# voice/src/pipeline/processors/billing_processor.py
"""
Billing processor for Pipecat pipeline.

Handles:
  - 30-second billing ticker (deducts 0.5 minutes each tick)
  - Credit exhaustion detection → call termination
  - Billing metrics emission
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Callable, Awaitable, Optional

from pipecat.frames.frames import (
    Frame,
    EndFrame,
    CancelFrame,
    SystemFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from ...services.billing_client import BillingClient
from ...config import settings

logger = logging.getLogger(__name__)


class BillingExhaustedFrame(SystemFrame):
    """Frame indicating credit exhaustion — pipeline should terminate."""

    pass


class BillingProcessor(FrameProcessor):
    """
    Pipecat processor that handles billing during calls.

    Runs a background ticker that deducts 0.5 minutes every 30 seconds.
    If balance is exhausted, emits BillingExhaustedFrame to terminate call.
    """

    def __init__(
        self,
        billing_client: BillingClient,
        org_id: str,
        conversation_id: str,
        interval_seconds: int = 30,
        deduct_minutes: float = 0.5,
        on_exhausted: Optional[Callable[[], Awaitable[None]]] = None,
        **kwargs,
    ):
        """
        Initialize billing processor.

        Args:
            billing_client: HTTP client for billing API
            org_id: Organization ID
            conversation_id: Conversation ID for audit trail
            interval_seconds: Billing interval (default 30s)
            deduct_minutes: Minutes to deduct per interval (default 0.5)
            on_exhausted: Optional callback when balance exhausted
        """
        super().__init__(**kwargs)
        self.billing_client = billing_client
        self.org_id = org_id
        self.conversation_id = conversation_id
        self.interval_seconds = interval_seconds
        self.deduct_minutes = deduct_minutes
        self.on_exhausted = on_exhausted

        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._start_time: Optional[float] = None
        self._total_deducted: float = 0.0

    async def start(self):
        """Start the billing ticker."""
        if self._running:
            return

        self._running = True
        self._start_time = time.time()
        self._task = asyncio.create_task(self._billing_loop())
        logger.info(
            "Billing ticker started: org=%s conv=%s interval=%ds",
            self.org_id,
            self.conversation_id,
            self.interval_seconds,
        )

    async def stop(self):
        """Stop the billing ticker."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        if self._start_time:
            duration = time.time() - self._start_time
            logger.info(
                "Billing ticker stopped: org=%s conv=%s duration=%.1fs deducted=%.1f min",
                self.org_id,
                self.conversation_id,
                duration,
                self._total_deducted,
            )

    async def _billing_loop(self):
        """Background loop that deducts minutes at regular intervals."""
        while self._running:
            try:
                await asyncio.sleep(self.interval_seconds)

                if not self._running:
                    break

                # Deduct minutes via billing API
                result = await self.billing_client.deduct_minutes(
                    org_id=self.org_id,
                    minutes=self.deduct_minutes,
                    conversation_id=self.conversation_id,
                )

                if result.success:
                    self._total_deducted += self.deduct_minutes
                    logger.debug(
                        "Billing tick: org=%s deducted=%.1f total=%.1f balance=%.1f",
                        self.org_id,
                        self.deduct_minutes,
                        self._total_deducted,
                        result.new_balance,
                    )
                else:
                    # Balance exhausted or error
                    logger.warning(
                        "Billing deduction failed: org=%s error=%s — terminating call",
                        self.org_id,
                        result.error or "insufficient balance",
                    )

                    # Emit exhaustion frame
                    await self.push_frame(BillingExhaustedFrame())

                    # Call exhaustion callback
                    if self.on_exhausted:
                        await self.on_exhausted()

                    # Stop ticker
                    self._running = False
                    break

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Billing loop error: %s", exc)
                # Continue running — don't terminate call on transient errors
                await asyncio.sleep(5)

    @property
    def total_deducted(self) -> float:
        """Total minutes deducted so far."""
        return self._total_deducted

    @property
    def call_duration(self) -> float:
        """Current call duration in seconds."""
        if self._start_time:
            return time.time() - self._start_time
        return 0.0

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """Process frame — start/stop ticker on lifecycle events."""
        await super().process_frame(frame, direction)

        # Start ticker when pipeline starts
        if not self._running and not isinstance(frame, (EndFrame, CancelFrame)):
            await self.start()

        # Stop ticker on end/cancel
        if isinstance(frame, (EndFrame, CancelFrame)):
            await self.stop()

        await self.push_frame(frame, direction)

    async def cleanup(self):
        """Cleanup when processor is destroyed."""
        await self.stop()
        await super().cleanup()


class BillingContext:
    """
    Context manager for billing during a call.

    Usage:
        async with BillingContext(client, org_id, conv_id) as billing:
            # Call runs here
            print(f"Duration: {billing.call_duration}")
    """

    def __init__(
        self,
        billing_client: BillingClient,
        org_id: str,
        conversation_id: str,
    ):
        self.billing_client = billing_client
        self.org_id = org_id
        self.conversation_id = conversation_id
        self._processor: Optional[BillingProcessor] = None

    async def __aenter__(self) -> "BillingContext":
        self._processor = BillingProcessor(
            billing_client=self.billing_client,
            org_id=self.org_id,
            conversation_id=self.conversation_id,
        )
        await self._processor.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._processor:
            await self._processor.stop()

            # Handle final billing
            await self.billing_client.handle_call_end(
                org_id=self.org_id,
                conversation_id=self.conversation_id,
                duration_seconds=int(self._processor.call_duration),
            )

    @property
    def call_duration(self) -> float:
        """Current call duration in seconds."""
        return self._processor.call_duration if self._processor else 0.0

    @property
    def total_deducted(self) -> float:
        """Total minutes deducted."""
        return self._processor.total_deducted if self._processor else 0.0

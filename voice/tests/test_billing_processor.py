# voice/tests/test_billing_processor.py
"""Tests for billing processor."""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock

from src.pipeline.processors.billing_processor import (
    BillingProcessor,
    BillingContext,
)


class TestBillingProcessor:
    """Tests for BillingProcessor."""

    @pytest.fixture
    def billing_client(self):
        """Create mock billing client."""
        client = MagicMock()
        client.deduct_minutes = AsyncMock(return_value=MagicMock(
            success=True,
            new_balance=99.5,
            error="",
        ))
        return client

    @pytest.mark.asyncio
    async def test_start_ticker(self, billing_client):
        """Ticker should start and track state."""
        processor = BillingProcessor(
            billing_client=billing_client,
            org_id="org-123",
            conversation_id="conv-456",
            interval_seconds=1,
        )

        await processor.start()
        assert processor._running == True
        assert processor._start_time is not None

        await processor.stop()
        assert processor._running == False

    @pytest.mark.asyncio
    async def test_deduction_success(self, billing_client):
        """Successful deduction should update total."""
        processor = BillingProcessor(
            billing_client=billing_client,
            org_id="org-123",
            conversation_id="conv-456",
            interval_seconds=0.1,  # Short interval for test
            deduct_minutes=0.5,
        )

        await processor.start()
        await asyncio.sleep(0.15)  # Wait for one tick
        await processor.stop()

        assert processor.total_deducted == 0.5
        billing_client.deduct_minutes.assert_called()

    @pytest.mark.asyncio
    async def test_deduction_failure(self, billing_client):
        """Failed deduction should trigger exhaustion."""
        billing_client.deduct_minutes = AsyncMock(return_value=MagicMock(
            success=False,
            new_balance=0,
            error="Insufficient balance",
        ))

        exhausted_called = False
        async def on_exhausted():
            nonlocal exhausted_called
            exhausted_called = True

        processor = BillingProcessor(
            billing_client=billing_client,
            org_id="org-123",
            conversation_id="conv-456",
            interval_seconds=0.1,
            on_exhausted=on_exhausted,
        )

        await processor.start()
        await asyncio.sleep(0.15)

        assert exhausted_called == True
        assert processor._running == False

    def test_call_duration(self, billing_client):
        """Call duration should be tracked."""
        processor = BillingProcessor(
            billing_client=billing_client,
            org_id="org-123",
            conversation_id="conv-456",
        )

        assert processor.call_duration == 0.0

    def test_total_deducted_initial(self, billing_client):
        """Initial deducted should be zero."""
        processor = BillingProcessor(
            billing_client=billing_client,
            org_id="org-123",
            conversation_id="conv-456",
        )

        assert processor.total_deducted == 0.0


class TestBillingContext:
    """Tests for BillingContext context manager."""

    @pytest.fixture
    def billing_client(self):
        """Create mock billing client."""
        client = MagicMock()
        client.deduct_minutes = AsyncMock(return_value=MagicMock(
            success=True,
            new_balance=99.5,
        ))
        client.handle_call_end = AsyncMock(return_value=MagicMock(
            success=True,
            new_balance=95,
        ))
        return client

    @pytest.mark.asyncio
    async def test_context_manager(self, billing_client):
        """Context manager should start and stop billing."""
        async with BillingContext(
            billing_client=billing_client,
            org_id="org-123",
            conversation_id="conv-456",
        ) as billing:
            assert billing.call_duration >= 0

        # Should have called handle_call_end
        billing_client.handle_call_end.assert_called_once()

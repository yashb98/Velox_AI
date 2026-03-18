# voice/src/services/billing_client.py
"""
HTTP client for billing operations via Node.js API.

The voice service calls the Node.js API for billing operations to maintain
a single source of truth for credit balance management with optimistic locking.

Endpoints:
  POST /internal/billing/check   — Check if org has sufficient balance
  POST /internal/billing/deduct  — Deduct minutes from org balance
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)


@dataclass
class BillingCheckResult:
    """Result of balance check."""

    has_balance: bool
    current_balance: float
    required_minutes: float


@dataclass
class BillingDeductResult:
    """Result of deduction operation."""

    success: bool
    new_balance: float
    error: str = ""


class BillingClient:
    """HTTP client for billing API calls to Node.js service."""

    def __init__(self, base_url: str, secret: str):
        """
        Initialize billing client.

        Args:
            base_url: Base URL of Node.js API (e.g., http://api:8080)
            secret: Shared secret for internal API authentication
        """
        self.base_url = base_url.rstrip("/")
        self.secret = secret
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=10.0,
                headers={
                    "Content-Type": "application/json",
                    "X-Internal-Secret": self.secret,
                },
            )
        return self._client

    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def check_balance(
        self, org_id: str, required_minutes: float = 1.0
    ) -> BillingCheckResult:
        """
        Check if organization has sufficient credit balance.

        Args:
            org_id: Organization ID
            required_minutes: Minimum minutes required

        Returns:
            BillingCheckResult with balance info
        """
        try:
            client = await self._get_client()
            resp = await client.post(
                f"{self.base_url}/internal/billing/check",
                json={
                    "orgId": org_id,
                    "requiredMinutes": required_minutes,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            return BillingCheckResult(
                has_balance=data.get("hasBalance", False),
                current_balance=data.get("currentBalance", 0),
                required_minutes=required_minutes,
            )

        except httpx.HTTPStatusError as exc:
            logger.error(
                "Billing check failed: status=%d org=%s",
                exc.response.status_code,
                org_id,
            )
            return BillingCheckResult(
                has_balance=False,
                current_balance=0,
                required_minutes=required_minutes,
            )

        except Exception as exc:
            logger.error("Billing check error: %s org=%s", exc, org_id)
            # Fail open for availability — allow call but log warning
            logger.warning("Billing check unavailable — allowing call for org=%s", org_id)
            return BillingCheckResult(
                has_balance=True,  # Fail open
                current_balance=-1,  # Unknown
                required_minutes=required_minutes,
            )

    async def deduct_minutes(
        self,
        org_id: str,
        minutes: float,
        conversation_id: str,
    ) -> BillingDeductResult:
        """
        Deduct minutes from organization credit balance.

        Uses optimistic locking on the Node.js side to prevent
        double-deduction under concurrent call load.

        Args:
            org_id: Organization ID
            minutes: Minutes to deduct
            conversation_id: Associated conversation for audit trail

        Returns:
            BillingDeductResult with success status
        """
        try:
            client = await self._get_client()
            resp = await client.post(
                f"{self.base_url}/internal/billing/deduct",
                json={
                    "orgId": org_id,
                    "minutes": minutes,
                    "conversationId": conversation_id,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            success = data.get("success", False)
            if success:
                logger.info(
                    "Deducted %.1f minutes from org=%s conv=%s new_balance=%.1f",
                    minutes,
                    org_id,
                    conversation_id,
                    data.get("newBalance", 0),
                )
            else:
                logger.warning(
                    "Deduction failed: org=%s minutes=%.1f reason=%s",
                    org_id,
                    minutes,
                    data.get("error", "unknown"),
                )

            return BillingDeductResult(
                success=success,
                new_balance=data.get("newBalance", 0),
                error=data.get("error", ""),
            )

        except httpx.HTTPStatusError as exc:
            logger.error(
                "Billing deduct failed: status=%d org=%s",
                exc.response.status_code,
                org_id,
            )
            return BillingDeductResult(
                success=False,
                new_balance=0,
                error=f"HTTP {exc.response.status_code}",
            )

        except Exception as exc:
            logger.error("Billing deduct error: %s org=%s", exc, org_id)
            return BillingDeductResult(
                success=False,
                new_balance=0,
                error=str(exc),
            )

    async def handle_call_end(
        self,
        org_id: str,
        conversation_id: str,
        duration_seconds: int,
    ) -> BillingDeductResult:
        """
        Handle end-of-call billing.

        Called when a call ends to perform final billing reconciliation.
        The Node.js API calculates actual usage and adjusts the balance.

        Args:
            org_id: Organization ID
            conversation_id: Conversation ID
            duration_seconds: Total call duration in seconds

        Returns:
            BillingDeductResult with final balance
        """
        try:
            client = await self._get_client()
            resp = await client.post(
                f"{self.base_url}/internal/billing/call-end",
                json={
                    "orgId": org_id,
                    "conversationId": conversation_id,
                    "durationSeconds": duration_seconds,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            logger.info(
                "Call end billing: org=%s conv=%s duration=%ds final_balance=%.1f",
                org_id,
                conversation_id,
                duration_seconds,
                data.get("newBalance", 0),
            )

            return BillingDeductResult(
                success=data.get("success", True),
                new_balance=data.get("newBalance", 0),
            )

        except Exception as exc:
            logger.error(
                "Call end billing error: %s org=%s conv=%s",
                exc,
                org_id,
                conversation_id,
            )
            return BillingDeductResult(
                success=False,
                new_balance=0,
                error=str(exc),
            )

# voice/src/transport/daily_transport.py
"""
Daily.co WebRTC transport management for Pipecat.

Handles:
  - Room creation with SIP enabled
  - Room configuration
  - Participant management
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Optional

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


@dataclass
class DailyRoomInfo:
    """Daily.co room information."""

    room_name: str
    room_url: str
    sip_uri: str
    token: str
    expires_at: int


class DailyTransport:
    """Daily.co API client for room management."""

    def __init__(self):
        self.api_key = settings.daily_api_key
        self.api_url = settings.daily_api_url
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=30.0,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )
        return self._client

    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def create_room(
        self,
        call_sid: str,
        exp_minutes: int = 60,
    ) -> DailyRoomInfo:
        """
        Create a Daily.co room with SIP enabled.

        Args:
            call_sid: Twilio call SID (used for room naming)
            exp_minutes: Room expiration in minutes

        Returns:
            DailyRoomInfo with room details
        """
        client = await self._get_client()

        # Generate unique room name
        room_name = f"velox-{call_sid[:8]}-{uuid.uuid4().hex[:6]}"

        # Create room with SIP enabled
        room_resp = await client.post(
            f"{self.api_url}/rooms",
            json={
                "name": room_name,
                "privacy": "private",
                "properties": {
                    "exp": exp_minutes * 60,  # Convert to seconds
                    "enable_chat": False,
                    "enable_screenshare": False,
                    "sip": {
                        "display_name": "Velox AI",
                        "video": False,
                        "sip_mode": "dial-in",
                    },
                },
            },
        )
        room_resp.raise_for_status()
        room_data = room_resp.json()

        # Get meeting token for the bot
        token_resp = await client.post(
            f"{self.api_url}/meeting-tokens",
            json={
                "properties": {
                    "room_name": room_name,
                    "is_owner": True,
                    "exp": exp_minutes * 60,
                    "user_name": "Velox AI",
                },
            },
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()

        room_info = DailyRoomInfo(
            room_name=room_name,
            room_url=room_data.get("url", ""),
            sip_uri=room_data.get("config", {}).get("sip_endpoint", f"sip:{room_name}@sip.daily.co"),
            token=token_data.get("token", ""),
            expires_at=room_data.get("config", {}).get("exp", 0),
        )

        logger.info(
            "Created Daily room: name=%s sip=%s",
            room_info.room_name,
            room_info.sip_uri,
        )

        return room_info

    async def delete_room(self, room_name: str):
        """
        Delete a Daily.co room.

        Args:
            room_name: Room name to delete
        """
        try:
            client = await self._get_client()
            resp = await client.delete(f"{self.api_url}/rooms/{room_name}")
            resp.raise_for_status()
            logger.info("Deleted Daily room: %s", room_name)
        except Exception as exc:
            logger.warning("Failed to delete Daily room %s: %s", room_name, exc)

    async def get_room_info(self, room_name: str) -> Optional[dict]:
        """
        Get room information.

        Args:
            room_name: Room name

        Returns:
            Room data dict or None
        """
        try:
            client = await self._get_client()
            resp = await client.get(f"{self.api_url}/rooms/{room_name}")
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return None
            raise

    async def get_room_participants(self, room_name: str) -> list[dict]:
        """
        Get list of participants in a room.

        Args:
            room_name: Room name

        Returns:
            List of participant dicts
        """
        try:
            client = await self._get_client()
            resp = await client.get(f"{self.api_url}/rooms/{room_name}/presence")
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", [])
        except Exception as exc:
            logger.warning("Failed to get participants for %s: %s", room_name, exc)
            return []

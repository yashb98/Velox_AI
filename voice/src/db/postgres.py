# voice/src/db/postgres.py
"""
Async PostgreSQL database access for voice service.

Uses SQLAlchemy async with asyncpg driver.
Directly accesses the same database as Node.js API (shared schema).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Optional, Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine

logger = logging.getLogger(__name__)


class Database:
    """Async PostgreSQL database connection manager."""

    def __init__(self, database_url: str):
        """
        Initialize database connection.

        Args:
            database_url: PostgreSQL connection string with asyncpg driver
                         e.g., postgresql+asyncpg://user:pass@host:5432/db
        """
        self.database_url = database_url
        self._engine: Optional[AsyncEngine] = None

    @property
    def is_connected(self) -> bool:
        """Check if database is connected."""
        return self._engine is not None

    async def connect(self):
        """Establish database connection."""
        if self._engine is None:
            self._engine = create_async_engine(
                self.database_url,
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True,
            )
            logger.info("Database engine created")

    async def disconnect(self):
        """Close database connection."""
        if self._engine:
            await self._engine.dispose()
            self._engine = None
            logger.info("Database connection closed")

    async def get_agent_by_phone(self, phone_number: str) -> Optional[dict[str, Any]]:
        """
        Look up agent by phone number.

        Args:
            phone_number: Phone number to search (e.g., +1234567890)

        Returns:
            Agent record dict or None if not found
        """
        if not self._engine:
            raise RuntimeError("Database not connected")

        async with self._engine.connect() as conn:
            result = await conn.execute(
                text("""
                    SELECT id, name, system_prompt, voice_id, phone_number,
                           org_id, kb_id, tools_enabled, llm_config, is_active
                    FROM agents
                    WHERE phone_number = :phone AND is_active = true
                    LIMIT 1
                """),
                {"phone": phone_number},
            )
            row = result.fetchone()

            if row:
                return {
                    "id": str(row.id),
                    "name": row.name,
                    "system_prompt": row.system_prompt,
                    "voice_id": row.voice_id,
                    "phone_number": row.phone_number,
                    "org_id": str(row.org_id),
                    "kb_id": str(row.kb_id) if row.kb_id else None,
                    "tools_enabled": row.tools_enabled,
                    "llm_config": row.llm_config,
                    "is_active": row.is_active,
                }
            return None

    async def get_organization(self, org_id: str) -> Optional[dict[str, Any]]:
        """
        Get organization by ID.

        Args:
            org_id: Organization UUID

        Returns:
            Organization record dict or None
        """
        if not self._engine:
            raise RuntimeError("Database not connected")

        async with self._engine.connect() as conn:
            result = await conn.execute(
                text("""
                    SELECT id, name, slug, credit_balance, reserved_balance,
                           current_plan, version
                    FROM organizations
                    WHERE id = :id
                """),
                {"id": org_id},
            )
            row = result.fetchone()

            if row:
                return {
                    "id": str(row.id),
                    "name": row.name,
                    "slug": row.slug,
                    "credit_balance": row.credit_balance,
                    "reserved_balance": row.reserved_balance,
                    "current_plan": row.current_plan,
                    "version": row.version,
                }
            return None

    async def create_conversation(
        self,
        twilio_sid: str,
        agent_id: str,
    ) -> dict[str, Any]:
        """
        Create a new conversation record.

        Args:
            twilio_sid: Twilio call SID
            agent_id: Agent UUID

        Returns:
            Created conversation record
        """
        if not self._engine:
            raise RuntimeError("Database not connected")

        conversation_id = str(uuid.uuid4())
        now = datetime.utcnow()

        async with self._engine.begin() as conn:
            await conn.execute(
                text("""
                    INSERT INTO conversations (id, twilio_sid, agent_id, status, start_time)
                    VALUES (:id, :twilio_sid, :agent_id, 'ACTIVE', :start_time)
                """),
                {
                    "id": conversation_id,
                    "twilio_sid": twilio_sid,
                    "agent_id": agent_id,
                    "start_time": now,
                },
            )

        logger.info("Created conversation: id=%s twilio_sid=%s", conversation_id, twilio_sid)

        return {
            "id": conversation_id,
            "twilio_sid": twilio_sid,
            "agent_id": agent_id,
            "status": "ACTIVE",
            "start_time": now,
        }

    async def update_conversation_status(
        self,
        conversation_id: str,
        status: str,
        end_time: Optional[datetime] = None,
    ):
        """
        Update conversation status.

        Args:
            conversation_id: Conversation UUID
            status: New status (ACTIVE, COMPLETED, FAILED, ABANDONED)
            end_time: Optional end timestamp
        """
        if not self._engine:
            raise RuntimeError("Database not connected")

        async with self._engine.begin() as conn:
            if end_time:
                await conn.execute(
                    text("""
                        UPDATE conversations
                        SET status = :status, end_time = :end_time
                        WHERE id = :id
                    """),
                    {"id": conversation_id, "status": status, "end_time": end_time},
                )
            else:
                await conn.execute(
                    text("""
                        UPDATE conversations SET status = :status WHERE id = :id
                    """),
                    {"id": conversation_id, "status": status},
                )

        logger.info("Updated conversation %s status to %s", conversation_id, status)

    async def create_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        tokens: int = 0,
        latency_ms: int = 0,
    ):
        """
        Create a message record (fire-and-forget for audit trail).

        Args:
            conversation_id: Parent conversation UUID
            role: Message role (user, assistant, system, tool)
            content: Message content
            tokens: Token count (optional)
            latency_ms: Processing latency (optional)
        """
        if not self._engine:
            raise RuntimeError("Database not connected")

        message_id = str(uuid.uuid4())

        async with self._engine.begin() as conn:
            await conn.execute(
                text("""
                    INSERT INTO messages (id, conversation_id, role, content, tokens, latency_ms)
                    VALUES (:id, :conv_id, :role, :content, :tokens, :latency_ms)
                """),
                {
                    "id": message_id,
                    "conv_id": conversation_id,
                    "role": role,
                    "content": content,
                    "tokens": tokens,
                    "latency_ms": latency_ms,
                },
            )

    async def get_agent_knowledge_base(self, kb_id: str) -> Optional[dict[str, Any]]:
        """
        Get knowledge base configuration for RAG.

        Args:
            kb_id: Knowledge base UUID

        Returns:
            Knowledge base config or None
        """
        if not self._engine:
            raise RuntimeError("Database not connected")

        async with self._engine.connect() as conn:
            result = await conn.execute(
                text("""
                    SELECT id, name, description, config
                    FROM knowledge_bases
                    WHERE id = :id
                """),
                {"id": kb_id},
            )
            row = result.fetchone()

            if row:
                return {
                    "id": str(row.id),
                    "name": row.name,
                    "description": row.description,
                    "config": row.config,
                }
            return None

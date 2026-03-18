# voice/tests/conftest.py
"""Pytest fixtures for voice service tests."""

import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture
def mock_billing_client():
    """Mock billing client for tests."""
    client = MagicMock()
    client.check_balance = AsyncMock(return_value=MagicMock(
        has_balance=True,
        current_balance=100,
        required_minutes=1,
    ))
    client.deduct_minutes = AsyncMock(return_value=MagicMock(
        success=True,
        new_balance=99.5,
        error="",
    ))
    client.handle_call_end = AsyncMock(return_value=MagicMock(
        success=True,
        new_balance=95,
    ))
    return client


@pytest.fixture
def mock_database():
    """Mock database for tests."""
    db = MagicMock()
    db.is_connected = True
    db.connect = AsyncMock()
    db.disconnect = AsyncMock()
    db.get_agent_by_phone = AsyncMock(return_value={
        "id": "agent-123",
        "name": "Test Agent",
        "system_prompt": "You are a test agent.",
        "voice_id": "test-voice",
        "phone_number": "+1234567890",
        "org_id": "org-456",
        "kb_id": None,
        "tools_enabled": [],
        "llm_config": {},
        "is_active": True,
    })
    db.get_organization = AsyncMock(return_value={
        "id": "org-456",
        "name": "Test Org",
        "slug": "test-org",
        "credit_balance": 100,
        "reserved_balance": 0,
        "current_plan": "PRO",
        "version": 1,
    })
    db.create_conversation = AsyncMock(return_value={
        "id": "conv-789",
        "twilio_sid": "CA123",
        "agent_id": "agent-123",
        "status": "ACTIVE",
    })
    db.update_conversation_status = AsyncMock()
    db.create_message = AsyncMock()
    return db


@pytest.fixture
def sample_agent():
    """Sample agent configuration."""
    return {
        "id": "agent-123",
        "name": "Test Agent",
        "system_prompt": "You are a helpful voice assistant.",
        "voice_id": "en-US-Neural2-F",
        "phone_number": "+1234567890",
        "org_id": "org-456",
        "kb_id": None,
        "tools_enabled": [],
        "llm_config": {},
        "is_active": True,
    }


@pytest.fixture
def sample_organization():
    """Sample organization configuration."""
    return {
        "id": "org-456",
        "name": "Test Organization",
        "slug": "test-org",
        "credit_balance": 100,
        "reserved_balance": 0,
        "current_plan": "PRO",
        "version": 1,
    }

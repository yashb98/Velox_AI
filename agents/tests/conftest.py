"""
conftest.py — pytest fixtures for agents service tests.

Reference: docs/architecture/08-mlops-cicd.md §8.3
"""

import os
import pytest
from unittest.mock import AsyncMock, MagicMock

# Set test environment variables
os.environ["GEMINI_API_KEY"] = "test-key"
os.environ["PHI3_SERVICE_URL"] = ""


@pytest.fixture
def mock_gemini_response():
    """Mock response from Gemini API."""
    return MagicMock(text="This is a test response from Gemini.")


@pytest.fixture
def mock_httpx_client():
    """Mock httpx async client."""
    mock = AsyncMock()
    mock.post = AsyncMock()
    return mock


@pytest.fixture
def sample_pipeline_request():
    """Sample pipeline request for testing."""
    from pipeline import PipelineRequest
    return PipelineRequest(
        user_message="What are your business hours?",
        context="Business hours: Monday-Friday 9am-5pm",
        agent_id="agent-123",
        conversation_id="conv-456",
        call_sid="CA123",
    )

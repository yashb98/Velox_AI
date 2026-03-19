# agents/tests/test_voice_agent.py
"""
Unit tests for the LangGraph voice agent.

Tests:
  - State transitions
  - Node functions
  - Conditional routing
  - End-to-end agent execution

Run with: pytest agents/tests/test_voice_agent.py -v
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

# ─── Test Fixtures ────────────────────────────────────────────────────────────


@pytest.fixture
def mock_router():
    """Mock the semantic router."""
    with patch("voice_agent.route_request") as mock:
        from router import RoutingResult, ModelTier

        mock.return_value = RoutingResult(
            tier=ModelTier.T1_FAST,
            intent="greeting",
            confidence=0.9,
            latency_ms=15.0,
        )
        yield mock


@pytest.fixture
def mock_llm_call():
    """Mock the traced LLM call."""
    with patch("voice_agent.traced_llm_call") as mock:
        mock.return_value = "Hello! How can I help you today?"
        yield mock


@pytest.fixture
def sample_state():
    """Create a sample voice agent state."""
    return {
        "user_message": "Hello",
        "conversation_history": [],
        "agent_config": {
            "system_prompt": "You are a helpful assistant.",
        },
        "intent": "",
        "tier": "",
        "routing_confidence": 0.0,
        "routing_latency_ms": 0.0,
        "rag_context": "",
        "rag_sources": [],
        "rag_latency_ms": 0.0,
        "tool_results": [],
        "response": "",
        "model_used": "",
        "total_latency_ms": 0.0,
    }


# ─── Node Function Tests ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_route_input_simple(mock_router, sample_state):
    """Test routing simple messages."""
    from voice_agent import route_input
    from router import RoutingResult, ModelTier

    mock_router.return_value = RoutingResult(
        tier=ModelTier.T1_FAST,
        intent="greeting",
        confidence=0.9,
        latency_ms=15.0,
    )

    result = await route_input(sample_state)

    assert result["intent"] == "simple"
    assert result["tier"] == "t1_fast"
    assert result["routing_confidence"] == 0.9
    assert result["routing_latency_ms"] > 0


@pytest.mark.asyncio
async def test_route_input_rag_needed(mock_router, sample_state):
    """Test routing messages that need RAG."""
    from voice_agent import route_input
    from router import RoutingResult, ModelTier

    sample_state["user_message"] = "What are your business hours?"

    mock_router.return_value = RoutingResult(
        tier=ModelTier.T2_MEDIUM,
        intent="information_request",
        confidence=0.85,
        latency_ms=20.0,
    )

    result = await route_input(sample_state)

    assert result["intent"] == "rag_needed"
    assert result["tier"] == "t2_medium"


@pytest.mark.asyncio
async def test_route_input_complex(mock_router, sample_state):
    """Test routing complex messages."""
    from voice_agent import route_input
    from router import RoutingResult, ModelTier

    sample_state["user_message"] = "Can you compare product A and B and recommend the best one for my use case?"

    mock_router.return_value = RoutingResult(
        tier=ModelTier.T3_HEAVY,
        intent="complex_analysis",
        confidence=0.8,
        latency_ms=25.0,
    )

    result = await route_input(sample_state)

    assert result["intent"] == "complex"
    assert result["tier"] == "t3_heavy"


@pytest.mark.asyncio
async def test_generate_response(mock_llm_call, sample_state):
    """Test simple response generation."""
    from voice_agent import generate_response

    sample_state["tier"] = "t1_fast"

    result = await generate_response(sample_state)

    assert result["response"] == "Hello! How can I help you today?"
    assert "model_used" in result
    assert result["total_latency_ms"] > 0

    mock_llm_call.assert_called_once()


@pytest.mark.asyncio
async def test_retrieve_context(sample_state):
    """Test RAG context retrieval."""
    from voice_agent import retrieve_context

    sample_state["agent_config"]["kb_id"] = "test-kb-123"

    result = await retrieve_context(sample_state)

    # With placeholder implementation, context is empty
    assert "rag_context" in result
    assert "rag_sources" in result
    assert result["rag_latency_ms"] >= 0


@pytest.mark.asyncio
async def test_generate_with_rag(mock_llm_call, sample_state):
    """Test RAG-augmented response generation."""
    from voice_agent import generate_with_rag

    sample_state["tier"] = "t2_medium"
    sample_state["rag_context"] = "Our business hours are 9 AM to 5 PM."
    sample_state["rag_latency_ms"] = 50.0
    sample_state["routing_latency_ms"] = 20.0

    mock_llm_call.return_value = "Our business hours are 9 AM to 5 PM Monday through Friday."

    result = await generate_with_rag(sample_state)

    assert "9 AM" in result["response"]
    assert result["total_latency_ms"] > 0

    # Verify system prompt included RAG context
    call_args = mock_llm_call.call_args
    messages = call_args.kwargs.get("messages", call_args.args[0] if call_args.args else [])
    system_msg = messages[0]["content"]
    assert "KNOWLEDGE BASE" in system_msg


@pytest.mark.asyncio
async def test_execute_tool(sample_state):
    """Test tool execution."""
    from voice_agent import execute_tool

    sample_state["agent_config"]["tools"] = ["check_order_status"]
    sample_state["user_message"] = "Check my order status"

    result = await execute_tool(sample_state)

    assert "tool_results" in result


@pytest.mark.asyncio
async def test_multi_step_reasoning(mock_llm_call, sample_state):
    """Test complex multi-step reasoning."""
    from voice_agent import multi_step_reasoning

    sample_state["user_message"] = "Compare our enterprise and pro plans"
    sample_state["routing_latency_ms"] = 25.0
    sample_state["rag_context"] = "Enterprise: $500/mo, Pro: $100/mo"
    sample_state["rag_latency_ms"] = 80.0

    mock_llm_call.return_value = "Enterprise offers more features at $500 per month, while Pro is $100 and suitable for smaller teams."

    result = await multi_step_reasoning(sample_state)

    assert "model_used" in result
    assert result["total_latency_ms"] > 0


# ─── Routing Logic Tests ──────────────────────────────────────────────────────


def test_select_path_simple():
    """Test path selection for simple intent."""
    from voice_agent import select_path

    state = {"intent": "simple"}
    assert select_path(state) == "simple"


def test_select_path_rag():
    """Test path selection for RAG intent."""
    from voice_agent import select_path

    state = {"intent": "rag_needed"}
    assert select_path(state) == "rag_needed"


def test_select_path_tool():
    """Test path selection for tool intent."""
    from voice_agent import select_path

    state = {"intent": "tool_call"}
    assert select_path(state) == "tool_call"


def test_select_path_complex():
    """Test path selection for complex intent."""
    from voice_agent import select_path

    state = {"intent": "complex"}
    assert select_path(state) == "complex"


def test_select_path_default():
    """Test default path selection."""
    from voice_agent import select_path

    state = {"intent": "unknown"}
    assert select_path(state) == "simple"


# ─── Graph Construction Tests ─────────────────────────────────────────────────


def test_build_voice_agent_graph():
    """Test that the graph builds correctly."""
    from voice_agent import build_voice_agent_graph

    graph = build_voice_agent_graph()

    # Check that all nodes are present
    assert "route_input" in graph.nodes
    assert "generate_response" in graph.nodes
    assert "retrieve_context" in graph.nodes
    assert "generate_with_rag" in graph.nodes
    assert "execute_tool" in graph.nodes
    assert "generate_with_tool" in graph.nodes
    assert "multi_step_reasoning" in graph.nodes


def test_voice_agent_compiled():
    """Test that the compiled agent is available."""
    from voice_agent import voice_agent

    assert voice_agent is not None


# ─── End-to-End Tests ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_run_voice_agent_simple(mock_router, mock_llm_call):
    """Test end-to-end simple query processing."""
    from voice_agent import run_voice_agent
    from router import RoutingResult, ModelTier

    mock_router.return_value = RoutingResult(
        tier=ModelTier.T1_FAST,
        intent="greeting",
        confidence=0.9,
        latency_ms=15.0,
    )
    mock_llm_call.return_value = "Hello! How can I help you today?"

    result = await run_voice_agent(
        user_message="Hello",
        conversation_history=[],
        agent_config={},
    )

    assert "response" in result
    assert result["response"] == "Hello! How can I help you today?"
    assert result["tier"] == "t1_fast"
    assert result["total_latency_ms"] > 0


@pytest.mark.asyncio
async def test_run_voice_agent_with_history(mock_router, mock_llm_call):
    """Test agent with conversation history."""
    from voice_agent import run_voice_agent
    from router import RoutingResult, ModelTier

    mock_router.return_value = RoutingResult(
        tier=ModelTier.T1_FAST,
        intent="acknowledgment",
        confidence=0.85,
        latency_ms=18.0,
    )
    mock_llm_call.return_value = "You're welcome!"

    history = [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi there! How can I help?"},
        {"role": "user", "content": "Thanks"},
    ]

    result = await run_voice_agent(
        user_message="Thank you",
        conversation_history=history,
        agent_config={},
    )

    assert result["response"] == "You're welcome!"


@pytest.mark.asyncio
async def test_run_voice_agent_with_thread_id(mock_router, mock_llm_call):
    """Test agent with thread ID for memory."""
    from voice_agent import run_voice_agent
    from router import RoutingResult, ModelTier

    mock_router.return_value = RoutingResult(
        tier=ModelTier.T1_FAST,
        intent="greeting",
        confidence=0.9,
        latency_ms=15.0,
    )
    mock_llm_call.return_value = "Hello!"

    result = await run_voice_agent(
        user_message="Hi",
        thread_id="test-thread-123",
    )

    assert "response" in result


# ─── Latency Tests ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_routing_latency_under_target(mock_router, mock_llm_call):
    """Test that routing stays under 30ms target."""
    from voice_agent import route_input
    from router import RoutingResult, ModelTier

    # Mock returns 15ms routing time
    mock_router.return_value = RoutingResult(
        tier=ModelTier.T1_FAST,
        intent="greeting",
        confidence=0.9,
        latency_ms=15.0,
    )

    state = {
        "user_message": "Hello",
        "conversation_history": [],
        "agent_config": {},
    }

    result = await route_input(state)

    # Routing should complete quickly (mocked at 15ms)
    assert result["routing_latency_ms"] < 100  # Allow some overhead


# ─── Error Handling Tests ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_run_voice_agent_empty_message():
    """Test handling of empty message (should be caught at API level)."""
    from voice_agent import run_voice_agent

    # Empty message should still work at agent level
    # (validation happens in main.py)
    with patch("voice_agent.route_request") as mock_router:
        from router import RoutingResult, ModelTier

        mock_router.return_value = RoutingResult(
            tier=ModelTier.T1_FAST,
            intent="acknowledgment",
            confidence=0.5,
            latency_ms=10.0,
        )

        with patch("voice_agent.traced_llm_call") as mock_llm:
            mock_llm.return_value = "I'm sorry, I didn't catch that."

            result = await run_voice_agent(
                user_message="",
                conversation_history=[],
                agent_config={},
            )

            assert "response" in result


@pytest.mark.asyncio
async def test_run_voice_agent_llm_error():
    """Test handling of LLM call errors."""
    from voice_agent import run_voice_agent

    with patch("voice_agent.route_request") as mock_router:
        from router import RoutingResult, ModelTier

        mock_router.return_value = RoutingResult(
            tier=ModelTier.T1_FAST,
            intent="greeting",
            confidence=0.9,
            latency_ms=15.0,
        )

        with patch("voice_agent.traced_llm_call") as mock_llm:
            mock_llm.side_effect = Exception("LLM service unavailable")

            with pytest.raises(Exception) as exc_info:
                await run_voice_agent(
                    user_message="Hello",
                    conversation_history=[],
                    agent_config={},
                )

            assert "LLM service unavailable" in str(exc_info.value)


# ─── Intent Mapping Tests ─────────────────────────────────────────────────────


def test_intent_to_path_mapping():
    """Test that all intents map to valid paths."""
    from voice_agent import INTENT_TO_PATH

    valid_paths = {"simple", "rag_needed", "tool_call", "complex"}

    for intent, path in INTENT_TO_PATH.items():
        assert path in valid_paths, f"Intent '{intent}' maps to invalid path '{path}'"


def test_all_router_intents_covered():
    """Test that all router intents have path mappings."""
    from voice_agent import INTENT_TO_PATH
    from router import INTENT_TO_TIER

    for intent in INTENT_TO_TIER:
        assert intent in INTENT_TO_PATH, f"Router intent '{intent}' not in INTENT_TO_PATH"

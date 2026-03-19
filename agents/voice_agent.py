# agents/voice_agent.py
"""
LangGraph voice agent state machine for Velox AI.

Implements a graph-based conversation flow for voice interactions:

  START
    │
    ▼
  [route_input] ─────────────────────────────────────────────────────
    │
    ├── intent=simple ──────► [generate_response] ──► END
    │
    ├── intent=rag_needed ──► [retrieve_context] ───►
    │                           │
    │                           ▼
    │                         [generate_with_rag] ──► END
    │
    ├── intent=tool_call ───► [execute_tool] ──►
    │                           │
    │                           ▼
    │                         [generate_with_tool] ──► END
    │
    └── intent=complex ─────► [multi_step_reasoning] ──► END

Target latency: <800ms voice-to-voice (graph overhead <10ms)

Model Routing:
  T0 Router:  Qwen3.5-3B     → classify intent + complexity  (<30ms)
  T1 Fast:    Nemotron Nano  → 70-80% of turns               (<100ms TTFT)
  T2 Medium:  Qwen3.5-32B    → multi-turn, tool orchestration (<200ms TTFT)
  T3 Heavy:   Kimi K2.5 API  → edge cases, multi-hop RAG     (<500ms TTFT)
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Literal, TypedDict

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from router import ModelTier, route_request, get_tier_model, INTENT_TO_TIER
from tracing import traced_llm_call, get_langsmith_callback

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "sglang").lower()
SGLANG_BASE_URL = os.getenv("SGLANG_BASE_URL", "")
SGLANG_API_KEY = os.getenv("SGLANG_API_KEY", "")
KIMI_API_KEY = os.getenv("KIMI_API_KEY", "")
KIMI_BASE_URL = os.getenv("KIMI_BASE_URL", "https://api.moonshot.cn/v1")

# RAG configuration
RAG_FAST_TIMEOUT_MS = int(os.getenv("RAG_FAST_TIMEOUT_MS", "100"))
RAG_COMPLEX_TIMEOUT_MS = int(os.getenv("RAG_COMPLEX_TIMEOUT_MS", "500"))

# System prompt for voice responses
VOICE_SYSTEM_PROMPT = (
    "You are Velox, a professional voice AI assistant. "
    "Keep answers concise — under two sentences. "
    "Do not use markdown formatting; your reply will be spoken aloud."
)


# ─── State Definition ─────────────────────────────────────────────────────────


class VoiceAgentState(TypedDict):
    """State for the voice agent graph."""

    # Input
    user_message: str
    conversation_history: list[dict]
    agent_config: dict

    # Routing
    intent: str  # simple | rag_needed | tool_call | complex
    tier: str    # t1_fast | t2_medium | t3_heavy
    routing_confidence: float
    routing_latency_ms: float

    # Context
    rag_context: str
    rag_sources: list[str]
    rag_latency_ms: float
    tool_results: list[dict]

    # Output
    response: str
    model_used: str
    total_latency_ms: float


# ─── Intent to Path Mapping ───────────────────────────────────────────────────

# Map semantic intents to graph paths
INTENT_TO_PATH: dict[str, str] = {
    # Simple path (T1) - no RAG, no tools
    "greeting": "simple",
    "farewell": "simple",
    "acknowledgment": "simple",
    "confirmation": "simple",
    "rejection": "simple",
    "simple_question": "simple",

    # RAG path (T2) - needs context retrieval
    "information_request": "rag_needed",
    "explanation": "rag_needed",
    "comparison": "rag_needed",
    "recommendation": "rag_needed",
    "troubleshooting": "rag_needed",

    # Complex path (T3) - multi-step reasoning
    "multi_step_reasoning": "complex",
    "complex_analysis": "complex",
    "creative_task": "complex",
}


# ─── Node Functions ───────────────────────────────────────────────────────────


async def route_input(state: VoiceAgentState) -> VoiceAgentState:
    """
    Route user input to appropriate processing path.

    Uses the T0 semantic router (Qwen3.5-3B) to classify intent,
    then maps intent to graph path.

    Target latency: <30ms
    """
    start_time = time.perf_counter()

    user_message = state["user_message"]

    # Use existing router for intent classification
    routing_result = await route_request(user_message)

    # Map tier to path
    intent = routing_result.intent
    path = INTENT_TO_PATH.get(intent, "simple")

    # Override path based on agent config if tools are configured
    agent_config = state.get("agent_config", {})
    if agent_config.get("tools") and path == "simple":
        # Check if message might need tools
        tool_keywords = ["order", "booking", "schedule", "check", "status"]
        if any(kw in user_message.lower() for kw in tool_keywords):
            path = "tool_call"

    routing_latency_ms = (time.perf_counter() - start_time) * 1000

    logger.info(
        "Route: intent=%s path=%s tier=%s latency=%.1fms",
        intent,
        path,
        routing_result.tier.value,
        routing_latency_ms,
    )

    return {
        **state,
        "intent": path,
        "tier": routing_result.tier.value,
        "routing_confidence": routing_result.confidence,
        "routing_latency_ms": routing_latency_ms,
    }


async def generate_response(state: VoiceAgentState) -> VoiceAgentState:
    """
    Generate a simple response without RAG or tools.

    Uses T1 Fast tier (Nemotron Nano) for quick responses.
    Target latency: <100ms TTFT
    """
    start_time = time.perf_counter()

    user_message = state["user_message"]
    conversation_history = state.get("conversation_history", [])
    agent_config = state.get("agent_config", {})

    # Build system prompt
    system_prompt = agent_config.get("system_prompt", VOICE_SYSTEM_PROMPT)

    # Build messages
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history[-10:])  # Last 10 turns
    messages.append({"role": "user", "content": user_message})

    # Select model based on tier
    tier = ModelTier.T1_FAST
    model = get_tier_model(tier, LLM_PROVIDER)

    # Call LLM with tracing
    response_text = await traced_llm_call(
        messages=messages,
        model=model,
        tier=tier.value,
        provider=LLM_PROVIDER,
    )

    total_latency_ms = (time.perf_counter() - start_time) * 1000

    logger.info(
        "Generated simple response: model=%s latency=%.1fms",
        model,
        total_latency_ms,
    )

    return {
        **state,
        "response": response_text,
        "model_used": model,
        "total_latency_ms": total_latency_ms + state.get("routing_latency_ms", 0),
    }


async def retrieve_context(state: VoiceAgentState) -> VoiceAgentState:
    """
    Retrieve context from knowledge base using fast RAG.

    Target latency: <100ms
    """
    start_time = time.perf_counter()

    user_message = state["user_message"]
    agent_config = state.get("agent_config", {})
    kb_id = agent_config.get("kb_id")

    context = ""
    sources = []

    if kb_id:
        # Placeholder: In production, this calls the RAG service
        # from agents.rag.retrievers.hybrid import HybridRetriever
        # retriever = HybridRetriever(kb_id)
        # results = await retriever.search(user_message, top_k=5)
        # context = "\n".join(r["content"] for r in results)
        # sources = [r["source"] for r in results]
        pass

    rag_latency_ms = (time.perf_counter() - start_time) * 1000

    logger.info(
        "RAG retrieval: kb_id=%s context_len=%d latency=%.1fms",
        kb_id,
        len(context),
        rag_latency_ms,
    )

    return {
        **state,
        "rag_context": context,
        "rag_sources": sources,
        "rag_latency_ms": rag_latency_ms,
    }


async def generate_with_rag(state: VoiceAgentState) -> VoiceAgentState:
    """
    Generate response with RAG context.

    Uses T2 Medium tier (Qwen 32B) for context-aware responses.
    Target latency: <200ms TTFT
    """
    start_time = time.perf_counter()

    user_message = state["user_message"]
    conversation_history = state.get("conversation_history", [])
    agent_config = state.get("agent_config", {})
    rag_context = state.get("rag_context", "")

    # Build system prompt with RAG context
    base_prompt = agent_config.get("system_prompt", VOICE_SYSTEM_PROMPT)
    if rag_context:
        system_prompt = (
            f"{base_prompt}\n\n"
            f"=== KNOWLEDGE BASE ===\n{rag_context}\n"
            f"======================\n\n"
            "Use the knowledge base to answer the user's question accurately."
        )
    else:
        system_prompt = base_prompt

    # Build messages
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history[-10:])
    messages.append({"role": "user", "content": user_message})

    # Select model - T2 for RAG responses
    tier = ModelTier.T2_MEDIUM
    model = get_tier_model(tier, LLM_PROVIDER)

    # Call LLM with tracing
    response_text = await traced_llm_call(
        messages=messages,
        model=model,
        tier=tier.value,
        provider=LLM_PROVIDER,
    )

    llm_latency_ms = (time.perf_counter() - start_time) * 1000
    total_latency_ms = (
        state.get("routing_latency_ms", 0) +
        state.get("rag_latency_ms", 0) +
        llm_latency_ms
    )

    logger.info(
        "Generated RAG response: model=%s llm_latency=%.1fms total=%.1fms",
        model,
        llm_latency_ms,
        total_latency_ms,
    )

    return {
        **state,
        "response": response_text,
        "model_used": model,
        "total_latency_ms": total_latency_ms,
    }


async def execute_tool(state: VoiceAgentState) -> VoiceAgentState:
    """
    Execute tools based on user request.

    Parses the user message to determine which tools to call.
    """
    start_time = time.perf_counter()

    user_message = state["user_message"]
    agent_config = state.get("agent_config", {})
    available_tools = agent_config.get("tools", [])

    tool_results = []

    # Placeholder: In production, this would:
    # 1. Use LLM to determine tool calls
    # 2. Execute tools via the tools module
    # 3. Collect results

    # For now, just pass through
    tool_latency_ms = (time.perf_counter() - start_time) * 1000

    logger.info(
        "Tool execution: tools=%d results=%d latency=%.1fms",
        len(available_tools),
        len(tool_results),
        tool_latency_ms,
    )

    return {
        **state,
        "tool_results": tool_results,
    }


async def generate_with_tool(state: VoiceAgentState) -> VoiceAgentState:
    """
    Generate response incorporating tool results.

    Uses T2 Medium tier for tool-augmented responses.
    """
    start_time = time.perf_counter()

    user_message = state["user_message"]
    conversation_history = state.get("conversation_history", [])
    agent_config = state.get("agent_config", {})
    tool_results = state.get("tool_results", [])

    # Build system prompt with tool results
    base_prompt = agent_config.get("system_prompt", VOICE_SYSTEM_PROMPT)
    if tool_results:
        tool_context = "\n".join(
            f"- {r.get('tool')}: {r.get('result')}"
            for r in tool_results
        )
        system_prompt = (
            f"{base_prompt}\n\n"
            f"=== TOOL RESULTS ===\n{tool_context}\n"
            f"====================\n\n"
            "Use the tool results to answer the user's question."
        )
    else:
        system_prompt = base_prompt

    # Build messages
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history[-10:])
    messages.append({"role": "user", "content": user_message})

    # Select model
    tier = ModelTier.T2_MEDIUM
    model = get_tier_model(tier, LLM_PROVIDER)

    # Call LLM with tracing
    response_text = await traced_llm_call(
        messages=messages,
        model=model,
        tier=tier.value,
        provider=LLM_PROVIDER,
    )

    llm_latency_ms = (time.perf_counter() - start_time) * 1000
    total_latency_ms = state.get("routing_latency_ms", 0) + llm_latency_ms

    logger.info(
        "Generated tool response: model=%s latency=%.1fms",
        model,
        total_latency_ms,
    )

    return {
        **state,
        "response": response_text,
        "model_used": model,
        "total_latency_ms": total_latency_ms,
    }


async def multi_step_reasoning(state: VoiceAgentState) -> VoiceAgentState:
    """
    Handle complex queries requiring multi-step reasoning.

    Uses T3 Heavy tier (Kimi K2.5) for complex reasoning.
    Target latency: <500ms TTFT
    """
    start_time = time.perf_counter()

    user_message = state["user_message"]
    conversation_history = state.get("conversation_history", [])
    agent_config = state.get("agent_config", {})
    rag_context = state.get("rag_context", "")

    # Build enhanced system prompt for complex reasoning
    base_prompt = agent_config.get("system_prompt", VOICE_SYSTEM_PROMPT)
    system_prompt = (
        f"{base_prompt}\n\n"
        "For this complex question, think through your answer step by step, "
        "but provide a concise spoken response at the end."
    )

    if rag_context:
        system_prompt += (
            f"\n\n=== KNOWLEDGE BASE ===\n{rag_context}\n"
            f"======================\n"
        )

    # Build messages
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history[-10:])
    messages.append({"role": "user", "content": user_message})

    # Use T3 Heavy tier for complex reasoning
    tier = ModelTier.T3_HEAVY
    model = get_tier_model(tier, "kimi")  # Always use Kimi K2.5 for T3

    # Call LLM with tracing
    response_text = await traced_llm_call(
        messages=messages,
        model=model,
        tier=tier.value,
        provider="kimi",
    )

    llm_latency_ms = (time.perf_counter() - start_time) * 1000
    total_latency_ms = (
        state.get("routing_latency_ms", 0) +
        state.get("rag_latency_ms", 0) +
        llm_latency_ms
    )

    logger.info(
        "Generated complex response: model=%s latency=%.1fms",
        model,
        total_latency_ms,
    )

    return {
        **state,
        "response": response_text,
        "model_used": model,
        "total_latency_ms": total_latency_ms,
    }


# ─── Routing Logic ────────────────────────────────────────────────────────────


def select_path(state: VoiceAgentState) -> Literal["simple", "rag_needed", "tool_call", "complex"]:
    """
    Select the processing path based on routed intent.

    Returns the next node to execute.
    """
    intent = state.get("intent", "simple")

    if intent == "simple":
        return "simple"
    elif intent == "rag_needed":
        return "rag_needed"
    elif intent == "tool_call":
        return "tool_call"
    elif intent == "complex":
        return "complex"
    else:
        # Default to simple path
        return "simple"


# ─── Graph Construction ───────────────────────────────────────────────────────


def build_voice_agent_graph() -> StateGraph:
    """
    Build the LangGraph voice agent state machine.

    Returns:
        Compiled StateGraph ready for execution
    """
    # Create the graph
    graph = StateGraph(VoiceAgentState)

    # Add nodes
    graph.add_node("route_input", route_input)
    graph.add_node("generate_response", generate_response)
    graph.add_node("retrieve_context", retrieve_context)
    graph.add_node("generate_with_rag", generate_with_rag)
    graph.add_node("execute_tool", execute_tool)
    graph.add_node("generate_with_tool", generate_with_tool)
    graph.add_node("multi_step_reasoning", multi_step_reasoning)

    # Add edges from START
    graph.add_edge(START, "route_input")

    # Add conditional edges from route_input
    graph.add_conditional_edges(
        "route_input",
        select_path,
        {
            "simple": "generate_response",
            "rag_needed": "retrieve_context",
            "tool_call": "execute_tool",
            "complex": "retrieve_context",  # Complex also retrieves context first
        },
    )

    # Add edges from processing nodes to END
    graph.add_edge("generate_response", END)

    # After retrieve_context, route to either generate_with_rag or multi_step_reasoning
    def after_retrieval_routing(state: VoiceAgentState) -> str:
        if state.get("intent") == "complex":
            return "multi_step"
        return "with_rag"

    graph.add_conditional_edges(
        "retrieve_context",
        after_retrieval_routing,
        {
            "with_rag": "generate_with_rag",
            "multi_step": "multi_step_reasoning",
        },
    )

    graph.add_edge("generate_with_rag", END)
    graph.add_edge("execute_tool", "generate_with_tool")
    graph.add_edge("generate_with_tool", END)
    graph.add_edge("multi_step_reasoning", END)

    return graph


# ─── Compiled Agent ───────────────────────────────────────────────────────────

# Build the graph once at module load
_graph = build_voice_agent_graph()

# Compile with memory checkpointing for conversation state (when thread_id provided)
_memory = MemorySaver()
voice_agent_with_memory = _graph.compile(checkpointer=_memory)

# Compile without checkpointing for stateless calls (no thread_id)
voice_agent_stateless = _graph.compile()


async def run_voice_agent(
    user_message: str,
    conversation_history: list[dict] | None = None,
    agent_config: dict | None = None,
    thread_id: str | None = None,
) -> dict:
    """
    Run the voice agent on a user message.

    Args:
        user_message: The user's input text
        conversation_history: Previous conversation turns
        agent_config: Agent configuration (system_prompt, kb_id, tools, etc.)
        thread_id: Optional thread ID for conversation memory

    Returns:
        Dict with response, model_used, tier, and latency metrics
    """
    initial_state: VoiceAgentState = {
        "user_message": user_message,
        "conversation_history": conversation_history or [],
        "agent_config": agent_config or {},
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

    # Configure thread for memory and select agent
    config = {}

    # Use stateful agent with memory if thread_id provided, otherwise stateless
    if thread_id:
        config["configurable"] = {"thread_id": thread_id}
        agent = voice_agent_with_memory
    else:
        agent = voice_agent_stateless

    # Add LangSmith callback if available
    callback = get_langsmith_callback()
    if callback:
        config["callbacks"] = [callback]

    # Run the graph
    result = await agent.ainvoke(initial_state, config)

    return {
        "response": result["response"],
        "model_used": result["model_used"],
        "tier": result["tier"],
        "intent": result["intent"],
        "total_latency_ms": result["total_latency_ms"],
        "routing_latency_ms": result["routing_latency_ms"],
        "rag_latency_ms": result.get("rag_latency_ms", 0),
        "rag_sources": result.get("rag_sources", []),
    }

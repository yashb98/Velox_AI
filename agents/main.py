"""
main.py — FastAPI entrypoint for the Velox LLM agent service.

Exposes:
  POST /generate    →  run the LLM pipeline with tier-based routing (legacy)
  POST /agent/run   →  run the LangGraph voice agent
  GET  /health      →  liveness probe for Docker / Kubernetes

Model Routing:
  T0 Router:  Qwen3.5-3B     → semantic intent classification
  T1 Fast:    Nemotron Nano  → simple queries (70-80% of turns)
  T2 Medium:  Qwen3.5-32B    → moderate complexity
  T3 Heavy:   Kimi K2.5      → complex reasoning (external API)
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from pipeline import PipelineRequest, PipelineResponse, run_pipeline
from voice_agent import run_voice_agent

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="Velox LLM Agent Service", version="2.0.0")


# ─── Request / Response schemas ───────────────────────────────────────────────

class GenerateRequest(BaseModel):
    user_message: str
    context: str = ""
    agent_id: str = ""
    conversation_id: str = ""
    call_sid: str = ""


class GenerateResponse(BaseModel):
    response: str
    model_used: str


# ─── Agent Request / Response schemas ─────────────────────────────────────────


class AgentRequest(BaseModel):
    """Request for the LangGraph voice agent."""

    user_message: str = Field(..., description="The user's input text")
    conversation_history: list[dict] = Field(
        default_factory=list,
        description="Previous conversation turns as [{role, content}, ...]",
    )
    agent_config: dict = Field(
        default_factory=dict,
        description="Agent configuration (system_prompt, kb_id, tools, etc.)",
    )
    thread_id: Optional[str] = Field(
        default=None,
        description="Thread ID for conversation memory",
    )


class AgentResponse(BaseModel):
    """Response from the LangGraph voice agent."""

    response: str = Field(..., description="The agent's response text")
    model_used: str = Field(..., description="Model that generated the response")
    tier: str = Field(..., description="Model tier used (t1_fast, t2_medium, t3_heavy)")
    intent: str = Field(default="", description="Detected intent")
    total_latency_ms: float = Field(
        default=0.0, description="Total processing latency in milliseconds"
    )
    routing_latency_ms: float = Field(
        default=0.0, description="Intent routing latency in milliseconds"
    )
    rag_latency_ms: float = Field(
        default=0.0, description="RAG retrieval latency in milliseconds"
    )
    rag_sources: list[str] = Field(
        default_factory=list, description="Sources used from RAG"
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest) -> GenerateResponse:
    """
    Main inference endpoint called by the Node.js orchestrator.
    Routes to T1/T2/T3 tiers based on semantic classification.
    """
    if not req.user_message.strip():
        raise HTTPException(status_code=400, detail="user_message must not be empty")

    logger.info(
        "Generating response | agent=%s conv=%s words=%d",
        req.agent_id,
        req.conversation_id,
        len(req.user_message.split()),
    )

    pipeline_req = PipelineRequest(
        user_message=req.user_message,
        context=req.context,
        agent_id=req.agent_id,
        conversation_id=req.conversation_id,
        call_sid=req.call_sid,
    )

    result: PipelineResponse = await run_pipeline(pipeline_req)

    logger.info("Response generated | model=%s", result.model_used)
    return GenerateResponse(response=result.response, model_used=result.model_used)


@app.post("/agent/run", response_model=AgentResponse)
async def agent_run(req: AgentRequest) -> AgentResponse:
    """
    Run the LangGraph voice agent.

    This endpoint uses the state machine-based voice agent for:
    - Intent classification and routing
    - Conditional RAG retrieval
    - Multi-tier LLM selection
    - Tool execution (when configured)

    Target latency: <800ms voice-to-voice (graph overhead <10ms)
    """
    if not req.user_message.strip():
        raise HTTPException(status_code=400, detail="user_message must not be empty")

    logger.info(
        "Agent run | thread=%s words=%d history_turns=%d",
        req.thread_id or "none",
        len(req.user_message.split()),
        len(req.conversation_history),
    )

    try:
        result = await run_voice_agent(
            user_message=req.user_message,
            conversation_history=req.conversation_history,
            agent_config=req.agent_config,
            thread_id=req.thread_id,
        )

        logger.info(
            "Agent response | model=%s tier=%s latency=%.1fms",
            result["model_used"],
            result["tier"],
            result["total_latency_ms"],
        )

        return AgentResponse(
            response=result["response"],
            model_used=result["model_used"],
            tier=result["tier"],
            intent=result.get("intent", ""),
            total_latency_ms=result["total_latency_ms"],
            routing_latency_ms=result.get("routing_latency_ms", 0),
            rag_latency_ms=result.get("rag_latency_ms", 0),
            rag_sources=result.get("rag_sources", []),
        )

    except Exception as exc:
        logger.error("Agent run failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "velox-llm-agents"}


# ─── Entrypoint ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)

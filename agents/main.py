"""
main.py — FastAPI entrypoint for the Velox LLM agent service.

Exposes:
  POST /generate   →  run the LLM pipeline with tier-based routing
  GET  /health     →  liveness probe for Docker / Kubernetes

Model Routing:
  T0 Router:  Qwen3.5-3B     → semantic intent classification
  T1 Fast:    Nemotron Nano  → simple queries (70-80% of turns)
  T2 Medium:  Qwen3.5-32B    → moderate complexity
  T3 Heavy:   Kimi K2.5      → complex reasoning (external API)
"""

from __future__ import annotations

import logging
import os

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from pipeline import PipelineRequest, PipelineResponse, run_pipeline

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


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "velox-llm-agents"}


# ─── Entrypoint ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)

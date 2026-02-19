"""
main.py — FastAPI entrypoint for the Velox ADK agent service.

Exposes:
  POST /generate   →  run the ADK pipeline and return an AI response
  GET  /health     →  liveness probe for Docker / Kubernetes
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
app = FastAPI(title="Velox ADK Agent Service", version="1.0.0")


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
    Runs the ADK pipeline (Phi-3 / Flash / Pro routing) and returns the reply.
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
    return {"status": "ok", "service": "velox-adk-agents"}


# ─── Entrypoint ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)

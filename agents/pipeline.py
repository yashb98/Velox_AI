"""
pipeline.py — Google ADK multi-agent pipeline for Velox AI voice calls.

Architecture (A1 + A4):
  SequentialAgent
    └─ RouterAgent       (chooses Phi-3 / Gemini-Flash / Gemini-Pro)
    └─ ResponderAgent    (generates the final reply using chosen model)

Routing heuristic (A4):
  word_count < 15  →  Phi-3-mini  (SLM, < 70 % of turns)
  word_count < 50  →  gemini-2.5-flash
  else             →  gemini-2.5-pro
"""

from __future__ import annotations

import os
import logging
from dataclasses import dataclass
from typing import Optional

import httpx
from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.models.lite_llm import LiteLlm

logger = logging.getLogger(__name__)

# ─── Environment ──────────────────────────────────────────────────────────────
GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY", "")
PHI3_SERVICE_URL = os.getenv("PHI3_SERVICE_URL", "")   # e.g. http://slm:8001/generate

# ─── Model aliases ────────────────────────────────────────────────────────────
GEMINI_FLASH = "gemini-2.5-flash"
GEMINI_PRO   = "gemini-2.5-pro"

# ─── Routing thresholds (A4) ──────────────────────────────────────────────────
PHI3_MAX_WORDS  = 15   # < 15 words → Phi-3-mini  (~70 % of short turns)
FLASH_MAX_WORDS = 50   # < 50 words → Gemini Flash (~25 %)
                       #  ≥ 50 words → Gemini Pro   (~ 5 %)


@dataclass
class PipelineRequest:
    user_message: str
    context: str = ""
    agent_id: str = ""
    conversation_id: str = ""
    call_sid: str = ""


@dataclass
class PipelineResponse:
    response: str
    model_used: str


# ─── Phi-3 SLM proxy (A4) ────────────────────────────────────────────────────

async def _call_phi3(user_message: str, context: str, system_prompt: str) -> Optional[str]:
    """
    Calls the Phi-3-mini SLM sidecar service.
    Returns None on any error so the caller can fall back to Gemini Flash.
    """
    if not PHI3_SERVICE_URL:
        logger.warning("PHI3_SERVICE_URL not set — skipping Phi-3 route")
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                PHI3_SERVICE_URL,
                json={
                    "system": system_prompt,
                    "context": context,
                    "message": user_message,
                },
            )
            resp.raise_for_status()
            return resp.json().get("response")
    except Exception as exc:
        logger.error("Phi-3 call failed: %s", exc)
        return None


# ─── ADK agent builders ───────────────────────────────────────────────────────

def _build_flash_agent(system_prompt: str) -> LlmAgent:
    return LlmAgent(
        name="gemini_flash_responder",
        model=LiteLlm(model=f"google/{GEMINI_FLASH}", api_key=GEMINI_API_KEY),
        instruction=system_prompt,
        description="Fast responder for medium-length queries",
    )


def _build_pro_agent(system_prompt: str) -> LlmAgent:
    return LlmAgent(
        name="gemini_pro_responder",
        model=LiteLlm(model=f"google/{GEMINI_PRO}", api_key=GEMINI_API_KEY),
        instruction=system_prompt,
        description="High-quality responder for complex queries",
    )


# ─── Main pipeline entry point ────────────────────────────────────────────────

async def run_pipeline(req: PipelineRequest) -> PipelineResponse:
    """
    Entry point called by main.py for every incoming /generate request.

    Routing logic (A4):
      1.  word_count < PHI3_MAX_WORDS  →  try Phi-3-mini SLM first
          (falls back to Flash if PHI3_SERVICE_URL is unset or call fails)
      2.  word_count < FLASH_MAX_WORDS →  Gemini 2.5 Flash
      3.  else                         →  Gemini 2.5 Pro
    """
    word_count = len(req.user_message.split())
    system_prompt = _build_system_prompt(req.context)

    # ── Phi-3 path (A4) ───────────────────────────────────────────────────────
    if word_count < PHI3_MAX_WORDS:
        phi3_reply = await _call_phi3(req.user_message, req.context, system_prompt)
        if phi3_reply:
            logger.info("Route: phi-3-mini (words=%d)", word_count)
            return PipelineResponse(response=phi3_reply, model_used="phi-3-mini")
        # Fall through to Flash on failure
        logger.info("Phi-3 fallback → gemini-flash (words=%d)", word_count)

    # ── Gemini Flash path ─────────────────────────────────────────────────────
    if word_count < FLASH_MAX_WORDS:
        agent = _build_flash_agent(system_prompt)
        logger.info("Route: gemini-flash (words=%d)", word_count)
        model_used = GEMINI_FLASH
    else:
        # ── Gemini Pro path ───────────────────────────────────────────────────
        agent = _build_pro_agent(system_prompt)
        logger.info("Route: gemini-pro (words=%d)", word_count)
        model_used = GEMINI_PRO

    # Run the chosen ADK agent
    result = await agent.run_async(req.user_message)
    response_text = result.text if hasattr(result, "text") else str(result)

    return PipelineResponse(response=response_text, model_used=model_used)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _build_system_prompt(context: str) -> str:
    base = (
        "You are Velox, a professional voice AI assistant. "
        "Keep answers concise — under two sentences. "
        "Do not use markdown formatting; your reply will be spoken aloud."
    )
    if context:
        return f"{base}\n\n=== KNOWLEDGE BASE ===\n{context}\n======================\n"
    return base

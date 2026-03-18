"""
pipeline.py — Multi-provider LLM pipeline for Velox AI voice calls.

Supports:
  - Kimi/Moonshot AI (OpenAI-compatible)
  - Google Gemini (via ADK)
  - OpenAI

Architecture (A1 + A4):
  SequentialAgent
    └─ RouterAgent       (chooses Phi-3 / Flash / Pro tier)
    └─ ResponderAgent    (generates the final reply using chosen model)

Routing heuristic (A4):
  word_count < 15  →  Phi-3-mini or cheapest model  (SLM, < 70 % of turns)
  word_count < 50  →  Mid-tier model (gemini-flash or kimi-8k)
  else             →  Top-tier model (gemini-pro or kimi-128k)
"""

from __future__ import annotations

import os
import logging
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ─── Environment ──────────────────────────────────────────────────────────────
LLM_PROVIDER     = os.getenv("LLM_PROVIDER", "gemini").lower()
GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY", "")
KIMI_API_KEY     = os.getenv("KIMI_API_KEY", os.getenv("MOONSHOT_API_KEY", ""))
KIMI_BASE_URL    = os.getenv("KIMI_BASE_URL", "https://api.moonshot.cn/v1")
OPENAI_API_KEY   = os.getenv("OPENAI_API_KEY", "")
PHI3_SERVICE_URL = os.getenv("PHI3_SERVICE_URL", "")   # e.g. http://slm:8001/generate

# ─── Model aliases per provider ───────────────────────────────────────────────
MODELS = {
    "kimi": {
        "fast": os.getenv("KIMI_MODEL", "moonshot-v1-8k"),
        "balanced": "moonshot-v1-32k",
        "powerful": "moonshot-v1-128k",
    },
    "gemini": {
        "fast": "gemini-2.5-flash",
        "balanced": "gemini-2.5-flash",
        "powerful": "gemini-2.5-pro",
    },
    "openai": {
        "fast": "gpt-4o-mini",
        "balanced": "gpt-4o-mini",
        "powerful": "gpt-4o",
    },
}

# ─── Routing thresholds (A4) ──────────────────────────────────────────────────
PHI3_MAX_WORDS  = 15   # < 15 words → Phi-3-mini  (~70 % of short turns)
FLASH_MAX_WORDS = 50   # < 50 words → Fast model (~25 %)
                       #  ≥ 50 words → Powerful model (~ 5 %)


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
    Returns None on any error so the caller can fall back to the main LLM.
    """
    if not PHI3_SERVICE_URL:
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


# ─── OpenAI-compatible API call (Kimi, OpenAI) ────────────────────────────────

async def _call_openai_compatible(
    user_message: str,
    context: str,
    system_prompt: str,
    model: str,
    api_key: str,
    base_url: str = "https://api.openai.com/v1"
) -> str:
    """
    Calls any OpenAI-compatible API (Kimi, OpenAI, etc.)
    """
    full_system = system_prompt
    if context:
        full_system += f"\n\n=== KNOWLEDGE BASE ===\n{context}\n======================"

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": full_system},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.7,
                "max_tokens": 256,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


# ─── Gemini API call (via ADK) ────────────────────────────────────────────────

async def _call_gemini(user_message: str, context: str, system_prompt: str, model: str) -> str:
    """
    Calls Gemini via Google ADK LiteLLM.
    """
    try:
        from google.adk.agents import LlmAgent
        from google.adk.models.lite_llm import LiteLlm

        full_instruction = system_prompt
        if context:
            full_instruction += f"\n\n=== KNOWLEDGE BASE ===\n{context}\n======================"

        agent = LlmAgent(
            name="gemini_responder",
            model=LiteLlm(model=f"google/{model}", api_key=GEMINI_API_KEY),
            instruction=full_instruction,
            description="Gemini responder",
        )

        result = await agent.run_async(user_message)
        return result.text if hasattr(result, "text") else str(result)
    except Exception as exc:
        logger.error("Gemini call failed: %s", exc)
        raise


# ─── Main pipeline entry point ────────────────────────────────────────────────

async def run_pipeline(req: PipelineRequest) -> PipelineResponse:
    """
    Entry point called by main.py for every incoming /generate request.

    Routing logic (A4):
      1.  word_count < PHI3_MAX_WORDS  →  try Phi-3-mini SLM first
          (falls back to fast model if PHI3_SERVICE_URL is unset or call fails)
      2.  word_count < FLASH_MAX_WORDS →  Fast model
      3.  else                         →  Powerful model
    """
    word_count = len(req.user_message.split())
    system_prompt = _build_system_prompt("")

    # Get models for current provider
    provider_models = MODELS.get(LLM_PROVIDER, MODELS["gemini"])

    # ── Phi-3 path (A4) ───────────────────────────────────────────────────────
    if word_count < PHI3_MAX_WORDS and PHI3_SERVICE_URL:
        phi3_reply = await _call_phi3(req.user_message, req.context, system_prompt)
        if phi3_reply:
            logger.info("Route: phi-3-mini (words=%d)", word_count)
            return PipelineResponse(response=phi3_reply, model_used="phi-3-mini")
        logger.info("Phi-3 fallback → %s (words=%d)", provider_models["fast"], word_count)

    # ── Select model tier based on word count ─────────────────────────────────
    if word_count < FLASH_MAX_WORDS:
        model = provider_models["fast"]
        tier = "fast"
    else:
        model = provider_models["powerful"]
        tier = "powerful"

    logger.info("Route: %s (%s tier, words=%d, provider=%s)", model, tier, word_count, LLM_PROVIDER)

    # ── Call the appropriate provider ─────────────────────────────────────────
    try:
        if LLM_PROVIDER == "kimi":
            response_text = await _call_openai_compatible(
                req.user_message,
                req.context,
                system_prompt,
                model,
                KIMI_API_KEY,
                KIMI_BASE_URL,
            )
        elif LLM_PROVIDER == "openai":
            response_text = await _call_openai_compatible(
                req.user_message,
                req.context,
                system_prompt,
                model,
                OPENAI_API_KEY,
                "https://api.openai.com/v1",
            )
        else:  # Default: Gemini
            response_text = await _call_gemini(
                req.user_message,
                req.context,
                system_prompt,
                model,
            )

        return PipelineResponse(response=response_text, model_used=model)

    except Exception as exc:
        logger.error("LLM call failed: %s", exc)
        # Return a fallback response
        return PipelineResponse(
            response="I'm having trouble processing that right now. Please try again.",
            model_used=f"{model} (error)",
        )


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

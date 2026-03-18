"""
pipeline.py — Multi-provider LLM pipeline for Velox AI voice calls.

Supports:
  - SGLang (self-hosted on Modal) — primary for T1/T2
  - Kimi/Moonshot AI (OpenAI-compatible) — T3 fallback
  - OpenAI — alternative fallback

Model Routing Architecture:
  T0 Router:  Qwen3.5-3B     → classify intent + complexity  (<30ms)
  T1 Fast:    Nemotron Nano  → 70-80% of turns               (<100ms TTFT)
  T2 Medium:  Qwen3.5-35B    → multi-turn, tool orchestration (<200ms TTFT)
  T3 Heavy:   Kimi K2.5 API  → edge cases, multi-hop RAG     (<500ms TTFT)

The semantic router (router.py) classifies intent to select the tier.
Word count heuristic is used as fallback when SGLang is unavailable.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional

import httpx

from router import ModelTier, route_request, get_tier_model

logger = logging.getLogger(__name__)

# ─── Environment ──────────────────────────────────────────────────────────────

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "sglang").lower()

# SGLang (self-hosted on Modal)
SGLANG_BASE_URL = os.getenv("SGLANG_BASE_URL", "")
SGLANG_API_KEY = os.getenv("SGLANG_API_KEY", "")

# Kimi / Moonshot AI (T3 fallback + alternative provider)
KIMI_API_KEY = os.getenv("KIMI_API_KEY", os.getenv("MOONSHOT_API_KEY", ""))
KIMI_BASE_URL = os.getenv("KIMI_BASE_URL", "https://api.moonshot.cn/v1")

# OpenAI (alternative fallback)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# ─── Model Configuration ─────────────────────────────────────────────────────

MODELS = {
    "sglang": {
        "router": os.getenv("SGLANG_MODEL_T0", "Qwen/Qwen2.5-3B-Instruct"),
        "fast": os.getenv("SGLANG_MODEL_T1", "nvidia/Nemotron-3-Nano-4B-Instruct"),
        "medium": os.getenv("SGLANG_MODEL_T2", "Qwen/Qwen2.5-32B-Instruct"),
    },
    "kimi": {
        "fast": os.getenv("KIMI_MODEL", "moonshot-v1-8k"),
        "balanced": "moonshot-v1-32k",
        "powerful": os.getenv("KIMI_MODEL_POWERFUL", "kimi-k2.5"),
    },
    "openai": {
        "fast": "gpt-4o-mini",
        "balanced": "gpt-4o-mini",
        "powerful": "gpt-4o",
    },
}

# ─── Routing Thresholds (fallback when no semantic router) ────────────────────

T1_MAX_WORDS = int(os.getenv("T1_MAX_WORDS", "15"))
T2_MAX_WORDS = int(os.getenv("T2_MAX_WORDS", "50"))


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
    tier: str = ""
    latency_ms: float = 0.0


# ─── OpenAI-compatible API call ───────────────────────────────────────────────


async def _call_openai_compatible(
    user_message: str,
    context: str,
    system_prompt: str,
    model: str,
    api_key: str,
    base_url: str = "https://api.openai.com/v1",
) -> str:
    """
    Calls any OpenAI-compatible API (SGLang, Kimi, OpenAI).

    SGLang on Modal exposes the same /v1/chat/completions endpoint.
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


async def _call_sglang(
    user_message: str,
    context: str,
    system_prompt: str,
    model: str,
) -> str:
    """
    Calls SGLang server (self-hosted on Modal).

    Uses the same OpenAI-compatible interface.
    """
    if not SGLANG_BASE_URL:
        raise ValueError("SGLANG_BASE_URL not configured")

    return await _call_openai_compatible(
        user_message=user_message,
        context=context,
        system_prompt=system_prompt,
        model=model,
        api_key=SGLANG_API_KEY,
        base_url=SGLANG_BASE_URL,
    )


# ─── Main pipeline entry point ────────────────────────────────────────────────


async def run_pipeline(req: PipelineRequest) -> PipelineResponse:
    """
    Entry point called by main.py for every incoming /generate request.

    Routing logic:
      1. Use semantic router (T0) to classify intent if SGLang is available
      2. Fall back to word count heuristic otherwise
      3. Route to T1 (Nemotron Nano), T2 (Qwen 32B), or T3 (Kimi K2.5)
    """
    import time

    start_time = time.perf_counter()
    system_prompt = _build_system_prompt("")

    # ── Route the request ─────────────────────────────────────────────────────
    routing_result = await route_request(req.user_message)
    tier = routing_result.tier

    logger.info(
        "Route: tier=%s intent=%s confidence=%.2f routing_ms=%.1f provider=%s",
        tier.value,
        routing_result.intent,
        routing_result.confidence,
        routing_result.latency_ms,
        LLM_PROVIDER,
    )

    # ── Select provider and model based on tier ───────────────────────────────
    try:
        if LLM_PROVIDER == "sglang" and SGLANG_BASE_URL:
            # SGLang for T1 and T2
            if tier in (ModelTier.T1_FAST, ModelTier.T2_MEDIUM):
                model = get_tier_model(tier, "sglang")
                response_text = await _call_sglang(
                    req.user_message,
                    req.context,
                    system_prompt,
                    model,
                )
            else:
                # T3 goes to Kimi K2.5
                model = MODELS["kimi"]["powerful"]
                response_text = await _call_openai_compatible(
                    req.user_message,
                    req.context,
                    system_prompt,
                    model,
                    KIMI_API_KEY,
                    KIMI_BASE_URL,
                )

        elif LLM_PROVIDER == "kimi":
            # All tiers go through Kimi
            if tier == ModelTier.T1_FAST:
                model = MODELS["kimi"]["fast"]
            elif tier == ModelTier.T2_MEDIUM:
                model = MODELS["kimi"]["balanced"]
            else:
                model = MODELS["kimi"]["powerful"]

            response_text = await _call_openai_compatible(
                req.user_message,
                req.context,
                system_prompt,
                model,
                KIMI_API_KEY,
                KIMI_BASE_URL,
            )

        elif LLM_PROVIDER == "openai":
            # All tiers go through OpenAI
            if tier == ModelTier.T1_FAST:
                model = MODELS["openai"]["fast"]
            elif tier == ModelTier.T2_MEDIUM:
                model = MODELS["openai"]["balanced"]
            else:
                model = MODELS["openai"]["powerful"]

            response_text = await _call_openai_compatible(
                req.user_message,
                req.context,
                system_prompt,
                model,
                OPENAI_API_KEY,
                "https://api.openai.com/v1",
            )

        else:
            # Default fallback to Kimi
            model = MODELS["kimi"]["fast"]
            response_text = await _call_openai_compatible(
                req.user_message,
                req.context,
                system_prompt,
                model,
                KIMI_API_KEY,
                KIMI_BASE_URL,
            )

        total_latency_ms = (time.perf_counter() - start_time) * 1000
        logger.info(
            "Response generated: model=%s tier=%s total_ms=%.1f",
            model, tier.value, total_latency_ms
        )

        return PipelineResponse(
            response=response_text,
            model_used=model,
            tier=tier.value,
            latency_ms=total_latency_ms,
        )

    except Exception as exc:
        logger.error("LLM call failed: %s", exc)
        total_latency_ms = (time.perf_counter() - start_time) * 1000

        return PipelineResponse(
            response="I'm having trouble processing that right now. Please try again.",
            model_used=f"{LLM_PROVIDER} (error)",
            tier=tier.value,
            latency_ms=total_latency_ms,
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

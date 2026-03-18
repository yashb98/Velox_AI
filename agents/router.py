# agents/router.py
"""
T0 Semantic Router for Velox AI voice pipeline.

Uses a small, fast model (Qwen3.5-3B) to classify user intent and complexity,
routing requests to the appropriate model tier:
  - T1 Fast:   Simple queries, greetings, acknowledgments (<100ms TTFT)
  - T2 Medium: Information requests, explanations (<200ms TTFT)
  - T3 Heavy:  Complex reasoning, multi-hop queries (<500ms TTFT)

Target latency: <30ms for classification.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────

SGLANG_BASE_URL = os.getenv("SGLANG_BASE_URL", "")
SGLANG_API_KEY = os.getenv("SGLANG_API_KEY", "")
ROUTER_MODEL = os.getenv("SGLANG_MODEL_T0", "Qwen/Qwen2.5-3B-Instruct")

# Fallback: if no SGLang, use word count heuristic
ENABLE_SEMANTIC_ROUTER = bool(SGLANG_BASE_URL)


class ModelTier(Enum):
    """Model tiers for routing."""

    T1_FAST = "t1_fast"      # Nemotron Nano - simple queries
    T2_MEDIUM = "t2_medium"  # Qwen 32B - moderate complexity
    T3_HEAVY = "t3_heavy"    # Kimi K2.5 - complex reasoning


@dataclass
class RoutingResult:
    """Result from the semantic router."""

    tier: ModelTier
    intent: str
    confidence: float
    latency_ms: float


# ─── Intent Classification Prompt ─────────────────────────────────────────────

ROUTER_SYSTEM_PROMPT = """You are an intent classifier for a voice AI assistant.
Classify the user's message into exactly one intent category.

Intent categories:
- greeting: Hello, hi, hey, good morning, etc.
- farewell: Goodbye, bye, see you, etc.
- acknowledgment: Yes, okay, sure, thanks, got it, etc.
- confirmation: Confirming something (yes to a question)
- rejection: No, nope, cancel, etc.
- simple_question: One-word or very simple factual questions
- information_request: Asking for specific information or details
- explanation: Asking for explanations or how something works
- comparison: Comparing options or alternatives
- recommendation: Asking for suggestions or advice
- troubleshooting: Reporting problems or asking for help fixing issues
- multi_step_reasoning: Complex questions requiring multiple reasoning steps
- complex_analysis: Requests for detailed analysis or evaluation
- creative_task: Creative writing, brainstorming, etc.

Respond with ONLY the intent name, nothing else."""


# ─── Intent to Tier Mapping ───────────────────────────────────────────────────

INTENT_TO_TIER = {
    # T1 Fast (Nemotron Nano) - 70-80% of voice turns
    "greeting": ModelTier.T1_FAST,
    "farewell": ModelTier.T1_FAST,
    "acknowledgment": ModelTier.T1_FAST,
    "confirmation": ModelTier.T1_FAST,
    "rejection": ModelTier.T1_FAST,
    "simple_question": ModelTier.T1_FAST,

    # T2 Medium (Qwen 32B) - 15-25% of turns
    "information_request": ModelTier.T2_MEDIUM,
    "explanation": ModelTier.T2_MEDIUM,
    "comparison": ModelTier.T2_MEDIUM,
    "recommendation": ModelTier.T2_MEDIUM,
    "troubleshooting": ModelTier.T2_MEDIUM,

    # T3 Heavy (Kimi K2.5) - 5-10% of turns
    "multi_step_reasoning": ModelTier.T3_HEAVY,
    "complex_analysis": ModelTier.T3_HEAVY,
    "creative_task": ModelTier.T3_HEAVY,
}


# ─── Word Count Fallback ──────────────────────────────────────────────────────

T1_MAX_WORDS = int(os.getenv("T1_MAX_WORDS", "15"))
T2_MAX_WORDS = int(os.getenv("T2_MAX_WORDS", "50"))


def route_by_word_count(word_count: int) -> ModelTier:
    """Fallback routing based on word count."""
    if word_count < T1_MAX_WORDS:
        return ModelTier.T1_FAST
    elif word_count < T2_MAX_WORDS:
        return ModelTier.T2_MEDIUM
    else:
        return ModelTier.T3_HEAVY


# ─── Semantic Router ──────────────────────────────────────────────────────────


async def classify_intent(user_message: str, timeout: float = 0.5) -> Optional[str]:
    """
    Classify user intent using T0 router model.

    Args:
        user_message: User's input text
        timeout: Max time for classification (default 500ms)

    Returns:
        Intent string or None if classification fails
    """
    if not SGLANG_BASE_URL:
        return None

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{SGLANG_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {SGLANG_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": ROUTER_MODEL,
                    "messages": [
                        {"role": "system", "content": ROUTER_SYSTEM_PROMPT},
                        {"role": "user", "content": user_message},
                    ],
                    "temperature": 0.0,  # Deterministic classification
                    "max_tokens": 20,    # Intent names are short
                },
            )
            resp.raise_for_status()
            data = resp.json()

            intent = data["choices"][0]["message"]["content"].strip().lower()
            # Clean up any extra text
            intent = intent.split()[0] if intent else ""

            return intent if intent in INTENT_TO_TIER else None

    except Exception as exc:
        logger.warning("Intent classification failed: %s", exc)
        return None


async def route_request(user_message: str) -> RoutingResult:
    """
    Route a user message to the appropriate model tier.

    Uses semantic classification if SGLang router is available,
    falls back to word count heuristic otherwise.

    Args:
        user_message: User's input text

    Returns:
        RoutingResult with tier, intent, confidence, and latency
    """
    start_time = time.perf_counter()
    word_count = len(user_message.split())

    # Try semantic classification first
    if ENABLE_SEMANTIC_ROUTER:
        intent = await classify_intent(user_message)

        if intent and intent in INTENT_TO_TIER:
            latency_ms = (time.perf_counter() - start_time) * 1000
            tier = INTENT_TO_TIER[intent]

            logger.info(
                "Semantic route: intent=%s tier=%s latency=%.1fms",
                intent, tier.value, latency_ms
            )

            return RoutingResult(
                tier=tier,
                intent=intent,
                confidence=0.9,  # High confidence from model
                latency_ms=latency_ms,
            )

    # Fallback to word count heuristic
    tier = route_by_word_count(word_count)
    latency_ms = (time.perf_counter() - start_time) * 1000

    logger.info(
        "Word count route: words=%d tier=%s latency=%.1fms",
        word_count, tier.value, latency_ms
    )

    return RoutingResult(
        tier=tier,
        intent="word_count_heuristic",
        confidence=0.7,  # Lower confidence for heuristic
        latency_ms=latency_ms,
    )


def get_tier_model(tier: ModelTier, provider: str = "sglang") -> str:
    """
    Get the model ID for a given tier and provider.

    Args:
        tier: Model tier (T1, T2, T3)
        provider: LLM provider (sglang, kimi)

    Returns:
        Model ID string
    """
    TIER_MODELS = {
        "sglang": {
            ModelTier.T1_FAST: os.getenv("SGLANG_MODEL_T1", "nvidia/Nemotron-3-Nano-4B-Instruct"),
            ModelTier.T2_MEDIUM: os.getenv("SGLANG_MODEL_T2", "Qwen/Qwen2.5-32B-Instruct"),
            ModelTier.T3_HEAVY: os.getenv("SGLANG_MODEL_T2", "Qwen/Qwen2.5-32B-Instruct"),  # Fallback
        },
        "kimi": {
            ModelTier.T1_FAST: os.getenv("KIMI_MODEL_FAST", "moonshot-v1-8k"),
            ModelTier.T2_MEDIUM: os.getenv("KIMI_MODEL", "moonshot-v1-32k"),
            ModelTier.T3_HEAVY: os.getenv("KIMI_MODEL_POWERFUL", "kimi-k2.5"),
        },
    }

    provider_models = TIER_MODELS.get(provider, TIER_MODELS["sglang"])
    return provider_models.get(tier, provider_models[ModelTier.T1_FAST])

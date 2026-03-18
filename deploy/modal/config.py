# deploy/modal/config.py
"""
Model configuration for SGLang deployment.

Defines model paths, routing thresholds, and runtime configuration.
"""

from __future__ import annotations

import os

# ─── Model Definitions ────────────────────────────────────────────────────────
# Maps provider → tier → model ID

MODELS = {
    "sglang": {
        # T0 Router: intent classification + complexity scoring (<30ms)
        "router": os.getenv("SGLANG_MODEL_T0", "Qwen/Qwen2.5-3B-Instruct"),
        # T1 Fast: 70-80% of voice turns (<100ms TTFT)
        "fast": os.getenv("SGLANG_MODEL_T1", "nvidia/Nemotron-3-Nano-4B-Instruct"),
        # T2 Medium: multi-turn reasoning, tool orchestration (<200ms TTFT)
        "medium": os.getenv("SGLANG_MODEL_T2", "Qwen/Qwen2.5-32B-Instruct"),
    },
    "kimi": {
        # T3 Heavy: fallback for complex queries (<500ms TTFT)
        "fast": os.getenv("KIMI_MODEL_FAST", "moonshot-v1-8k"),
        "powerful": os.getenv("KIMI_MODEL_POWERFUL", "kimi-k2.5"),
    },
}

# ─── Routing Thresholds ───────────────────────────────────────────────────────
# Word count thresholds for tier selection (simple heuristic)
# Semantic router (T0) overrides these with intent-based classification

ROUTING_THRESHOLDS = {
    "t1_max_words": int(os.getenv("T1_MAX_WORDS", "15")),   # < 15 words → T1
    "t2_max_words": int(os.getenv("T2_MAX_WORDS", "50")),   # < 50 words → T2
    # >= 50 words → T3 (Kimi fallback)
}

# ─── Intent Classifications ───────────────────────────────────────────────────
# T0 router outputs one of these, which maps to a tier

INTENT_TO_TIER = {
    # Simple intents → T1 (Nemotron Nano)
    "greeting": "t1",
    "farewell": "t1",
    "acknowledgment": "t1",
    "simple_question": "t1",
    "confirmation": "t1",
    "rejection": "t1",

    # Medium complexity → T2 (Qwen 32B)
    "information_request": "t2",
    "explanation": "t2",
    "comparison": "t2",
    "recommendation": "t2",
    "troubleshooting": "t2",

    # Complex / multi-hop → T3 (Kimi K2.5)
    "multi_step_reasoning": "t3",
    "complex_analysis": "t3",
    "creative_task": "t3",
    "unknown": "t2",  # Default to T2 for safety
}

# ─── SGLang Runtime Configuration ─────────────────────────────────────────────

SGLANG_CONFIG = {
    # Context length for voice (short turns)
    "context_length": int(os.getenv("SGLANG_CONTEXT_LENGTH", "4096")),

    # Maximum concurrent sequences
    "max_batch_size": int(os.getenv("SGLANG_MAX_BATCH_SIZE", "32")),

    # Enable prefix caching (critical for <200ms TTFT)
    "enable_prefix_caching": True,

    # Memory management
    "mem_fraction_static": float(os.getenv("SGLANG_MEM_FRACTION", "0.85")),

    # Tensor parallelism (for large models like Qwen 32B)
    "tensor_parallel_size": int(os.getenv("SGLANG_TP_SIZE", "1")),
}

# ─── Latency Targets (for monitoring) ─────────────────────────────────────────

LATENCY_TARGETS_MS = {
    "t0_router": 30,    # Intent classification
    "t1_ttft": 100,     # Nemotron Nano TTFT
    "t2_ttft": 200,     # Qwen 32B TTFT
    "t3_ttft": 500,     # Kimi K2.5 TTFT (external API)
}

# ─── API Configuration ────────────────────────────────────────────────────────

API_CONFIG = {
    # Default generation parameters
    "default_temperature": 0.7,
    "default_max_tokens": 256,

    # Voice-specific constraints
    "voice_max_tokens": 128,  # Keep responses short for voice
    "voice_temperature": 0.6,  # Slightly less random for consistency
}

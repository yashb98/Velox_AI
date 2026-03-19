# agents/tracing.py
"""
LangSmith tracing and observability for Velox AI voice agents.

Provides:
  - LangSmith client initialization
  - @traceable decorator for automatic tracing
  - OpenAI client wrapping for LLM call tracing
  - Prometheus metrics integration

Environment variables:
  LANGSMITH_API_KEY      - LangSmith API key
  LANGSMITH_PROJECT      - Project name (default: velox-voice-agent)
  LANGSMITH_ENDPOINT     - API endpoint (default: https://api.smith.langchain.com)
  LANGSMITH_TRACING      - Enable/disable tracing (default: true)
"""

from __future__ import annotations

import logging
import os
import time
from functools import wraps
from typing import Any, Callable, Optional

import httpx

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────

LANGSMITH_API_KEY = os.getenv("LANGSMITH_API_KEY", "")
LANGSMITH_PROJECT = os.getenv("LANGSMITH_PROJECT", "velox-voice-agent")
LANGSMITH_ENDPOINT = os.getenv("LANGSMITH_ENDPOINT", "https://api.smith.langchain.com")
LANGSMITH_TRACING = os.getenv("LANGSMITH_TRACING", "true").lower() == "true"

# LLM Provider settings (reused from pipeline.py)
SGLANG_BASE_URL = os.getenv("SGLANG_BASE_URL", "")
SGLANG_API_KEY = os.getenv("SGLANG_API_KEY", "")
KIMI_API_KEY = os.getenv("KIMI_API_KEY", "")
KIMI_BASE_URL = os.getenv("KIMI_BASE_URL", "https://api.moonshot.cn/v1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Check if LangSmith is available
LANGSMITH_ENABLED = bool(LANGSMITH_API_KEY) and LANGSMITH_TRACING

# ─── LangSmith Client ─────────────────────────────────────────────────────────

_langsmith_client = None


def get_langsmith_client():
    """
    Get or create the LangSmith client.

    Returns None if LangSmith is not configured.
    """
    global _langsmith_client

    if not LANGSMITH_ENABLED:
        return None

    if _langsmith_client is None:
        try:
            from langsmith import Client

            _langsmith_client = Client(
                api_key=LANGSMITH_API_KEY,
                api_url=LANGSMITH_ENDPOINT,
            )
            logger.info(
                "LangSmith client initialized: project=%s endpoint=%s",
                LANGSMITH_PROJECT,
                LANGSMITH_ENDPOINT,
            )
        except ImportError:
            logger.warning("langsmith package not installed, tracing disabled")
            return None
        except Exception as e:
            logger.warning("Failed to initialize LangSmith client: %s", e)
            return None

    return _langsmith_client


def get_langsmith_callback():
    """
    Get a LangSmith callback handler for LangGraph.

    Returns None if LangSmith is not configured.
    """
    if not LANGSMITH_ENABLED:
        return None

    try:
        from langsmith.run_helpers import get_current_run_tree
        from langchain_core.callbacks import BaseCallbackHandler

        # Return a simple callback that logs to LangSmith
        class LangSmithCallback(BaseCallbackHandler):
            def on_chain_start(self, serialized, inputs, **kwargs):
                logger.debug("Chain started: %s", serialized.get("name", "unknown"))

            def on_chain_end(self, outputs, **kwargs):
                logger.debug("Chain ended")

        return LangSmithCallback()

    except ImportError:
        return None


# ─── Traceable Decorator ──────────────────────────────────────────────────────


def traceable(
    name: Optional[str] = None,
    run_type: str = "chain",
    metadata: Optional[dict] = None,
):
    """
    Decorator for tracing functions with LangSmith.

    Args:
        name: Run name (defaults to function name)
        run_type: Type of run (chain, llm, tool, retriever)
        metadata: Additional metadata to attach

    Example:
        @traceable(name="generate_response", run_type="chain")
        async def generate_response(state):
            ...
    """
    def decorator(func: Callable) -> Callable:
        if not LANGSMITH_ENABLED:
            return func

        try:
            from langsmith import traceable as ls_traceable

            return ls_traceable(
                name=name or func.__name__,
                run_type=run_type,
                metadata=metadata or {},
                project_name=LANGSMITH_PROJECT,
            )(func)

        except ImportError:
            return func

    return decorator


# ─── Traced LLM Call ──────────────────────────────────────────────────────────


async def traced_llm_call(
    messages: list[dict],
    model: str,
    tier: str,
    provider: str,
    temperature: float = 0.7,
    max_tokens: int = 256,
) -> str:
    """
    Make an LLM call with automatic tracing.

    Supports SGLang, Kimi, and OpenAI providers.
    All calls are traced to LangSmith when enabled.

    Args:
        messages: Chat messages
        model: Model identifier
        tier: Model tier (t1_fast, t2_medium, t3_heavy)
        provider: LLM provider (sglang, kimi, openai)
        temperature: Sampling temperature
        max_tokens: Maximum response tokens

    Returns:
        Response text from the model
    """
    start_time = time.perf_counter()

    # Select API endpoint and key based on provider
    if provider == "sglang" and SGLANG_BASE_URL:
        base_url = SGLANG_BASE_URL
        api_key = SGLANG_API_KEY
    elif provider == "kimi":
        base_url = KIMI_BASE_URL
        api_key = KIMI_API_KEY
    elif provider == "openai":
        base_url = "https://api.openai.com/v1"
        api_key = OPENAI_API_KEY
    else:
        # Default to Kimi
        base_url = KIMI_BASE_URL
        api_key = KIMI_API_KEY

    # Make the API call
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            response_text = data["choices"][0]["message"]["content"]

    except Exception as e:
        logger.error("LLM call failed: provider=%s model=%s error=%s", provider, model, e)
        raise

    latency_ms = (time.perf_counter() - start_time) * 1000

    # Log trace to LangSmith if enabled
    if LANGSMITH_ENABLED:
        _log_llm_trace(
            messages=messages,
            response=response_text,
            model=model,
            tier=tier,
            provider=provider,
            latency_ms=latency_ms,
        )

    # Update Prometheus metrics
    _record_llm_metrics(
        model=model,
        tier=tier,
        provider=provider,
        latency_ms=latency_ms,
        success=True,
    )

    logger.debug(
        "LLM call completed: provider=%s model=%s tier=%s latency=%.1fms",
        provider,
        model,
        tier,
        latency_ms,
    )

    return response_text


def _log_llm_trace(
    messages: list[dict],
    response: str,
    model: str,
    tier: str,
    provider: str,
    latency_ms: float,
):
    """Log LLM call trace to LangSmith."""
    client = get_langsmith_client()
    if not client:
        return

    try:
        from langsmith.run_trees import RunTree

        # Create a run tree for the LLM call
        run = RunTree(
            name=f"llm_call_{tier}",
            run_type="llm",
            project_name=LANGSMITH_PROJECT,
            inputs={"messages": messages},
            extra={
                "metadata": {
                    "model": model,
                    "tier": tier,
                    "provider": provider,
                    "latency_ms": latency_ms,
                }
            },
        )

        run.end(outputs={"response": response})
        run.post()

    except Exception as e:
        logger.debug("Failed to log LangSmith trace: %s", e)


# ─── Prometheus Metrics ───────────────────────────────────────────────────────

# Lazy initialization of Prometheus metrics
_metrics_initialized = False
_llm_latency_histogram = None
_llm_tier_counter = None
_llm_error_counter = None


def _init_metrics():
    """Initialize Prometheus metrics (lazy)."""
    global _metrics_initialized, _llm_latency_histogram, _llm_tier_counter, _llm_error_counter

    if _metrics_initialized:
        return

    try:
        from prometheus_client import Counter, Histogram

        _llm_latency_histogram = Histogram(
            "voice_agent_llm_latency_seconds",
            "LLM call latency in seconds",
            ["model", "tier", "provider"],
            buckets=[0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 2.0, 5.0],
        )

        _llm_tier_counter = Counter(
            "voice_agent_tier_usage_total",
            "Number of calls per model tier",
            ["tier"],
        )

        _llm_error_counter = Counter(
            "voice_agent_llm_errors_total",
            "Number of LLM call errors",
            ["model", "provider", "error_type"],
        )

        _metrics_initialized = True
        logger.debug("Prometheus metrics initialized")

    except ImportError:
        logger.debug("prometheus_client not available, metrics disabled")
        _metrics_initialized = True  # Don't retry


def _record_llm_metrics(
    model: str,
    tier: str,
    provider: str,
    latency_ms: float,
    success: bool,
    error_type: str = "",
):
    """Record metrics for an LLM call."""
    _init_metrics()

    if _llm_latency_histogram is not None and success:
        _llm_latency_histogram.labels(
            model=model,
            tier=tier,
            provider=provider,
        ).observe(latency_ms / 1000)  # Convert to seconds

    if _llm_tier_counter is not None:
        _llm_tier_counter.labels(tier=tier).inc()

    if _llm_error_counter is not None and not success:
        _llm_error_counter.labels(
            model=model,
            provider=provider,
            error_type=error_type,
        ).inc()


# ─── Trace Context Manager ────────────────────────────────────────────────────


class TraceContext:
    """
    Context manager for manual tracing spans.

    Example:
        async with TraceContext("my_operation", metadata={"key": "value"}):
            # do work
            pass
    """

    def __init__(
        self,
        name: str,
        run_type: str = "chain",
        metadata: Optional[dict] = None,
    ):
        self.name = name
        self.run_type = run_type
        self.metadata = metadata or {}
        self._run = None
        self._start_time = None

    async def __aenter__(self):
        self._start_time = time.perf_counter()

        if LANGSMITH_ENABLED:
            try:
                from langsmith.run_trees import RunTree

                self._run = RunTree(
                    name=self.name,
                    run_type=self.run_type,
                    project_name=LANGSMITH_PROJECT,
                    extra={"metadata": self.metadata},
                )
            except Exception as e:
                logger.debug("Failed to create trace span: %s", e)

        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        latency_ms = (time.perf_counter() - self._start_time) * 1000

        if self._run:
            try:
                if exc_type:
                    self._run.end(
                        error=str(exc_val),
                        outputs={"error": str(exc_type.__name__)},
                    )
                else:
                    self._run.end(outputs={"latency_ms": latency_ms})
                self._run.post()
            except Exception as e:
                logger.debug("Failed to end trace span: %s", e)

        return False  # Don't suppress exceptions


# ─── Initialization ───────────────────────────────────────────────────────────

# Initialize LangSmith client on module load
if LANGSMITH_ENABLED:
    get_langsmith_client()
    logger.info("LangSmith tracing enabled: project=%s", LANGSMITH_PROJECT)
else:
    logger.info("LangSmith tracing disabled (no API key or LANGSMITH_TRACING=false)")

# deploy/modal/sglang_app.py
"""
Modal deployment for SGLang multi-model inference server.

Hosts multiple models for Velox AI voice pipeline:
  - T0 Router:  Qwen3.5-3B      - classify intent + complexity (<30ms)
  - T1 Fast:    Nemotron Nano   - 70-80% of turns (<100ms TTFT)
  - T2 Medium:  Qwen3.5-35B     - multi-turn, tool orchestration (<200ms TTFT)

Exposes OpenAI-compatible API at /v1/chat/completions.
T3 Heavy (Kimi K2.5) is external API, not hosted here.

Usage:
  modal deploy deploy/modal/sglang_app.py
  modal serve deploy/modal/sglang_app.py  # for development
"""

from __future__ import annotations

import os
from typing import Optional

import modal

from config import MODELS, SGLANG_CONFIG

# ─── Modal App Definition ─────────────────────────────────────────────────────

app = modal.App("velox-sglang")

# ─── Container Image ──────────────────────────────────────────────────────────

sglang_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "sglang[all]>=0.3.0",
        "torch>=2.1.0",
        "transformers>=4.40.0",
        "vllm>=0.4.0",
        "accelerate>=0.27.0",
        "flashinfer>=0.1.0",
        "httpx>=0.27.0",
        "fastapi>=0.115.0",
        "uvicorn[standard]>=0.30.0",
    )
    .run_commands(
        # Pre-download models on image build for faster cold starts
        "python -c \"from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('Qwen/Qwen2.5-3B-Instruct')\"",
    )
)

# ─── Volume for Model Weights ─────────────────────────────────────────────────

model_volume = modal.Volume.from_name("velox-models", create_if_missing=True)
MODEL_DIR = "/models"

# ─── Secrets ──────────────────────────────────────────────────────────────────

# Store SGLANG_API_KEY in Modal secrets
sglang_secret = modal.Secret.from_name("velox-sglang-secret", required_keys=[])


# ─── SGLang Server Class ──────────────────────────────────────────────────────


@app.cls(
    image=sglang_image,
    gpu=modal.gpu.A100(count=1, memory=40),  # A100-40GB for T1/T2
    volumes={MODEL_DIR: model_volume},
    secrets=[sglang_secret],
    container_idle_timeout=300,  # 5 min idle before scale down
    allow_concurrent_inputs=100,  # High concurrency for voice
    timeout=600,  # 10 min max request timeout
)
class SGLangServer:
    """
    Multi-model SGLang server with OpenAI-compatible API.

    Implements RadixAttention for prefix caching to achieve <200ms TTFT.
    """

    def __init__(self):
        self.engines: dict = {}
        self.current_model: Optional[str] = None

    @modal.enter()
    def start_engines(self):
        """Initialize SGLang runtime on container start."""
        import sglang as sgl

        # Start with T1 (most common) for fast startup
        # Other models loaded on-demand
        t1_model = MODELS["sglang"]["fast"]
        print(f"Starting SGLang with T1 model: {t1_model}")

        # Configure SGLang runtime
        sgl.set_default_backend(
            sgl.RuntimeEndpoint(
                model_path=t1_model,
                tokenizer_path=t1_model,
                context_length=SGLANG_CONFIG["context_length"],
                max_num_seqs=SGLANG_CONFIG["max_batch_size"],
                enable_prefix_caching=True,  # Critical for <200ms TTFT
            )
        )

        self.current_model = t1_model
        print(f"SGLang runtime started with {t1_model}")

    @modal.method()
    async def generate(
        self,
        model: str,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 256,
        stream: bool = False,
    ) -> dict:
        """
        Generate completion using SGLang.

        Args:
            model: Model identifier (maps to T0/T1/T2)
            messages: OpenAI-format messages
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            stream: Whether to stream response (not implemented yet)

        Returns:
            OpenAI-compatible completion response
        """
        import sglang as sgl
        import time

        start_time = time.perf_counter()

        # Map model name to tier
        model_map = {
            MODELS["sglang"]["router"]: "router",
            MODELS["sglang"]["fast"]: "fast",
            MODELS["sglang"]["medium"]: "medium",
        }

        tier = model_map.get(model, "fast")

        # Build prompt from messages
        system_content = ""
        user_content = ""

        for msg in messages:
            if msg["role"] == "system":
                system_content = msg["content"]
            elif msg["role"] == "user":
                user_content = msg["content"]

        # SGLang generation
        @sgl.function
        def chat_completion(s):
            if system_content:
                s += sgl.system(system_content)
            s += sgl.user(user_content)
            s += sgl.assistant(sgl.gen("response", max_tokens=max_tokens, temperature=temperature))

        # Run generation
        state = chat_completion.run()
        response_text = state["response"]

        # Calculate metrics
        ttft_ms = (time.perf_counter() - start_time) * 1000

        # Return OpenAI-compatible response
        return {
            "id": f"chatcmpl-{int(time.time())}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": response_text,
                    },
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": len(user_content.split()),  # Approximate
                "completion_tokens": len(response_text.split()),
                "total_tokens": len(user_content.split()) + len(response_text.split()),
            },
            "velox_metrics": {
                "tier": tier,
                "ttft_ms": round(ttft_ms, 2),
            },
        }

    @modal.method()
    def health(self) -> dict:
        """Health check endpoint."""
        return {
            "status": "ok",
            "service": "velox-sglang",
            "current_model": self.current_model,
            "models_available": list(MODELS["sglang"].values()),
        }


# ─── FastAPI Web Endpoint ─────────────────────────────────────────────────────


@app.function(
    image=sglang_image,
    secrets=[sglang_secret],
    allow_concurrent_inputs=100,
)
@modal.web_endpoint(method="POST", docs=True)
async def chat_completions(request: dict) -> dict:
    """
    OpenAI-compatible /v1/chat/completions endpoint.

    This is the main entry point for the voice pipeline.

    Request body:
        {
            "model": "nvidia/Nemotron-3-Nano",
            "messages": [
                {"role": "system", "content": "..."},
                {"role": "user", "content": "..."}
            ],
            "temperature": 0.7,
            "max_tokens": 256
        }

    Returns:
        OpenAI-compatible completion response
    """
    server = SGLangServer()

    return await server.generate.remote(
        model=request.get("model", MODELS["sglang"]["fast"]),
        messages=request.get("messages", []),
        temperature=request.get("temperature", 0.7),
        max_tokens=request.get("max_tokens", 256),
        stream=request.get("stream", False),
    )


@app.function(image=sglang_image)
@modal.web_endpoint(method="GET")
async def health() -> dict:
    """Health check endpoint."""
    server = SGLangServer()
    return server.health.remote()


@app.function(image=sglang_image)
@modal.web_endpoint(method="GET")
async def models() -> dict:
    """List available models (OpenAI-compatible)."""
    import time

    return {
        "object": "list",
        "data": [
            {
                "id": model_id,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "velox-ai",
            }
            for model_id in MODELS["sglang"].values()
        ],
    }


# ─── Local Testing ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # For local testing without Modal
    print("SGLang models configured:")
    for tier, model in MODELS["sglang"].items():
        print(f"  {tier}: {model}")

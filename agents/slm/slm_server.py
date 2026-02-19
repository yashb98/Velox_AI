"""
slm_server.py — Phi-3-mini SLM sidecar for Velox AI (A4).

Loads a GGUF-quantised Phi-3-mini-4k-instruct model via llama-cpp-python
and exposes a simple POST /generate endpoint consumed by pipeline.py.

Expected model file: /app/models/phi-3-mini-4k-instruct-q4.gguf
Set MODEL_PATH env var to override.
"""

from __future__ import annotations

import logging
import os

import uvicorn
from fastapi import FastAPI, HTTPException
from llama_cpp import Llama
from pydantic import BaseModel

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

MODEL_PATH = os.getenv(
    "MODEL_PATH",
    "/app/models/phi-3-mini-4k-instruct-q4.gguf",
)

app = FastAPI(title="Velox Phi-3 SLM Service")

# Load model once at startup
logger.info("Loading Phi-3 model from %s …", MODEL_PATH)
llm = Llama(
    model_path=MODEL_PATH,
    n_ctx=4096,
    n_threads=os.cpu_count() or 4,
    verbose=False,
)
logger.info("Phi-3 model loaded")


class SLMRequest(BaseModel):
    system: str = "You are Velox, a concise voice AI assistant."
    context: str = ""
    message: str


class SLMResponse(BaseModel):
    response: str


@app.post("/generate", response_model=SLMResponse)
def generate(req: SLMRequest) -> SLMResponse:
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")

    # Build Phi-3 chat format prompt
    system_block = req.system
    if req.context:
        system_block += f"\n\n=== KNOWLEDGE BASE ===\n{req.context}\n======================"

    prompt = (
        f"<|system|>\n{system_block}<|end|>\n"
        f"<|user|>\n{req.message}<|end|>\n"
        f"<|assistant|>\n"
    )

    output = llm(
        prompt,
        max_tokens=200,
        temperature=0.3,
        stop=["<|end|>", "<|user|>"],
    )
    text: str = output["choices"][0]["text"].strip()  # type: ignore[index]
    logger.info("Phi-3 response (%d chars)", len(text))
    return SLMResponse(response=text)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "velox-phi3-slm"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("slm_server:app", host="0.0.0.0", port=port, reload=False)

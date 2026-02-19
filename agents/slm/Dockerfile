# Phi-3-mini SLM sidecar — serves the lightweight model on port 8001.
# Uses llama-cpp-python with GGUF quantized Phi-3-mini-4k-instruct model.
#
# Prerequisites:
#   Place the GGUF file at: agents/slm/models/phi-3-mini-4k-instruct-q4.gguf
#   (Download from: https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf)

FROM python:3.11-slim

WORKDIR /app

# Build dependencies for llama-cpp-python
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    fastapi==0.115.0 \
    uvicorn[standard]==0.30.6 \
    llama-cpp-python==0.2.90 \
    pydantic==2.9.2

COPY slm_server.py ./

ENV PORT=8001
EXPOSE 8001

CMD ["python", "slm_server.py"]

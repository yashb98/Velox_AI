# fine-tuning/Dockerfile
#
# 6.7 — GPU-capable container for LoRA fine-tuning on Cloud Run GPU
#        or Vertex AI Custom Training Jobs.
#
# Build:
#   docker build -t velox-fine-tuning:latest .
#
# Run locally (requires NVIDIA GPU + nvidia-docker):
#   docker run --gpus all \
#     -e DATABASE_URL=postgresql://... \
#     -e MLFLOW_TRACKING_URI=https://mlflow.internal \
#     -v $(pwd)/data:/app/data \
#     -v $(pwd)/output:/app/output \
#     velox-fine-tuning:latest \
#     python train.py --model microsoft/Phi-3-mini-4k-instruct \
#                     --dataset data/calls.jsonl \
#                     --output output/phi3-velox-v1

FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04 AS base

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-dev \
    python3-pip \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Use python3.11 as default
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 && \
    update-alternatives --install /usr/bin/python  python  /usr/bin/python3.11 1

WORKDIR /app

# Install Python dependencies (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy training scripts
COPY . .

# Create directories for data and output volumes
RUN mkdir -p data output

# Default command: export data then train Phi-3-mini
# Override at runtime for different models/datasets
CMD ["bash", "-c", \
     "python export_training_data.py --output data/calls.jsonl && \
      python train.py --model microsoft/Phi-3-mini-4k-instruct \
                      --dataset data/calls.jsonl \
                      --output output/phi3-velox-v1"]

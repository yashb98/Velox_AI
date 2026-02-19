# Velox AI — Fine-Tuning Pipeline

LoRA/PEFT fine-tuning for Phi-3-mini and Mistral-7B on Velox call transcript data.

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Export training data from production Postgres
export DATABASE_URL="postgresql://user:pass@host:5432/velox_prod"
python export_training_data.py --output data/calls.jsonl --min-turns 3

# 3. Train Phi-3-mini with LoRA
python train.py \
  --model microsoft/Phi-3-mini-4k-instruct \
  --dataset data/calls.jsonl \
  --output output/phi3-velox-v1
```

## Files

| File | Purpose |
|------|---------|
| `export_training_data.py` | Exports completed conversations from Postgres to ChatML JSONL |
| `train.py` | LoRA fine-tuning with PEFT + TRL SFTTrainer + MLflow logging |
| `requirements.txt` | Python dependencies |
| `Dockerfile` | GPU-capable container for Cloud Run GPU / Vertex AI |

## MLflow Tracking

Set `MLFLOW_TRACKING_URI` to log training runs:

```bash
export MLFLOW_TRACKING_URI=http://localhost:5000
python train.py ...
```

Tracked metrics: `train_loss`, `eval_loss`, `eval_perplexity`, `train_samples_per_second`

## Deployment

After training, upload the LoRA adapter to:
- **Vertex AI Model Garden** — for production serving at scale
- **Ollama** — for local development (`ollama create velox-phi3 -f Modelfile`)

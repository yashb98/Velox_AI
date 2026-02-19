#!/usr/bin/env python3
# fine-tuning/train.py
#
# 6.7 — LoRA/PEFT fine-tuning pipeline for Phi-3-mini and Mistral-7B.
#
# Uses:
#   - HuggingFace PEFT  → LoRA adapters (r=16, alpha=32, target q_proj + v_proj)
#   - bitsandbytes      → 8-bit quantisation (fits ~7B model in 16 GB VRAM)
#   - TRL SFTTrainer    → SFT on ChatML-formatted JSONL
#   - MLflow            → tracks training loss, eval perplexity, hyperparams
#
# Usage:
#   python train.py \
#     --model microsoft/Phi-3-mini-4k-instruct \
#     --dataset data/calls.jsonl \
#     --output output/phi3-velox-v1
#
# Or for Mistral-7B:
#   python train.py \
#     --model mistralai/Mistral-7B-Instruct-v0.3 \
#     --dataset data/calls.jsonl \
#     --output output/mistral-velox-v1

import argparse
import os
from pathlib import Path

import mlflow
import torch
from datasets import load_dataset
from peft import LoraConfig, TaskType, get_peft_model
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from trl import SFTTrainer

# ─── LoRA hyperparameters ────────────────────────────────────────────────────

LORA_CONFIG = LoraConfig(
    r=16,
    lora_alpha=32,
    # Target the attention projection matrices — standard for most LLMs
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type=TaskType.CAUSAL_LM,
)

# ─── Training hyperparameters ─────────────────────────────────────────────────

TRAINING_DEFAULTS = dict(
    num_train_epochs=3,
    per_device_train_batch_size=4,
    per_device_eval_batch_size=4,
    gradient_accumulation_steps=4,  # effective batch = 16
    learning_rate=2e-4,
    lr_scheduler_type="cosine",
    warmup_ratio=0.05,
    fp16=not torch.cuda.is_bf16_supported(),
    bf16=torch.cuda.is_bf16_supported(),
    logging_steps=10,
    eval_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    metric_for_best_model="eval_loss",
    report_to="none",  # we handle MLflow manually below
)

# ─── Main ────────────────────────────────────────────────────────────────────

def train(model_name: str, dataset_path: str, output_dir: str):
    print(f"=== Velox Fine-Tuning ===")
    print(f"Model:   {model_name}")
    print(f"Dataset: {dataset_path}")
    print(f"Output:  {output_dir}")

    # ── Quantisation config (load model in 8-bit for memory efficiency) ────────
    bnb_config = BitsAndBytesConfig(
        load_in_8bit=True,
        llm_int8_threshold=6.0,
    )

    # ── Load tokeniser ─────────────────────────────────────────────────────────
    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    # ── Load base model with 8-bit quantisation ────────────────────────────────
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
        torch_dtype=torch.float16,
    )
    model.config.use_cache = False
    model.config.pretraining_tp = 1

    # ── Wrap with LoRA adapters ────────────────────────────────────────────────
    model = get_peft_model(model, LORA_CONFIG)
    model.print_trainable_parameters()

    # ── Load dataset ───────────────────────────────────────────────────────────
    dataset = load_dataset("json", data_files=dataset_path, split="train")

    # 90/10 train/eval split
    split = dataset.train_test_split(test_size=0.1, seed=42)
    train_dataset = split["train"]
    eval_dataset  = split["test"]
    print(f"Train: {len(train_dataset)} samples, Eval: {len(eval_dataset)} samples")

    # ── Training arguments ─────────────────────────────────────────────────────
    training_args = TrainingArguments(
        output_dir=output_dir,
        **TRAINING_DEFAULTS,
    )

    # ── SFT Trainer ────────────────────────────────────────────────────────────
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        args=training_args,
        dataset_text_field="text",
        max_seq_length=2048,
        packing=False,
    )

    # ── MLflow run ─────────────────────────────────────────────────────────────
    mlflow_uri = os.environ.get("MLFLOW_TRACKING_URI")
    if mlflow_uri:
        mlflow.set_tracking_uri(mlflow_uri)
        mlflow.set_experiment("velox-fine-tuning")

    with mlflow.start_run(run_name=f"{Path(model_name).name}-sft"):
        mlflow.log_params({
            "model": model_name,
            "dataset": dataset_path,
            "train_samples": len(train_dataset),
            "eval_samples": len(eval_dataset),
            "lora_r": LORA_CONFIG.r,
            "lora_alpha": LORA_CONFIG.lora_alpha,
            "learning_rate": TRAINING_DEFAULTS["learning_rate"],
            "epochs": TRAINING_DEFAULTS["num_train_epochs"],
            "batch_size": TRAINING_DEFAULTS["per_device_train_batch_size"],
            "gradient_accumulation": TRAINING_DEFAULTS["gradient_accumulation_steps"],
        })

        # Train
        result = trainer.train()

        # Log training metrics
        mlflow.log_metrics({
            "train_loss": result.training_loss,
            "train_runtime_s": result.metrics.get("train_runtime", 0),
            "train_samples_per_second": result.metrics.get("train_samples_per_second", 0),
        })

        # Log final eval metrics
        eval_result = trainer.evaluate()
        mlflow.log_metrics({
            "eval_loss": eval_result.get("eval_loss", 0),
            "eval_perplexity": 2 ** eval_result.get("eval_loss", 0),
        })

    # ── Save LoRA adapter weights ───────────────────────────────────────────────
    trainer.model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    print(f"\n✅ LoRA adapter saved to: {output_dir}")
    print("   Deploy to Vertex AI Model Garden or Ollama for inference.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fine-tune Velox voice LLM with LoRA/PEFT")
    parser.add_argument(
        "--model",
        default="microsoft/Phi-3-mini-4k-instruct",
        help="HuggingFace model ID",
    )
    parser.add_argument(
        "--dataset",
        default="data/calls.jsonl",
        help="Path to JSONL dataset from export_training_data.py",
    )
    parser.add_argument(
        "--output",
        default="output/phi3-velox-v1",
        help="Output directory for LoRA adapter weights",
    )
    args = parser.parse_args()

    train(args.model, args.dataset, args.output)

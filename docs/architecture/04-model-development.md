# L4: Model Development

> Reference layer for training, experimentation, evaluation, and model registry.

---

## 4.1 Experiment Tracking

| Component | Tracks | Tool | Why |
|-----------|--------|------|-----|
| Experiment Tracker | Hyperparams, metrics, artifacts, code | MLflow / W&B / Neptune | Reproducibility |
| Model Registry | Versions, stage (dev/staging/prod) | MLflow Registry / Vertex | Governance, rollback |
| Dataset Versioning | Splits with checksums | DVC / Delta time travel | Reproducibility |
| LLM Observability | Prompts, tokens, latency, quality | Langfuse / Arize Phoenix | Prompt regression detection |

### MLflow Pattern

```python
import mlflow

with mlflow.start_run(run_name="experiment-v2"):
    mlflow.log_params({"lr": 0.001, "epochs": 10, "batch_size": 32})
    # ... training loop ...
    mlflow.log_metrics({"accuracy": 0.94, "f1": 0.91, "latency_ms": 45})
    mlflow.pytorch.log_model(model, "model")
    mlflow.log_artifact("evaluation_report.html")
```

---

## 4.2 Distributed Training

| Strategy | When | How | Framework |
|----------|------|-----|-----------|
| Data Parallelism (DDP) | Model fits 1 GPU; want speed | Replicate model; split data; sync gradients | PyTorch DDP |
| ZeRO Stage 2/3 | OOM on optimizer state | Shard optimizer/gradients/params | DeepSpeed / FSDP |
| Tensor Parallelism | Model too large | Split layers across GPUs | Megatron-LM |
| Pipeline Parallelism | Overlap compute | Pipeline micro-batches | DeepSpeed / GPipe |

**Decision**: Start with DDP → ZeRO S2 if OOM → ZeRO S3/FSDP → Tensor/Pipeline only for 13B+.
**Key metric**: MFU (Model FLOPS Utilisation). Target 40-60%. Below 30% = bottleneck.

---

## 4.3 Training Pipeline DAG

```
Step 1: Data Prep → Version dataset, create splits
Step 2: Training  → Distributed GPU job, checkpoint every epoch
Step 3: Evaluate  → Task metrics + fairness metrics + latency benchmark
Step 4: Register  → If passes thresholds → model registry (stage=staging)
Step 5: Test      → Integration tests in staging environment
Step 6: Approve   → Human gate for high-risk; auto for low-risk → stage=production
```

---

## 4.4 Evaluation Best Practices

### Classical ML Eval

```python
from sklearn.metrics import classification_report, roc_auc_score

def evaluate_model(model, X_test, y_test):
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    report = classification_report(y_test, y_pred, output_dict=True)
    auc = roc_auc_score(y_test, y_prob)
    return {"classification_report": report, "auc_roc": auc}
```

### LLM Eval

```python
# Using RAGAS for RAG evaluation
from ragas.metrics import faithfulness, answer_relevancy, context_precision
from ragas import evaluate

result = evaluate(dataset, metrics=[faithfulness, answer_relevancy, context_precision])
```

---

## Audit Checklist

- [ ] Experiment tracking in use (MLflow/W&B/Langfuse)
- [ ] Model registry with versioning
- [ ] Training pipeline is automated (not manual notebook runs)
- [ ] Evaluation suite covers accuracy, fairness, and latency
- [ ] Dataset versioning in place
- [ ] Reproducibility: can you recreate any past model from its metadata?
- [ ] For LLMs: prompt versioning and eval pipeline

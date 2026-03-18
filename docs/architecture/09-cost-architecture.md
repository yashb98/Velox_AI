# Cost Architecture & FinOps

> Reference for AI cost management, optimisation strategies, and budget planning.

---

## 9.1 Cost Breakdown

| Category | % of AI Spend | Drivers | Optimisation |
|----------|--------------|---------|-------------|
| GPU Training | 30-50% | Model size, dataset, HPO | Spot instances, mixed precision, early stopping |
| GPU Inference | 20-40% | Traffic, model size, latency SLA | Quantisation, batching, caching, distillation |
| Data Storage | 10-20% | Volume, retention, processing freq | Tiered storage, lifecycle, partition pruning |
| Third-Party APIs | 5-15% | API call volume | Caching, fine-tuned self-hosted |
| Human-in-Loop | 5-10% | Labelling, evaluation | Active learning, synthetic data |
| Observability | 5-10% | Monitoring, logging SaaS | Self-hosted, sampling, retention |

---

## 9.2 Key Optimisation Strategies

1. **Spot Instances for Training**: Save 60-90%. Requires checkpointing + retry logic.
2. **GPU Right-Sizing**: Profile on multiple types; pick cheapest that meets SLA.
3. **Quantisation**: INT8/INT4 cuts memory 2-4x. Quality loss <1%.
4. **Semantic Caching**: 20-40% hit rate on LLM queries → direct cost reduction.
5. **Model Distillation**: One-time cost; permanent inference savings.
6. **Auto-Scaling to Zero**: Scale dev/staging to 0 off-hours. KEDA or custom HPA.

---

## 9.3 Cost Tracking Pattern

```python
# cost_tracker.py
from prometheus_client import Counter

TOKEN_COST = Counter("llm_token_cost_dollars", "Cost in dollars", ["model", "direction"])
GPU_HOURS = Counter("gpu_hours_total", "GPU hours consumed", ["workload_type", "gpu_type"])

def track_inference_cost(model: str, input_tokens: int, output_tokens: int):
    rates = {
        "claude-sonnet-4": {"input": 3.0 / 1_000_000, "output": 15.0 / 1_000_000},
        "llama-3.1-8b": {"input": 0.0001, "output": 0.0001},  # self-hosted amortised
    }
    rate = rates.get(model, rates["llama-3.1-8b"])
    TOKEN_COST.labels(model=model, direction="input").inc(input_tokens * rate["input"])
    TOKEN_COST.labels(model=model, direction="output").inc(output_tokens * rate["output"])
```

---

## Audit Checklist

- [ ] Cost tracking per model/service
- [ ] GPU utilisation monitored (target >70%)
- [ ] Spot instances used for training
- [ ] Auto-scaling with scale-to-zero for non-prod
- [ ] Quantisation applied where possible
- [ ] Caching strategy in place
- [ ] Monthly cost review process

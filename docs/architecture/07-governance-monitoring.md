<!-- ⚠️ STALE: Rewrite as observability doc with LangSmith + Prometheus -->
# L7: Governance, Monitoring & Security

> Reference layer for observability, compliance, security, and operational excellence.

---

## 7.1 Model Monitoring

| Monitor | Detects | Method | Alert Threshold |
|---------|---------|--------|----------------|
| Data Drift | Input distribution change | PSI, KS test vs baseline | PSI>0.2=warn; >0.5=critical |
| Concept Drift | Feature-target relationship change | Performance decay; ADWIN | 5% accuracy drop |
| Prediction Drift | Output distribution change | Chi-squared test | Significant shift |
| Latency | Inference time increase | P50/P95/P99 tracking | P95>SLA=warn |
| Error Rate | Failed predictions | HTTP 5xx rate | >1% = critical |
| LLM Quality | Response quality, faithfulness | LLM-as-Judge, RAGAS | Below threshold |

---

## 7.2 Observability Stack

| Layer | Purpose | Technology |
|-------|---------|-----------|
| Metrics | Time-series data | Prometheus + Grafana |
| Logging | Structured logs | Loki + Grafana / ELK |
| Tracing | Distributed traces | OpenTelemetry + Jaeger/Tempo |
| ML Monitoring | Drift, distributions | Evidently / Arize / WhyLabs |
| LLM Observability | Prompts, costs, quality | Langfuse / Arize Phoenix |
| Alerting | Incident routing | PagerDuty / Opsgenie |

### Structured Logging Pattern

```python
import structlog

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
)

logger = structlog.get_logger()

# Usage
logger.info("inference_complete",
    model="llama-3.1-8b",
    latency_ms=145.3,
    tokens_in=512,
    tokens_out=128,
    cache_hit=False,
    user_id="u-123",
)
```

### Prometheus Metrics Pattern

```python
from prometheus_client import Counter, Histogram, Gauge

INFERENCE_REQUESTS = Counter("inference_requests_total", "Total requests", ["model", "status"])
INFERENCE_LATENCY = Histogram("inference_latency_seconds", "Latency", ["model"],
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0])
ACTIVE_REQUESTS = Gauge("active_inference_requests", "Active requests", ["model"])
MODEL_LOADED = Gauge("model_loaded", "Is model loaded", ["model", "version"])
```

---

## 7.3 Security Architecture

| Threat | Mitigation | Layer |
|--------|-----------|-------|
| Prompt Injection | Input classifiers, system/user separation | L6 Guardrails |
| Data Poisoning | Provenance tracking, anomaly detection | L2 Data |
| Model Extraction | Rate limiting, watermarking | L6 API Gateway |
| Supply Chain | Signature verification, trusted registries | L4 Registry |
| Data Exfiltration | DLP on outputs, guardrails | L6 Guardrails |

---

## 7.4 Compliance Framework

| Area | Requirement | Implementation | Artefacts |
|------|------------|----------------|-----------|
| Model Inventory | Central registry | Model registry + metadata | Model cards |
| Risk Classification | Tier by risk level | Risk matrix | Assessment docs |
| Explainability | Explain decisions | SHAP/LIME; CoT for LLMs | Explainability reports |
| Audit Trail | Full lineage | MLflow + Langfuse + Git | Reproducibility package |
| Access Control | RBAC | OPA + IAM + namespaces | RBAC policies |
| Data Privacy | GDPR/CCPA | PII detection, deletion pipes | DPIAs |
| Bias & Fairness | No discrimination | Pre-deploy + continuous testing | Fairness reports |

---

## Audit Checklist

- [ ] Structured logging in all services
- [ ] Metrics exported (Prometheus or equivalent)
- [ ] Dashboards for key metrics (latency, throughput, errors)
- [ ] Alerting configured with tiered severity
- [ ] Model monitoring for drift (data + concept + prediction)
- [ ] Security: no hardcoded secrets, input validation, auth
- [ ] Access control on all sensitive endpoints
- [ ] Incident response runbook exists
- [ ] Model cards for production models
- [ ] Audit trail: can trace prediction → model → training data

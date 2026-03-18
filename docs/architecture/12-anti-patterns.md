# Common Anti-Patterns & How to Avoid Them

---

| Anti-Pattern | What Goes Wrong | Correct Approach |
|-------------|----------------|-----------------|
| **Notebook-to-Prod** | No tests, no error handling, no monitoring | Refactor to packages; CI/CD; never deploy notebook code |
| **Training-Serving Skew** | Features differ between train/infer; silent degradation | Feature store with shared definitions; test parity |
| **No Model Versioning** | Can't reproduce, rollback, or audit | Version code (Git), data (DVC), models (MLflow), configs |
| **GPU Over-Provisioning** | H100 for inference that fits A10G; 90% budget waste | Profile workloads; right-size; quantise first |
| **Ignoring Data Quality** | GIGO; silent accuracy degradation | Automated quality framework at ingestion/transform/serve |
| **Monolithic Model Service** | One failure takes down everything | Microservice per model group; independent deploy/scale |
| **No Guardrails** | Hallucinations, PII leaks, harmful content | Multi-layer validation: input, output, monitoring |
| **Shadow IT Models** | No governance, monitoring, compliance | Self-service platform with built-in guardrails |
| **eval==vibes** | "It looks good" instead of quantitative evaluation | Automated eval suite: accuracy, fairness, latency, LLM-as-Judge |
| **Premature Scaling** | Building for 1M users when you have 100 | Start simple; measure; scale only when data justifies |
| **No Fallback** | Primary model fails = total outage | Fallback chain: primary → smaller model → cached response → error |
| **Logging as Afterthought** | Can't debug production issues | Structured logging from day 1; correlate with request IDs |

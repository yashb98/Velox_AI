#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# ARCHITECTURE DOC GENERATOR
# Generates all 14 enterprise AI architecture reference docs
# ═══════════════════════════════════════════════════════════════
# Usage: bash scripts/generate-architecture-docs.sh [project-root]
# Output: docs/architecture/*.md
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

PROJECT_ROOT="${1:-.}"
DOCS_DIR="$PROJECT_ROOT/docs/architecture"

mkdir -p "$DOCS_DIR"

echo "╔═══════════════════════════════════════════════╗"
echo "║  Generating Architecture Reference Docs...    ║"
echo "╚═══════════════════════════════════════════════╝"

# ══════════════════════════════════════════════════════════════
# DOC 01: Infrastructure
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/01-infrastructure.md" << 'ENDMD'
# L1: Cloud Infrastructure & Deployment

> Reference layer for all compute, storage, networking, and IaC decisions.

---

## 1.1 Compute Architecture

### GPU Selection Matrix

| Workload | GPU | Why | Configuration |
|----------|-----|-----|---------------|
| LLM Training (>7B) | H100/H200 80GB | NVLink for tensor parallelism; HBM3 for large batches | 8x per node, InfiniBand, 4-64 nodes |
| LLM Fine-tuning (LoRA) | A100 40GB / L40S | Sufficient VRAM for adapters; cost-effective | 1-4 GPUs, spot instances OK |
| LLM Inference (real-time) | A10G / L4 / H100 | Latency-throughput-cost balance; KV-cache is bottleneck | Auto-scaled pools, 1-2 GPUs/replica |
| Batch Inference / Embedding | A10G / T4 | Throughput-optimised; latency not critical | Large spot pools |
| Classical ML Training | CPU or single GPU | Most sklearn/XGBoost are CPU-bound | r6i/m6i or single T4 |
| Classical ML Inference | CPU | Sub-ms latency; no GPU overhead | Auto-scaled CPU pools |

**Decision Rule**: Right-size compute to workload. An H100 costs ~$30/hr; A10G costs ~$1.50/hr. Don't use H100 for inference when A10G suffices.

### Multi-Cloud Strategy

| Strategy | Adoption | When |
|----------|----------|------|
| Single Cloud | 70% | Existing enterprise agreements; team expertise; specific AI service advantages |
| Primary + Burst | 20% | Steady-state on primary; GPU burst on secondary for training |
| True Multi-Cloud | 10% | Regulatory requirements only; operational overhead is significant |

---

## 1.2 Infrastructure as Code (IaC)

| Layer | Tool | Rationale |
|-------|------|-----------|
| Cloud Resources | Terraform / OpenTofu | Declarative, multi-cloud, drift detection |
| K8s Config | Helm + Kustomize | Helm for third-party; Kustomize for env overlays |
| K8s Cluster | EKS/GKE/AKS + Cluster API | Managed control plane; Cluster API for multi-cluster |
| GPU Scheduling | NVIDIA GPU Operator + MIG | MIG partitions H100 into 7 slices |
| Secrets | Vault / AWS Secrets Manager | Never in environment variables |
| GitOps | ArgoCD / Flux | Git as single source of truth |

---

## 1.3 Networking Architecture

- **VPC Design**: Separate VPCs for data platform, ML platform, application layer. Private endpoints for all cloud services.
- **Service Mesh**: Istio/Linkerd for mTLS, canary routing, distributed tracing.
- **API Gateway**: Kong/AWS API GW for rate limiting, auth, model routing, usage metering.
- **CDN/Edge**: CloudFront/Fastly for caching static predictions. 40-60% cost reduction for cacheable outputs.

---

## 1.4 Container Architecture

### Dockerfile Best Practices for ML

```dockerfile
# Multi-stage build: separate build deps from runtime
FROM python:3.11-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim AS runtime
COPY --from=builder /install /usr/local
COPY . /app
WORKDIR /app

# Non-root user (security)
RUN useradd -m appuser && chown -R appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Docker Compose Structure

```yaml
# docker-compose.yml (development)
services:
  app:
    build: .
    ports: ["8000:8000"]
    env_file: .env
    volumes: ["./src:/app/src"]  # hot-reload in dev
    depends_on: [redis, postgres, qdrant]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333"]
    volumes: ["qdrant_data:/qdrant/storage"]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: ["pg_data:/var/lib/postgresql/data"]

volumes:
  qdrant_data:
  pg_data:
```

---

## 1.5 Environment Management

| Environment | Purpose | Data | GPU | Scaling |
|-------------|---------|------|-----|---------|
| Local | Developer machine | Mock/sample | None/CPU | None |
| Dev | Integration testing | Synthetic | Shared T4 | Fixed (1 replica) |
| Staging | Pre-production validation | Anonymised production | Production-like | Production-like |
| Production | Live traffic | Real | Dedicated | Auto-scaled |

**Configuration management**: Use environment variables (12-factor app) with pydantic-settings:

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    model_name: str = "meta-llama/Llama-3.1-8B"
    redis_url: str = "redis://localhost:6379"
    qdrant_url: str = "http://localhost:6333"
    log_level: str = "INFO"
    environment: str = "development"  # development | staging | production

    class Config:
        env_file = ".env"
```

---

## Audit Checklist

- [ ] Dockerfile exists with multi-stage build
- [ ] docker-compose.yml for local development
- [ ] .env.example with all required variables (no secrets)
- [ ] .gitignore covers all generated files
- [ ] Makefile with standard targets (build, test, run, lint)
- [ ] CI/CD pipeline (GitHub Actions / GitLab CI)
- [ ] Health check endpoint
- [ ] Non-root container user
- [ ] Resource limits set in compose/k8s
- [ ] Secrets managed externally (not in code)
ENDMD

echo "  ✅ 01-infrastructure.md"

# ══════════════════════════════════════════════════════════════
# DOC 02: Data Platform
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/02-data-platform.md" << 'ENDMD'
# L2: Data Platform Architecture

> Reference layer for data ingestion, storage, processing, quality, and cataloguing.

---

## 2.1 Lakehouse Architecture

The industry standard for AI data platforms. Combines data lake flexibility with warehouse reliability.

| Component | Technology | Purpose | Decision Factors |
|-----------|-----------|---------|-----------------|
| Object Storage | S3 / GCS / ADLS | Raw + processed data | Cost, lifecycle policies, replication |
| Table Format | Delta Lake / Iceberg | ACID, time travel, schema evolution | Iceberg=vendor-neutral; Delta=Databricks |
| Query Engine | Spark / Trino / DuckDB | Processing and analytics | Spark=batch; Trino=interactive; DuckDB=local |
| Catalog | Unity / Glue / OpenMetadata | Schema, lineage, access control | Vendor lock-in tolerance |
| Orchestration | Airflow / Dagster / Prefect | Scheduling, dependencies, retries | Dagster=asset-centric; Airflow=ecosystem |
| Streaming | Kafka + Flink / Spark SS | Real-time ingestion | Flink=low-latency; Spark SS=unified |

---

## 2.2 Medallion Architecture (Bronze → Silver → Gold)

```
Raw Sources → [Bronze: Raw] → [Silver: Cleansed] → [Gold: Business-Ready]
                append-only     deduplicated          aggregated
                schema-on-read  quality-checked       optimised views
                full history    ML features read here  dashboards
```

**Bronze**: Raw data as ingested. No transforms. Append-only. Source of truth for reprocessing.
**Silver**: Deduplicated, typed, null-handled, joined. Quality checks applied. ML features read from here.
**Gold**: Aggregated, business logic applied. Materialised views for dashboards and low-latency serving.

---

## 2.3 Ingestion Patterns

| Pattern | Use Case | Architecture | Latency |
|---------|----------|-------------|---------|
| Batch ETL | Daily retraining, analytics | Airflow → Spark → Delta/Iceberg | Hours |
| Micro-batch | Near-real-time features | Kafka → Spark SS → Feature Store | Seconds-minutes |
| Real-time | Fraud detection, live recs | Kafka → Flink → Redis | Milliseconds |
| CDC | DB replication to lake | Debezium → Kafka → Iceberg | Seconds |
| API Ingestion | Third-party SaaS data | Airbyte / Fivetran → Landing Zone | Minutes-hours |

---

## 2.4 Data Quality Framework

| Dimension | Checks | Tool | On Failure |
|-----------|--------|------|-----------|
| Completeness | Null rates, column coverage | Great Expectations / dbt | Block pipeline |
| Freshness | Staleness, SLA breaches | Monte Carlo / Soda | Fallback to cache |
| Consistency | Cross-source agreement | dbt tests + custom | Quarantine records |
| Drift | Distribution shift vs baseline | Evidently / custom PSI | Trigger retraining |
| Schema | Column types, new/dropped | Great Expectations | Block ingestion |
| Volume | Row count anomalies | Custom checks | Investigate source |

### Implementation Pattern

```python
# data_quality.py — example with Great Expectations
import great_expectations as gx

def validate_training_data(df, expectation_suite="training_data"):
    context = gx.get_context()
    validator = context.sources.pandas_default.read_dataframe(df)

    # Completeness
    validator.expect_column_values_to_not_be_null("user_id")
    validator.expect_column_values_to_not_be_null("target")

    # Schema
    validator.expect_column_values_to_be_of_type("user_id", "int64")
    validator.expect_column_values_to_be_between("target", 0, 1)

    # Volume
    validator.expect_table_row_count_to_be_between(min_value=1000)

    result = validator.validate()
    if not result.success:
        raise DataQualityError(f"Validation failed: {result.statistics}")
    return result
```

---

## Audit Checklist

- [ ] Clear data storage strategy (where does each type of data live?)
- [ ] Data quality checks exist and run automatically
- [ ] Schema versioning or migration strategy
- [ ] Data cataloguing or documentation of all datasets
- [ ] Backup and recovery plan
- [ ] Data retention policies defined
- [ ] PII handling documented (masking, encryption, deletion)
- [ ] Data lineage trackable (can you trace a prediction back to source data?)
ENDMD

echo "  ✅ 02-data-platform.md"

# ══════════════════════════════════════════════════════════════
# DOC 03: Feature Engineering
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/03-feature-engineering.md" << 'ENDMD'
# L3: Feature Engineering

> Reference layer for feature computation, storage, and serving.

---

## 3.1 Feature Store Architecture

| Component | Purpose | Technology |
|-----------|---------|-----------|
| Registry | Central catalogue of definitions, metadata, ownership | Feast / Tecton / Hopsworks |
| Offline Store | Historical values for training | Delta Lake / Iceberg / BigQuery |
| Online Store | Low-latency serving (<10ms) | Redis / DynamoDB / Bigtable |
| Computation | Batch + streaming transforms | Spark / Flink / dbt |
| Serving API | Unified feature fetch at inference | Feast serving / custom gRPC |

**Decision: Build vs Buy**
- <50 models: Use Feast (open-source) + Redis
- 50-200 models: Evaluate Tecton or Hopsworks
- 200+ models: Custom-built (Uber Michelangelo pattern)

---

## 3.2 Computation Patterns

| Pattern | Latency | Example | Engine |
|---------|---------|---------|--------|
| Batch | Hours | User LTV, 30-day counts | Spark on schedule |
| Streaming | Seconds | Rolling 5-min txn count | Flink / Spark SS |
| On-Demand | Milliseconds | Current cart total | Computed at inference |
| Embedding | Minutes | User/product embeddings | GPU batch → vector store |

---

## 3.3 Training-Serving Skew Prevention

The #1 cause of silent model degradation. Features computed differently in training vs inference.

**Solution**: Single feature definition used by both:

```python
# feature_definitions.py — shared between training and serving
from feast import Feature, FeatureView, Entity, ValueType

user = Entity(name="user_id", value_type=ValueType.INT64)

user_features = FeatureView(
    name="user_features",
    entities=[user],
    features=[
        Feature(name="total_purchases_30d", dtype=ValueType.INT64),
        Feature(name="avg_session_duration", dtype=ValueType.FLOAT),
        Feature(name="last_login_days_ago", dtype=ValueType.INT64),
    ],
    online=True,
    source=spark_source,  # batch computation
    ttl=timedelta(days=1),
)
```

---

## Audit Checklist

- [ ] Features are defined in code (not ad-hoc in notebooks)
- [ ] Same feature logic used in training and inference
- [ ] Feature documentation exists
- [ ] Point-in-time correctness for training data (no data leakage)
- [ ] Feature freshness monitored
- [ ] Feature drift detection in place
ENDMD

echo "  ✅ 03-feature-engineering.md"

# ══════════════════════════════════════════════════════════════
# DOC 04: Model Development
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/04-model-development.md" << 'ENDMD'
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
ENDMD

echo "  ✅ 04-model-development.md"

# ══════════════════════════════════════════════════════════════
# DOC 05: Model Serving
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/05-model-serving.md" << 'ENDMD'
# L5: Model Serving

> Reference layer for inference infrastructure, optimisation, and deployment strategies.

---

## 5.1 Serving Engines

| Engine | Best For | Key Features | Latency |
|--------|----------|-------------|---------|
| vLLM | LLM at scale | PagedAttention, continuous batching, OpenAI API | 100-500ms TTFT |
| TGI | LLM (HF ecosystem) | Flash Attention, grammar support | Similar to vLLM |
| Triton | Multi-framework | Dynamic batching, ensembles, TensorRT | 5-50ms classical |
| TorchServe | PyTorch simple | Easy packaging, metrics OOTB | 10-100ms |
| BentoML | Multi-model pipes | Composition, adaptive batching | Varies |
| ONNX Runtime | Cross-framework opt | Graph opt, quantisation | 1-20ms optimised |

**Decision**: vLLM for LLM inference (de facto standard 2025-26). Triton for classical ML. BentoML for pipelines.

---

## 5.2 Inference Optimisation

| Technique | Effect | Impact | Trade-off |
|-----------|--------|--------|-----------|
| Quantisation (GPTQ/AWQ) | FP16→INT8/INT4 | 2-4x memory, 1.5-3x throughput | <1% accuracy loss |
| Continuous Batching | Dynamic request batching | 3-10x throughput | Slight P99 increase |
| Speculative Decoding | Small model drafts, large verifies | 2-3x speedup | Requires paired models |
| Flash Attention | Fused attention kernel | 2-4x attention speedup | Ampere+ GPU |
| Prefix Caching | Cache KV for shared prefixes | 50-90% TTFT reduction | Memory overhead |
| Structured Output | Force JSON schema | Eliminates post-proc failures | Slight latency |

---

## 5.3 Deployment Strategies

| Strategy | How | Best For | Rollback |
|----------|-----|----------|----------|
| Blue-Green | Swap traffic atomically | Major versions | Seconds |
| Canary | Route small % → monitor → increase | Incremental updates | Seconds |
| Shadow | Parallel run, compare outputs | High-risk models | N/A |
| A/B Test | Statistical traffic split | Business impact measurement | Seconds |

---

## 5.4 Auto-Scaling Configuration

```yaml
# Kubernetes HPA for model serving
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: model-server-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: model-server
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Pods
    pods:
      metric:
        name: inference_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
```

---

## Audit Checklist

- [ ] Serving infrastructure defined (not raw Flask/FastAPI for inference)
- [ ] Inference optimisation applied (quantisation, batching, caching)
- [ ] Deployment strategy defined (not "push and pray")
- [ ] Auto-scaling configured
- [ ] Health/readiness probes on serving endpoints
- [ ] Load testing performed (know your capacity limits)
- [ ] Fallback model defined (what happens when primary fails?)
ENDMD

echo "  ✅ 05-model-serving.md"

# ══════════════════════════════════════════════════════════════
# DOC 06: Application Layer
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/06-application-layer.md" << 'ENDMD'
# L6: Application Layer

> Reference layer for API design, orchestration, guardrails, and caching.

---

## 6.1 API Architecture

- **AI Gateway**: Unified entry for auth, rate limiting, routing, caching, metering (Kong / custom FastAPI / Portkey)
- **Orchestration Service**: Multi-step workflows, retry, fallback (LangGraph / Temporal)
- **Guardrails Layer**: Input + output validation (Guardrails AI / Lakera / NeMo)
- **Response Cache**: Semantic caching to reduce LLM costs 20-40% (GPTCache / Redis)

### FastAPI Pattern

```python
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
import structlog

logger = structlog.get_logger()
app = FastAPI(title="AI Service", version="1.0.0")

class PredictRequest(BaseModel):
    query: str
    context: list[str] | None = None
    max_tokens: int = 512

class PredictResponse(BaseModel):
    answer: str
    sources: list[str]
    confidence: float
    latency_ms: float

@app.post("/predict", response_model=PredictResponse)
async def predict(request: PredictRequest, settings=Depends(get_settings)):
    # 1. Input validation (guardrails)
    validated = await validate_input(request)
    # 2. Feature retrieval
    features = await feature_store.get_features(validated)
    # 3. Model inference
    result = await model_service.predict(validated, features)
    # 4. Output validation (guardrails)
    safe_result = await validate_output(result)
    return safe_result

@app.get("/health")
async def health():
    return {"status": "healthy", "model_loaded": True}
```

---

## 6.2 Orchestration Patterns

| Pattern | Architecture | Use Case | Complexity |
|---------|-------------|----------|-----------|
| Simple Chain | Prompt → LLM → Parse | Q&A, classification | Low |
| RAG Pipeline | Query → Embed → Retrieve → Rerank → LLM | Knowledge Q&A | Medium |
| Agent Loop | Plan → Tool → Observe → Decide (loop) | Research, analysis | High |
| Multi-Agent | Supervisor routes to specialists | Workflows, review | Very High |
| Router | Classifier → specialised model | Cost optimisation | Medium |

---

## 6.3 Guardrails Architecture

| Type | Catches | Implementation | Budget |
|------|---------|---------------|--------|
| Prompt Injection | Override attempts | Classifier + heuristics | <50ms |
| PII Detection | Names, SSN, cards | Presidio + NER | <30ms |
| Toxicity Filter | Harmful content | Perspective API / classifier | <100ms |
| Hallucination Check | Ungrounded claims | NLI cross-encoder | <200ms |
| Topic Guard | Off-domain queries | Intent classifier | <50ms |
| Format Validation | Schema compliance | Pydantic / JSON Schema | <5ms |
| Cost Guard | Runaway tokens | Budget per request | <1ms |

### Implementation

```python
# guardrails/pipeline.py
from typing import NamedTuple

class GuardrailResult(NamedTuple):
    passed: bool
    blocked_by: str | None = None
    details: dict | None = None

async def run_input_guardrails(text: str) -> GuardrailResult:
    # Run in parallel for speed
    results = await asyncio.gather(
        check_prompt_injection(text),
        check_pii(text),
        check_toxicity(text),
        check_topic_boundary(text),
    )
    for check_name, passed, details in results:
        if not passed:
            return GuardrailResult(False, check_name, details)
    return GuardrailResult(True)
```

---

## 6.4 Error Handling Pattern

```python
# Standard error handling for AI services
from fastapi import HTTPException
from enum import Enum

class AIErrorCode(str, Enum):
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    GUARDRAIL_BLOCKED = "GUARDRAIL_BLOCKED"
    RATE_LIMITED = "RATE_LIMITED"
    CONTEXT_TOO_LONG = "CONTEXT_TOO_LONG"
    TIMEOUT = "INFERENCE_TIMEOUT"

class AIServiceError(HTTPException):
    def __init__(self, code: AIErrorCode, detail: str):
        super().__init__(status_code=self._status(code), detail={"code": code, "message": detail})

    @staticmethod
    def _status(code):
        return {
            AIErrorCode.MODEL_UNAVAILABLE: 503,
            AIErrorCode.GUARDRAIL_BLOCKED: 422,
            AIErrorCode.RATE_LIMITED: 429,
            AIErrorCode.CONTEXT_TOO_LONG: 413,
            AIErrorCode.TIMEOUT: 504,
        }.get(code, 500)
```

---

## Audit Checklist

- [ ] API documented with OpenAPI/Swagger
- [ ] Input validation on all endpoints (Pydantic models)
- [ ] Error handling with structured error responses
- [ ] Rate limiting configured
- [ ] Authentication/authorisation on endpoints
- [ ] Guardrails on LLM input and output
- [ ] Response caching strategy
- [ ] Timeout handling with fallback
- [ ] CORS configured appropriately
- [ ] Request/response logging
ENDMD

echo "  ✅ 06-application-layer.md"

# ══════════════════════════════════════════════════════════════
# DOC 07: Governance & Monitoring
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/07-governance-monitoring.md" << 'ENDMD'
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
ENDMD

echo "  ✅ 07-governance-monitoring.md"

# ══════════════════════════════════════════════════════════════
# DOC 08: MLOps CI/CD
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/08-mlops-cicd.md" << 'ENDMD'
# L7+: MLOps CI/CD Pipeline

> Reference for ML-specific CI/CD, testing strategy, and deployment automation.

---

## 8.1 ML CI/CD Pipeline Stages

| Stage | What Runs | Gate | Tooling |
|-------|----------|------|---------|
| Code Quality | Lint, type check, unit tests | Pass; coverage>80% | Ruff, mypy, pytest |
| Data Validation | Schema, quality, drift | All checks pass | Great Expectations, dbt |
| Model Training | Train on latest data | Completes without error | Kubeflow / Vertex / custom |
| Model Evaluation | Offline metrics on holdout | Above thresholds | MLflow eval, custom |
| Fairness Testing | Bias across groups | Within tolerance | Fairlearn, Aequitas |
| Integration Test | E2E API tests | Pass; latency<SLA | pytest + httpx, Locust |
| Staging Deploy | Deploy + smoke test | Smoke pass; no errors | ArgoCD / Helm |
| Canary Deploy | 5%→25%→50%→100% | No regression | Istio / Argo Rollouts |

---

## 8.2 GitHub Actions Templates

### CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install ruff mypy pytest pytest-cov
      - run: ruff check .
      - run: ruff format --check .
      - run: mypy src/ --ignore-missing-imports
      - run: pytest tests/ --cov=src --cov-report=term-missing --cov-fail-under=80
```

### Model Evaluation Pipeline

```yaml
# .github/workflows/model-eval.yml
name: Model Evaluation
on:
  workflow_dispatch:
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6am

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install -r requirements.txt
      - run: python scripts/evaluate_model.py
      - run: python scripts/check_thresholds.py
      - uses: actions/upload-artifact@v4
        with:
          name: eval-report
          path: reports/evaluation_*.html
```

---

## 8.3 Testing Strategy

| Test Type | What | When | Coverage Target |
|-----------|------|------|----------------|
| Unit | Individual functions, utils | Every commit | >80% |
| Integration | API endpoints, DB queries | Every PR | Key paths |
| Model Eval | Offline metrics on holdout | Pre-deploy | Thresholds defined |
| Fairness | Bias across demographics | Pre-deploy | Within tolerance |
| Load | Throughput, latency at scale | Pre-release | Meet SLA |
| E2E Smoke | Full request flow | Post-deploy | Critical paths |

### Testing Structure

```
tests/
├── conftest.py           # Shared fixtures
├── unit/
│   ├── test_preprocessing.py
│   ├── test_feature_engineering.py
│   └── test_guardrails.py
├── integration/
│   ├── test_api_endpoints.py
│   ├── test_model_serving.py
│   └── test_database.py
├── eval/
│   ├── test_model_accuracy.py
│   ├── test_model_fairness.py
│   └── test_model_latency.py
└── e2e/
    └── test_full_pipeline.py
```

---

## 8.4 Pre-commit Configuration

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.8.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
        args: ['--maxkb=1000']
      - id: detect-private-key
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.11.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests, pydantic]
```

---

## Audit Checklist

- [ ] CI pipeline runs on every push/PR
- [ ] Linting + formatting enforced
- [ ] Type checking enforced
- [ ] Unit tests with >80% coverage
- [ ] Integration tests for key API paths
- [ ] Model evaluation as gated pipeline stage
- [ ] Pre-commit hooks configured
- [ ] Deployment is automated (not manual)
- [ ] Rollback procedure documented and tested
ENDMD

echo "  ✅ 08-mlops-cicd.md"

# ══════════════════════════════════════════════════════════════
# DOC 09: Cost Architecture
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/09-cost-architecture.md" << 'ENDMD'
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
ENDMD

echo "  ✅ 09-cost-architecture.md"

# ══════════════════════════════════════════════════════════════
# DOC 10: Org Design
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/10-org-design.md" << 'ENDMD'
# Organisational Design for AI Teams

> Reference for team topology, roles, and Conway's Law implications.

---

## 10.1 Team Topologies

| Model | Structure | Best For | Risk |
|-------|-----------|----------|------|
| Centralised Platform | Single team owns all AI | <20 ML engineers; consistency | Bottleneck |
| Embedded Engineers | ML in product teams; shared platform | Large orgs; fast iteration | Fragmentation |
| Hub-and-Spoke | Central platform + embedded | Enterprise 50+ engineers | Coordination overhead |

---

## 10.2 Key Roles

| Role | Responsibility | Skills | Reports To |
|------|---------------|--------|-----------|
| ML Engineer | Build, train, deploy models | PyTorch, MLOps, SWE | ML Platform / Product |
| Data Scientist | Analysis, experimentation | Stats, Python, SQL | Analytics / Product |
| Data Engineer | Pipelines, quality, features | Spark, Kafka, Airflow | Data Platform |
| ML Platform Eng | Infrastructure (train/serve/monitor) | K8s, Terraform, GPU | Platform Engineering |
| AI Researcher | Novel architectures | DL theory, papers | Research |
| AI Product Manager | Strategy, requirements | ML literacy, business | Product |
| ML Architect | System design, standards | Breadth, trade-offs | CTO |
| Responsible AI Lead | Fairness, compliance | Ethics, regulation | Legal / CTO |

---

## 10.3 Conway's Law for AI

Your architecture will mirror your team structure. If data engineering and ML engineering are separate silos, you will get a fragmented data-to-model pipeline. The solution:

- **Platform team** owns the horizontal layers (infra, data, MLOps)
- **Product ML teams** own vertical slices (specific models and features)
- **Shared interfaces** (feature store API, model serving API) prevent tight coupling
ENDMD

echo "  ✅ 10-org-design.md"

# ══════════════════════════════════════════════════════════════
# DOC 11: Reference Architectures
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/11-reference-architectures.md" << 'ENDMD'
# Reference Architectures

> Complete end-to-end architecture examples.

---

## 11.1 Real-Time Recommendation System (10M+ DAU)

```
User Events → Kafka → Flink → Feature Store (Feast + Redis)
                               ↓
Spark (daily) → Embeddings → Feature Store (offline: Delta Lake)
                               ↓
API Request → Feature Store → Two-Tower Retrieval (GPU/Triton)
                             → Cross-Encoder Ranking (GPU/Triton)
                             → Business Rules (CPU)
                             → Response Cache (Redis)
                             → Return Top-K
                               ↓
Monitoring: Evidently (drift) + Grafana (ops) + A/B framework (Eppo)
```

---

## 11.2 Enterprise RAG System (50K+ Employees)

```
Documents (SharePoint/Confluence/Drive/Slack)
  → Airbyte → Chunking (512 tokens, 50 overlap)
  → Embedding (BGE-large) → Qdrant Vector DB

User Query → Guardrails (injection + PII)
  → Hybrid Retrieval (Qdrant dense + ES sparse)
  → RRF Fusion → Cross-Encoder Rerank
  → Top-5 Docs + System Prompt → LLM (Claude / Llama 3.1 70B via vLLM)
  → Output Guardrails (faithfulness + PII + format)
  → Response

Access Control: Document-level ACLs via Qdrant metadata filtering
Observability: Langfuse (traces, costs, quality) + Grafana (ops)
Eval: Weekly RAGAS pipeline on sampled queries
```

---

## 11.3 MLOps Platform (Hub-and-Spoke)

```
Central Platform Team Owns:
  ├── Kubernetes cluster + GPU scheduling (NVIDIA Operator)
  ├── Feature Store (Feast + Redis + Delta Lake)
  ├── Model Registry (MLflow)
  ├── Model Serving (vLLM + Triton behind Istio)
  ├── Monitoring (Prometheus + Grafana + Evidently + Langfuse)
  ├── CI/CD Templates (GitHub Actions reusable workflows)
  └── Guardrails Library (shared input/output validators)

Product ML Teams Own:
  ├── Model training code (uses platform training pipeline)
  ├── Feature definitions (registered in shared feature store)
  ├── Evaluation suites (using platform eval framework)
  └── Model-specific monitoring dashboards
```
ENDMD

echo "  ✅ 11-reference-architectures.md"

# ══════════════════════════════════════════════════════════════
# DOC 12: Anti-Patterns
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/12-anti-patterns.md" << 'ENDMD'
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
ENDMD

echo "  ✅ 12-anti-patterns.md"

# ══════════════════════════════════════════════════════════════
# DOC 13: Decision Cheatsheet
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/13-decision-cheatsheet.md" << 'ENDMD'
# Architecture Decision Cheat Sheet

> Quick-reference for common technology selection decisions.

---

| Decision | Option A | Option B | Choose A When | Choose B When |
|----------|----------|----------|---------------|---------------|
| Cloud | AWS | GCP | Enterprise deals; SageMaker | Vertex AI; BigQuery; TPUs |
| Orchestrator | Airflow | Dagster | Large team; mature ecosystem | Asset-centric; modern DX |
| Table Format | Delta Lake | Iceberg | Databricks shop | Vendor-neutral; multi-engine |
| Feature Store | Feast | Tecton | <50 models; open-source | Enterprise; streaming features |
| Experiment Track | MLflow | W&B | Self-hosted; integrated registry | Better UX; collaboration |
| LLM Serving | vLLM | TGI | Max throughput; PagedAttention | HF ecosystem; grammar output |
| Vector DB | Qdrant | Pinecone | Self-hosted; open-source | Fully managed; serverless |
| LLM Framework | LangGraph | CrewAI | Complex agents; state machines | Quick prototyping; role-based |
| Streaming | Kafka | Pulsar | Mature; largest ecosystem | Multi-tenancy; geo-replication |
| Python Linter | Ruff | Pylint | Speed; modern; all-in-one | Legacy codebase compatibility |
| Type Checker | mypy | Pyright | Standard; widest adoption | Speed; VSCode integration |
| API Framework | FastAPI | Flask | Modern; async; auto-docs | Simple; maximum ecosystem |
| Container Orch | Kubernetes | Docker Compose | Production; multi-node | Dev/staging; single node |
| LLM Provider | Anthropic Claude | OpenAI GPT | Reasoning; safety; long context | Ecosystem; multimodal; fine-tuning |
| Embedding Model | BGE-large | Cohere embed | Self-hosted; open-source | API convenience; multilingual |
| CI/CD | GitHub Actions | GitLab CI | GitHub-hosted repos | Self-hosted; GitLab ecosystem |
ENDMD

echo "  ✅ 13-decision-cheatsheet.md"

# ══════════════════════════════════════════════════════════════
# DOC 14: LLM-Specific Patterns
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/14-llm-patterns.md" << 'ENDMD'
# LLM-Specific Architecture Patterns

> Dedicated reference for LLM system design: RAG, agents, fine-tuning, evaluation, guardrails.

---

## 14.1 LLM Development Spectrum

| Pattern | When | Architecture | Cost |
|---------|------|-------------|------|
| Prompt Engineering | Quick iteration; no training | Templates in VCS; A/B via feature flags | Cheapest |
| RAG | Domain knowledge without fine-tuning | Vector DB + embedding + retrieval + LLM | Moderate |
| Fine-tuning (Full) | Change behaviour fundamentally | Full parameter training | Expensive |
| LoRA / QLoRA | Adapt to domain cheaply | Low-rank adapters; merge or serve separately | 10-20% of full |
| RLHF / DPO / GRPO | Align with human preferences | Preference data → reward model → RL | Very expensive |
| Distillation | Smaller model with big model quality | Teacher generates data for student | One-time large; permanent savings |
| Agents | Multi-step reasoning | LLM + tools + memory + planning | High (multi-call) |

---

## 14.2 RAG Architecture Deep Dive

### Chunking Strategies

| Strategy | When | Config |
|----------|------|--------|
| Fixed-size | Simple documents | 512 tokens, 50 token overlap |
| Recursive Character | Markdown/HTML | Split on headers → paragraphs → sentences |
| Semantic | Dense technical docs | Embed sentences; cluster by similarity |
| Document-level | Short documents (<1000 tokens) | Whole document as single chunk |

### Retrieval Pipeline

```
Query → Query Expansion (optional: LLM rephrases)
      → Embedding (BGE-large / Cohere)
      → Dense Search (Qdrant top-20)
      → Sparse Search (BM25/Elasticsearch top-20)
      → Fusion (Reciprocal Rank Fusion)
      → Re-ranking (Cross-encoder: ms-marco-MiniLM top-5)
      → Context Assembly (system prompt + retrieved chunks)
      → LLM Generation
      → Citation Extraction
```

### Evaluation (RAGAS)

| Metric | What It Measures | Target |
|--------|-----------------|--------|
| Faithfulness | Is the answer grounded in context? | >0.85 |
| Answer Relevancy | Does the answer address the question? | >0.80 |
| Context Precision | Are retrieved docs relevant? | >0.75 |
| Context Recall | Were all needed docs retrieved? | >0.70 |

---

## 14.3 Agent Architecture

### LangGraph Pattern

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated

class AgentState(TypedDict):
    messages: list
    tool_results: list
    iterations: int

def should_continue(state: AgentState) -> str:
    if state["iterations"] >= 5:
        return "end"  # Cost guard: max iterations
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return "end"

graph = StateGraph(AgentState)
graph.add_node("agent", call_model)
graph.add_node("tools", execute_tools)
graph.add_edge("tools", "agent")
graph.add_conditional_edges("agent", should_continue, {"tools": "tools", "end": END})
graph.set_entry_point("agent")
app = graph.compile()
```

### Multi-Agent Pattern

```
Supervisor Agent
  ├── routes to: Research Agent (web search, doc retrieval)
  ├── routes to: Analysis Agent (data processing, code execution)
  ├── routes to: Writing Agent (content generation, formatting)
  └── synthesises: Final response from specialist outputs

Communication: Message passing via shared state
Guard: Max total iterations across all agents
Fallback: If any agent fails, supervisor handles gracefully
```

---

## 14.4 Prompt Engineering Best Practices

```python
# prompt_templates/rag_qa.py
SYSTEM_PROMPT = """You are a helpful assistant answering questions based on provided context.

RULES:
1. Only answer based on the provided context. If the context doesn't contain the answer, say so.
2. Cite your sources using [Source: document_name] format.
3. Be concise and direct.
4. If the question is ambiguous, ask for clarification.

CONTEXT:
{context}
"""

USER_PROMPT = """Question: {question}

Answer based only on the context above."""
```

### Prompt Versioning

```
prompts/
├── rag_qa/
│   ├── v1.0.0.yaml    # initial version
│   ├── v1.1.0.yaml    # added citation rules
│   ├── v2.0.0.yaml    # restructured for better faithfulness
│   └── current.yaml   # symlink to active version
├── classification/
│   ├── v1.0.0.yaml
│   └── current.yaml
└── README.md           # prompt changelog and rationale
```

---

## 14.5 LLM Observability with Langfuse

```python
from langfuse import Langfuse
from langfuse.decorators import observe, langfuse_context

langfuse = Langfuse()

@observe()
def rag_pipeline(query: str) -> str:
    # Retrieval (auto-traced as span)
    langfuse_context.update_current_observation(name="retrieval")
    docs = retriever.search(query, top_k=5)

    # Generation (auto-traced as generation)
    langfuse_context.update_current_observation(name="generation")
    response = llm.generate(
        system=SYSTEM_PROMPT.format(context=format_docs(docs)),
        user=query,
    )

    # Score (for eval dashboard)
    langfuse_context.score_current_trace(
        name="user_feedback",
        value=1,  # or 0 for negative
    )
    return response
```

---

## 14.6 LLM Cost Optimisation

| Strategy | Savings | Implementation |
|----------|---------|---------------|
| Semantic Cache | 20-40% | Cache similar queries; Redis + embedding similarity |
| Model Router | 30-50% | Small model for simple queries; large for complex |
| Prompt Compression | 10-20% | Remove redundant context; summarise before sending |
| Batch Processing | 20-30% | Group non-urgent requests; use batch API pricing |
| Fine-tuned Small | 60-80% | Distil task-specific model; serve on cheap GPU |

---

## Audit Checklist

- [ ] Prompt templates versioned in code (not hardcoded strings)
- [ ] RAG: chunking strategy documented and tested
- [ ] RAG: retrieval pipeline includes reranking
- [ ] RAG: evaluation pipeline (RAGAS or equivalent)
- [ ] Agents: iteration limit / cost guard in place
- [ ] Agents: fallback behaviour on tool failure
- [ ] LLM observability (Langfuse or equivalent) capturing traces
- [ ] LLM eval pipeline running regularly (not just vibes)
- [ ] Token cost tracking per model and per endpoint
- [ ] Prompt injection defence tested
ENDMD

echo "  ✅ 14-llm-patterns.md"

# ══════════════════════════════════════════════════════════════
# INDEX FILE
# ══════════════════════════════════════════════════════════════
cat > "$DOCS_DIR/README.md" << 'ENDMD'
# Architecture Reference Documentation

> Enterprise AI Architecture & System Design — 14-document reference library.

## Documents

| # | Document | Covers |
|---|----------|--------|
| 01 | [Infrastructure](01-infrastructure.md) | Cloud, GPU, IaC, containers, networking |
| 02 | [Data Platform](02-data-platform.md) | Lakehouse, ingestion, quality, medallion |
| 03 | [Feature Engineering](03-feature-engineering.md) | Feature store, computation, skew prevention |
| 04 | [Model Development](04-model-development.md) | Training, experiments, evaluation, distributed |
| 05 | [Model Serving](05-model-serving.md) | Inference engines, optimisation, deployment |
| 06 | [Application Layer](06-application-layer.md) | API, orchestration, guardrails, caching |
| 07 | [Governance & Monitoring](07-governance-monitoring.md) | Observability, security, compliance |
| 08 | [MLOps CI/CD](08-mlops-cicd.md) | Pipelines, testing, automation |
| 09 | [Cost Architecture](09-cost-architecture.md) | FinOps, optimisation, tracking |
| 10 | [Org Design](10-org-design.md) | Teams, roles, Conway's Law |
| 11 | [Reference Architectures](11-reference-architectures.md) | End-to-end examples |
| 12 | [Anti-Patterns](12-anti-patterns.md) | What NOT to do |
| 13 | [Decision Cheatsheet](13-decision-cheatsheet.md) | Technology selection matrix |
| 14 | [LLM Patterns](14-llm-patterns.md) | RAG, agents, fine-tuning, eval |

## Usage

1. Run `bash scripts/scan-project.sh` to audit your project
2. Read the scan report in `.audit/scan-report.md`
3. Reference relevant docs above for each layer that needs improvement
4. Follow the priority matrix in `CLAUDE.md` Phase 2

## With Claude Code

Paste into Claude Code:
```
Read CLAUDE.md. Scan my project. Generate the audit report. Then start fixing P0 issues using the architecture docs as reference.
```
ENDMD

echo "  ✅ README.md (index)"

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║  ✅ All 14 architecture docs generated!        ║"
echo "║  Location: $DOCS_DIR/                         ║"
echo "╚═══════════════════════════════════════════════╝"

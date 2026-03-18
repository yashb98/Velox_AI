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

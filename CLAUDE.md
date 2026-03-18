# CLAUDE.md — Velox AI Development Guide

> **Version**: 4.0 | **Updated**: March 2026
> **Purpose**: Guide for continuous improvement of Velox AI

---

## Core Principles

1. **Audit First** — Scan → Score → Prioritize → Implement
2. **Production-Ready** — Every change must work in containers with CI/CD
3. **Evidence-Based** — Reference `docs/architecture/` for decisions

---

## Project Structure

```
velox-api/          # Node.js/Express backend (port 8080)
velox-web/          # React/Vite frontend (port 5173)
agents/             # Python ADK pipeline (port 8002)
  └─ rag/           # Advanced RAG system
      ├─ dspy_modules/    # DSPy 2.6 optimization
      ├─ retrievers/      # GraphRAG + Hybrid retrieval
      ├─ agentic_rag/     # Self-RAG, Corrective RAG, Adaptive RAG
      ├─ orchestration/   # LangGraph multi-agent
      └─ guardrails/      # Anti-hallucination checks
docs/architecture/  # Architecture reference docs
```

---

## Quick Start

```bash
# Run with Docker
docker compose up --build

# Free tier (external Neon/Upstash)
docker compose -f docker-compose.free-tier.yml up --build
```

**URLs**: Frontend `:5173` | API `:8080` | Agents `:8002`

---

## Audit & Improve Workflow

### 1. Scan
```bash
bash scripts/scan-project.sh  # Generates .audit/project-scan.json
```

### 2. Score (0-10 per layer)
| Layer | Focus Area |
|-------|------------|
| L1 | Infrastructure: Docker, CI/CD, IaC |
| L2 | Data: Storage, quality, versioning |
| L3 | Features: Store, computation, consistency |
| L4 | Models: Training, registry, evaluation |
| L5 | Serving: Inference, scaling, deployment |
| L6 | Application: API, guardrails, caching |
| L7 | Operations: Monitoring, security, compliance |

### 3. Prioritize
| Priority | Fix When | Examples |
|----------|----------|----------|
| **P0** | Immediately | Secrets exposed, crashes, no Docker |
| **P1** | This week | No tests, no CI/CD, no logging |
| **P2** | This sprint | No monitoring, tight coupling |
| **P3** | This quarter | No auto-scaling, no A/B testing |

### 4. Implement & Verify
- Reference architecture docs for decisions
- Write tests for every change
- Re-scan after fixes to measure improvement

---

## Architecture Reference

| Doc | Purpose |
|-----|---------|
| `01-infrastructure.md` | Cloud, containers, IaC |
| `05-model-serving.md` | Inference, optimization |
| `06-application-layer.md` | API, RAG, guardrails |
| `07-governance-monitoring.md` | Observability, security |
| `15-advanced-rag-architecture.md` | 5-layer anti-hallucination RAG |

---

## RAG System (5-Layer Anti-Hallucination)

```
Layer 1: DSPy Optimization     → agents/rag/dspy_modules/
Layer 2: GraphRAG + Hybrid     → agents/rag/retrievers/
Layer 3: Agentic RAG Patterns  → agents/rag/agentic_rag/
Layer 4: Multi-Agent Pipeline  → agents/rag/orchestration/
Layer 5: Guardrails            → agents/rag/guardrails/
```

**Usage:**
```python
from agents.rag import create_rag_pipeline
pipeline = create_rag_pipeline(retriever=my_retriever)
result = await pipeline.run("Your question")
```

---

## LLM Providers

| Provider | Env Var | Models |
|----------|---------|--------|
| Kimi | `KIMI_API_KEY` | moonshot-v1-8k/32k/128k |
| Gemini | `GEMINI_API_KEY` | gemini-2.5-flash/pro |
| OpenAI | `OPENAI_API_KEY` | gpt-4o-mini/gpt-4o |

Set `LLM_PROVIDER=kimi|gemini|openai` in `.env`

---

## Key Commands

```bash
# Development
make dev              # Start all services
make test             # Run tests
make lint             # Lint code

# Docker
make build            # Build containers
make up               # Start containers
make down             # Stop containers
make logs             # View logs

# Database
make migrate          # Run migrations
make seed             # Seed data
```

---

## Behavioral Rules

1. **Scan before changing** — Always understand current state
2. **Reference docs** — Link to architecture docs in PRs
3. **Don't break things** — Incremental improvements only
4. **Write tests** — No untested code
5. **P0 → P1 → P2** — Fix in priority order
6. **Be specific** — "Add Prometheus latency histogram" not "add monitoring"

---

## Continuous Improvement

After each improvement cycle:
1. Re-run `bash scripts/scan-project.sh`
2. Compare scores to previous audit
3. Update this doc with new patterns learned
4. Add new architecture docs as needed

**Target**: 2/10 → 10/10 over time through incremental fixes.

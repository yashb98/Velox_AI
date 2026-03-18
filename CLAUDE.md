# CLAUDE.md — Velox AI Migration & Development Guide

> **Version**: 5.0 | **Updated**: 2026-03-18
> **Purpose**: Master context for Claude Code. Replaces the v4 audit framework.
> **Goal**: Migrate Velox AI off Google ecosystem → vendor-agnostic, sub-800ms voice stack.

---

## 1. WHAT THIS PROJECT IS

Velox AI is a multi-tenant AI voice agent SaaS. Users configure an AI agent with a knowledge base, connect a Twilio phone number, and the platform handles real-time voice calls.

**Owner**: Yash Bishnoi (github.com/yashb98) | **License**: MIT
**Stats**: 482 files | 121 TS (13K lines) | 29 PY (6.7K lines) | Node.js API + React 19 + Python agents

---

## 2. CURRENT STATE (as-is)

### What Works
- Docker Compose (multi-stage builds, health checks, non-root, compose profiles)
- Free-tier: Neon PostgreSQL + Upstash Redis + Kimi LLM (`docker-compose.free-tier.yml`)
- Prisma ORM: 5 migrations, multi-tenant schema (orgs, agents, conversations, messages)
- GitHub Actions CI/CD: `.github/workflows/ci.yml` + `cd.yml` (EXISTS already)
- Clerk auth + Stripe billing + Twilio voice + Deepgram STT/TTS + ElevenLabs TTS
- 5-layer RAG: DSPy, GraphRAG, Self-RAG/Corrective/Adaptive RAG, LangGraph orchestration, Guardrails
- Tests: `agents/tests/` + `velox-api/tests/` (unit + integration + LLM)
- Pre-commit: `.pre-commit-config.yaml` (ruff, mypy, trailing whitespace, secrets detection)
- Makefile shortcuts

### What's Being Removed
- Gemini API calls → SGLang self-hosted open-weight models
- Google ADK agent framework → LangGraph
- GCP Terraform (Cloud SQL, Memorystore, Cloud Run, VPC, Secret Manager) → Modal + Railway
- Cloud Build → GitHub Actions (already exists)
- Phi-3-mini SLM sidecar → Nemotron 3 Nano via SGLang
- Gemini fine-tuning API → Unsloth/Llama-Factory with GRPO

### Key Insight: Kimi Already Primary
Free-tier compose sets `LLM_PROVIDER=kimi` with `KIMI_BASE_URL=https://api.moonshot.cn/v1`. The OpenAI-compatible pattern is already in `pipeline.py`. Migration to SGLang is incremental — same API shape, different endpoint.

---

## 3. CODEBASE MAP

```
Velox_AI/
├── CLAUDE.md                    ← YOU ARE HERE
├── .claude/skills/              ← voice-pipeline, langgraph-agent, sglang-deploy, context-pruning
├── .claude/commands/            ← /audit, /migrate, /benchmark, /doc-check
├── .github/workflows/           ← CI + CD (EXISTS — update, don't recreate)
├── docs/
│   ├── architecture/            ← Replace generic docs with Velox-specific
│   └── compliance/              ← KEEP (SLOs, incident response)
├── velox-api/                   ← Node.js/Express :8080 (keep, refactor services)
│   ├── src/services/            ← Remove Gemini deps, keep business logic
│   ├── src/websocket/           ← REMOVE (voice moves to Pipecat)
│   └── prisma/                  ← KEEP
├── velox-web/                   ← React 19/Vite :5173 (keep, minor updates)
├── agents/                      ← Python :8002 (MAJOR REWRITE)
│   ├── pipeline.py              ← ADK router → LangGraph state machine
│   ├── rag/                     ← Simplify to 2-tier for voice
│   └── slm/                     ← DELETE (Phi-3)
├── voice/                       ← NEW: Pipecat voice service
├── deploy/                      ← NEW: Modal + Railway configs
├── fine-tuning/                 ← REWRITE for open-weight models
└── infrastructure/              ← DELETE (GCP Terraform)
```

---

## 4. MIGRATION TABLE

| Layer | OLD | NEW | Effort |
|-------|-----|-----|--------|
| Voice Orchestration | Custom WS in `server.ts` + `orchestrator.ts` | **Pipecat** (Python) | Major |
| Transport | Twilio WebSocket | **Daily.co WebRTC** + Twilio PSTN | Major |
| STT | Deepgram Nova-2 | **Ultravox** or **AssemblyAI Universal** | Medium |
| LLM | Gemini + Kimi fallback | **SGLang**: Nemotron / Qwen3.5 / Kimi K2.5 | Major |
| TTS | Deepgram Aura + ElevenLabs | **Cartesia Sonic** + ElevenLabs Flash v2.5 | Small |
| Agent Framework | Google ADK | **LangGraph** + **LangSmith** | Major |
| RAG | 5-layer (latency-heavy) | **2-tier**: fast hybrid + complex agentic | Medium |
| SLM | Phi-3-mini (llama-cpp) | Nemotron 3 Nano (SGLang) | Medium |
| Inference | API calls | **SGLang** on **Modal** | Major |
| Infra | GCP Terraform | **Modal** + **Railway** | Medium |
| Observability | LangFuse + Prometheus | **LangSmith** + Prometheus + Grafana | Small |
| Fine-tuning | Gemini API + Cloud Run | **Unsloth** + GRPO | Medium |

---

## 5. LATENCY & MODEL TARGETS

### Voice-to-Voice Budget (< 800ms)
```
Turn Detection:  < 75ms   (Silero VAD + semantic classifier)
STT:             < 100ms  (streaming) or 0ms (Ultravox merges STT+LLM)
LLM TTFT:        < 200ms  (SGLang + RadixAttention prefix caching)
TTS TTFB:        < 75ms   (Cartesia Sonic)
PSTN overhead:   ~300ms   (unavoidable)
```

### Model Routing
```
T0 Router:  Qwen3.5-3B    → classify intent + complexity  (<30ms)
T1 Fast:    Nemotron Nano  → 70-80% of turns              (<100ms TTFT)
T2 Medium:  Qwen3.5-35B   → multi-turn, tool orchestration (<200ms TTFT)
T3 Heavy:   Kimi K2.5 API → edge cases, multi-hop RAG     (<500ms TTFT)
```

### RAG (2-tier, voice-optimised)
- **Fast (<100ms):** Qdrant hybrid (vector + BM25) → cross-encoder rerank
- **Complex (<500ms):** LangGraph agentic loop + HyDE + optional GraphRAG
- **DSPy: offline only** — prompt optimization, NOT in hot path

---

## 6. PHASES (execute in order)

**Phase 0: Clean** → Run deletion script, replace CLAUDE.md, update .env.example
**Phase 1: Voice** → Create `voice/` with Pipecat, remove WS from velox-api
**Phase 2: LLM** → SGLang on Modal, model routing, remove Gemini calls
**Phase 3: Agents** → LangGraph state machine, LangSmith, remove ADK
**Phase 4: RAG** → Simplify to 2-tier, move DSPy offline
**Phase 5: Infra** → Update CI/CD, docker-compose, README, fine-tuning

---

## 7. DOC PLAN

### Keep: `compliance/slo-definitions.md`, `compliance/runbook-incident-response.md`, `FREE-TIER-SETUP.md`
### Keep+Update: `12-anti-patterns.md`, `13-decision-cheatsheet.md`, `14-llm-patterns.md`
### Replace with Velox-specific: 01→infra, 05→voice-pipeline, 06→app-layer, 07→observability, 15→voice-rag
### Delete: 02, 03, 04, 08, 09, 10, 11, architecture/README.md, compliance/model-card-gemini.md

---

## 8. RULES

1. **Latency wins** — reject anything adding voice path latency
2. **Delete over document** — remove dead code, don't mark deprecated
3. **One source** — search before writing, never duplicate info
4. **Max 300 lines per .md** — split if longer
5. **Open-weight preference** — self-hostable > API dependency
6. **Stale = delete** — any reference to Gemini/ADK/Cloud Run/Cloud Build/Phi-3 gets removed
7. **Test with audio** — voice changes need mock audio tests
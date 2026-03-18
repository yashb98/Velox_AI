<div align="center">

# 🎙️ Velox AI

**Enterprise-Grade AI Voice Agent Platform**

*Build, deploy, and manage intelligent AI voice agents — no ML expertise required*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB.svg)](https://www.python.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748.svg)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791.svg)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://docs.docker.com/compose/)
[![Google Cloud](https://img.shields.io/badge/Google_Cloud-GCP-4285F4.svg)](https://cloud.google.com/)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started (Local)](#getting-started-local)
- [Environment Variables](#environment-variables)
- [Running the Stack](#running-the-stack)
- [Service URLs](#service-urls)
- [API Reference](#api-reference)
- [How Voice Calls Work](#how-voice-calls-work)
- [AI Agent Pipeline](#ai-agent-pipeline)
- [Fine-Tuning Pipeline](#fine-tuning-pipeline)
- [Observability](#observability)
- [Cloud Deployment](#cloud-deployment)
- [Contributing](#contributing)

---

## Overview

Velox AI is a production-ready platform for building AI voice agents that can handle real phone calls. Connect a Twilio phone number, design a conversation flow, upload your knowledge base, and your AI agent answers calls — with sub-2-second response times powered by Gemini 2.5 Flash.

**Core capabilities:**
- 🎙️ Real-time voice calls via Twilio + Deepgram STT + Deepgram/ElevenLabs TTS
- 🧠 Multi-provider LLM support (Kimi/Moonshot, Gemini, OpenAI)
- 📚 **5-Layer Anti-Hallucination RAG** — GraphRAG, hybrid retrieval, multi-agent validation
- 🤖 Agentic RAG patterns — Self-RAG, Corrective RAG, Adaptive RAG
- 🛠️ Tool integrations (orders, inventory, calendar, CRM, human handoff)
- 🎨 Visual flow builder — design conversation flows with drag-and-drop
- 📊 Real-time analytics — cost tracking, sentiment, latency, Prometheus metrics
- 🔐 Multi-tenant — org-level isolation, Clerk auth, Stripe billing
- 💸 **Free tier support** — run with Neon (PostgreSQL) + Upstash (Redis)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Velox AI Stack                            │
│                                                                  │
│  Browser                                                         │
│  ┌────────────┐   HTTP/WS    ┌─────────────────────────────────┐ │
│  │ velox-web  │◄────────────►│         velox-api               │ │
│  │ React/Vite │              │   Node.js · Express · Prisma    │ │
│  │ :5173      │              │   WebSocket · Twilio Webhooks   │ │
│  └────────────┘              │   :8080                         │ │
│                              └──────────────┬──────────────────┘ │
│  Phone                                      │                    │
│  ┌────────────┐   WebSocket  │              │ HTTP               │
│  │  Twilio    │◄─────────────┘    ┌─────────▼──────────┐        │
│  │  (PSTN)    │                   │      agents        │        │
│  └────────────┘                   │  Python · FastAPI  │        │
│                                   │  Google ADK        │        │
│  STT / TTS                        │  :8002             │        │
│  ┌────────────┐                   └────────────────────┘        │
│  │  Deepgram  │                                                  │
│  │  ElevenLab │   Infrastructure                                 │
│  └────────────┘   ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│                   │ Postgres │  │  Redis   │  │   MLflow    │  │
│                   │ :5433    │  │  :6380   │  │   :5001     │  │
│                   └──────────┘  └──────────┘  └─────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
Velox_AI/
├── docker-compose.yml          # Full local stack (all 6 services)
├── .env.example                # Environment variable template
├── cloudbuild.yaml             # Google Cloud Build CI/CD
│
├── velox-api/                  # Node.js / Express backend
│   ├── src/
│   │   ├── server.ts           # HTTP + WebSocket server, billing pre-auth gate
│   │   ├── app.ts              # Express app, routes, /health, /metrics
│   │   ├── routes/
│   │   │   ├── agents.ts       # CRUD for AI agents
│   │   │   ├── conversations.ts # Conversation history & messages
│   │   │   ├── billing.ts      # Stripe checkout, webhooks, usage
│   │   │   ├── documentRoutes.ts # Knowledge base upload & ingestion
│   │   │   ├── playground.ts   # Playground chat endpoint
│   │   │   ├── voice.ts        # Twilio voice webhook (TwiML)
│   │   │   ├── webhooks.ts     # Stripe webhook handler
│   │   │   └── admin.ts        # Admin eval endpoint (protected)
│   │   └── services/
│   │       ├── orchestrator.ts     # Call pipeline coordinator
│   │       ├── llmService.ts       # Gemini integration + tool calling
│   │       ├── transcriptionService.ts # Deepgram STT (Nova-2)
│   │       ├── ttsService.ts       # Deepgram Aura + ElevenLabs TTS
│   │       ├── ragService.ts       # RAG query pipeline
│   │       ├── embeddingService.ts # Gemini text embeddings
│   │       ├── hybridSearchService.ts # BM25 + vector hybrid search
│   │       ├── ingestionService.ts # Document chunking & embedding
│   │       ├── billingService.ts   # Credit check, usage metering
│   │       ├── metricsService.ts   # Prometheus counters/histograms
│   │       ├── tracingService.ts   # LangFuse observability
│   │       ├── sessionService.ts   # Redis call state
│   │       ├── mlflow.ts           # MLflow experiment logging
│   │       └── promptService.ts    # System prompt builder
│   │   └── tools/
│   │       ├── definitions.ts      # Tool schemas (order, stock, calendar…)
│   │       └── registry.ts         # Tool execution registry
│   ├── prisma/
│   │   ├── schema.prisma       # DB schema (orgs, agents, conversations…)
│   │   └── migrations/         # 5 Prisma migrations
│   ├── Dockerfile              # Multi-stage build (builder → runner)
│   └── docker-entrypoint.sh   # Auto-runs DB migrations on startup
│
├── velox-web/                  # React 19 / Vite frontend
│   ├── src/
│   │   ├── main.tsx            # Entry point + Clerk + error boundary
│   │   ├── App.tsx             # Router (public + protected routes)
│   │   └── pages/
│   │       ├── HomePage.tsx    # Public landing page
│   │       ├── Dashboard.tsx   # Metrics overview
│   │       ├── Agents.tsx      # Agent list + create
│   │       ├── AgentFlowBuilder.tsx # Visual drag-and-drop flow editor
│   │       ├── Playground.tsx  # Test agent via chat
│   │       ├── Calls.tsx       # Live & historical calls
│   │       ├── Knowledge.tsx   # Knowledge base upload
│   │       └── Billing.tsx     # Stripe subscription management
│   └── Dockerfile              # Vite build → nginx:alpine
│
├── agents/                     # Python multi-agent pipeline
│   ├── main.py                 # FastAPI server (POST /generate, GET /health)
│   ├── pipeline.py             # Multi-provider LLM router (Kimi/Gemini/OpenAI)
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── rag/                    # 5-Layer Anti-Hallucination RAG System
│   │   ├── dspy_modules/       # DSPy 2.6 optimization (GEPA/MIPROv2)
│   │   ├── retrievers/         # GraphRAG + Hybrid (dense+sparse+graph)
│   │   ├── agentic_rag/        # Self-RAG, Corrective RAG, Adaptive RAG
│   │   ├── orchestration/      # LangGraph multi-agent pipeline
│   │   └── guardrails/         # Anti-hallucination checks
│   └── slm/                    # Phi-3-mini GGUF sidecar (optional)
│       ├── slm_server.py
│       └── Dockerfile
│
├── fine-tuning/                # Weekly fine-tune pipeline
│   ├── export_training_data.py # Exports conversation data from DB
│   ├── train.py                # Gemini fine-tune job
│   ├── cloud-run-job.yaml      # Cloud Run Jobs definition
│   └── cron/
│       └── finetune-scheduler.yaml # Cloud Scheduler (Mon 03:00)
│
└── infrastructure/             # Terraform — Google Cloud
    ├── main.tf                 # VPC, Cloud SQL, Redis
    ├── variables.tf
    ├── provider.tf
    └── outputs.tf
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Docker Desktop | 4.x+ | [docker.com](https://www.docker.com/products/docker-desktop/) |
| Git | any | pre-installed on macOS |
| VS Code | any | [code.visualstudio.com](https://code.visualstudio.com/) |

> Node.js, Python, and all other dependencies run **inside Docker** — nothing to install locally.

---

## Getting Started (Local)

### Step 1 — Clone the repository

```bash
git clone https://github.com/yashb98/Velox_AI.git
cd Velox_AI
```

### Step 2 — Copy the environment file

```bash
cp .env.example .env
```

### Step 3 — Fill in your API keys

Open `.env` in VS Code and add your credentials. The minimum required keys to get the app running:

| Key | Where to get it |
|-----|----------------|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `DEEPGRAM_API_KEY` | [console.deepgram.com](https://console.deepgram.com) → API Keys |
| `CLERK_SECRET_KEY` | [dashboard.clerk.com](https://dashboard.clerk.com) → API Keys |
| `VITE_CLERK_PUBLISHABLE_KEY` | same Clerk dashboard |
| `STRIPE_SECRET_KEY` | [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → Signing secret |
| `VITE_STRIPE_PUBLISHABLE_KEY` | same Stripe dashboard |
| `TWILIO_AUTH_TOKEN` | [console.twilio.com](https://console.twilio.com) → Account Info |

> **Tip:** The frontend landing page works even without Clerk keys. Auth is only needed when accessing `/dashboard`, `/agents`, etc.

### Step 4 — Start the full stack

```bash
docker compose --profile mlflow up --build
```

> First build takes ~3–5 minutes (downloads base images + installs dependencies). Subsequent starts are instant.

### Step 5 — Open in browser

| Service | URL | Notes |
|---------|-----|-------|
| **Frontend** | http://localhost:5173 | Landing page + full dashboard |
| **API Health** | http://localhost:8080/health | Should return `{"status":"ok"}` |
| **API Metrics** | http://localhost:8080/metrics | Prometheus scrape endpoint |
| **Agents Health** | http://localhost:8002/health | ADK pipeline status |
| **MLflow UI** | http://localhost:5001 | Experiment tracking |

---

## Free Tier Setup (Development)

Run Velox AI using free cloud services — no local PostgreSQL or Redis required.

### Quick Start

```bash
# 1. Copy free tier template
cp .env.free-tier .env

# 2. Get free services:
#    - PostgreSQL: https://neon.tech (0.5GB free)
#    - Redis: https://upstash.com (10K commands/day)
#    - LLM: Kimi API from https://platform.moonshot.cn

# 3. Edit .env with your keys

# 4. Run migrations
cd velox-api && npx prisma migrate deploy && cd ..

# 5. Start with free tier compose
docker compose -f docker-compose.free-tier.yml up --build
```

See [docs/FREE-TIER-SETUP.md](docs/FREE-TIER-SETUP.md) for detailed instructions.

---

## Environment Variables

Full reference for every variable in `.env`:

### Required

```env
# Google Gemini — LLM + embeddings
GEMINI_API_KEY=AIza...

# Deepgram — speech-to-text + text-to-speech
DEEPGRAM_API_KEY=...

# Twilio — receives inbound phone calls
TWILIO_AUTH_TOKEN=...

# Clerk — user authentication
CLERK_SECRET_KEY=sk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Stripe — billing & subscriptions
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_STARTER_PRICE_ID=price_...   # $49/mo — 1,000 minutes
STRIPE_PRO_PRICE_ID=price_...       # $199/mo — 5,000 minutes
STRIPE_ENTERPRISE_PRICE_ID=price_...# $499/mo — 20,000 minutes
```

### Optional (gracefully disabled when absent)

```env
# ElevenLabs — premium TTS voices (prefix voice_id with "el_" to use)
ELEVENLABS_API_KEY=

# LangFuse — LLM call tracing & observability
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=

# Tool integrations — connect to your business systems
ORDER_API_URL=          # Order status lookup
ORDER_API_KEY=
INVENTORY_API_URL=      # Stock level checks
CALENDAR_API_URL=       # Appointment booking
CRM_API_URL=            # Customer profile lookup
HANDOFF_API_URL=        # Transfer to human agent
FAQ_KB_ID=              # Knowledge base UUID for FAQ RAG

# Admin
ADMIN_API_KEY=dev-admin-key-change-me   # Protects POST /api/admin/run-eval
```

### Infrastructure (pre-wired by docker-compose — do not change for local dev)

```env
DATABASE_URL=postgresql://postgres:devpass@db:5432/velox_local
REDIS_HOST=redis
REDIS_PORT=6379
MLFLOW_TRACKING_URI=http://mlflow:5000
VITE_API_URL=http://localhost:8080
```

---

## Running the Stack

### Core stack (no MLflow UI)
```bash
docker compose up --build
```

### Core stack + MLflow experiment tracking UI
```bash
docker compose --profile mlflow up --build
```

### Core stack + Phi-3 SLM sidecar (requires model file — see below)
```bash
docker compose --profile slm up --build
```

### Everything
```bash
docker compose --profile mlflow --profile slm up --build
```

### Stop everything
```bash
docker compose --profile mlflow down
```

### Stop and wipe the database
```bash
docker compose --profile mlflow down -v
```

### Rebuild a single service after code changes
```bash
docker compose build api   # or: web, agents
docker compose up -d api
```

### View logs for a service
```bash
docker logs velox_api -f
docker logs velox_web -f
docker logs velox_agents -f
```

---

## Service URLs

| Container | Host URL | Purpose |
|-----------|----------|---------|
| `velox_web` | http://localhost:5173 | React dashboard + landing page |
| `velox_api` | http://localhost:8080/health | REST API health |
| `velox_api` | http://localhost:8080/metrics | Prometheus metrics |
| `velox_api` | http://localhost:8080/api/* | All API routes |
| `velox_agents` | http://localhost:8002/health | ADK agent pipeline |
| `velox_mlflow` | http://localhost:5001 | MLflow experiment UI |
| `velox_db` | localhost:5433 | PostgreSQL (psql client) |
| `velox_redis` | localhost:6380 | Redis (redis-cli) |

> **Why non-standard ports?** Host ports are remapped to avoid conflicts with other local services (local Postgres on 5432, macOS AirPlay on 5000, etc.).

---

## API Reference

All API routes are under `http://localhost:8080`.

### Public

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/health` | Service health — returns `{"status":"ok"}` |
| `GET` | `/metrics` | Prometheus metrics scrape |
| `POST` | `/stripe/webhook` | Stripe billing events |
| `POST` | `/voice/incoming` | Twilio inbound call webhook |
| `POST` | `/voice/stream` | Twilio media stream websocket upgrade |

### Protected (requires Clerk `Authorization: Bearer <token>` header)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/agents` | List all agents for the org |
| `POST` | `/api/agents` | Create a new agent |
| `GET` | `/api/agents/:id` | Get agent details |
| `PUT` | `/api/agents/:id` | Update agent config |
| `DELETE` | `/api/agents/:id` | Delete agent |
| `GET` | `/api/conversations` | List conversations |
| `GET` | `/api/conversations/:id` | Conversation details + messages |
| `GET` | `/api/billing/subscription` | Current plan + usage |
| `POST` | `/api/billing/checkout` | Create Stripe checkout session |
| `POST` | `/api/documents/upload` | Upload knowledge base document |
| `GET` | `/api/documents` | List knowledge base documents |
| `POST` | `/api/playground/chat` | Test an agent (no phone needed) |

### Admin (requires `X-Admin-Key: <ADMIN_API_KEY>` header)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/admin/run-eval` | Trigger DeepEval test suite + log to MLflow |

---

## How Voice Calls Work

When someone calls your Twilio number:

```
1. Twilio → POST /voice/incoming
      velox-api returns TwiML: <Connect><Stream url="wss://…/media-stream?orgId=…"/>

2. Twilio → WebSocket upgrade to /media-stream
      server.ts checks billing (hasMinutes) BEFORE accepting the WS handshake
      → 402 Payment Required if out of credits

3. Audio stream open
      Deepgram STT transcribes each chunk in real time (Nova-2, confidence score logged)

4. Transcript arrives
      orchestrator.ts builds context (system prompt + RAG results + conversation history)
      → sends to Google ADK agents pipeline (POST /generate)
      → agents route to: Phi-3 SLM (simple) → Gemini Flash (medium) → Gemini Pro (complex)

5. Tool call detected
      Gemini returns functionCall → registry.ts executes the tool (order API, CRM, etc.)
      → result injected back into Gemini → final natural language response

6. Response → TTS
      ttsService.ts calls Deepgram Aura (or ElevenLabs if voice_id starts with "el_")
      → mulaw 8kHz audio streamed back to Twilio → caller hears the response

7. Call ends
      callService.ts writes final cost, sentiment score, duration to DB
      metricsService.ts records Prometheus counters + histograms
```

### Setting up Twilio (for real phone calls)

1. Buy a phone number in the [Twilio Console](https://console.twilio.com)
2. Set the webhook URL for voice calls:
   - **Voice → A Call Comes In:** `https://your-api-domain.com/voice/incoming`
   - Or for local dev, use `ngrok` to expose port 8080:
     ```bash
     ngrok http 8080
     # Then set: https://abc123.ngrok.io/voice/incoming
     ```
3. Add your `TWILIO_AUTH_TOKEN` to `.env`

---

## AI Agent Pipeline

The multi-agent routing pipeline lives in `agents/` and is built with **Google ADK (Agent Development Kit)**.

### Multi-Provider LLM Support

Set `LLM_PROVIDER` in `.env` to switch providers:

| Provider | Env Var | Models |
|----------|---------|--------|
| **Kimi** | `KIMI_API_KEY` | moonshot-v1-8k, 32k, 128k |
| **Gemini** | `GEMINI_API_KEY` | gemini-2.5-flash, gemini-2.5-pro |
| **OpenAI** | `OPENAI_API_KEY` | gpt-4o-mini, gpt-4o |

### How routing works

```
User speech
     │
     ▼
Phi-3-mini SLM          ← fast, runs locally, handles ~70% of simple turns
     │ (complex query?)
     ▼
Fast Model              ← Kimi-8k / Gemini Flash / GPT-4o-mini
     │ (very complex?)
     ▼
Powerful Model          ← Kimi-128k / Gemini Pro / GPT-4o
```

### Running with the Phi-3 SLM sidecar (optional)

The SLM sidecar saves Gemini API costs by handling short/simple turns locally.

1. Download the model:
   ```bash
   # ~2.3GB download
   wget -P agents/slm/models/ \
     https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf
   ```
2. Start with the SLM profile:
   ```bash
   docker compose --profile slm up --build
   ```

### Available tools

Tools are defined in `velox-api/src/tools/definitions.ts` and registered in `registry.ts`:

| Tool | Description | Requires |
|------|-------------|----------|
| `check_order_status` | Look up order by ID | `ORDER_API_URL` |
| `check_item_stock` | Check warehouse stock | `INVENTORY_API_URL` |
| `book_appointment` | Create a calendar event | `CALENDAR_API_URL` |
| `get_customer_profile` | Fetch CRM record | `CRM_API_URL` |
| `transfer_to_agent` | Hand off to human | `HANDOFF_API_URL` |
| `search_knowledge_base` | RAG over uploaded docs | `FAQ_KB_ID` |

---

## Advanced RAG System

Velox AI includes a **5-Layer Anti-Hallucination RAG** system in `agents/rag/`:

```
Layer 1: DSPy Optimization      → Automatic prompt tuning (GEPA/MIPROv2)
Layer 2: GraphRAG + Hybrid      → Knowledge graph + dense + sparse retrieval
Layer 3: Agentic RAG            → Self-RAG, Corrective RAG, Adaptive RAG
Layer 4: Multi-Agent Pipeline   → LangGraph orchestration with validation
Layer 5: Guardrails             → Citation enforcement, calibrated abstention
```

### Usage

```python
from agents.rag import create_rag_pipeline

# Create pipeline with all layers
pipeline = create_rag_pipeline(
    retriever=my_retriever,
    enable_guardrails=True,
    abstention_threshold=0.4
)

# Run query
result = await pipeline.run("Your question here")
print(result.final_response)
print(f"Confidence: {result.confidence_score:.0%}")
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `SelfRAGAgent` | Reflects on retrieval decisions, grades relevance |
| `CorrectiveRAGAgent` | Falls back to web search when local docs fail |
| `AdaptiveRAGAgent` | Auto-selects strategy based on query complexity |
| `GraphRAGRetriever` | Entity extraction + knowledge graph queries |
| `HybridRetriever` | Fuses dense, sparse, and graph retrieval |
| `AntiHallucinationGuardrail` | Entropy probes + citation enforcement |

See [docs/architecture/15-advanced-rag-architecture.md](docs/architecture/15-advanced-rag-architecture.md) for full documentation.

---

## Fine-Tuning Pipeline

A weekly fine-tune job runs every Monday at 03:00 (Europe/London) on Google Cloud:

```
Cloud Scheduler → Cloud Run Job → export_training_data.py → train.py → Gemini fine-tune
```

To deploy:
```bash
# Deploy the Cloud Run Job
gcloud run jobs replace fine-tuning/cloud-run-job.yaml

# Deploy the scheduler
gcloud scheduler jobs create http velox-finetune \
  --schedule="0 3 * * 1" \
  --location=europe-west2 \
  --config=fine-tuning/cron/finetune-scheduler.yaml
```

---

## Observability

### Prometheus Metrics

Scraped at `http://localhost:8080/metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `velox_calls_total` | Counter | Total calls by status (completed/failed) |
| `velox_active_calls` | Gauge | Currently active WebSocket calls |
| `velox_llm_latency_seconds` | Histogram | LLM response time by model |
| `velox_tts_latency_seconds` | Histogram | TTS generation time by provider |
| `velox_e2e_latency_seconds` | Histogram | End-to-end call turn latency |

### MLflow Experiments

Start MLflow UI with `--profile mlflow`, then visit http://localhost:5001:
- Every call to `POST /api/admin/run-eval` logs a DeepEval test run
- Fine-tune jobs log training metrics automatically

### LangFuse Tracing

Set `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` to trace every LLM call:
- STT spans: transcript, confidence score, word count
- LLM spans: prompt, response, model, latency
- TTS spans: character count, provider, latency

---

## Cloud Deployment

### Google Cloud (production)

Infrastructure is managed with Terraform in `infrastructure/`:

```bash
cd infrastructure

# One-time setup
terraform init

# Preview changes
terraform plan

# Deploy (Cloud SQL Postgres + Redis + VPC + networking)
terraform apply
```

### CI/CD with Cloud Build

Push to `main` triggers `cloudbuild.yaml`:
1. Build Docker images
2. Push to Artifact Registry
3. Deploy to Cloud Run (`velox-api`, `velox-web`, `agents`)

### Environment variables in production

Set via Cloud Run → Edit & Deploy → Variables, or Secret Manager (already referenced in `cloud-run-job.yaml`).

---

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/my-feature`
3. Make changes and test locally with `docker compose up --build`
4. Commit: `git commit -m "feat: add my feature"`
5. Push and open a Pull Request against `main`

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
Built with Gemini · Kimi · Deepgram · Twilio · LangGraph · DSPy
</div>

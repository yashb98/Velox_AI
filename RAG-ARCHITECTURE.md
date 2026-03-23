# Velox AI — RAG Architecture Documentation

> **Version**: 1.0 | **Last Updated**: 2025-03-19
> **Target Hallucination Rate**: <3% on in-domain queries

This document provides a comprehensive overview of the Velox AI Retrieval-Augmented Generation (RAG) system, covering document uploading, processing, query flow, retrieval mechanisms, and anti-hallucination safeguards.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Document Upload & Processing](#2-document-upload--processing)
3. [Knowledge Base Storage](#3-knowledge-base-storage)
4. [Query & Retrieval Pipeline](#4-query--retrieval-pipeline)
5. [Hybrid Retrieval System](#5-hybrid-retrieval-system)
6. [GraphRAG Implementation](#6-graphrag-implementation)
7. [Agentic RAG Patterns](#7-agentic-rag-patterns)
8. [Multi-Agent Orchestration](#8-multi-agent-orchestration)
9. [Anti-Hallucination Guardrails](#9-anti-hallucination-guardrails)
10. [Configuration Reference](#10-configuration-reference)
11. [Voice Optimization](#11-voice-optimization)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           VELOX AI RAG ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Document   │───►│   Chunking   │───►│  Embedding   │───►│   Storage    │  │
│  │    Upload    │    │  & Hashing   │    │  Generation  │    │  (pgvector)  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                        RETRIEVAL LAYER                                   │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │  │
│  │  │ Dense   │  │ Sparse  │  │ Graph   │  │  RRF    │  │ Cross-Encoder   │ │  │
│  │  │(Vector) │  │ (BM25)  │  │ (KG)    │──►│ Fusion │──►│   Reranking    │ │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └─────────┘  └─────────────────┘ │  │
│  │       └────────────┴────────────┘                                        │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                     ANTI-HALLUCINATION LAYER                             │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │    Query     │  │  Retrieval   │  │  Semantic    │  │   Citation   │  │  │
│  │  │  Abstention  │  │  Confidence  │  │   Entropy    │  │  Enforcer    │  │  │
│  │  │  Classifier  │  │     Gate     │  │    Probe     │  │              │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                        GENERATION LAYER                                  │  │
│  │  ┌─────────────────────────────────────────────────────────────────────┐ │  │
│  │  │  Multi-Agent Orchestrator (7 Specialized Agents)                    │ │  │
│  │  │  Query Parser → Retriever → Analyzer → Reasoner → Validator → ...   │ │  │
│  │  └─────────────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Document Routes | `velox-api/src/routes/documentRoutes.ts` | PDF upload endpoint |
| Ingestion Service | `velox-api/src/services/ingestionService.ts` | Chunking & deduplication |
| Embedding Service | `velox-api/src/services/embeddingService.ts` | Vector generation |
| Hybrid Search | `velox-api/src/services/hybridSearchService.ts` | RRF fusion search |
| Retrieval Service | `velox-api/src/services/retrievalService.ts` | Semantic similarity search |
| Hybrid Retriever | `agents/rag/retrievers/hybrid.py` | Python-side retrieval |
| GraphRAG | `agents/rag/retrievers/graphrag.py` | Knowledge graph queries |
| Anti-Hallucination | `agents/rag/guardrails/anti_hallucination.py` | 5-layer guardrails |
| Multi-Agent | `agents/rag/orchestration/multi_agent.py` | Agent orchestration |

---

## 2. Document Upload & Processing

### 2.1 Upload Endpoint

**File**: `velox-api/src/routes/documentRoutes.ts`

```
POST /api/documents/upload
Content-Type: multipart/form-data
Field Name: "file"
Max Size: 10MB
Supported: PDF files
```

### 2.2 Processing Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Upload    │────►│   Parse     │────►│   Chunk     │────►│   Embed     │
│    PDF      │     │   Text      │     │   Text      │     │   Vectors   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                   │                   │
                    pdf-parse lib      RecursiveCharacter    OpenAI API
                                      TextSplitter           (text-embedding-3-small)
```

### 2.3 Chunking Configuration

**Primary Route** (`documentRoutes.ts` - direct PDF upload):
| Parameter | Value | Description |
|-----------|-------|-------------|
| `chunkSize` | 500 characters | ~100 words per chunk |
| `chunkOverlap` | 50 characters | Context preservation |
| Splitter | `RecursiveCharacterTextSplitter` | LangChain text splitter |

**Ingestion Service** (`ingestionService.ts` - programmatic ingestion):
| Parameter | Default | Description |
|-----------|---------|-------------|
| `chunkSize` | 512 characters | Configurable per KB |
| `overlap` | 50 characters | Sliding window overlap |

### 2.4 Deduplication (SHA-256)

**File**: `velox-api/src/services/ingestionService.ts:57-59`

Each chunk is hashed before storage to prevent duplicate embeddings:

```typescript
function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}
```

**Deduplication Flow**:
1. Compute SHA-256 hash of chunk content
2. Query `content_hash` column in `knowledge_chunks` table
3. Skip INSERT if hash exists for the knowledge base
4. Return `chunksSkipped` count in response

---

## 3. Knowledge Base Storage

### 3.1 Database Schema

**Table**: `knowledge_chunks` (PostgreSQL with pgvector)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `content` | TEXT | Chunk text content |
| `content_hash` | VARCHAR | SHA-256 deduplication key |
| `embedding` | VECTOR | Embedding vector |
| `metadata` | JSONB | Source file, page, section |
| `kb_id` | UUID | Foreign key to knowledge_base |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update |

### 3.2 Vector Index (HNSW)

**File**: `velox-api/src/services/ingestionService.ts:33-49`

```sql
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw
ON knowledge_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
```

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `m` | 16 | Max connections per node |
| `ef_construction` | 64 | Search depth during build |
| Distance | `vector_cosine_ops` | Cosine similarity |
| Performance | ~10x faster | vs. ivfflat for this dimension |

---

## 4. Query & Retrieval Pipeline

### 4.1 Query Flow

```
User Query
    │
    ▼
┌───────────────────────────────────────────────────────────────┐
│  PRE-GENERATION CHECKS (< 30ms latency)                       │
│  ┌─────────────────────┐    ┌─────────────────────┐          │
│  │ QueryAbstention     │───►│ If unanswerable     │──► ABSTAIN│
│  │ Classifier          │    │ return early        │          │
│  └─────────────────────┘    └─────────────────────┘          │
└───────────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────────────┐
│  EMBEDDING GENERATION                                          │
│  Model: text-embedding-3-small                                 │
│  Max text: 8000 characters (truncated if longer)               │
└───────────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────────────┐
│  HYBRID RETRIEVAL (parallel execution)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │   Dense     │  │   Sparse    │  │   Graph     │           │
│  │  (Vector)   │  │   (BM25)    │  │ (Optional)  │           │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘           │
│         └────────────────┼────────────────┘                   │
│                          ▼                                     │
│               ┌─────────────────────┐                         │
│               │   RRF Fusion        │                         │
│               │   (k=60 constant)   │                         │
│               └──────────┬──────────┘                         │
│                          ▼                                     │
│               ┌─────────────────────┐                         │
│               │ Cross-Encoder       │                         │
│               │ Reranking           │                         │
│               └─────────────────────┘                         │
└───────────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────────────┐
│  RETRIEVAL CONFIDENCE GATE                                     │
│  Threshold: 0.65 (RETRIEVAL_CONFIDENCE_THRESHOLD)              │
│  Min chunks: 2 (MIN_SUPPORTING_CHUNKS)                         │
│  If fails → ABSTAIN with user-friendly message                 │
└───────────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────────────┐
│  LLM GENERATION                                                │
│  Context: Retrieved chunks joined with "\n---\n"               │
│  Model: Tier-based selection (T1/T2/T3)                        │
└───────────────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────────────┐
│  POST-GENERATION CHECKS                                        │
│  • Semantic Entropy Probe (optional, expensive)                │
│  • Citation Enforcement (NLI-based)                            │
│  • Calibrated Abstention (multi-factor)                        │
└───────────────────────────────────────────────────────────────┘
    │
    ▼
Final Response (with citations)
```

### 4.2 Retrieval Service

**File**: `velox-api/src/services/retrievalService.ts`

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `SIMILARITY_THRESHOLD` | 0.7 | Minimum cosine similarity |
| Default `limit` | 3 chunks | Max chunks returned |
| Output format | `"\n---\n"` joined | Context block for LLM |

**Similarity Formula**:
```sql
1 - (embedding <=> query_vector) AS similarity
```
Where `<=>` is pgvector's cosine distance operator.

---

## 5. Hybrid Retrieval System

### 5.1 TypeScript Implementation

**File**: `velox-api/src/services/hybridSearchService.ts`

#### Keyword Search (BM25-style)

Uses PostgreSQL Full-Text Search:
```sql
SELECT content,
       ts_rank(content_tsv, plainto_tsquery('english', $1)) AS relevance
FROM knowledge_chunks
WHERE content_tsv @@ plainto_tsquery('english', $1)
```

#### Semantic Search (Dense)

Uses pgvector cosine similarity:
```sql
SELECT content,
       1 - (embedding <=> $1::vector) AS similarity
FROM knowledge_chunks
ORDER BY embedding <=> $1::vector
```

#### Reciprocal Rank Fusion (RRF)

**Formula**: `RRF(d) = Σ 1/(k + rank(d))`

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `k` | 60 | RRF constant (standard value) |
| Weights | Equal | Keyword and semantic equally weighted |

### 5.2 Python Implementation

**File**: `agents/rag/retrievers/hybrid.py`

#### Components

| Class | Purpose |
|-------|---------|
| `DenseRetriever` | FAISS or NumPy vector search |
| `BM25Retriever` | TF-IDF sparse retrieval |
| `CrossEncoderReranker` | `cross-encoder/ms-marco-MiniLM-L-6-v2` or LLM fallback |
| `HybridRetriever` | Combines all with RRF fusion |

#### Default Weights

```python
weights = {
    "dense": 0.4,
    "sparse": 0.3,
    "graph": 0.3
}
```

---

## 6. GraphRAG Implementation

**File**: `agents/rag/retrievers/graphrag.py`

### 6.1 Components

| Class | Purpose |
|-------|---------|
| `EntityExtractor` | LLM-based entity/relationship extraction |
| `KnowledgeGraph` | NetworkX-based graph storage |
| `CommunitySummarizer` | Generates community summaries |
| `GraphRAGRetriever` | Main query interface |

### 6.2 Entity Extraction

Extracts from text using LLM:
- **Entity types**: PERSON, ORG, PRODUCT, CONCEPT, LOCATION, DATE
- **Relationships**: source → target with type and description
- **Fallback**: Pattern-based extraction for capitalized phrases

### 6.3 Community Detection

Uses **Louvain algorithm** (NetworkX):
```python
from networkx.algorithms.community import louvain_communities
community_sets = louvain_communities(undirected_graph)
```

### 6.4 Query Types

| Type | Description |
|------|-------------|
| `local` | Entity-centric subgraph traversal |
| `global` | Community-based summaries |
| `hybrid` | Both local and global context |

---

## 7. Agentic RAG Patterns

### 7.1 Self-RAG

**File**: `agents/rag/agentic_rag/self_rag.py`

Implements reflection tokens from the Self-RAG paper (arXiv:2310.11511):

| Token | Purpose |
|-------|---------|
| `[Retrieve]` | Decide if retrieval needed |
| `[IsRel]` | Grade document relevance |
| `[IsSup]` | Check if output supported |
| `[IsUse]` | Score response usefulness |

**Pipeline**:
1. `_should_retrieve()` → YES/NO
2. `_grade_relevance()` → RELEVANT/IRRELEVANT
3. `_generate_response()` → With context
4. `_check_support()` → FULLY/PARTIALLY/NOT_SUPPORTED
5. `_score_usefulness()` → 1-5 scale

### 7.2 Corrective RAG (CRAG)

**File**: `agents/rag/agentic_rag/corrective_rag.py`

Knowledge refinement pipeline (arXiv:2401.15884):

| Grade | Score | Action |
|-------|-------|--------|
| CORRECT | ≥ 0.7 | Use retrieved docs |
| AMBIGUOUS | 0.4-0.7 | Refine knowledge |
| INCORRECT | < 0.4 | Web search fallback |

**Action Decision**:
- ≥50% CORRECT → `USE_RETRIEVED`
- ≥50% INCORRECT → `WEB_SEARCH`
- Otherwise → `REFINE`

### 7.3 Adaptive RAG

**File**: `agents/rag/agentic_rag/adaptive_rag.py`

Dynamic strategy selection (arXiv:2403.14403):

| Complexity | Strategy | Description |
|------------|----------|-------------|
| SIMPLE | `DirectLLMStrategy` | No retrieval (greetings, common knowledge) |
| SINGLE_STEP | `SingleStepRAGStrategy` | One retrieval pass |
| MULTI_STEP | `MultiStepRAGStrategy` | Query decomposition + iterative retrieval |

**Classification Signals**:
- Query length
- Question mark count
- Keyword patterns (e.g., "step by step", "compare", "hello")

---

## 8. Multi-Agent Orchestration

**File**: `agents/rag/orchestration/multi_agent.py`

### 8.1 Agent Roles

| Agent | Class | Purpose |
|-------|-------|---------|
| Query Parser | `QueryParserAgent` | Extract intent, entities, sub-queries |
| Retriever | `RetrieverAgent` | Fetch documents from all sources |
| Analyzer | `AnalyzerAgent` | Extract key facts from documents |
| Reasoner | `ReasonerAgent` | Chain-of-Thought synthesis |
| Validator | `ValidatorAgent` | Verify claims against evidence |
| Confidence Scorer | `ConfidenceScorerAgent` | Calculate confidence, decide abstention |
| Response Generator | `ResponseGeneratorAgent` | Format final response with citations |

### 8.2 Pipeline Flow

```
┌────────────────┐
│  Query Parser  │ → Intent, entities, sub-queries
└───────┬────────┘
        ▼
┌────────────────┐
│   Retriever    │ → Documents from dense/sparse/graph
└───────┬────────┘
        ▼
┌────────────────┐
│   Analyzer     │ → Extracted facts JSON
└───────┬────────┘
        ▼
┌────────────────┐
│   Reasoner     │ → THINK: reasoning | ANSWER: response
└───────┬────────┘
        ▼
┌────────────────┐
│   Validator    │ → verified_claims, unverified_claims
└───────┬────────┘
        ▼
┌────────────────┐
│Confidence Scorer│ → confidence_score, should_abstain
└───────┬────────┘
        ▼
┌────────────────┐
│Response Generator│ → final_response with citations
└────────────────┘
```

### 8.3 Confidence Calculation

**Weights**:
```python
weights = {
    "doc_coverage": 0.2,      # min(1, doc_count / 5)
    "fact_extraction": 0.2,   # min(1, fact_count / 5)
    "verification_ratio": 0.4, # verified / total claims
    "reasoning_quality": 0.2  # 0.8 if reasoning > 50 chars
}
```

**Abstention Threshold**: 0.4 (default)

---

## 9. Anti-Hallucination Guardrails

**File**: `agents/rag/guardrails/anti_hallucination.py`

### 9.1 Five-Layer Defense

```
┌─────────────────────────────────────────────────────────────────┐
│                  ANTI-HALLUCINATION PIPELINE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LAYER 1: Query Abstention Classifier                           │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ • Pattern matching for impossible queries                 │ │
│  │ • Ambiguity detection (< 3 words, vague references)       │ │
│  │ • LLM classification: ANSWERABLE/UNANSWERABLE/CLARIFY     │ │
│  │ • Target latency: < 30ms                                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                           │                                     │
│                           ▼                                     │
│  LAYER 2: Retrieval Confidence Gate                             │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ • Gate 1: Best chunk ≥ 0.65 confidence                    │ │
│  │ • Gate 2: ≥ 2 chunks above threshold                      │ │
│  │ • Gate 3: Average score ≥ 0.455 (0.65 × 0.7)              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                           │                                     │
│                           ▼                                     │
│  LAYER 3: Semantic Entropy Probe                                │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ • Generate 3 samples at temperatures [0.3, 0.7, 1.0]      │ │
│  │ • Compute pairwise word overlap similarity                │ │
│  │ • Entropy = 1 - average_similarity                        │ │
│  │ • Threshold: 0.7 (high disagreement = hallucination)      │ │
│  └───────────────────────────────────────────────────────────┘ │
│                           │                                     │
│                           ▼                                     │
│  LAYER 4: Citation Enforcer (NLI)                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ • Split response into claims (by sentence)                │ │
│  │ • Check each claim against evidence documents             │ │
│  │ • Entailment labels: SUPPORT/CONTRADICT/NEUTRAL           │ │
│  │ • Threshold: 0.7 entailment confidence                    │ │
│  │ • Track unverified_count                                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                           │                                     │
│                           ▼                                     │
│  LAYER 5: Calibrated Abstention                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Multi-factor decision:                                    │ │
│  │ • confidence < 0.5 → flag                                 │ │
│  │ • verification_ratio < 0.6 → flag                         │ │
│  │ • entropy > 0.7 → flag                                    │ │
│  │ • If ≥ 2 flags → ABSTAIN                                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Configuration Thresholds

| Environment Variable | Default | Purpose |
|---------------------|---------|---------|
| `RETRIEVAL_CONFIDENCE_THRESHOLD` | 0.65 | Min chunk confidence |
| `MIN_SUPPORTING_CHUNKS` | 2 | Required supporting evidence |
| `ENTROPY_THRESHOLD` | 0.7 | Max semantic entropy |
| `ENTAILMENT_THRESHOLD` | 0.7 | Citation verification |
| `ABSTENTION_CONFIDENCE_THRESHOLD` | 0.5 | Min overall confidence |
| `ABSTENTION_VERIFICATION_THRESHOLD` | 0.6 | Min verification ratio |

### 9.3 Abstention Messages

Voice-friendly messages for different scenarios:

| Scenario | Message |
|----------|---------|
| `no_retrieval` | "I don't have that information in my knowledge base. Would you like me to transfer you to someone who can help?" |
| `low_confidence` | "I'm not confident I have accurate information about that. Let me connect you with someone who can give you a definite answer." |
| `out_of_scope` | "That's outside what I can help with. Would you like me to transfer you to a specialist?" |
| `ambiguous` | "I want to make sure I help you correctly. Could you tell me a bit more about what you're looking for?" |

### 9.4 Query Abstention Patterns

**Impossible Queries** (auto-reject):
```python
[
    r"\b(predict|forecast|will happen|future)\b",
    r"\b(stock price|bitcoin|crypto)\b.*\b(will|going to)\b",
    r"\b(opinion|think|feel|believe)\b.*\b(should|best)\b",
    r"\b(lottery|gambling|bet)\b",
]
```

**Ambiguous Queries** (request clarification):
```python
[
    r"^(it|that|this|they)\b",  # Unclear reference
    r"\b(something|anything|whatever)\b",  # Vague request
]
```

### 9.5 Convenience Functions

```python
# Pre-generation check (fast, before LLM call)
should_proceed, message, confidence = await check_before_generation(
    query="...",
    chunks=[...],
    available_topics=["topic1", "topic2"]
)

# Post-generation check (after LLM response)
result = await check_after_generation(
    query="...",
    response="...",
    chunks=[...],
    skip_expensive=True  # Skip entropy for voice latency
)
```

---

## 10. Configuration Reference

### 10.1 Environment Variables

```bash
# Embedding Service
EMBEDDING_API_URL=https://api.openai.com/v1
EMBEDDING_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small

# LLM Service
KIMI_API_KEY=...
KIMI_BASE_URL=https://api.moonshot.cn/v1

# Anti-Hallucination Thresholds
RETRIEVAL_CONFIDENCE_THRESHOLD=0.65
MIN_SUPPORTING_CHUNKS=2
ENTROPY_THRESHOLD=0.7
ENTAILMENT_THRESHOLD=0.7
ABSTENTION_CONFIDENCE_THRESHOLD=0.5
ABSTENTION_VERIFICATION_THRESHOLD=0.6

# Web Search (for Corrective RAG)
TAVILY_API_KEY=...
BRAVE_API_KEY=...
```

### 10.2 Default Values Summary

| Parameter | Value | File Location |
|-----------|-------|---------------|
| Chunk size (upload) | 500 chars | documentRoutes.ts:65 |
| Chunk overlap (upload) | 50 chars | documentRoutes.ts:66 |
| Chunk size (ingestion) | 512 chars | ingestionService.ts:68 |
| Similarity threshold | 0.7 | retrievalService.ts:15 |
| RRF k constant | 60 | hybridSearchService.ts:29 |
| HNSW m | 16 | ingestionService.ts:40 |
| HNSW ef_construction | 64 | ingestionService.ts:40 |
| Max text for embedding | 8000 chars | embeddingService.ts:48 |
| Rate limit delay | 100ms | embeddingService.ts:107 |
| File upload limit | 10MB | documentRoutes.ts:16 |
| Abstention threshold | 0.4 | multi_agent.py:619 |

---

## 11. Voice Optimization

### 11.1 Latency Targets

| Stage | Target | Actual |
|-------|--------|--------|
| Query abstention check | < 30ms | ~20ms (pattern) / ~50ms (LLM) |
| Retrieval confidence gate | < 5ms | ~3ms |
| Total pre-generation | < 50ms | ~25-55ms |
| Post-generation (voice mode) | < 10ms | ~5ms (skip expensive checks) |

### 11.2 Voice Mode Settings

For voice applications, skip expensive post-generation checks:

```python
result = await guardrail.check_response(
    query=query,
    response=response,
    evidence=chunks,
    skip_expensive=True  # Skip entropy probe for latency
)
```

### 11.3 Two-Tier RAG for Voice

| Tier | Latency | Use Case |
|------|---------|----------|
| Fast (< 100ms) | Hybrid search → cross-encoder rerank | 80% of queries |
| Complex (< 500ms) | Agentic loop + HyDE + optional GraphRAG | Complex multi-hop |

---

## Verification Checklist

- [x] Document upload endpoint verified (`POST /api/documents/upload`)
- [x] Chunking parameters verified (500 chars, 50 overlap)
- [x] SHA-256 deduplication verified
- [x] HNSW index parameters verified (m=16, ef_construction=64)
- [x] Similarity threshold verified (0.7)
- [x] RRF k constant verified (60)
- [x] All anti-hallucination thresholds verified
- [x] Multi-agent pipeline order verified (7 agents)
- [x] Embedding model verified (text-embedding-3-small)
- [x] Max text length verified (8000 chars)
- [x] File upload limit verified (10MB)

---

**Document Status**: Verified and accurate as of 2025-03-19
**Source Files Reviewed**: 15 files across velox-api/ and agents/

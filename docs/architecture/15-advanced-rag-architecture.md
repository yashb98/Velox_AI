# 15. Advanced RAG Architecture — 5-Layer Anti-Hallucination System

> **Version**: 2.0 | **Updated**: March 2026
> **Implementation**: `agents/rag/`

---

## Overview

5-layer system to reduce hallucinations by 90%+:

| Layer | Purpose | Implementation |
|-------|---------|----------------|
| 1 | Training-Level | DSPy optimization | `dspy_modules/` |
| 2 | Retrieval | GraphRAG + Hybrid | `retrievers/` |
| 3 | Inference | Agentic RAG patterns | `agentic_rag/` |
| 4 | Orchestration | Multi-agent validation | `orchestration/` |
| 5 | Guardrails | Citation + abstention | `guardrails/` |

---

## Layer 1: DSPy Optimization

**File**: `agents/rag/dspy_modules/rag_module.py`

```python
from agents.rag import RAGModule, RAGOptimizer

# Basic usage
rag = RAGModule(retriever=my_retriever)
response = rag.forward("Question here")

# Optimization with GEPA
optimizer = RAGOptimizer(strategy="miprov2")
optimized = optimizer.optimize(rag, trainset=data, metric=faithfulness_metric)
```

**Modules**: `RAGModule`, `FactualRAGModule`, `MultiHopRAGModule`

---

## Layer 2: GraphRAG + Hybrid Retrieval

**Files**: `agents/rag/retrievers/graphrag.py`, `hybrid.py`

```python
from agents.rag import GraphRAGRetriever, HybridRetriever

# GraphRAG
graph_rag = GraphRAGRetriever()
await graph_rag.index_documents(documents)
result = await graph_rag.query("question", search_type="hybrid")

# Hybrid (Dense + Sparse + Graph)
hybrid = HybridRetriever(
    dense_retriever=DenseRetriever(),
    sparse_retriever=BM25Retriever(),
    graph_retriever=graph_rag
)
result = await hybrid.retrieve("question")
```

**Fusion**: Reciprocal Rank Fusion (RRF) with cross-encoder reranking.

---

## Layer 3: Agentic RAG Patterns

**Files**: `agents/rag/agentic_rag/`

| Pattern | Purpose | Class |
|---------|---------|-------|
| Self-RAG | Reflect on retrieval decisions | `SelfRAGAgent` |
| Corrective RAG | Web fallback when docs fail | `CorrectiveRAGAgent` |
| Adaptive RAG | Dynamic strategy selection | `AdaptiveRAGAgent` |

```python
from agents.rag import SelfRAGAgent, AdaptiveRAGAgent

# Self-RAG with reflection
self_rag = SelfRAGAgent(retriever=my_retriever)
result = await self_rag.generate("question")
# Returns: support_level, usefulness_score, confidence

# Adaptive RAG (auto-selects strategy)
adaptive = AdaptiveRAGAgent(retriever=my_retriever)
result = await adaptive.generate("question")
# Auto-routes: SIMPLE → direct LLM, SINGLE_STEP → basic RAG, MULTI_STEP → iterative
```

---

## Layer 4: Multi-Agent Orchestration

**File**: `agents/rag/orchestration/multi_agent.py`

Pipeline: `QueryParser → Retriever → Analyzer → Reasoner → Validator → ConfidenceScorer`

```python
from agents.rag import MultiAgentOrchestrator

pipeline = MultiAgentOrchestrator(
    retriever=my_retriever,
    abstention_threshold=0.4
)
result = await pipeline.run("complex question")

# Result includes:
# - final_response
# - confidence_score (0-1)
# - should_abstain (bool)
# - citations
```

---

## Layer 5: Anti-Hallucination Guardrails

**File**: `agents/rag/guardrails/anti_hallucination.py`

| Component | Purpose |
|-----------|---------|
| `SemanticEntropyProbe` | Detect uncertainty via response variability |
| `CitationEnforcer` | NLI-based claim verification |
| `FactVerifier` | Check claims against evidence |
| `CalibratedAbstention` | Refuse when confidence too low |

```python
from agents.rag import AntiHallucinationGuardrail

guardrail = AntiHallucinationGuardrail()
result = await guardrail.check(
    query="question",
    response="generated answer",
    evidence=[{"text": "doc1"}, {"text": "doc2"}]
)
# Returns: passed, confidence, issues, should_abstain
```

---

## Quick Start

```python
from agents.rag import create_rag_pipeline

# Full pipeline with all layers
pipeline = create_rag_pipeline(
    retriever=my_retriever,
    enable_guardrails=True,
    abstention_threshold=0.4
)

result = await pipeline.run("Your question here")
print(result.final_response)
print(f"Confidence: {result.confidence_score:.0%}")
```

---

## Configuration

```yaml
# Retrieval weights
hybrid_weights:
  dense: 0.4
  sparse: 0.3
  graph: 0.3

# Thresholds
abstention_threshold: 0.4
entailment_threshold: 0.7
entropy_threshold: 0.7

# Models
embedding_model: "BAAI/bge-large-en-v1.5"
reranker_model: "cross-encoder/ms-marco-MiniLM-L-6-v2"
```

---

## Evaluation Metrics

| Metric | Target | Tool |
|--------|--------|------|
| Faithfulness | > 95% | RAGAS |
| Answer Relevancy | > 0.85 | RAGAS |
| Hallucination Rate | < 5% | Custom |
| Abstention Accuracy | > 90% | Custom |

---

## References

- [DSPy 2.6](https://dspy.ai/)
- [Microsoft GraphRAG](https://github.com/microsoft/graphrag)
- [LangGraph](https://langchain-ai.github.io/langgraph/)
- [Self-RAG](https://arxiv.org/abs/2310.11511)
- [Corrective RAG](https://arxiv.org/abs/2401.15884)

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

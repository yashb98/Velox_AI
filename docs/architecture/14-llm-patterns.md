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

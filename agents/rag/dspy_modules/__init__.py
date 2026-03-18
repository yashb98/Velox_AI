"""
DSPy Modules for Velox AI RAG System.

Provides DSPy 2.6 compatible modules for:
- Basic RAG with Chain-of-Thought
- Factual RAG with verification
- Multi-hop RAG for complex queries
- GEPA/MIPROv2 optimization
"""

from .rag_module import (
    RAGModule,
    FactualRAGModule,
    MultiHopRAGModule,
    RAGOptimizer,
    RAGResponse,
    RetrievedDocument,
    create_rag_module,
    faithfulness_metric,
    relevancy_metric,
)

__all__ = [
    "RAGModule",
    "FactualRAGModule",
    "MultiHopRAGModule",
    "RAGOptimizer",
    "RAGResponse",
    "RetrievedDocument",
    "create_rag_module",
    "faithfulness_metric",
    "relevancy_metric",
]

"""
Agentic RAG Patterns for Velox AI.

Implements state-of-the-art agentic RAG patterns:
- Self-RAG: Self-reflective retrieval with critique
- Corrective RAG: Knowledge refinement with web fallback
- Adaptive RAG: Dynamic strategy selection
"""

from .self_rag import (
    SelfRAGAgent,
    IterativeSelfRAG,
    SelfRAGResponse,
    SelfRAGDocument,
    RetrievalDecision,
    RelevanceGrade,
    SupportLevel,
    UsefulnessScore,
)

from .corrective_rag import (
    CorrectiveRAGAgent,
    CRAGResponse,
    GradedDocument,
    DocumentGrade,
    KnowledgeAction,
    WebSearchClient,
    KnowledgeRefiner,
)

from .adaptive_rag import (
    AdaptiveRAGAgent,
    AdaptiveRAGResponse,
    QueryComplexity,
    QueryComplexityClassifier,
    RAGStrategy,
    DirectLLMStrategy,
    SingleStepRAGStrategy,
    MultiStepRAGStrategy,
)

__all__ = [
    # Self-RAG
    "SelfRAGAgent",
    "IterativeSelfRAG",
    "SelfRAGResponse",
    "SelfRAGDocument",
    "RetrievalDecision",
    "RelevanceGrade",
    "SupportLevel",
    "UsefulnessScore",
    # Corrective RAG
    "CorrectiveRAGAgent",
    "CRAGResponse",
    "GradedDocument",
    "DocumentGrade",
    "KnowledgeAction",
    "WebSearchClient",
    "KnowledgeRefiner",
    # Adaptive RAG
    "AdaptiveRAGAgent",
    "AdaptiveRAGResponse",
    "QueryComplexity",
    "QueryComplexityClassifier",
    "RAGStrategy",
    "DirectLLMStrategy",
    "SingleStepRAGStrategy",
    "MultiStepRAGStrategy",
]

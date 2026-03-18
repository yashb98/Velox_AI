"""
Velox AI Advanced RAG System

5-Layer Anti-Hallucination Architecture:
1. Training-Level: DSPy optimization
2. Retrieval: GraphRAG + Hybrid retrieval
3. Inference: Agentic RAG patterns
4. Orchestration: Multi-agent validation
5. Guardrails: Citation enforcement + abstention

Usage:
    from agents.rag import create_rag_pipeline

    pipeline = create_rag_pipeline()
    result = await pipeline.run("Your question here")
"""

from .dspy_modules import (
    RAGModule,
    FactualRAGModule,
    MultiHopRAGModule,
    RAGOptimizer,
    create_rag_module,
)

from .retrievers import (
    GraphRAGRetriever,
    HybridRetriever,
    DenseRetriever,
    BM25Retriever,
)

from .agentic_rag import (
    SelfRAGAgent,
    CorrectiveRAGAgent,
    AdaptiveRAGAgent,
)

from .orchestration import (
    MultiAgentOrchestrator,
    RAGOrchestratorState,
)

from .guardrails import (
    AntiHallucinationGuardrail,
    SemanticEntropyProbe,
    CitationEnforcer,
)


def create_rag_pipeline(
    retriever=None,
    llm_api_key=None,
    enable_guardrails: bool = True,
    abstention_threshold: float = 0.4
):
    """
    Create a complete RAG pipeline with all components.

    Args:
        retriever: Document retriever instance
        llm_api_key: API key for LLM calls
        enable_guardrails: Enable anti-hallucination checks
        abstention_threshold: Confidence threshold for abstention

    Returns:
        Configured MultiAgentOrchestrator
    """
    return MultiAgentOrchestrator(
        retriever=retriever,
        llm_api_key=llm_api_key,
        abstention_threshold=abstention_threshold
    )


__all__ = [
    # Factory
    "create_rag_pipeline",
    # DSPy
    "RAGModule",
    "FactualRAGModule",
    "MultiHopRAGModule",
    "RAGOptimizer",
    "create_rag_module",
    # Retrievers
    "GraphRAGRetriever",
    "HybridRetriever",
    "DenseRetriever",
    "BM25Retriever",
    # Agentic RAG
    "SelfRAGAgent",
    "CorrectiveRAGAgent",
    "AdaptiveRAGAgent",
    # Orchestration
    "MultiAgentOrchestrator",
    "RAGOrchestratorState",
    # Guardrails
    "AntiHallucinationGuardrail",
    "SemanticEntropyProbe",
    "CitationEnforcer",
]

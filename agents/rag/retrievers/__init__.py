"""
Retrievers for Velox AI RAG System.

Provides:
- GraphRAG: Knowledge graph based retrieval
- HybridRetriever: Dense + Sparse + Graph fusion
- DenseRetriever: Vector similarity search
- BM25Retriever: Sparse keyword search
- CrossEncoderReranker: Reranking with cross-encoders
"""

from .graphrag import (
    GraphRAGRetriever,
    KnowledgeGraph,
    EntityExtractor,
    CommunitySummarizer,
    Entity,
    Relationship,
    Community,
    GraphRAGResult,
)

from .hybrid import (
    HybridRetriever,
    DenseRetriever,
    BM25Retriever,
    CrossEncoderReranker,
    EmbeddingService,
    Document,
    RetrievalResult,
    HybridRetrievalResult,
    reciprocal_rank_fusion,
)

__all__ = [
    # GraphRAG
    "GraphRAGRetriever",
    "KnowledgeGraph",
    "EntityExtractor",
    "CommunitySummarizer",
    "Entity",
    "Relationship",
    "Community",
    "GraphRAGResult",
    # Hybrid
    "HybridRetriever",
    "DenseRetriever",
    "BM25Retriever",
    "CrossEncoderReranker",
    "EmbeddingService",
    "Document",
    "RetrievalResult",
    "HybridRetrievalResult",
    "reciprocal_rank_fusion",
]

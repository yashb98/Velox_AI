# voice/src/pipeline/processors/rag_processor.py
"""
RAG (Retrieval Augmented Generation) processor for Pipecat pipeline.

Implements 2-tier RAG optimized for voice latency:
  - Fast path (<100ms): Hybrid vector + BM25 search
  - Complex path (<500ms): Agentic loop for multi-hop questions

This is a simplified version of the 5-layer RAG in agents/rag/.
DSPy optimization is moved offline (not in hot path).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional, List

from pipecat.frames.frames import (
    Frame,
    TranscriptionFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

logger = logging.getLogger(__name__)


@dataclass
class RAGResult:
    """Result from RAG retrieval."""

    context: str
    sources: List[str]
    latency_ms: float
    path: str  # "fast" or "complex"


class RAGProcessor(FrameProcessor):
    """
    Pipecat processor that adds RAG context to transcriptions.

    Implements 2-tier retrieval:
      1. Fast path: Simple vector + BM25 hybrid search
      2. Complex path: Multi-step retrieval for complex queries

    The processor analyzes the query and selects the appropriate path
    based on complexity heuristics.
    """

    # Keywords that suggest complex retrieval needed
    COMPLEX_KEYWORDS = [
        "compare",
        "difference between",
        "how does",
        "explain",
        "why",
        "relationship",
        "multiple",
        "all",
        "every",
    ]

    def __init__(
        self,
        kb_id: Optional[str] = None,
        fast_timeout_ms: int = 100,
        complex_timeout_ms: int = 500,
        max_results: int = 5,
        **kwargs,
    ):
        """
        Initialize RAG processor.

        Args:
            kb_id: Knowledge base ID for retrieval
            fast_timeout_ms: Timeout for fast path
            complex_timeout_ms: Timeout for complex path
            max_results: Maximum number of results to return
        """
        super().__init__(**kwargs)
        self.kb_id = kb_id
        self.fast_timeout_ms = fast_timeout_ms
        self.complex_timeout_ms = complex_timeout_ms
        self.max_results = max_results

        # Placeholder for retriever initialization
        # In production, this would connect to Qdrant/FAISS
        self._retriever = None

    def _should_use_complex_path(self, query: str) -> bool:
        """
        Determine if query requires complex retrieval.

        Args:
            query: User query text

        Returns:
            True if complex path should be used
        """
        query_lower = query.lower()

        # Check for complex keywords
        for keyword in self.COMPLEX_KEYWORDS:
            if keyword in query_lower:
                return True

        # Check word count (long queries often need complex retrieval)
        if len(query.split()) > 20:
            return True

        # Check for multiple question marks
        if query.count("?") > 1:
            return True

        return False

    async def _fast_retrieve(self, query: str) -> RAGResult:
        """
        Fast path retrieval using hybrid search.

        Target latency: <100ms

        Args:
            query: User query

        Returns:
            RAGResult with context
        """
        start = time.time()

        # Placeholder: In production, this would:
        # 1. Generate query embedding
        # 2. Search Qdrant with hybrid (vector + BM25)
        # 3. Return top-k results

        # Mock response for now
        context = ""
        sources = []

        if self.kb_id:
            # Would call: await self._retriever.search(query, top_k=self.max_results)
            pass

        latency_ms = (time.time() - start) * 1000

        return RAGResult(
            context=context,
            sources=sources,
            latency_ms=latency_ms,
            path="fast",
        )

    async def _complex_retrieve(self, query: str) -> RAGResult:
        """
        Complex path retrieval using agentic loop.

        Target latency: <500ms

        Args:
            query: User query

        Returns:
            RAGResult with context
        """
        start = time.time()

        # Placeholder: In production, this would:
        # 1. Decompose query into sub-queries
        # 2. Run multiple retrievals
        # 3. Synthesize results
        # 4. Optional: Use HyDE for better retrieval

        # For now, fall back to fast path
        result = await self._fast_retrieve(query)
        result.path = "complex"

        latency_ms = (time.time() - start) * 1000
        result.latency_ms = latency_ms

        return result

    async def retrieve(self, query: str) -> RAGResult:
        """
        Main retrieval entry point.

        Selects fast or complex path based on query analysis.

        Args:
            query: User query

        Returns:
            RAGResult with context
        """
        if not self.kb_id:
            # No knowledge base configured
            return RAGResult(
                context="",
                sources=[],
                latency_ms=0,
                path="none",
            )

        use_complex = self._should_use_complex_path(query)

        if use_complex:
            logger.debug("Using complex RAG path for: '%s'", query[:50])
            return await self._complex_retrieve(query)
        else:
            logger.debug("Using fast RAG path for: '%s'", query[:50])
            return await self._fast_retrieve(query)

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """
        Process frame and add RAG context.

        For TranscriptionFrames, retrieve context and add to metadata.
        """
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            # Retrieve context
            result = await self.retrieve(frame.text)

            # Add to frame metadata
            frame.metadata = frame.metadata or {}
            frame.metadata["rag"] = {
                "context": result.context,
                "sources": result.sources,
                "latency_ms": result.latency_ms,
                "path": result.path,
            }

            if result.context:
                logger.debug(
                    "RAG retrieved %d chars via %s path in %.1fms",
                    len(result.context),
                    result.path,
                    result.latency_ms,
                )

        await self.push_frame(frame, direction)


class HybridRetriever:
    """
    Hybrid retriever combining vector and keyword search.

    This is a placeholder for the actual implementation that would:
    - Use Qdrant for vector search
    - Use BM25 for keyword search
    - Combine results with RRF (Reciprocal Rank Fusion)
    """

    def __init__(self, collection_name: str, embedding_model: str = "text-embedding-3-small"):
        self.collection_name = collection_name
        self.embedding_model = embedding_model

    async def search(self, query: str, top_k: int = 5) -> List[dict]:
        """
        Search for relevant documents.

        Args:
            query: Search query
            top_k: Number of results

        Returns:
            List of document dicts with content and metadata
        """
        # Placeholder - would implement actual search
        return []

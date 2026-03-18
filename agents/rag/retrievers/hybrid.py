"""
retrievers/hybrid.py — Hybrid Retrieval for Velox AI

Implements MEGA-RAG style multi-source retrieval:
- Dense retrieval (FAISS + embeddings)
- Sparse retrieval (BM25)
- Graph retrieval (GraphRAG)
- Reciprocal Rank Fusion (RRF)
- Cross-encoder reranking

Reference: docs/architecture/15-advanced-rag-architecture.md §3.2
"""

from __future__ import annotations

import os
import logging
import math
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Callable
from collections import defaultdict

import httpx

logger = logging.getLogger(__name__)

# Try to import optional dependencies
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False


# ─── Data Classes ──────────────────────────────────────────────────────────────

@dataclass
class Document:
    """Represents a document in the retrieval system."""
    id: str
    text: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    embedding: Optional[List[float]] = None


@dataclass
class RetrievalResult:
    """Result from retrieval."""
    document: Document
    score: float
    source: str  # dense, sparse, graph, reranked


@dataclass
class HybridRetrievalResult:
    """Combined result from hybrid retrieval."""
    results: List[RetrievalResult]
    sources_used: List[str]
    fusion_method: str
    reranked: bool = False


# ─── Embedding Service ─────────────────────────────────────────────────────────

class EmbeddingService:
    """
    Generate embeddings using various providers.
    Supports: OpenAI, Kimi/Moonshot, local models.
    """

    def __init__(
        self,
        provider: str = "kimi",
        model: str = "text-embedding-3-small",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None
    ):
        self.provider = provider
        self.model = model
        self.api_key = api_key or self._get_api_key()
        self.base_url = base_url or self._get_base_url()

    def _get_api_key(self) -> str:
        if self.provider == "kimi":
            return os.getenv("KIMI_API_KEY", "")
        return os.getenv("OPENAI_API_KEY", "")

    def _get_base_url(self) -> str:
        if self.provider == "kimi":
            return os.getenv("KIMI_BASE_URL", "https://api.moonshot.cn/v1")
        return "https://api.openai.com/v1"

    async def embed(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for texts.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        if not self.api_key:
            logger.warning("No API key for embeddings. Using mock embeddings.")
            return self._mock_embed(texts)

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{self.base_url}/embeddings",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "input": texts,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return [item["embedding"] for item in data["data"]]

        except Exception as e:
            logger.error(f"Embedding failed: {e}")
            return self._mock_embed(texts)

    def _mock_embed(self, texts: List[str]) -> List[List[float]]:
        """Generate mock embeddings for testing."""
        dim = 1536  # OpenAI dimension
        embeddings = []
        for text in texts:
            # Simple hash-based mock embedding
            hash_val = hash(text)
            embedding = [(hash_val * (i + 1)) % 1000 / 1000.0 for i in range(dim)]
            embeddings.append(embedding)
        return embeddings


# ─── Dense Retriever ───────────────────────────────────────────────────────────

class DenseRetriever:
    """
    Dense retrieval using vector similarity.
    Uses FAISS if available, falls back to numpy.
    """

    def __init__(
        self,
        embedding_service: Optional[EmbeddingService] = None,
        similarity_fn: str = "cosine"  # cosine, dot, euclidean
    ):
        self.embedding_service = embedding_service or EmbeddingService()
        self.similarity_fn = similarity_fn
        self.documents: List[Document] = []
        self.embeddings: Optional[Any] = None

        # Try to use FAISS
        try:
            import faiss
            self.faiss = faiss
            self.use_faiss = True
            self.index = None
        except ImportError:
            self.use_faiss = False
            self.faiss = None
            self.index = None

    async def index(self, documents: List[Document]):
        """Index documents with embeddings."""
        self.documents = documents

        # Get texts to embed
        texts = [doc.text for doc in documents]

        # Generate embeddings
        embeddings = await self.embedding_service.embed(texts)

        # Store embeddings in documents
        for doc, emb in zip(documents, embeddings):
            doc.embedding = emb

        # Build index
        if NUMPY_AVAILABLE:
            self.embeddings = np.array(embeddings, dtype=np.float32)

            if self.use_faiss and self.faiss:
                dim = self.embeddings.shape[1]
                self.index = self.faiss.IndexFlatIP(dim)  # Inner product
                # Normalize for cosine similarity
                faiss_embeddings = self.embeddings.copy()
                faiss.normalize_L2(faiss_embeddings)
                self.index.add(faiss_embeddings)

        logger.info(f"Indexed {len(documents)} documents for dense retrieval")

    async def retrieve(
        self,
        query: str,
        top_k: int = 10
    ) -> List[RetrievalResult]:
        """Retrieve documents by vector similarity."""
        if not self.documents:
            return []

        # Get query embedding
        query_embeddings = await self.embedding_service.embed([query])
        query_emb = query_embeddings[0]

        if self.use_faiss and self.index is not None and NUMPY_AVAILABLE:
            # FAISS retrieval
            query_vec = np.array([query_emb], dtype=np.float32)
            self.faiss.normalize_L2(query_vec)
            scores, indices = self.index.search(query_vec, min(top_k, len(self.documents)))

            results = []
            for score, idx in zip(scores[0], indices[0]):
                if idx >= 0:
                    results.append(RetrievalResult(
                        document=self.documents[idx],
                        score=float(score),
                        source="dense"
                    ))
            return results

        elif NUMPY_AVAILABLE and self.embeddings is not None:
            # NumPy fallback
            query_vec = np.array(query_emb)

            if self.similarity_fn == "cosine":
                # Cosine similarity
                norms = np.linalg.norm(self.embeddings, axis=1) * np.linalg.norm(query_vec)
                norms = np.where(norms == 0, 1, norms)
                scores = np.dot(self.embeddings, query_vec) / norms
            else:
                # Dot product
                scores = np.dot(self.embeddings, query_vec)

            top_indices = np.argsort(scores)[::-1][:top_k]

            results = []
            for idx in top_indices:
                results.append(RetrievalResult(
                    document=self.documents[idx],
                    score=float(scores[idx]),
                    source="dense"
                ))
            return results

        else:
            # Simple fallback without numpy
            return [
                RetrievalResult(document=doc, score=0.5, source="dense")
                for doc in self.documents[:top_k]
            ]


# ─── Sparse Retriever (BM25) ───────────────────────────────────────────────────

class BM25Retriever:
    """
    BM25 sparse retrieval.
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.documents: List[Document] = []
        self.doc_freqs: Dict[str, int] = defaultdict(int)
        self.doc_lengths: List[int] = []
        self.avg_doc_length: float = 0
        self.inverted_index: Dict[str, List[int]] = defaultdict(list)
        self.N: int = 0

    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenization."""
        # Basic tokenization - can be enhanced with NLTK/SpaCy
        text = text.lower()
        tokens = []
        current_token = []
        for char in text:
            if char.isalnum():
                current_token.append(char)
            else:
                if current_token:
                    tokens.append("".join(current_token))
                    current_token = []
        if current_token:
            tokens.append("".join(current_token))
        return tokens

    def index(self, documents: List[Document]):
        """Index documents for BM25."""
        self.documents = documents
        self.N = len(documents)
        self.doc_lengths = []
        self.doc_freqs = defaultdict(int)
        self.inverted_index = defaultdict(list)

        for i, doc in enumerate(documents):
            tokens = self._tokenize(doc.text)
            self.doc_lengths.append(len(tokens))

            # Track unique terms in this doc
            seen_terms = set()
            for token in tokens:
                if token not in seen_terms:
                    self.doc_freqs[token] += 1
                    seen_terms.add(token)
                self.inverted_index[token].append(i)

        self.avg_doc_length = sum(self.doc_lengths) / max(1, self.N)
        logger.info(f"Indexed {self.N} documents for BM25 retrieval")

    def retrieve(self, query: str, top_k: int = 10) -> List[RetrievalResult]:
        """Retrieve documents using BM25."""
        if not self.documents:
            return []

        query_tokens = self._tokenize(query)
        scores = [0.0] * self.N

        for token in query_tokens:
            if token not in self.inverted_index:
                continue

            # IDF
            df = self.doc_freqs.get(token, 0)
            idf = math.log((self.N - df + 0.5) / (df + 0.5) + 1)

            # Score each document containing this token
            for doc_idx in self.inverted_index[token]:
                # Term frequency in document
                doc_tokens = self._tokenize(self.documents[doc_idx].text)
                tf = doc_tokens.count(token)

                # BM25 formula
                doc_len = self.doc_lengths[doc_idx]
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (1 - self.b + self.b * doc_len / self.avg_doc_length)
                scores[doc_idx] += idf * numerator / denominator

        # Sort by score
        scored_docs = [(i, score) for i, score in enumerate(scores) if score > 0]
        scored_docs.sort(key=lambda x: x[1], reverse=True)

        results = []
        for idx, score in scored_docs[:top_k]:
            results.append(RetrievalResult(
                document=self.documents[idx],
                score=score,
                source="sparse"
            ))

        return results


# ─── Cross-Encoder Reranker ────────────────────────────────────────────────────

class CrossEncoderReranker:
    """
    Rerank results using cross-encoder model.
    Falls back to LLM-based reranking if model not available.
    """

    def __init__(
        self,
        model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
        use_llm_fallback: bool = True,
        llm_api_key: Optional[str] = None
    ):
        self.model_name = model
        self.use_llm_fallback = use_llm_fallback
        self.llm_api_key = llm_api_key or os.getenv("KIMI_API_KEY")

        # Try to load cross-encoder
        try:
            from sentence_transformers import CrossEncoder
            self.cross_encoder = CrossEncoder(model)
            self.has_cross_encoder = True
        except ImportError:
            self.cross_encoder = None
            self.has_cross_encoder = False
            logger.warning("sentence-transformers not available. Using LLM reranking.")

    async def rerank(
        self,
        query: str,
        results: List[RetrievalResult],
        top_k: int = 5
    ) -> List[RetrievalResult]:
        """Rerank results using cross-encoder or LLM."""
        if not results:
            return []

        if self.has_cross_encoder and self.cross_encoder:
            return self._rerank_with_cross_encoder(query, results, top_k)
        elif self.use_llm_fallback:
            return await self._rerank_with_llm(query, results, top_k)
        else:
            return results[:top_k]

    def _rerank_with_cross_encoder(
        self,
        query: str,
        results: List[RetrievalResult],
        top_k: int
    ) -> List[RetrievalResult]:
        """Rerank using cross-encoder model."""
        pairs = [(query, r.document.text) for r in results]
        scores = self.cross_encoder.predict(pairs)

        # Combine with reranked scores
        reranked = []
        for result, score in zip(results, scores):
            reranked.append(RetrievalResult(
                document=result.document,
                score=float(score),
                source="reranked"
            ))

        reranked.sort(key=lambda x: x.score, reverse=True)
        return reranked[:top_k]

    async def _rerank_with_llm(
        self,
        query: str,
        results: List[RetrievalResult],
        top_k: int
    ) -> List[RetrievalResult]:
        """Rerank using LLM relevance scoring."""
        if not self.llm_api_key:
            return results[:top_k]

        # Score each document
        scored_results = []
        for result in results[:min(20, len(results))]:  # Limit for cost
            prompt = f"""Rate the relevance of this document to the query on a scale of 0-10.

Query: {query}

Document: {result.document.text[:500]}

Return only a number from 0 to 10."""

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        "https://api.moonshot.cn/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.llm_api_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": "moonshot-v1-8k",
                            "messages": [{"role": "user", "content": prompt}],
                            "temperature": 0,
                            "max_tokens": 10,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    score_text = data["choices"][0]["message"]["content"].strip()
                    score = float(score_text.split()[0])
                    scored_results.append(RetrievalResult(
                        document=result.document,
                        score=score / 10.0,
                        source="reranked"
                    ))
            except Exception as e:
                logger.warning(f"LLM reranking failed: {e}")
                scored_results.append(result)

        scored_results.sort(key=lambda x: x.score, reverse=True)
        return scored_results[:top_k]


# ─── Reciprocal Rank Fusion ────────────────────────────────────────────────────

def reciprocal_rank_fusion(
    result_lists: List[List[RetrievalResult]],
    k: int = 60,
    weights: Optional[List[float]] = None
) -> List[RetrievalResult]:
    """
    Combine multiple ranked lists using RRF.

    Args:
        result_lists: List of ranked result lists
        k: RRF constant (default 60)
        weights: Optional weights for each list

    Returns:
        Fused and sorted results
    """
    if not result_lists:
        return []

    if weights is None:
        weights = [1.0] * len(result_lists)

    # Score accumulator
    doc_scores: Dict[str, float] = defaultdict(float)
    doc_objects: Dict[str, Document] = {}
    doc_sources: Dict[str, List[str]] = defaultdict(list)

    for results, weight in zip(result_lists, weights):
        for rank, result in enumerate(results):
            doc_id = result.document.id
            doc_objects[doc_id] = result.document
            doc_sources[doc_id].append(result.source)

            # RRF score
            rrf_score = weight * (1.0 / (k + rank + 1))
            doc_scores[doc_id] += rrf_score

    # Sort by fused score
    sorted_docs = sorted(doc_scores.items(), key=lambda x: x[1], reverse=True)

    results = []
    for doc_id, score in sorted_docs:
        results.append(RetrievalResult(
            document=doc_objects[doc_id],
            score=score,
            source="+".join(set(doc_sources[doc_id]))
        ))

    return results


# ─── Hybrid Retriever ──────────────────────────────────────────────────────────

class HybridRetriever:
    """
    Hybrid retriever combining dense, sparse, and graph retrieval.
    Implements MEGA-RAG style multi-evidence approach.
    """

    def __init__(
        self,
        dense_retriever: Optional[DenseRetriever] = None,
        sparse_retriever: Optional[BM25Retriever] = None,
        graph_retriever: Optional[Any] = None,
        reranker: Optional[CrossEncoderReranker] = None,
        weights: Optional[Dict[str, float]] = None
    ):
        self.dense = dense_retriever or DenseRetriever()
        self.sparse = sparse_retriever or BM25Retriever()
        self.graph = graph_retriever
        self.reranker = reranker or CrossEncoderReranker()

        self.weights = weights or {
            "dense": 0.4,
            "sparse": 0.3,
            "graph": 0.3
        }

    async def index(self, documents: List[Document]):
        """Index documents in all retrievers."""
        await self.dense.index(documents)
        self.sparse.index(documents)

        if self.graph:
            # Index in graph retriever
            doc_dicts = [{"id": d.id, "text": d.text} for d in documents]
            await self.graph.index_documents(doc_dicts)

        logger.info(f"Indexed {len(documents)} documents in hybrid retriever")

    async def retrieve(
        self,
        query: str,
        top_k: int = 10,
        use_reranking: bool = True,
        sources: Optional[List[str]] = None
    ) -> HybridRetrievalResult:
        """
        Retrieve documents using hybrid approach.

        Args:
            query: Search query
            top_k: Number of results to return
            use_reranking: Whether to apply cross-encoder reranking
            sources: Which sources to use (dense, sparse, graph)

        Returns:
            HybridRetrievalResult with fused results
        """
        if sources is None:
            sources = ["dense", "sparse"]
            if self.graph:
                sources.append("graph")

        result_lists = []
        weights = []
        sources_used = []

        # Dense retrieval
        if "dense" in sources:
            dense_results = await self.dense.retrieve(query, top_k=top_k * 2)
            if dense_results:
                result_lists.append(dense_results)
                weights.append(self.weights.get("dense", 0.4))
                sources_used.append("dense")

        # Sparse retrieval
        if "sparse" in sources:
            sparse_results = self.sparse.retrieve(query, top_k=top_k * 2)
            if sparse_results:
                result_lists.append(sparse_results)
                weights.append(self.weights.get("sparse", 0.3))
                sources_used.append("sparse")

        # Graph retrieval
        if "graph" in sources and self.graph:
            graph_result = await self.graph.query(query, search_type="hybrid", top_k=top_k)
            # Convert graph entities to retrieval results
            graph_results = [
                RetrievalResult(
                    document=Document(id=e.id, text=e.description or e.name),
                    score=0.8,
                    source="graph"
                )
                for e in graph_result.entities[:top_k * 2]
            ]
            if graph_results:
                result_lists.append(graph_results)
                weights.append(self.weights.get("graph", 0.3))
                sources_used.append("graph")

        # Fuse results
        if not result_lists:
            return HybridRetrievalResult(
                results=[],
                sources_used=[],
                fusion_method="none",
                reranked=False
            )

        fused_results = reciprocal_rank_fusion(result_lists, weights=weights)

        # Reranking
        if use_reranking and fused_results:
            reranked_results = await self.reranker.rerank(query, fused_results, top_k)
            return HybridRetrievalResult(
                results=reranked_results,
                sources_used=sources_used,
                fusion_method="rrf",
                reranked=True
            )

        return HybridRetrievalResult(
            results=fused_results[:top_k],
            sources_used=sources_used,
            fusion_method="rrf",
            reranked=False
        )

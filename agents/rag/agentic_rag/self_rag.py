"""
agentic_rag/self_rag.py — Self-RAG Implementation for Velox AI

Self-RAG: Learning to Retrieve, Generate, and Critique
Paper: arxiv.org/abs/2310.11511

Uses reflection tokens to:
- Decide when to retrieve
- Grade document relevance
- Verify output support
- Score usefulness

Reference: docs/architecture/15-advanced-rag-architecture.md §9.1
"""

from __future__ import annotations

import os
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Any
from enum import Enum

import httpx

logger = logging.getLogger(__name__)


# ─── Reflection Token Types ────────────────────────────────────────────────────

class RetrievalDecision(Enum):
    """Should we retrieve?"""
    YES = "yes"
    NO = "no"


class RelevanceGrade(Enum):
    """Is the document relevant?"""
    RELEVANT = "relevant"
    IRRELEVANT = "irrelevant"


class SupportLevel(Enum):
    """Does output support the query?"""
    FULLY_SUPPORTED = "fully_supported"
    PARTIALLY_SUPPORTED = "partially_supported"
    NOT_SUPPORTED = "not_supported"


class UsefulnessScore(Enum):
    """Is the output useful? (1-5 scale)"""
    SCORE_1 = 1
    SCORE_2 = 2
    SCORE_3 = 3
    SCORE_4 = 4
    SCORE_5 = 5


# ─── Data Classes ──────────────────────────────────────────────────────────────

@dataclass
class SelfRAGDocument:
    """Document with relevance grade."""
    id: str
    text: str
    relevance: RelevanceGrade = RelevanceGrade.IRRELEVANT
    relevance_reason: str = ""


@dataclass
class SelfRAGResponse:
    """Response from Self-RAG agent."""
    response: str
    documents: List[SelfRAGDocument]
    retrieval_used: bool
    support_level: SupportLevel
    usefulness_score: int
    confidence: float
    reasoning: str = ""


# ─── Self-RAG Agent ────────────────────────────────────────────────────────────

class SelfRAGAgent:
    """
    Self-RAG agent with reflection tokens.

    The agent:
    1. Decides if retrieval is needed
    2. Retrieves and grades relevance
    3. Generates response with relevant context
    4. Self-critiques the response
    """

    def __init__(
        self,
        retriever: Optional[Any] = None,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        llm_model: str = "moonshot-v1-8k"
    ):
        self.retriever = retriever
        self.api_key = llm_api_key or os.getenv("KIMI_API_KEY")
        self.base_url = llm_base_url
        self.model = llm_model

    async def _call_llm(
        self,
        prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 500
    ) -> str:
        """Call LLM API."""
        if not self.api_key:
            logger.warning("No API key. Returning mock response.")
            return "[mock response]"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            return ""

    async def _should_retrieve(self, query: str) -> bool:
        """
        Decide if retrieval is needed.
        [Retrieve] token simulation.
        """
        prompt = f"""Analyze this query and decide if external retrieval is needed.

Query: {query}

Consider:
- Is this a factual question requiring specific information?
- Is this a simple greeting or conversational query?
- Does this require up-to-date or domain-specific knowledge?

Respond with ONLY "yes" or "no".
"""
        response = await self._call_llm(prompt, temperature=0)
        return "yes" in response.lower()

    async def _grade_relevance(
        self,
        query: str,
        document: str
    ) -> tuple[RelevanceGrade, str]:
        """
        Grade document relevance.
        [IsRel] token simulation.
        """
        prompt = f"""Grade the relevance of this document to the query.

Query: {query}

Document: {document[:1000]}

Is this document relevant to answering the query?
Respond with:
RELEVANT: [reason] OR IRRELEVANT: [reason]
"""
        response = await self._call_llm(prompt, temperature=0)

        if "RELEVANT" in response.upper() and "IRRELEVANT" not in response.upper():
            reason = response.split(":", 1)[-1].strip() if ":" in response else ""
            return RelevanceGrade.RELEVANT, reason
        else:
            reason = response.split(":", 1)[-1].strip() if ":" in response else ""
            return RelevanceGrade.IRRELEVANT, reason

    async def _generate_response(
        self,
        query: str,
        context: str
    ) -> str:
        """Generate response with context."""
        if context:
            prompt = f"""Answer the query using ONLY the provided context.
If the context doesn't contain enough information, say so.

Context:
{context}

Query: {query}

Answer:"""
        else:
            prompt = f"""Answer this query directly:

Query: {query}

Answer:"""

        return await self._call_llm(prompt, temperature=0.7, max_tokens=500)

    async def _check_support(
        self,
        query: str,
        response: str,
        context: str
    ) -> tuple[SupportLevel, str]:
        """
        Check if response is supported by context.
        [IsSup] token simulation.
        """
        if not context:
            return SupportLevel.NOT_SUPPORTED, "No context provided"

        prompt = f"""Evaluate if the response is supported by the context.

Context: {context[:1500]}

Query: {query}

Response: {response}

Is the response supported by the context?
Respond with ONE of:
- FULLY_SUPPORTED: [reason]
- PARTIALLY_SUPPORTED: [reason]
- NOT_SUPPORTED: [reason]
"""
        result = await self._call_llm(prompt, temperature=0)

        if "FULLY_SUPPORTED" in result.upper():
            reason = result.split(":", 1)[-1].strip() if ":" in result else ""
            return SupportLevel.FULLY_SUPPORTED, reason
        elif "PARTIALLY_SUPPORTED" in result.upper():
            reason = result.split(":", 1)[-1].strip() if ":" in result else ""
            return SupportLevel.PARTIALLY_SUPPORTED, reason
        else:
            reason = result.split(":", 1)[-1].strip() if ":" in result else ""
            return SupportLevel.NOT_SUPPORTED, reason

    async def _score_usefulness(
        self,
        query: str,
        response: str
    ) -> int:
        """
        Score usefulness of response.
        [IsUse] token simulation.
        """
        prompt = f"""Rate the usefulness of this response on a scale of 1-5.

Query: {query}

Response: {response}

Scoring guide:
5 = Excellent: Complete, accurate, well-structured
4 = Good: Mostly complete and accurate
3 = Acceptable: Addresses the query but has gaps
2 = Poor: Incomplete or partially wrong
1 = Unusable: Wrong or irrelevant

Respond with ONLY a number from 1-5.
"""
        result = await self._call_llm(prompt, temperature=0)

        try:
            # Extract first digit
            for char in result:
                if char.isdigit():
                    score = int(char)
                    return max(1, min(5, score))
            return 3
        except Exception:
            return 3

    async def generate(self, query: str) -> SelfRAGResponse:
        """
        Generate response using Self-RAG pipeline.

        Args:
            query: User query

        Returns:
            SelfRAGResponse with full metadata
        """
        # Step 1: Decide if retrieval is needed
        should_retrieve = await self._should_retrieve(query)

        documents = []
        relevant_docs = []
        context = ""

        if should_retrieve and self.retriever:
            # Step 2: Retrieve documents
            if hasattr(self.retriever, 'retrieve'):
                # Async retriever
                raw_docs = await self.retriever.retrieve(query, top_k=5)
            elif callable(self.retriever):
                # Sync callable
                raw_docs = self.retriever(query)
            else:
                raw_docs = []

            # Step 3: Grade relevance for each document
            for doc in raw_docs:
                doc_text = doc.text if hasattr(doc, 'text') else str(doc)
                doc_id = doc.id if hasattr(doc, 'id') else str(hash(doc_text))[:8]

                grade, reason = await self._grade_relevance(query, doc_text)

                self_rag_doc = SelfRAGDocument(
                    id=doc_id,
                    text=doc_text,
                    relevance=grade,
                    relevance_reason=reason
                )
                documents.append(self_rag_doc)

                if grade == RelevanceGrade.RELEVANT:
                    relevant_docs.append(self_rag_doc)

            # Build context from relevant documents
            context = "\n\n".join([doc.text for doc in relevant_docs])

        # Step 4: Generate response
        response = await self._generate_response(query, context)

        # Step 5: Self-critique
        support_level, support_reason = await self._check_support(query, response, context)
        usefulness = await self._score_usefulness(query, response)

        # Calculate confidence
        confidence = self._calculate_confidence(
            retrieval_used=should_retrieve,
            relevant_docs_count=len(relevant_docs),
            support_level=support_level,
            usefulness=usefulness
        )

        return SelfRAGResponse(
            response=response,
            documents=documents,
            retrieval_used=should_retrieve,
            support_level=support_level,
            usefulness_score=usefulness,
            confidence=confidence,
            reasoning=support_reason
        )

    def _calculate_confidence(
        self,
        retrieval_used: bool,
        relevant_docs_count: int,
        support_level: SupportLevel,
        usefulness: int
    ) -> float:
        """Calculate overall confidence score."""
        score = 0.0

        # Base score from usefulness (40%)
        score += (usefulness / 5.0) * 0.4

        # Support level contribution (40%)
        support_scores = {
            SupportLevel.FULLY_SUPPORTED: 1.0,
            SupportLevel.PARTIALLY_SUPPORTED: 0.6,
            SupportLevel.NOT_SUPPORTED: 0.2,
        }
        score += support_scores.get(support_level, 0.2) * 0.4

        # Document coverage (20%)
        if retrieval_used:
            doc_score = min(1.0, relevant_docs_count / 3)
            score += doc_score * 0.2
        else:
            # No retrieval needed - assume base confidence
            score += 0.1

        return min(1.0, max(0.0, score))


# ─── Self-RAG with Iterative Refinement ────────────────────────────────────────

class IterativeSelfRAG(SelfRAGAgent):
    """
    Self-RAG with iterative refinement.
    If initial response is not well-supported, retrieve more and retry.
    """

    def __init__(self, max_iterations: int = 3, **kwargs):
        super().__init__(**kwargs)
        self.max_iterations = max_iterations

    async def generate(self, query: str) -> SelfRAGResponse:
        """Generate with iterative refinement."""
        for iteration in range(self.max_iterations):
            response = await super().generate(query)

            # Check if response is good enough
            if (response.support_level == SupportLevel.FULLY_SUPPORTED or
                response.confidence >= 0.8):
                return response

            # If not well-supported, try to get more context
            if iteration < self.max_iterations - 1:
                logger.info(f"Iteration {iteration + 1}: Refining response...")
                # Could modify query or retrieval strategy here

        return response

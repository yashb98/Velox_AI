"""
agentic_rag/adaptive_rag.py — Adaptive RAG Implementation

Adaptive RAG: Dynamic Strategy Selection
Paper: arxiv.org/abs/2403.14403

Dynamically selects retrieval strategy based on query complexity:
- No retrieval: Simple factual questions LLM can answer directly
- Single-step: Straightforward lookup
- Multi-step: Complex reasoning requiring iterative retrieval

Reference: docs/architecture/15-advanced-rag-architecture.md §9.3
"""

from __future__ import annotations

import os
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Any, Protocol
from enum import Enum
from abc import ABC, abstractmethod

import httpx

logger = logging.getLogger(__name__)


# ─── Query Complexity Types ────────────────────────────────────────────────────

class QueryComplexity(Enum):
    """Query complexity classification."""
    SIMPLE = "simple"              # No retrieval needed
    SINGLE_STEP = "single_step"    # One retrieval step
    MULTI_STEP = "multi_step"      # Multiple retrieval steps


# ─── Data Classes ──────────────────────────────────────────────────────────────

@dataclass
class AdaptiveRAGResponse:
    """Response from Adaptive RAG."""
    response: str
    complexity: QueryComplexity
    strategy_used: str
    retrieval_steps: int
    documents: List[Any] = field(default_factory=list)
    reasoning_trace: List[str] = field(default_factory=list)
    confidence: float = 0.0


# ─── RAG Strategy Interface ────────────────────────────────────────────────────

class RAGStrategy(ABC):
    """Base class for RAG strategies."""

    @abstractmethod
    async def execute(self, query: str) -> AdaptiveRAGResponse:
        """Execute the RAG strategy."""
        pass


# ─── Query Complexity Classifier ───────────────────────────────────────────────

class QueryComplexityClassifier:
    """
    Classifies query complexity to determine retrieval strategy.
    Uses LLM-based classification with rule-based fallback.
    """

    def __init__(
        self,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        llm_model: str = "moonshot-v1-8k",
        use_llm: bool = True
    ):
        self.api_key = llm_api_key or os.getenv("KIMI_API_KEY")
        self.base_url = llm_base_url
        self.model = llm_model
        self.use_llm = use_llm and bool(self.api_key)

        # Keywords indicating complexity
        self.simple_keywords = {
            "what is", "who is", "when was", "where is",
            "define", "meaning of", "hello", "hi", "thanks"
        }
        self.complex_keywords = {
            "how does", "why does", "explain", "compare",
            "difference between", "analyze", "summarize",
            "what are the steps", "how to", "relationship between"
        }
        self.multi_step_keywords = {
            "step by step", "first", "then", "finally",
            "multiple", "several", "all the", "list all",
            "comprehensive", "detailed analysis"
        }

    async def classify(self, query: str) -> QueryComplexity:
        """
        Classify query complexity.

        Args:
            query: User query

        Returns:
            QueryComplexity enum value
        """
        if self.use_llm:
            return await self._classify_with_llm(query)
        return self._classify_with_rules(query)

    def _classify_with_rules(self, query: str) -> QueryComplexity:
        """Rule-based classification."""
        query_lower = query.lower()

        # Check for multi-step indicators
        for keyword in self.multi_step_keywords:
            if keyword in query_lower:
                return QueryComplexity.MULTI_STEP

        # Check for complex query indicators
        for keyword in self.complex_keywords:
            if keyword in query_lower:
                return QueryComplexity.SINGLE_STEP

        # Check for simple queries
        for keyword in self.simple_keywords:
            if keyword in query_lower:
                # Short queries with simple keywords
                if len(query.split()) < 10:
                    return QueryComplexity.SIMPLE

        # Check query length and structure
        word_count = len(query.split())
        question_mark_count = query.count("?")

        if word_count < 5 and question_mark_count <= 1:
            return QueryComplexity.SIMPLE
        elif question_mark_count > 1 or word_count > 30:
            return QueryComplexity.MULTI_STEP
        else:
            return QueryComplexity.SINGLE_STEP

    async def _classify_with_llm(self, query: str) -> QueryComplexity:
        """LLM-based classification."""
        prompt = f"""Classify the complexity of this query for a RAG system.

Query: {query}

Classification options:
- SIMPLE: Can be answered directly without retrieval (greetings, basic definitions, common knowledge)
- SINGLE_STEP: Requires one retrieval step (specific facts, simple lookups)
- MULTI_STEP: Requires multiple retrieval steps (complex analysis, comparisons, multi-part questions)

Respond with ONLY one of: SIMPLE, SINGLE_STEP, or MULTI_STEP
"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0,
                        "max_tokens": 20,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                result = data["choices"][0]["message"]["content"].strip().upper()

                if "MULTI" in result:
                    return QueryComplexity.MULTI_STEP
                elif "SINGLE" in result:
                    return QueryComplexity.SINGLE_STEP
                else:
                    return QueryComplexity.SIMPLE

        except Exception as e:
            logger.warning(f"LLM classification failed: {e}")
            return self._classify_with_rules(query)


# ─── Direct LLM Strategy (No Retrieval) ────────────────────────────────────────

class DirectLLMStrategy(RAGStrategy):
    """
    Direct LLM response without retrieval.
    Used for simple queries.
    """

    def __init__(
        self,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        llm_model: str = "moonshot-v1-8k"
    ):
        self.api_key = llm_api_key or os.getenv("KIMI_API_KEY")
        self.base_url = llm_base_url
        self.model = llm_model

    async def execute(self, query: str) -> AdaptiveRAGResponse:
        """Execute direct LLM response."""
        if not self.api_key:
            return AdaptiveRAGResponse(
                response="[Mock direct response]",
                complexity=QueryComplexity.SIMPLE,
                strategy_used="direct_llm",
                retrieval_steps=0,
                confidence=0.5
            )

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
                        "messages": [{"role": "user", "content": query}],
                        "temperature": 0.7,
                        "max_tokens": 500,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                response = data["choices"][0]["message"]["content"].strip()

                return AdaptiveRAGResponse(
                    response=response,
                    complexity=QueryComplexity.SIMPLE,
                    strategy_used="direct_llm",
                    retrieval_steps=0,
                    confidence=0.7
                )

        except Exception as e:
            logger.error(f"Direct LLM failed: {e}")
            return AdaptiveRAGResponse(
                response="I apologize, but I'm having trouble processing your request.",
                complexity=QueryComplexity.SIMPLE,
                strategy_used="direct_llm",
                retrieval_steps=0,
                confidence=0.2
            )


# ─── Single-Step RAG Strategy ──────────────────────────────────────────────────

class SingleStepRAGStrategy(RAGStrategy):
    """
    Single retrieval step followed by generation.
    Used for straightforward lookup queries.
    """

    def __init__(
        self,
        retriever: Optional[Any] = None,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        llm_model: str = "moonshot-v1-8k",
        top_k: int = 5
    ):
        self.retriever = retriever
        self.api_key = llm_api_key or os.getenv("KIMI_API_KEY")
        self.base_url = llm_base_url
        self.model = llm_model
        self.top_k = top_k

    async def execute(self, query: str) -> AdaptiveRAGResponse:
        """Execute single-step RAG."""
        documents = []
        context = ""

        # Retrieve documents
        if self.retriever:
            if hasattr(self.retriever, 'retrieve'):
                raw_docs = await self.retriever.retrieve(query, top_k=self.top_k)
            elif callable(self.retriever):
                raw_docs = self.retriever(query)
            else:
                raw_docs = []

            documents = raw_docs
            context = "\n\n".join([
                d.text if hasattr(d, 'text') else str(d)
                for d in raw_docs
            ])

        # Generate response
        if not self.api_key:
            return AdaptiveRAGResponse(
                response="[Mock single-step response]",
                complexity=QueryComplexity.SINGLE_STEP,
                strategy_used="single_step_rag",
                retrieval_steps=1,
                documents=documents,
                confidence=0.5
            )

        prompt = f"""Answer the query using the provided context.
Be accurate and specific.

Context:
{context if context else "No relevant context found."}

Query: {query}

Answer:"""

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
                        "temperature": 0.7,
                        "max_tokens": 500,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                response = data["choices"][0]["message"]["content"].strip()

                return AdaptiveRAGResponse(
                    response=response,
                    complexity=QueryComplexity.SINGLE_STEP,
                    strategy_used="single_step_rag",
                    retrieval_steps=1,
                    documents=documents,
                    confidence=0.8 if documents else 0.5
                )

        except Exception as e:
            logger.error(f"Single-step RAG failed: {e}")
            return AdaptiveRAGResponse(
                response="I apologize, but I'm having trouble processing your request.",
                complexity=QueryComplexity.SINGLE_STEP,
                strategy_used="single_step_rag",
                retrieval_steps=1,
                documents=documents,
                confidence=0.2
            )


# ─── Multi-Step RAG Strategy ──────────────────────────────────────────────────

class MultiStepRAGStrategy(RAGStrategy):
    """
    Multiple retrieval steps with iterative reasoning.
    Used for complex queries requiring multi-hop retrieval.
    """

    def __init__(
        self,
        retriever: Optional[Any] = None,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        llm_model: str = "moonshot-v1-32k",  # Larger context for multi-step
        max_steps: int = 3,
        top_k_per_step: int = 3
    ):
        self.retriever = retriever
        self.api_key = llm_api_key or os.getenv("KIMI_API_KEY")
        self.base_url = llm_base_url
        self.model = llm_model
        self.max_steps = max_steps
        self.top_k_per_step = top_k_per_step

    async def _call_llm(self, prompt: str, temperature: float = 0.3) -> str:
        """Call LLM API."""
        if not self.api_key:
            return ""

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
                        "max_tokens": 500,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            return ""

    async def _decompose_query(self, query: str) -> List[str]:
        """Decompose complex query into sub-questions."""
        prompt = f"""Break down this complex query into 2-4 simpler sub-questions.
Each sub-question should be answerable independently.

Query: {query}

Return each sub-question on a new line, starting with a number.
Example:
1. First sub-question?
2. Second sub-question?
"""
        result = await self._call_llm(prompt, temperature=0.1)

        sub_questions = []
        for line in result.split("\n"):
            line = line.strip()
            if line and (line[0].isdigit() or line.startswith("-")):
                # Remove leading numbers/bullets
                question = line.lstrip("0123456789.-) ").strip()
                if question:
                    sub_questions.append(question)

        return sub_questions[:self.max_steps] if sub_questions else [query]

    async def execute(self, query: str) -> AdaptiveRAGResponse:
        """Execute multi-step RAG."""
        all_documents = []
        reasoning_trace = []
        accumulated_context = ""

        # Step 1: Decompose query
        sub_questions = await self._decompose_query(query)
        reasoning_trace.append(f"Decomposed into {len(sub_questions)} sub-questions")

        # Step 2: Iterative retrieval
        for i, sub_q in enumerate(sub_questions):
            reasoning_trace.append(f"Step {i+1}: Retrieving for '{sub_q}'")

            if self.retriever:
                if hasattr(self.retriever, 'retrieve'):
                    docs = await self.retriever.retrieve(sub_q, top_k=self.top_k_per_step)
                elif callable(self.retriever):
                    docs = self.retriever(sub_q)
                else:
                    docs = []

                all_documents.extend(docs)

                doc_context = "\n".join([
                    d.text if hasattr(d, 'text') else str(d)
                    for d in docs
                ])
                accumulated_context += f"\n\n[Sub-question {i+1}: {sub_q}]\n{doc_context}"

        # Step 3: Synthesize final answer
        if not self.api_key:
            return AdaptiveRAGResponse(
                response="[Mock multi-step response]",
                complexity=QueryComplexity.MULTI_STEP,
                strategy_used="multi_step_rag",
                retrieval_steps=len(sub_questions),
                documents=all_documents,
                reasoning_trace=reasoning_trace,
                confidence=0.5
            )

        synthesis_prompt = f"""Answer this complex query by synthesizing information from multiple sources.

Original Query: {query}

Retrieved Information:
{accumulated_context if accumulated_context else "No relevant information found."}

Provide a comprehensive answer that addresses all aspects of the query:"""

        response = await self._call_llm(synthesis_prompt, temperature=0.7)
        reasoning_trace.append("Synthesized final answer")

        return AdaptiveRAGResponse(
            response=response,
            complexity=QueryComplexity.MULTI_STEP,
            strategy_used="multi_step_rag",
            retrieval_steps=len(sub_questions),
            documents=all_documents,
            reasoning_trace=reasoning_trace,
            confidence=0.85 if all_documents else 0.5
        )


# ─── Adaptive RAG Agent ────────────────────────────────────────────────────────

class AdaptiveRAGAgent:
    """
    Adaptive RAG agent that dynamically selects retrieval strategy.

    Automatically chooses between:
    - Direct LLM (no retrieval)
    - Single-step RAG
    - Multi-step RAG

    Based on query complexity analysis.
    """

    def __init__(
        self,
        retriever: Optional[Any] = None,
        classifier: Optional[QueryComplexityClassifier] = None,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1"
    ):
        self.classifier = classifier or QueryComplexityClassifier(
            llm_api_key=llm_api_key,
            llm_base_url=llm_base_url
        )

        # Initialize strategies
        self.strategies = {
            QueryComplexity.SIMPLE: DirectLLMStrategy(
                llm_api_key=llm_api_key,
                llm_base_url=llm_base_url
            ),
            QueryComplexity.SINGLE_STEP: SingleStepRAGStrategy(
                retriever=retriever,
                llm_api_key=llm_api_key,
                llm_base_url=llm_base_url
            ),
            QueryComplexity.MULTI_STEP: MultiStepRAGStrategy(
                retriever=retriever,
                llm_api_key=llm_api_key,
                llm_base_url=llm_base_url
            ),
        }

    async def generate(self, query: str) -> AdaptiveRAGResponse:
        """
        Generate response using adaptive strategy selection.

        Args:
            query: User query

        Returns:
            AdaptiveRAGResponse with strategy details
        """
        # Classify query complexity
        complexity = await self.classifier.classify(query)

        # Select and execute strategy
        strategy = self.strategies[complexity]
        response = await strategy.execute(query)

        logger.info(f"Adaptive RAG: {complexity.value} -> {response.strategy_used}")

        return response

    def register_strategy(
        self,
        complexity: QueryComplexity,
        strategy: RAGStrategy
    ):
        """Register a custom strategy for a complexity level."""
        self.strategies[complexity] = strategy

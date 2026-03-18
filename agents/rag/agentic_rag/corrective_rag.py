"""
agentic_rag/corrective_rag.py — Corrective RAG (CRAG) Implementation

Corrective RAG: Knowledge Refinement Pipeline
Paper: arxiv.org/abs/2401.15884

Pipeline:
1. Retrieve documents
2. Grade document relevance (Correct/Incorrect/Ambiguous)
3. If ambiguous/incorrect → web search fallback
4. Refine knowledge before generation

Reference: docs/architecture/15-advanced-rag-architecture.md §9.2
"""

from __future__ import annotations

import os
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Any, Tuple
from enum import Enum

import httpx

logger = logging.getLogger(__name__)


# ─── Grading Types ─────────────────────────────────────────────────────────────

class DocumentGrade(Enum):
    """Document relevance grade."""
    CORRECT = "correct"      # Highly relevant
    INCORRECT = "incorrect"  # Not relevant
    AMBIGUOUS = "ambiguous"  # Partially relevant


class KnowledgeAction(Enum):
    """Action based on document grades."""
    USE_RETRIEVED = "use_retrieved"    # All docs are correct
    REFINE = "refine"                  # Some docs are ambiguous
    WEB_SEARCH = "web_search"          # Most docs are incorrect


# ─── Data Classes ──────────────────────────────────────────────────────────────

@dataclass
class GradedDocument:
    """Document with grade."""
    id: str
    text: str
    source: str  # "local" or "web"
    grade: DocumentGrade = DocumentGrade.AMBIGUOUS
    score: float = 0.0


@dataclass
class CRAGResponse:
    """Response from Corrective RAG."""
    response: str
    local_documents: List[GradedDocument]
    web_documents: List[GradedDocument]
    action_taken: KnowledgeAction
    refined_knowledge: str
    confidence: float


# ─── Web Search Client ─────────────────────────────────────────────────────────

class WebSearchClient:
    """
    Web search client for fallback retrieval.
    Supports multiple search providers.
    """

    def __init__(
        self,
        provider: str = "tavily",  # tavily, brave, serper
        api_key: Optional[str] = None
    ):
        self.provider = provider
        self.api_key = api_key or self._get_api_key()

    def _get_api_key(self) -> str:
        """Get API key from environment."""
        key_map = {
            "tavily": "TAVILY_API_KEY",
            "brave": "BRAVE_API_KEY",
            "serper": "SERPER_API_KEY",
        }
        env_var = key_map.get(self.provider, "SEARCH_API_KEY")
        return os.getenv(env_var, "")

    async def search(self, query: str, num_results: int = 5) -> List[GradedDocument]:
        """
        Search the web for relevant documents.

        Args:
            query: Search query
            num_results: Number of results to return

        Returns:
            List of documents from web search
        """
        if not self.api_key:
            logger.warning("No search API key. Returning empty results.")
            return []

        try:
            if self.provider == "tavily":
                return await self._search_tavily(query, num_results)
            elif self.provider == "brave":
                return await self._search_brave(query, num_results)
            else:
                logger.warning(f"Unknown provider: {self.provider}")
                return []
        except Exception as e:
            logger.error(f"Web search failed: {e}")
            return []

    async def _search_tavily(
        self,
        query: str,
        num_results: int
    ) -> List[GradedDocument]:
        """Search using Tavily API."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                headers={"Content-Type": "application/json"},
                json={
                    "api_key": self.api_key,
                    "query": query,
                    "search_depth": "basic",
                    "max_results": num_results,
                    "include_raw_content": True,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            documents = []
            for i, result in enumerate(data.get("results", [])):
                documents.append(GradedDocument(
                    id=f"web_{i}",
                    text=result.get("content", result.get("raw_content", "")),
                    source="web",
                    grade=DocumentGrade.AMBIGUOUS,
                    score=result.get("score", 0.5)
                ))
            return documents

    async def _search_brave(
        self,
        query: str,
        num_results: int
    ) -> List[GradedDocument]:
        """Search using Brave Search API."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                headers={
                    "Accept": "application/json",
                    "X-Subscription-Token": self.api_key,
                },
                params={
                    "q": query,
                    "count": num_results,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            documents = []
            for i, result in enumerate(data.get("web", {}).get("results", [])):
                documents.append(GradedDocument(
                    id=f"web_{i}",
                    text=result.get("description", ""),
                    source="web",
                    grade=DocumentGrade.AMBIGUOUS,
                    score=0.5
                ))
            return documents


# ─── Knowledge Refiner ─────────────────────────────────────────────────────────

class KnowledgeRefiner:
    """
    Refines retrieved knowledge by extracting relevant information.
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

    async def refine(
        self,
        query: str,
        documents: List[GradedDocument]
    ) -> str:
        """
        Refine knowledge by extracting query-relevant information.

        Args:
            query: User query
            documents: Documents to refine

        Returns:
            Refined knowledge string
        """
        if not documents:
            return ""

        if not self.api_key:
            # Simple fallback: concatenate document texts
            return "\n\n".join([doc.text for doc in documents])

        doc_texts = "\n\n---\n\n".join([
            f"Document {i+1} (Source: {doc.source}):\n{doc.text[:1000]}"
            for i, doc in enumerate(documents)
        ])

        prompt = f"""Extract and synthesize information relevant to the query from these documents.
Remove irrelevant information and focus only on what helps answer the query.

Query: {query}

Documents:
{doc_texts}

Refined Knowledge (include only relevant facts and information):"""

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
                        "temperature": 0.3,
                        "max_tokens": 1000,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.error(f"Knowledge refinement failed: {e}")
            return "\n\n".join([doc.text for doc in documents[:3]])


# ─── Corrective RAG Agent ──────────────────────────────────────────────────────

class CorrectiveRAGAgent:
    """
    Corrective RAG agent with knowledge refinement.

    Pipeline:
    1. Retrieve from local knowledge base
    2. Grade each document's relevance
    3. Decide action based on grades
    4. Execute action (use docs, refine, or web search)
    5. Generate response with refined knowledge
    """

    def __init__(
        self,
        retriever: Optional[Any] = None,
        web_search: Optional[WebSearchClient] = None,
        refiner: Optional[KnowledgeRefiner] = None,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        llm_model: str = "moonshot-v1-8k",
        correct_threshold: float = 0.7,
        ambiguous_threshold: float = 0.4
    ):
        self.retriever = retriever
        self.web_search = web_search or WebSearchClient()
        self.refiner = refiner or KnowledgeRefiner(llm_api_key=llm_api_key)

        self.api_key = llm_api_key or os.getenv("KIMI_API_KEY")
        self.base_url = llm_base_url
        self.model = llm_model

        self.correct_threshold = correct_threshold
        self.ambiguous_threshold = ambiguous_threshold

    async def _call_llm(
        self,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 500
    ) -> str:
        """Call LLM API."""
        if not self.api_key:
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

    async def _grade_document(
        self,
        query: str,
        document: str
    ) -> Tuple[DocumentGrade, float]:
        """
        Grade document relevance.

        Returns:
            Tuple of (grade, score)
        """
        prompt = f"""Rate the relevance of this document to the query on a scale of 0-10.

Query: {query}

Document: {document[:1000]}

Consider:
- Does the document directly address the query?
- Does it contain accurate, useful information?
- Is the information specific enough to answer the query?

Respond with ONLY a number from 0-10.
"""
        result = await self._call_llm(prompt, temperature=0)

        try:
            score = float(result.strip().split()[0]) / 10.0
        except Exception:
            score = 0.5

        if score >= self.correct_threshold:
            return DocumentGrade.CORRECT, score
        elif score >= self.ambiguous_threshold:
            return DocumentGrade.AMBIGUOUS, score
        else:
            return DocumentGrade.INCORRECT, score

    def _decide_action(
        self,
        graded_docs: List[GradedDocument]
    ) -> KnowledgeAction:
        """
        Decide action based on document grades.

        Returns:
            KnowledgeAction indicating what to do
        """
        if not graded_docs:
            return KnowledgeAction.WEB_SEARCH

        correct_count = sum(1 for d in graded_docs if d.grade == DocumentGrade.CORRECT)
        incorrect_count = sum(1 for d in graded_docs if d.grade == DocumentGrade.INCORRECT)
        total = len(graded_docs)

        # If most documents are correct, use them
        if correct_count >= total * 0.5:
            return KnowledgeAction.USE_RETRIEVED

        # If most documents are incorrect, search web
        if incorrect_count >= total * 0.5:
            return KnowledgeAction.WEB_SEARCH

        # Otherwise, refine what we have
        return KnowledgeAction.REFINE

    async def generate(self, query: str) -> CRAGResponse:
        """
        Generate response using Corrective RAG pipeline.

        Args:
            query: User query

        Returns:
            CRAGResponse with full metadata
        """
        local_docs: List[GradedDocument] = []
        web_docs: List[GradedDocument] = []

        # Step 1: Retrieve from local knowledge base
        if self.retriever:
            if hasattr(self.retriever, 'retrieve'):
                raw_docs = await self.retriever.retrieve(query, top_k=10)
            elif callable(self.retriever):
                raw_docs = self.retriever(query)
            else:
                raw_docs = []

            # Step 2: Grade each document
            for i, doc in enumerate(raw_docs):
                doc_text = doc.text if hasattr(doc, 'text') else str(doc)
                doc_id = doc.id if hasattr(doc, 'id') else f"local_{i}"

                grade, score = await self._grade_document(query, doc_text)

                local_docs.append(GradedDocument(
                    id=doc_id,
                    text=doc_text,
                    source="local",
                    grade=grade,
                    score=score
                ))

        # Step 3: Decide action
        action = self._decide_action(local_docs)

        # Step 4: Execute action
        docs_for_generation = []

        if action == KnowledgeAction.USE_RETRIEVED:
            # Use only correct documents
            docs_for_generation = [d for d in local_docs if d.grade == DocumentGrade.CORRECT]

        elif action == KnowledgeAction.WEB_SEARCH:
            # Search web for additional information
            web_docs = await self.web_search.search(query, num_results=5)

            # Grade web documents
            for doc in web_docs:
                grade, score = await self._grade_document(query, doc.text)
                doc.grade = grade
                doc.score = score

            # Use correct local docs + correct/ambiguous web docs
            docs_for_generation = [d for d in local_docs if d.grade == DocumentGrade.CORRECT]
            docs_for_generation.extend([
                d for d in web_docs
                if d.grade in [DocumentGrade.CORRECT, DocumentGrade.AMBIGUOUS]
            ])

        elif action == KnowledgeAction.REFINE:
            # Use correct + ambiguous documents
            docs_for_generation = [
                d for d in local_docs
                if d.grade in [DocumentGrade.CORRECT, DocumentGrade.AMBIGUOUS]
            ]

        # Step 5: Refine knowledge
        refined_knowledge = await self.refiner.refine(query, docs_for_generation)

        # Step 6: Generate response
        response = await self._generate_response(query, refined_knowledge)

        # Calculate confidence
        confidence = self._calculate_confidence(local_docs, web_docs, action)

        return CRAGResponse(
            response=response,
            local_documents=local_docs,
            web_documents=web_docs,
            action_taken=action,
            refined_knowledge=refined_knowledge,
            confidence=confidence
        )

    async def _generate_response(self, query: str, knowledge: str) -> str:
        """Generate response using refined knowledge."""
        if knowledge:
            prompt = f"""Answer the query using the provided knowledge.
Be accurate and cite specific information from the knowledge.

Knowledge:
{knowledge}

Query: {query}

Answer:"""
        else:
            prompt = f"""I don't have enough information to answer this query accurately.

Query: {query}

Please let the user know that you need more information, or provide what limited help you can:"""

        return await self._call_llm(prompt, temperature=0.7, max_tokens=500)

    def _calculate_confidence(
        self,
        local_docs: List[GradedDocument],
        web_docs: List[GradedDocument],
        action: KnowledgeAction
    ) -> float:
        """Calculate confidence score."""
        all_docs = local_docs + web_docs
        if not all_docs:
            return 0.3

        # Average score of all documents
        avg_score = sum(d.score for d in all_docs) / len(all_docs)

        # Bonus for having correct documents
        correct_ratio = sum(1 for d in all_docs if d.grade == DocumentGrade.CORRECT) / len(all_docs)

        # Penalty if web search was needed
        action_penalty = {
            KnowledgeAction.USE_RETRIEVED: 0.0,
            KnowledgeAction.REFINE: 0.1,
            KnowledgeAction.WEB_SEARCH: 0.2,
        }

        confidence = avg_score * 0.5 + correct_ratio * 0.5 - action_penalty.get(action, 0.1)
        return min(1.0, max(0.0, confidence))

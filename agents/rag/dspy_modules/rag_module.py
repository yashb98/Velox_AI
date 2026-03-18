"""
dspy_modules/rag_module.py — DSPy 2.6 RAG Modules for Velox AI

Implements:
- RAGModule: Basic RAG with Chain-of-Thought
- FactualRAGModule: RAG optimized for factuality
- MultiHopRAGModule: Multi-hop reasoning RAG
- GEPA optimization via optimize_anything API

Reference: docs/architecture/15-advanced-rag-architecture.md
"""

from __future__ import annotations

import os
import logging
from typing import Optional, List, Any
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Try to import DSPy, fall back to mock if not available
try:
    import dspy
    from dspy import Module, Signature, InputField, OutputField
    DSPY_AVAILABLE = True
except ImportError:
    DSPY_AVAILABLE = False
    logger.warning("DSPy not installed. Using mock implementations.")


# ─── Signatures ────────────────────────────────────────────────────────────────

if DSPY_AVAILABLE:
    class RAGSignature(Signature):
        """Answer questions using retrieved context."""
        context: str = InputField(desc="Retrieved documents as context")
        question: str = InputField(desc="User question to answer")
        answer: str = OutputField(desc="Factual answer grounded in context")

    class FactCheckSignature(Signature):
        """Verify if a claim is supported by evidence."""
        claim: str = InputField(desc="Claim to verify")
        evidence: str = InputField(desc="Evidence passages")
        verdict: str = OutputField(desc="SUPPORTED, REFUTED, or NOT_ENOUGH_INFO")
        explanation: str = OutputField(desc="Reasoning for the verdict")

    class QueryDecompositionSignature(Signature):
        """Break down complex questions into sub-questions."""
        question: str = InputField(desc="Complex question to decompose")
        sub_questions: List[str] = OutputField(desc="List of simpler sub-questions")

    class ReasoningSignature(Signature):
        """Perform step-by-step reasoning."""
        question: str = InputField(desc="Question requiring reasoning")
        context: str = InputField(desc="Available context and evidence")
        reasoning: str = OutputField(desc="Step-by-step reasoning chain")
        answer: str = OutputField(desc="Final answer based on reasoning")


# ─── Data Classes ──────────────────────────────────────────────────────────────

@dataclass
class RetrievedDocument:
    """Represents a retrieved document."""
    id: str
    text: str
    score: float
    source: str = "unknown"
    metadata: dict = field(default_factory=dict)


@dataclass
class RAGResponse:
    """Response from RAG module."""
    answer: str
    documents: List[RetrievedDocument]
    confidence: float = 0.0
    reasoning: Optional[str] = None
    citations: List[str] = field(default_factory=list)


# ─── Mock Retriever for Development ────────────────────────────────────────────

class MockRetriever:
    """Mock retriever for development/testing."""

    def __init__(self, k: int = 5):
        self.k = k

    def __call__(self, query: str) -> List[RetrievedDocument]:
        """Return mock documents."""
        return [
            RetrievedDocument(
                id=f"doc_{i}",
                text=f"Mock document {i} related to: {query[:50]}",
                score=1.0 - (i * 0.1),
                source="mock"
            )
            for i in range(self.k)
        ]


# ─── RAG Modules ───────────────────────────────────────────────────────────────

class RAGModule:
    """
    Basic RAG module with Chain-of-Thought reasoning.

    Usage:
        rag = RAGModule(retriever=my_retriever)
        response = rag.forward("What is the capital of France?")
    """

    def __init__(
        self,
        retriever: Optional[Any] = None,
        k: int = 5,
        llm_model: str = "moonshot-v1-8k"
    ):
        self.k = k
        self.retriever = retriever or MockRetriever(k=k)
        self.llm_model = llm_model

        if DSPY_AVAILABLE:
            # Configure DSPy with LLM
            self._setup_dspy()
            self.generate = dspy.ChainOfThought(RAGSignature)
        else:
            self.generate = None

    def _setup_dspy(self):
        """Configure DSPy with the appropriate LLM."""
        api_key = os.getenv("KIMI_API_KEY") or os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("KIMI_BASE_URL", "https://api.moonshot.cn/v1")

        if api_key:
            lm = dspy.LM(
                model=f"openai/{self.llm_model}",
                api_key=api_key,
                api_base=base_url,
            )
            dspy.configure(lm=lm)

    def forward(self, question: str, context: Optional[str] = None) -> RAGResponse:
        """
        Process a question through the RAG pipeline.

        Args:
            question: User question
            context: Optional pre-retrieved context

        Returns:
            RAGResponse with answer and metadata
        """
        # Retrieve documents if no context provided
        if context is None:
            docs = self.retriever(question)
            context = "\n\n".join([d.text for d in docs])
        else:
            docs = []

        # Generate answer
        if DSPY_AVAILABLE and self.generate:
            try:
                result = self.generate(context=context, question=question)
                answer = result.answer
            except Exception as e:
                logger.error(f"DSPy generation failed: {e}")
                answer = f"Unable to generate answer: {str(e)}"
        else:
            # Fallback for when DSPy is not available
            answer = f"[Mock] Answer to '{question}' based on context."

        return RAGResponse(
            answer=answer,
            documents=docs if isinstance(docs, list) else [],
            confidence=0.8,
            citations=[d.id for d in docs] if docs else []
        )


class FactualRAGModule(RAGModule):
    """
    RAG module optimized for factuality.
    Includes fact-checking step after generation.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if DSPY_AVAILABLE:
            self.fact_checker = dspy.Predict(FactCheckSignature)
        else:
            self.fact_checker = None

    def forward(self, question: str, context: Optional[str] = None) -> RAGResponse:
        """Generate factual answer with verification."""
        # Get base response
        response = super().forward(question, context)

        # Verify factuality
        if self.fact_checker and response.documents:
            try:
                evidence = "\n".join([d.text for d in response.documents[:3]])
                verification = self.fact_checker(
                    claim=response.answer,
                    evidence=evidence
                )

                # Adjust confidence based on verification
                if verification.verdict == "SUPPORTED":
                    response.confidence = min(1.0, response.confidence + 0.15)
                elif verification.verdict == "REFUTED":
                    response.confidence = max(0.0, response.confidence - 0.3)
                    response.answer = f"[LOW CONFIDENCE] {response.answer}"

                response.reasoning = verification.explanation
            except Exception as e:
                logger.warning(f"Fact checking failed: {e}")

        return response


class MultiHopRAGModule(RAGModule):
    """
    Multi-hop RAG for complex questions requiring multiple retrieval steps.
    Decomposes questions and retrieves evidence iteratively.
    """

    def __init__(self, max_hops: int = 3, **kwargs):
        super().__init__(**kwargs)
        self.max_hops = max_hops
        if DSPY_AVAILABLE:
            self.decomposer = dspy.Predict(QueryDecompositionSignature)
            self.reasoner = dspy.ChainOfThought(ReasoningSignature)
        else:
            self.decomposer = None
            self.reasoner = None

    def forward(self, question: str, context: Optional[str] = None) -> RAGResponse:
        """Process complex question with multi-hop retrieval."""
        all_docs = []
        all_context = context or ""

        if self.decomposer:
            try:
                # Decompose the question
                decomposition = self.decomposer(question=question)
                sub_questions = decomposition.sub_questions

                # Retrieve for each sub-question
                for sub_q in sub_questions[:self.max_hops]:
                    docs = self.retriever(sub_q)
                    all_docs.extend(docs)
                    all_context += "\n\n" + "\n".join([d.text for d in docs])

            except Exception as e:
                logger.warning(f"Decomposition failed: {e}")
                # Fall back to single retrieval
                docs = self.retriever(question)
                all_docs = docs
                all_context = "\n".join([d.text for d in docs])

        # Generate final answer with reasoning
        if self.reasoner:
            try:
                result = self.reasoner(question=question, context=all_context)
                return RAGResponse(
                    answer=result.answer,
                    documents=all_docs,
                    confidence=0.85,
                    reasoning=result.reasoning,
                    citations=[d.id for d in all_docs]
                )
            except Exception as e:
                logger.error(f"Reasoning failed: {e}")

        # Fallback to base implementation
        return super().forward(question, all_context)


# ─── GEPA Optimization ─────────────────────────────────────────────────────────

class RAGOptimizer:
    """
    DSPy optimizer for RAG modules using GEPA (Genetic-Pareto) or MIPROv2.

    Usage:
        optimizer = RAGOptimizer()
        optimized_module = optimizer.optimize(
            module=RAGModule(),
            trainset=training_data,
            metric=faithfulness_metric
        )
    """

    def __init__(self, strategy: str = "miprov2"):
        """
        Initialize optimizer.

        Args:
            strategy: "miprov2" (stable) or "gepa" (experimental)
        """
        self.strategy = strategy

    def optimize(
        self,
        module: RAGModule,
        trainset: List[dict],
        metric: callable,
        num_candidates: int = 10
    ) -> RAGModule:
        """
        Optimize a RAG module using DSPy.

        Args:
            module: RAG module to optimize
            trainset: Training examples as list of dicts
            metric: Evaluation metric function
            num_candidates: Number of prompt candidates

        Returns:
            Optimized RAG module
        """
        if not DSPY_AVAILABLE:
            logger.warning("DSPy not available. Returning original module.")
            return module

        try:
            if self.strategy == "gepa":
                # GEPA optimization (DSPy 2.6 experimental)
                # Uses optimize_anything API with multi-objective optimization
                from dspy.optimizers import optimize_anything

                optimized = optimize_anything(
                    module=module,
                    trainset=trainset,
                    metric=metric,
                    objectives=["accuracy", "cost"],
                    strategy="pareto",
                    num_generations=num_candidates,
                )
            else:
                # MIPROv2 optimization (stable)
                from dspy.teleprompt import MIPROv2

                optimizer = MIPROv2(
                    metric=metric,
                    num_candidates=num_candidates,
                    init_temperature=1.0,
                )
                optimized = optimizer.compile(module, trainset=trainset)

            return optimized

        except Exception as e:
            logger.error(f"Optimization failed: {e}")
            return module


# ─── Metrics for Optimization ──────────────────────────────────────────────────

def faithfulness_metric(example: dict, prediction: RAGResponse) -> float:
    """
    Measure faithfulness of answer to retrieved context.

    Args:
        example: Ground truth example
        prediction: RAG module prediction

    Returns:
        Faithfulness score 0-1
    """
    # Simple implementation - can be enhanced with NLI model
    answer = prediction.answer.lower()
    context = " ".join([d.text.lower() for d in prediction.documents])

    # Check overlap between answer and context
    answer_words = set(answer.split())
    context_words = set(context.split())

    if not answer_words:
        return 0.0

    overlap = len(answer_words & context_words)
    score = overlap / len(answer_words)

    return min(1.0, score)


def relevancy_metric(example: dict, prediction: RAGResponse) -> float:
    """
    Measure relevancy of answer to question.

    Args:
        example: Ground truth example with 'question' field
        prediction: RAG module prediction

    Returns:
        Relevancy score 0-1
    """
    question = example.get("question", "").lower()
    answer = prediction.answer.lower()

    # Simple keyword overlap
    q_words = set(question.split())
    a_words = set(answer.split())

    if not q_words:
        return 0.0

    overlap = len(q_words & a_words)
    return min(1.0, overlap / len(q_words) * 2)


# ─── Factory Function ──────────────────────────────────────────────────────────

def create_rag_module(
    module_type: str = "basic",
    retriever: Optional[Any] = None,
    **kwargs
) -> RAGModule:
    """
    Factory function to create RAG modules.

    Args:
        module_type: "basic", "factual", or "multihop"
        retriever: Document retriever instance
        **kwargs: Additional arguments for module

    Returns:
        Configured RAG module
    """
    modules = {
        "basic": RAGModule,
        "factual": FactualRAGModule,
        "multihop": MultiHopRAGModule,
    }

    module_class = modules.get(module_type, RAGModule)
    return module_class(retriever=retriever, **kwargs)

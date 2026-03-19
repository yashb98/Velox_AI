"""
guardrails/anti_hallucination.py — Anti-Hallucination Guardrails

Implements:
- Query abstention classifier (detects unanswerable queries)
- Retrieval confidence gate (refuses if chunks score too low)
- Semantic entropy probes (uncertainty detection)
- Citation enforcement (NLI-based)
- Fact verification pipeline
- Calibrated abstention
- Confidence scoring

Target: <3% hallucination rate on in-domain queries

Reference: docs/architecture/15-advanced-rag-architecture.md
"""

from __future__ import annotations

import os
import logging
import re
import asyncio
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any
from enum import Enum

import httpx

logger = logging.getLogger(__name__)

# ─── Default Thresholds ───────────────────────────────────────────────────────

# Retrieval confidence: if best chunk < this, abstain
RETRIEVAL_CONFIDENCE_THRESHOLD = float(os.getenv("RETRIEVAL_CONFIDENCE_THRESHOLD", "0.65"))

# Minimum chunks required for confident answer
MIN_SUPPORTING_CHUNKS = int(os.getenv("MIN_SUPPORTING_CHUNKS", "2"))

# Entropy threshold for semantic entropy probe
ENTROPY_THRESHOLD = float(os.getenv("ENTROPY_THRESHOLD", "0.7"))

# Entailment threshold for citation enforcement
ENTAILMENT_THRESHOLD = float(os.getenv("ENTAILMENT_THRESHOLD", "0.7"))

# Abstention thresholds
ABSTENTION_CONFIDENCE_THRESHOLD = float(os.getenv("ABSTENTION_CONFIDENCE_THRESHOLD", "0.5"))
ABSTENTION_VERIFICATION_THRESHOLD = float(os.getenv("ABSTENTION_VERIFICATION_THRESHOLD", "0.6"))


# ─── Enums ─────────────────────────────────────────────────────────────────────

class EntailmentLabel(Enum):
    ENTAILMENT = "entailment"
    CONTRADICTION = "contradiction"
    NEUTRAL = "neutral"


class VerificationVerdict(Enum):
    SUPPORTED = "supported"
    REFUTED = "refuted"
    NOT_ENOUGH_INFO = "not_enough_info"


# ─── Data Classes ──────────────────────────────────────────────────────────────

@dataclass
class Claim:
    """Extracted claim from response."""
    text: str
    span_start: int = 0
    span_end: int = 0
    verdict: VerificationVerdict = VerificationVerdict.NOT_ENOUGH_INFO
    supporting_evidence: List[str] = field(default_factory=list)
    confidence: float = 0.0


@dataclass
class CitedResponse:
    """Response with span-level citations."""
    text: str
    claims: List[Claim]
    citations: Dict[str, str]  # claim_id -> doc_id
    unverified_count: int = 0
    overall_confidence: float = 0.0


@dataclass
class GuardrailResult:
    """Result from guardrail checks."""
    passed: bool
    response: str
    confidence: float
    checks_run: List[str]
    issues: List[str] = field(default_factory=list)
    should_abstain: bool = False
    abstention_reason: str = ""
    abstention_message: str = ""


@dataclass
class RetrievalResult:
    """Result from retrieval with scores."""
    chunks: List[Dict[str, Any]]
    scores: List[float]
    best_score: float
    avg_score: float
    num_above_threshold: int


# ─── Query Abstention Classifier ──────────────────────────────────────────────

class QueryAbstentionClassifier:
    """
    Detects unanswerable queries BEFORE spending tokens on generation.

    Uses lightweight classification to identify:
    - Out-of-domain queries (not covered by knowledge base)
    - Impossible requests (predictions, opinions, future events)
    - Ambiguous queries needing clarification

    Target latency: <30ms (runs in parallel with T0 router)
    """

    def __init__(
        self,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        llm_model: str = "moonshot-v1-8k",
    ):
        self.api_key = llm_api_key or os.getenv("KIMI_API_KEY")
        self.base_url = llm_base_url
        self.model = llm_model

        # Patterns that indicate unanswerable queries
        self.impossible_patterns = [
            r"\b(predict|forecast|will happen|future)\b",
            r"\b(stock price|bitcoin|crypto)\b.*\b(will|going to)\b",
            r"\b(opinion|think|feel|believe)\b.*\b(should|best)\b",
            r"\b(lottery|gambling|bet)\b",
        ]

        # Patterns that need clarification
        self.ambiguous_patterns = [
            r"^(it|that|this|they)\b",  # Unclear reference
            r"\b(something|anything|whatever)\b",  # Vague request
        ]

    def _quick_pattern_check(self, query: str) -> Tuple[bool, str]:
        """Fast regex-based check for obviously unanswerable queries."""
        query_lower = query.lower()

        for pattern in self.impossible_patterns:
            if re.search(pattern, query_lower, re.IGNORECASE):
                return True, "Query asks for predictions or opinions that cannot be answered factually"

        return False, ""

    def _check_ambiguity(self, query: str) -> Tuple[bool, str]:
        """Check if query is too ambiguous to answer."""
        for pattern in self.ambiguous_patterns:
            if re.search(pattern, query.lower()):
                return True, "Query is ambiguous and needs clarification"

        # Very short queries are often ambiguous
        if len(query.split()) < 3:
            return True, "Query is too short to determine intent"

        return False, ""

    async def classify(
        self,
        query: str,
        available_topics: Optional[List[str]] = None,
    ) -> Tuple[bool, float, str]:
        """
        Classify whether a query can be answered.

        Args:
            query: User's question
            available_topics: Optional list of topics in the knowledge base

        Returns:
            Tuple of (should_abstain, confidence, reason)
        """
        # Fast pattern check first
        should_abstain, reason = self._quick_pattern_check(query)
        if should_abstain:
            return True, 0.95, reason

        # Check ambiguity
        is_ambiguous, reason = self._check_ambiguity(query)
        if is_ambiguous:
            return True, 0.7, reason

        # If no API key, rely on pattern checks only
        if not self.api_key:
            return False, 0.5, ""

        # Use LLM for more nuanced classification
        topic_context = ""
        if available_topics:
            topic_context = f"\nKnowledge base covers: {', '.join(available_topics[:10])}"

        prompt = f"""Classify if this query can be answered factually from a business knowledge base.

Query: {query}
{topic_context}

Respond with ONE line:
ANSWERABLE - if the query asks for factual information that could be in a knowledge base
UNANSWERABLE - if the query asks for predictions, opinions, or information unlikely to be documented
CLARIFY - if the query is too vague or ambiguous

Classification:"""

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
                result = resp.json()["choices"][0]["message"]["content"].upper()

                if "UNANSWERABLE" in result:
                    return True, 0.85, "Query classified as unanswerable by knowledge base"
                elif "CLARIFY" in result:
                    return True, 0.75, "Query needs clarification before answering"
                else:
                    return False, 0.85, ""

        except Exception as e:
            logger.warning(f"Query classification failed: {e}")
            return False, 0.5, ""


# ─── Retrieval Confidence Gate ────────────────────────────────────────────────

class RetrievalConfidenceGate:
    """
    Gates response generation based on retrieval quality.

    If retrieved chunks don't meet confidence thresholds, abstains
    rather than generating a potentially hallucinated response.

    This is the MOST IMPORTANT guardrail for preventing hallucinations
    when the answer isn't in the knowledge base.
    """

    def __init__(
        self,
        min_confidence: float = RETRIEVAL_CONFIDENCE_THRESHOLD,
        min_chunks: int = MIN_SUPPORTING_CHUNKS,
        score_key: str = "score",
    ):
        self.min_confidence = min_confidence
        self.min_chunks = min_chunks
        self.score_key = score_key

    def analyze_retrieval(
        self,
        chunks: List[Dict[str, Any]],
        score_key: Optional[str] = None,
    ) -> RetrievalResult:
        """Analyze retrieval results for confidence metrics."""
        key = score_key or self.score_key

        scores = []
        for chunk in chunks:
            score = chunk.get(key, chunk.get("similarity", chunk.get("relevance", 0.0)))
            if isinstance(score, (int, float)):
                scores.append(float(score))

        if not scores:
            return RetrievalResult(
                chunks=chunks,
                scores=[],
                best_score=0.0,
                avg_score=0.0,
                num_above_threshold=0,
            )

        return RetrievalResult(
            chunks=chunks,
            scores=scores,
            best_score=max(scores),
            avg_score=sum(scores) / len(scores),
            num_above_threshold=sum(1 for s in scores if s >= self.min_confidence),
        )

    def should_abstain(
        self,
        chunks: List[Dict[str, Any]],
        query: Optional[str] = None,
    ) -> Tuple[bool, float, str]:
        """
        Decide whether to abstain based on retrieval quality.

        Args:
            chunks: Retrieved chunks with scores
            query: Original query (for logging)

        Returns:
            Tuple of (should_abstain, confidence, reason)
        """
        if not chunks:
            return True, 0.95, "No documents retrieved from knowledge base"

        result = self.analyze_retrieval(chunks)

        # Gate 1: Best chunk must meet threshold
        if result.best_score < self.min_confidence:
            return True, 0.9, (
                f"Best retrieval score ({result.best_score:.2f}) below threshold "
                f"({self.min_confidence:.2f}) — answer may not be in knowledge base"
            )

        # Gate 2: Need minimum supporting chunks
        if result.num_above_threshold < self.min_chunks:
            return True, 0.8, (
                f"Only {result.num_above_threshold} chunks above threshold "
                f"(need {self.min_chunks}) — insufficient supporting evidence"
            )

        # Gate 3: Average score shouldn't be too low
        if result.avg_score < self.min_confidence * 0.7:
            return True, 0.7, (
                f"Average retrieval score ({result.avg_score:.2f}) too low — "
                f"results may be marginally relevant"
            )

        # Passed all gates
        confidence = min(result.best_score, result.avg_score + 0.1)
        return False, confidence, ""

    def get_abstention_message(self, reason: str) -> str:
        """Generate a user-friendly abstention message."""
        return (
            "I don't have enough reliable information in my knowledge base to answer "
            "that question accurately. Would you like me to transfer you to someone "
            "who can help, or can I assist with something else?"
        )


# ─── Semantic Entropy Probe ────────────────────────────────────────────────────

class SemanticEntropyProbe:
    """
    Lightweight hallucination detection via response variability.
    High entropy in multiple generations = potential hallucination.
    """

    def __init__(
        self,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        llm_model: str = "moonshot-v1-8k",
        num_samples: int = 3,
        entropy_threshold: float = 0.7
    ):
        self.api_key = llm_api_key or os.getenv("KIMI_API_KEY")
        self.base_url = llm_base_url
        self.model = llm_model
        self.num_samples = num_samples
        self.entropy_threshold = entropy_threshold

    async def _generate_sample(self, prompt: str, temperature: float) -> str:
        """Generate one response sample."""
        if not self.api_key:
            return f"[Mock sample at temp={temperature}]"

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
                        "max_tokens": 300,
                    },
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logger.error(f"Sample generation failed: {e}")
            return ""

    def _compute_similarity(self, text1: str, text2: str) -> float:
        """Simple word overlap similarity."""
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        if not words1 or not words2:
            return 0.0
        intersection = len(words1 & words2)
        union = len(words1 | words2)
        return intersection / union if union > 0 else 0.0

    async def compute_entropy(self, query: str, context: str = "") -> Tuple[float, List[str]]:
        """
        Compute semantic entropy by generating multiple samples.
        High disagreement = high entropy = potential hallucination.
        """
        prompt = f"Context: {context}\n\nQuestion: {query}\n\nAnswer:" if context else query

        # Generate samples at different temperatures
        samples = []
        for temp in [0.3, 0.7, 1.0][:self.num_samples]:
            sample = await self._generate_sample(prompt, temp)
            if sample:
                samples.append(sample)

        if len(samples) < 2:
            return 0.5, samples

        # Compute pairwise similarities
        similarities = []
        for i in range(len(samples)):
            for j in range(i + 1, len(samples)):
                sim = self._compute_similarity(samples[i], samples[j])
                similarities.append(sim)

        # Entropy = 1 - average similarity (high similarity = low entropy)
        avg_similarity = sum(similarities) / len(similarities)
        entropy = 1.0 - avg_similarity

        return entropy, samples

    async def should_abstain(self, query: str, context: str = "") -> Tuple[bool, float, str]:
        """Check if model should abstain due to high uncertainty."""
        entropy, samples = await self.compute_entropy(query, context)

        if entropy > self.entropy_threshold:
            return True, entropy, "High semantic entropy detected - responses vary significantly"
        return False, entropy, ""


# ─── Citation Enforcer ─────────────────────────────────────────────────────────

class CitationEnforcer:
    """
    Ensures every claim is backed by evidence.
    Uses NLI-style entailment checking.
    """

    def __init__(
        self,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        llm_model: str = "moonshot-v1-8k",
        entailment_threshold: float = 0.7
    ):
        self.api_key = llm_api_key or os.getenv("KIMI_API_KEY")
        self.base_url = llm_base_url
        self.model = llm_model
        self.entailment_threshold = entailment_threshold

    def _split_into_claims(self, text: str) -> List[Claim]:
        """Split response into individual claims."""
        # Split by sentence
        sentences = re.split(r'(?<=[.!?])\s+', text)
        claims = []
        pos = 0

        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) > 10:  # Skip very short sentences
                start = text.find(sentence, pos)
                claims.append(Claim(
                    text=sentence,
                    span_start=start,
                    span_end=start + len(sentence)
                ))
                pos = start + len(sentence)

        return claims

    async def _check_entailment(self, premise: str, hypothesis: str) -> Tuple[EntailmentLabel, float]:
        """Check if premise entails hypothesis using LLM."""
        if not self.api_key:
            return EntailmentLabel.NEUTRAL, 0.5

        prompt = f"""Determine if the premise supports the hypothesis.

Premise (evidence): {premise[:500]}

Hypothesis (claim): {hypothesis}

Does the premise SUPPORT, CONTRADICT, or provide NO INFORMATION about the hypothesis?
Respond with only one word: SUPPORT, CONTRADICT, or NEUTRAL"""

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
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
                result = resp.json()["choices"][0]["message"]["content"].upper()

                if "SUPPORT" in result:
                    return EntailmentLabel.ENTAILMENT, 0.9
                elif "CONTRADICT" in result:
                    return EntailmentLabel.CONTRADICTION, 0.9
                else:
                    return EntailmentLabel.NEUTRAL, 0.5

        except Exception as e:
            logger.error(f"Entailment check failed: {e}")
            return EntailmentLabel.NEUTRAL, 0.3

    async def enforce_citations(
        self,
        response: str,
        evidence: List[Dict[str, str]]
    ) -> CitedResponse:
        """Add citations to response claims."""
        claims = self._split_into_claims(response)
        citations = {}
        unverified_count = 0

        for i, claim in enumerate(claims):
            best_evidence = None
            best_score = 0.0
            best_label = EntailmentLabel.NEUTRAL

            # Check against each evidence document
            for doc in evidence[:5]:  # Limit for efficiency
                doc_text = doc.get("text", str(doc))
                label, score = await self._check_entailment(doc_text, claim.text)

                if label == EntailmentLabel.ENTAILMENT and score > best_score:
                    best_score = score
                    best_evidence = doc
                    best_label = label

            # Update claim
            if best_label == EntailmentLabel.ENTAILMENT and best_score >= self.entailment_threshold:
                claim.verdict = VerificationVerdict.SUPPORTED
                claim.confidence = best_score
                claim.supporting_evidence = [best_evidence.get("id", "doc")]
                citations[f"claim_{i}"] = best_evidence.get("id", "doc")
            else:
                claim.verdict = VerificationVerdict.NOT_ENOUGH_INFO
                claim.confidence = best_score
                unverified_count += 1

        # Calculate overall confidence
        if claims:
            overall = sum(c.confidence for c in claims) / len(claims)
        else:
            overall = 0.5

        return CitedResponse(
            text=response,
            claims=claims,
            citations=citations,
            unverified_count=unverified_count,
            overall_confidence=overall
        )


# ─── Fact Verifier ─────────────────────────────────────────────────────────────

class FactVerifier:
    """
    Verifies factual claims against evidence.
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

    async def verify_claim(
        self,
        claim: str,
        evidence: List[str]
    ) -> Tuple[VerificationVerdict, str]:
        """Verify a single claim against evidence."""
        if not self.api_key or not evidence:
            return VerificationVerdict.NOT_ENOUGH_INFO, "No API key or evidence"

        evidence_text = "\n".join([f"- {e[:300]}" for e in evidence[:5]])

        prompt = f"""Verify this claim against the evidence.

Claim: {claim}

Evidence:
{evidence_text}

Verdict (choose one):
- SUPPORTED: Evidence directly supports the claim
- REFUTED: Evidence contradicts the claim
- NOT_ENOUGH_INFO: Evidence doesn't address the claim

Respond with: VERDICT: [choice] | REASON: [brief explanation]"""

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
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
                        "max_tokens": 100,
                    },
                )
                resp.raise_for_status()
                result = resp.json()["choices"][0]["message"]["content"]

                if "SUPPORTED" in result.upper():
                    verdict = VerificationVerdict.SUPPORTED
                elif "REFUTED" in result.upper():
                    verdict = VerificationVerdict.REFUTED
                else:
                    verdict = VerificationVerdict.NOT_ENOUGH_INFO

                reason = result.split("REASON:")[-1].strip() if "REASON:" in result else ""
                return verdict, reason

        except Exception as e:
            logger.error(f"Verification failed: {e}")
            return VerificationVerdict.NOT_ENOUGH_INFO, str(e)


# ─── Calibrated Abstention ─────────────────────────────────────────────────────

class CalibratedAbstention:
    """
    Decides when to abstain from answering.
    Uses multiple signals: entropy, verification, confidence.
    """

    def __init__(
        self,
        confidence_threshold: float = 0.5,
        verification_threshold: float = 0.6,
        entropy_threshold: float = 0.7
    ):
        self.confidence_threshold = confidence_threshold
        self.verification_threshold = verification_threshold
        self.entropy_threshold = entropy_threshold

        self.abstention_messages = [
            "I don't have enough reliable information to answer accurately.",
            "Based on the available evidence, I cannot provide a confident answer.",
            "I'm uncertain about this - please consult authoritative sources.",
        ]

    def should_abstain(
        self,
        confidence: float,
        verification_ratio: float,
        entropy: float
    ) -> Tuple[bool, str]:
        """Multi-factor abstention decision."""
        reasons = []

        if confidence < self.confidence_threshold:
            reasons.append(f"low confidence ({confidence:.0%})")

        if verification_ratio < self.verification_threshold:
            reasons.append(f"insufficient verification ({verification_ratio:.0%})")

        if entropy > self.entropy_threshold:
            reasons.append(f"high uncertainty ({entropy:.0%})")

        if len(reasons) >= 2:
            return True, f"Abstaining due to: {', '.join(reasons)}"

        return False, ""


# ─── Combined Guardrail Pipeline ───────────────────────────────────────────────

# Voice-friendly abstention messages
ABSTENTION_MESSAGES = {
    "no_retrieval": (
        "I don't have that information in my knowledge base. "
        "Would you like me to transfer you to someone who can help?"
    ),
    "low_confidence": (
        "I'm not confident I have accurate information about that. "
        "Let me connect you with someone who can give you a definite answer."
    ),
    "out_of_scope": (
        "That's outside what I can help with. "
        "Would you like me to transfer you to a specialist?"
    ),
    "ambiguous": (
        "I want to make sure I help you correctly. "
        "Could you tell me a bit more about what you're looking for?"
    ),
    "default": (
        "I don't have enough reliable information to answer that accurately. "
        "Would you like me to transfer you to someone who can help, "
        "or can I assist with something else?"
    ),
}


class AntiHallucinationGuardrail:
    """
    Combined guardrail pipeline for anti-hallucination.

    Implements a multi-stage defense:
    1. Query Abstention - catch unanswerable queries early
    2. Retrieval Confidence - gate on chunk quality
    3. Semantic Entropy - detect uncertain responses
    4. Citation Enforcement - verify claims against evidence
    5. Calibrated Abstention - final decision

    Target: <3% hallucination rate on in-domain queries
    """

    def __init__(
        self,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        enable_query_classifier: bool = True,
        enable_retrieval_gate: bool = True,
        enable_entropy_check: bool = True,
        enable_citation_check: bool = True,
        enable_fact_verification: bool = False,  # Expensive, off by default
        retrieval_confidence_threshold: float = RETRIEVAL_CONFIDENCE_THRESHOLD,
        min_supporting_chunks: int = MIN_SUPPORTING_CHUNKS,
    ):
        kwargs = {"llm_api_key": llm_api_key, "llm_base_url": llm_base_url}

        # Pre-generation guardrails (fast, run before LLM call)
        self.query_classifier = QueryAbstentionClassifier(**kwargs) if enable_query_classifier else None
        self.retrieval_gate = RetrievalConfidenceGate(
            min_confidence=retrieval_confidence_threshold,
            min_chunks=min_supporting_chunks,
        ) if enable_retrieval_gate else None

        # Post-generation guardrails (run after LLM generates response)
        self.entropy_probe = SemanticEntropyProbe(**kwargs) if enable_entropy_check else None
        self.citation_enforcer = CitationEnforcer(**kwargs) if enable_citation_check else None
        self.fact_verifier = FactVerifier(**kwargs) if enable_fact_verification else None
        self.abstention = CalibratedAbstention()

    async def check_query(
        self,
        query: str,
        available_topics: Optional[List[str]] = None,
    ) -> Tuple[bool, float, str, str]:
        """
        Pre-generation check: should we even attempt to answer?

        Returns:
            Tuple of (should_abstain, confidence, reason, abstention_message)
        """
        if not self.query_classifier:
            return False, 1.0, "", ""

        should_abstain, confidence, reason = await self.query_classifier.classify(
            query, available_topics
        )

        if should_abstain:
            if "ambiguous" in reason.lower() or "clarification" in reason.lower():
                message = ABSTENTION_MESSAGES["ambiguous"]
            elif "unanswerable" in reason.lower() or "prediction" in reason.lower():
                message = ABSTENTION_MESSAGES["out_of_scope"]
            else:
                message = ABSTENTION_MESSAGES["default"]
            return True, confidence, reason, message

        return False, confidence, "", ""

    def check_retrieval(
        self,
        chunks: List[Dict[str, Any]],
        query: Optional[str] = None,
    ) -> Tuple[bool, float, str, str]:
        """
        Pre-generation check: is retrieval quality sufficient?

        Returns:
            Tuple of (should_abstain, confidence, reason, abstention_message)
        """
        if not self.retrieval_gate:
            return False, 1.0, "", ""

        should_abstain, confidence, reason = self.retrieval_gate.should_abstain(chunks, query)

        if should_abstain:
            if "no documents" in reason.lower():
                message = ABSTENTION_MESSAGES["no_retrieval"]
            else:
                message = ABSTENTION_MESSAGES["low_confidence"]
            return True, confidence, reason, message

        return False, confidence, "", ""

    async def check_response(
        self,
        query: str,
        response: str,
        evidence: List[Dict[str, str]],
        context: str = "",
        skip_expensive: bool = False,
    ) -> GuardrailResult:
        """
        Post-generation check: is the response reliable?

        Args:
            query: Original user query
            response: LLM-generated response
            evidence: Retrieved chunks used for generation
            context: Additional context
            skip_expensive: If True, skip entropy check (for latency)

        Returns:
            GuardrailResult with pass/fail and confidence
        """
        checks_run = []
        issues = []
        confidence = 0.7
        entropy = 0.0
        verification_ratio = 1.0

        # 1. Entropy check (can be skipped for voice latency)
        if self.entropy_probe and not skip_expensive:
            checks_run.append("semantic_entropy")
            try:
                should_abstain_entropy, entropy, reason = await self.entropy_probe.should_abstain(
                    query, context
                )
                if should_abstain_entropy:
                    issues.append(reason)
            except Exception as e:
                logger.warning(f"Entropy check failed: {e}")

        # 2. Citation enforcement
        if self.citation_enforcer and evidence:
            checks_run.append("citation_enforcement")
            try:
                cited = await self.citation_enforcer.enforce_citations(response, evidence)
                confidence = cited.overall_confidence

                if cited.unverified_count > len(cited.claims) / 2:
                    issues.append(f"{cited.unverified_count} claims lack citation support")

                total = len(cited.claims)
                verified = total - cited.unverified_count
                verification_ratio = verified / total if total > 0 else 0
            except Exception as e:
                logger.warning(f"Citation check failed: {e}")

        # 3. Abstention decision
        should_abstain, abstention_reason = self.abstention.should_abstain(
            confidence, verification_ratio, entropy
        )

        # Generate appropriate message
        if should_abstain:
            abstention_message = ABSTENTION_MESSAGES["low_confidence"]
        else:
            abstention_message = ""

        return GuardrailResult(
            passed=not should_abstain and len(issues) == 0,
            response=response,
            confidence=confidence,
            checks_run=checks_run,
            issues=issues,
            should_abstain=should_abstain,
            abstention_reason=abstention_reason,
            abstention_message=abstention_message,
        )

    async def check(
        self,
        query: str,
        response: str,
        evidence: List[Dict[str, str]],
        context: str = ""
    ) -> GuardrailResult:
        """
        Legacy method: Run all post-generation guardrail checks.
        For backward compatibility.
        """
        return await self.check_response(query, response, evidence, context)

    async def full_check(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        response: str,
        context: str = "",
        available_topics: Optional[List[str]] = None,
        skip_expensive: bool = False,
    ) -> GuardrailResult:
        """
        Run the complete guardrail pipeline.

        This is the recommended method for full protection.
        Runs both pre-generation and post-generation checks.
        """
        checks_run = []
        issues = []

        # 1. Query abstention check
        query_abstain, query_conf, query_reason, query_msg = await self.check_query(
            query, available_topics
        )
        if query_abstain:
            checks_run.append("query_abstention")
            return GuardrailResult(
                passed=False,
                response=query_msg,
                confidence=query_conf,
                checks_run=checks_run,
                issues=[query_reason],
                should_abstain=True,
                abstention_reason=query_reason,
                abstention_message=query_msg,
            )

        # 2. Retrieval confidence check
        retrieval_abstain, retrieval_conf, retrieval_reason, retrieval_msg = self.check_retrieval(
            chunks, query
        )
        if retrieval_abstain:
            checks_run.append("retrieval_confidence")
            return GuardrailResult(
                passed=False,
                response=retrieval_msg,
                confidence=retrieval_conf,
                checks_run=checks_run,
                issues=[retrieval_reason],
                should_abstain=True,
                abstention_reason=retrieval_reason,
                abstention_message=retrieval_msg,
            )

        # 3. Post-generation checks
        evidence = [{"text": c.get("content", c.get("text", str(c)))} for c in chunks]
        result = await self.check_response(
            query, response, evidence, context, skip_expensive
        )

        # Merge check names
        result.checks_run = checks_run + result.checks_run

        return result


# ─── Convenience Functions ────────────────────────────────────────────────────


async def check_before_generation(
    query: str,
    chunks: List[Dict[str, Any]],
    available_topics: Optional[List[str]] = None,
) -> Tuple[bool, str, float]:
    """
    Quick pre-generation check. Use this before calling LLM.

    Returns:
        Tuple of (should_proceed, abstention_message, confidence)
    """
    guardrail = AntiHallucinationGuardrail(
        enable_entropy_check=False,
        enable_citation_check=False,
    )

    # Check query
    query_abstain, _, _, query_msg = await guardrail.check_query(query, available_topics)
    if query_abstain:
        return False, query_msg, 0.0

    # Check retrieval
    retrieval_abstain, conf, _, retrieval_msg = guardrail.check_retrieval(chunks, query)
    if retrieval_abstain:
        return False, retrieval_msg, conf

    return True, "", conf


async def check_after_generation(
    query: str,
    response: str,
    chunks: List[Dict[str, Any]],
    skip_expensive: bool = True,
) -> GuardrailResult:
    """
    Post-generation check. Use this after LLM generates response.

    For voice, set skip_expensive=True to minimize latency.
    """
    guardrail = AntiHallucinationGuardrail(
        enable_query_classifier=False,
        enable_retrieval_gate=False,
        enable_entropy_check=not skip_expensive,
    )

    evidence = [{"text": c.get("content", c.get("text", str(c)))} for c in chunks]
    return await guardrail.check_response(query, response, evidence, skip_expensive=skip_expensive)

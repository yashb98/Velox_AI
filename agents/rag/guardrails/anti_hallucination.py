"""
guardrails/anti_hallucination.py — Anti-Hallucination Guardrails

Implements:
- Semantic entropy probes (uncertainty detection)
- Citation enforcement (NLI-based)
- Fact verification pipeline
- Calibrated abstention
- Confidence scoring

Reference: docs/architecture/15-advanced-rag-architecture.md
"""

from __future__ import annotations

import os
import logging
import re
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from enum import Enum

import httpx

logger = logging.getLogger(__name__)


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

class AntiHallucinationGuardrail:
    """
    Combined guardrail pipeline for anti-hallucination.
    """

    def __init__(
        self,
        llm_api_key: Optional[str] = None,
        llm_base_url: str = "https://api.moonshot.cn/v1",
        enable_entropy_check: bool = True,
        enable_citation_check: bool = True,
        enable_fact_verification: bool = True
    ):
        kwargs = {"llm_api_key": llm_api_key, "llm_base_url": llm_base_url}

        self.entropy_probe = SemanticEntropyProbe(**kwargs) if enable_entropy_check else None
        self.citation_enforcer = CitationEnforcer(**kwargs) if enable_citation_check else None
        self.fact_verifier = FactVerifier(**kwargs) if enable_fact_verification else None
        self.abstention = CalibratedAbstention()

    async def check(
        self,
        query: str,
        response: str,
        evidence: List[Dict[str, str]],
        context: str = ""
    ) -> GuardrailResult:
        """Run all guardrail checks."""
        checks_run = []
        issues = []
        confidence = 0.7
        entropy = 0.0
        verification_ratio = 1.0

        # 1. Entropy check
        if self.entropy_probe:
            checks_run.append("semantic_entropy")
            should_abstain, entropy, reason = await self.entropy_probe.should_abstain(query, context)
            if should_abstain:
                issues.append(reason)

        # 2. Citation enforcement
        if self.citation_enforcer and evidence:
            checks_run.append("citation_enforcement")
            cited = await self.citation_enforcer.enforce_citations(response, evidence)
            confidence = cited.overall_confidence

            if cited.unverified_count > len(cited.claims) / 2:
                issues.append(f"{cited.unverified_count} claims lack citation support")

            total = len(cited.claims)
            verified = total - cited.unverified_count
            verification_ratio = verified / total if total > 0 else 0

        # 3. Abstention decision
        should_abstain, abstention_reason = self.abstention.should_abstain(
            confidence, verification_ratio, entropy
        )

        return GuardrailResult(
            passed=not should_abstain and len(issues) == 0,
            response=response,
            confidence=confidence,
            checks_run=checks_run,
            issues=issues,
            should_abstain=should_abstain,
            abstention_reason=abstention_reason
        )

"""
Anti-Hallucination Guardrails for Velox AI RAG.

Provides:
- SemanticEntropyProbe: Uncertainty detection
- CitationEnforcer: NLI-based citation verification
- FactVerifier: Claim verification against evidence
- CalibratedAbstention: When to refuse answering
- AntiHallucinationGuardrail: Combined pipeline
"""

from .anti_hallucination import (
    AntiHallucinationGuardrail,
    SemanticEntropyProbe,
    CitationEnforcer,
    FactVerifier,
    CalibratedAbstention,
    Claim,
    CitedResponse,
    GuardrailResult,
    EntailmentLabel,
    VerificationVerdict,
)

__all__ = [
    "AntiHallucinationGuardrail",
    "SemanticEntropyProbe",
    "CitationEnforcer",
    "FactVerifier",
    "CalibratedAbstention",
    "Claim",
    "CitedResponse",
    "GuardrailResult",
    "EntailmentLabel",
    "VerificationVerdict",
]

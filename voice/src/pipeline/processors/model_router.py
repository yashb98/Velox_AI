# voice/src/pipeline/processors/model_router.py
"""
Model routing processor for Pipecat pipeline.

Routes user messages to appropriate LLM tier based on complexity:
  - T0: Router (< 15 words) → SLM / Nemotron Nano (future)
  - T1: Fast (< 50 words) → moonshot-v1-8k / gpt-4o-mini
  - T2: Powerful (>= 50 words) → moonshot-v1-128k / gpt-4o
  - T3: Heavy (multi-hop RAG) → Kimi K2.5 API (future)

Reuses logic from agents/pipeline.py for consistency.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from pipecat.frames.frames import (
    Frame,
    TextFrame,
    TranscriptionFrame,
    LLMMessagesFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from ...config import settings

logger = logging.getLogger(__name__)


class ModelTier(Enum):
    """LLM model tiers."""

    T0_SLM = "t0_slm"  # Future: Nemotron Nano
    T1_FAST = "t1_fast"  # moonshot-v1-8k, gpt-4o-mini
    T2_POWERFUL = "t2_powerful"  # moonshot-v1-128k, gpt-4o
    T3_HEAVY = "t3_heavy"  # Kimi K2.5, multi-hop RAG


@dataclass
class RoutingDecision:
    """Model routing decision with metadata."""

    tier: ModelTier
    model: str
    word_count: int
    reason: str


class ModelRouterProcessor(FrameProcessor):
    """
    Pipecat processor that routes messages to appropriate LLM tier.

    Intercepts TranscriptionFrames, analyzes complexity, and tags
    with routing metadata for downstream LLM processor.
    """

    # Model mappings (same as llm_service.py)
    MODELS = {
        "kimi": {
            ModelTier.T1_FAST: settings.kimi_model_fast,
            ModelTier.T2_POWERFUL: settings.kimi_model_powerful,
        },
        "openai": {
            ModelTier.T1_FAST: settings.openai_model_fast,
            ModelTier.T2_POWERFUL: settings.openai_model_powerful,
        },
    }

    def __init__(
        self,
        provider: str = "kimi",
        slm_max_words: int = 15,
        fast_max_words: int = 50,
        **kwargs,
    ):
        """
        Initialize model router.

        Args:
            provider: LLM provider (kimi, openai)
            slm_max_words: Max words for SLM tier
            fast_max_words: Max words for fast tier
        """
        super().__init__(**kwargs)
        self.provider = provider.lower()
        self.slm_max_words = slm_max_words
        self.fast_max_words = fast_max_words

    def _select_tier(self, word_count: int) -> ModelTier:
        """
        Select model tier based on word count.

        Routing heuristic (from pipeline.py):
          < 15 words → SLM (falls back to T1_FAST for now)
          < 50 words → T1_FAST
          >= 50 words → T2_POWERFUL
        """
        if word_count < self.slm_max_words:
            # Future: return ModelTier.T0_SLM when Nemotron Nano is available
            return ModelTier.T1_FAST
        elif word_count < self.fast_max_words:
            return ModelTier.T1_FAST
        else:
            return ModelTier.T2_POWERFUL

    def _get_model(self, tier: ModelTier) -> str:
        """Get model name for provider and tier."""
        provider_models = self.MODELS.get(self.provider, self.MODELS["kimi"])
        return provider_models.get(tier, provider_models[ModelTier.T1_FAST])

    def route(self, text: str) -> RoutingDecision:
        """
        Make routing decision for given text.

        Args:
            text: User message text

        Returns:
            RoutingDecision with tier, model, and metadata
        """
        word_count = len(text.split())
        tier = self._select_tier(word_count)
        model = self._get_model(tier)

        reason = f"words={word_count}"
        if word_count < self.slm_max_words:
            reason += " (would be SLM, falling back to fast)"
        elif word_count < self.fast_max_words:
            reason += " (fast tier)"
        else:
            reason += " (powerful tier)"

        decision = RoutingDecision(
            tier=tier,
            model=model,
            word_count=word_count,
            reason=reason,
        )

        logger.info(
            "Model routing: tier=%s model=%s %s",
            tier.value,
            model,
            reason,
        )

        return decision

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """
        Process frame and add routing metadata.

        For TranscriptionFrames, analyze text and add routing decision.
        """
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            # Analyze and route
            decision = self.route(frame.text)

            # Add routing metadata to frame (for downstream processors)
            frame.metadata = frame.metadata or {}
            frame.metadata["routing"] = {
                "tier": decision.tier.value,
                "model": decision.model,
                "word_count": decision.word_count,
                "reason": decision.reason,
            }

            logger.debug(
                "Routed transcription: '%s' → %s",
                frame.text[:50],
                decision.model,
            )

        await self.push_frame(frame, direction)


class ComplexityAnalyzer:
    """
    Analyzes user input complexity for routing decisions.

    Future enhancements:
      - Semantic complexity (requires embedding model)
      - Question type detection
      - Multi-turn context awareness
    """

    def __init__(self):
        # Patterns that indicate higher complexity
        self.complex_patterns = [
            "explain",
            "compare",
            "analyze",
            "summarize",
            "how does",
            "why did",
            "what if",
            "could you",
        ]

    def analyze(self, text: str) -> dict:
        """
        Analyze text complexity.

        Args:
            text: User message

        Returns:
            Complexity metrics dict
        """
        text_lower = text.lower()
        word_count = len(text.split())

        # Check for complex patterns
        has_complex_pattern = any(p in text_lower for p in self.complex_patterns)

        # Check for multiple questions
        question_count = text.count("?")

        return {
            "word_count": word_count,
            "has_complex_pattern": has_complex_pattern,
            "question_count": question_count,
            "estimated_complexity": self._estimate_complexity(
                word_count, has_complex_pattern, question_count
            ),
        }

    def _estimate_complexity(
        self,
        word_count: int,
        has_complex_pattern: bool,
        question_count: int,
    ) -> str:
        """Estimate overall complexity level."""
        if word_count < 5 and not has_complex_pattern:
            return "trivial"
        elif word_count < 15 and question_count <= 1:
            return "simple"
        elif word_count < 50 and not has_complex_pattern:
            return "moderate"
        else:
            return "complex"

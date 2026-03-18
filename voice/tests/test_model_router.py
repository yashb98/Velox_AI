# voice/tests/test_model_router.py
"""Tests for model router processor."""

import pytest
from src.pipeline.processors.model_router import (
    ModelRouterProcessor,
    ModelTier,
    ComplexityAnalyzer,
)


class TestModelRouterProcessor:
    """Tests for ModelRouterProcessor."""

    def test_select_tier_slm(self):
        """Short messages (<15 words) should route to fast tier (SLM fallback)."""
        router = ModelRouterProcessor(provider="kimi")

        # Very short message
        tier = router._select_tier(5)
        assert tier == ModelTier.T1_FAST

        # At boundary
        tier = router._select_tier(14)
        assert tier == ModelTier.T1_FAST

    def test_select_tier_fast(self):
        """Medium messages (15-49 words) should route to fast tier."""
        router = ModelRouterProcessor(provider="kimi")

        tier = router._select_tier(15)
        assert tier == ModelTier.T1_FAST

        tier = router._select_tier(49)
        assert tier == ModelTier.T1_FAST

    def test_select_tier_powerful(self):
        """Long messages (>=50 words) should route to powerful tier."""
        router = ModelRouterProcessor(provider="kimi")

        tier = router._select_tier(50)
        assert tier == ModelTier.T2_POWERFUL

        tier = router._select_tier(100)
        assert tier == ModelTier.T2_POWERFUL

    def test_get_model_kimi(self):
        """Kimi provider should return correct models."""
        router = ModelRouterProcessor(provider="kimi")

        assert router._get_model(ModelTier.T1_FAST) == "moonshot-v1-8k"
        assert router._get_model(ModelTier.T2_POWERFUL) == "moonshot-v1-128k"

    def test_get_model_openai(self):
        """OpenAI provider should return correct models."""
        router = ModelRouterProcessor(provider="openai")

        assert router._get_model(ModelTier.T1_FAST) == "gpt-4o-mini"
        assert router._get_model(ModelTier.T2_POWERFUL) == "gpt-4o"

    def test_route_decision(self):
        """Route should return complete decision."""
        router = ModelRouterProcessor(provider="kimi")

        # Short message
        decision = router.route("Hello, how are you?")
        assert decision.tier == ModelTier.T1_FAST
        assert decision.model == "moonshot-v1-8k"
        assert decision.word_count == 4

        # Long message
        long_text = " ".join(["word"] * 60)
        decision = router.route(long_text)
        assert decision.tier == ModelTier.T2_POWERFUL
        assert decision.model == "moonshot-v1-128k"
        assert decision.word_count == 60


class TestComplexityAnalyzer:
    """Tests for ComplexityAnalyzer."""

    def test_analyze_trivial(self):
        """Very short simple messages should be trivial."""
        analyzer = ComplexityAnalyzer()

        result = analyzer.analyze("Hi")
        assert result["word_count"] == 1
        assert result["estimated_complexity"] == "trivial"

    def test_analyze_simple(self):
        """Short messages without complex patterns should be simple."""
        analyzer = ComplexityAnalyzer()

        # 4 words is trivial, need 5+ words for simple
        result = analyzer.analyze("What time does the store open?")
        assert result["estimated_complexity"] == "simple"

    def test_analyze_complex_pattern(self):
        """Messages with complex keywords should be detected."""
        analyzer = ComplexityAnalyzer()

        result = analyzer.analyze("Can you explain how this works?")
        assert result["has_complex_pattern"] == True

    def test_analyze_multiple_questions(self):
        """Multiple questions should be counted."""
        analyzer = ComplexityAnalyzer()

        result = analyzer.analyze("What is X? And what about Y?")
        assert result["question_count"] == 2

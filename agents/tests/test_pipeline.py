"""
test_pipeline.py — Unit tests for the LLM pipeline routing logic.

Tests:
  - Semantic router (T0) intent classification
  - Tier-based model selection (T1/T2/T3)
  - Word count fallback routing
  - System prompt building
"""

import pytest
from unittest.mock import patch, AsyncMock

from pipeline import (
    PipelineRequest,
    PipelineResponse,
    run_pipeline,
    _build_system_prompt,
    T1_MAX_WORDS,
    T2_MAX_WORDS,
)
from router import ModelTier, route_request, route_by_word_count, RoutingResult


class TestSemanticRouter:
    """Tests for the T0 semantic router."""

    @pytest.mark.asyncio
    @patch("router.classify_intent")
    async def test_greeting_routes_to_t1(self, mock_classify):
        """Greetings should route to T1 Fast (Nemotron Nano)."""
        mock_classify.return_value = "greeting"

        result = await route_request("Hello!")

        assert result.tier == ModelTier.T1_FAST
        assert result.intent == "greeting"
        mock_classify.assert_called_once()

    @pytest.mark.asyncio
    @patch("router.classify_intent")
    async def test_explanation_routes_to_t2(self, mock_classify):
        """Explanation requests should route to T2 Medium (Qwen 32B)."""
        mock_classify.return_value = "explanation"

        result = await route_request("Can you explain how the billing system works?")

        assert result.tier == ModelTier.T2_MEDIUM
        assert result.intent == "explanation"

    @pytest.mark.asyncio
    @patch("router.classify_intent")
    async def test_complex_analysis_routes_to_t3(self, mock_classify):
        """Complex analysis should route to T3 Heavy (Kimi K2.5)."""
        mock_classify.return_value = "complex_analysis"

        result = await route_request(
            "Analyze the pros and cons of our current architecture "
            "and suggest improvements for scalability."
        )

        assert result.tier == ModelTier.T3_HEAVY
        assert result.intent == "complex_analysis"

    @pytest.mark.asyncio
    @patch("router.classify_intent")
    async def test_fallback_to_word_count_on_failure(self, mock_classify):
        """When intent classification fails, fall back to word count."""
        mock_classify.return_value = None  # Classification failed

        result = await route_request("Hello there friend")

        # 3 words < 15, should be T1
        assert result.tier == ModelTier.T1_FAST
        assert result.intent == "word_count_heuristic"


class TestWordCountRouting:
    """Tests for word count fallback routing."""

    def test_short_message_routes_to_t1(self):
        """Messages under T1_MAX_WORDS should go to T1."""
        tier = route_by_word_count(5)  # 5 words < 15
        assert tier == ModelTier.T1_FAST

    def test_medium_message_routes_to_t2(self):
        """Messages between T1 and T2 thresholds should go to T2."""
        tier = route_by_word_count(30)  # 30 words: 15 < 30 < 50
        assert tier == ModelTier.T2_MEDIUM

    def test_long_message_routes_to_t3(self):
        """Messages >= T2_MAX_WORDS should go to T3."""
        tier = route_by_word_count(60)  # 60 words >= 50
        assert tier == ModelTier.T3_HEAVY


class TestPipelineRouting:
    """Tests for end-to-end pipeline routing."""

    @pytest.mark.asyncio
    @patch("pipeline.route_request")
    @patch("pipeline._call_sglang")
    async def test_t1_routes_to_sglang(self, mock_sglang, mock_route):
        """T1 tier should use SGLang with Nemotron Nano."""
        mock_route.return_value = RoutingResult(
            tier=ModelTier.T1_FAST,
            intent="greeting",
            confidence=0.9,
            latency_ms=15.0,
        )
        mock_sglang.return_value = "Hello! How can I help you?"

        with patch("pipeline.SGLANG_BASE_URL", "http://sglang.modal.run/v1"):
            with patch("pipeline.LLM_PROVIDER", "sglang"):
                request = PipelineRequest(user_message="Hi")
                result = await run_pipeline(request)

        assert "Hello" in result.response
        assert result.tier == "t1_fast"
        mock_sglang.assert_called_once()

    @pytest.mark.asyncio
    @patch("pipeline.route_request")
    @patch("pipeline._call_openai_compatible")
    async def test_t3_routes_to_kimi(self, mock_kimi, mock_route):
        """T3 tier should use Kimi K2.5 API."""
        mock_route.return_value = RoutingResult(
            tier=ModelTier.T3_HEAVY,
            intent="complex_analysis",
            confidence=0.85,
            latency_ms=20.0,
        )
        mock_kimi.return_value = "Here's a detailed analysis..."

        with patch("pipeline.SGLANG_BASE_URL", "http://sglang.modal.run/v1"):
            with patch("pipeline.LLM_PROVIDER", "sglang"):
                request = PipelineRequest(
                    user_message=" ".join(["analyze"] * 60)  # Long message
                )
                result = await run_pipeline(request)

        assert result.tier == "t3_heavy"
        mock_kimi.assert_called_once()

    @pytest.mark.asyncio
    @patch("pipeline.route_request")
    @patch("pipeline._call_openai_compatible")
    async def test_kimi_provider_all_tiers(self, mock_call, mock_route):
        """When provider is kimi, all tiers go through Kimi API."""
        mock_route.return_value = RoutingResult(
            tier=ModelTier.T1_FAST,
            intent="greeting",
            confidence=0.9,
            latency_ms=10.0,
        )
        mock_call.return_value = "Hello from Kimi!"

        with patch("pipeline.LLM_PROVIDER", "kimi"):
            request = PipelineRequest(user_message="Hi")
            result = await run_pipeline(request)

        assert "Kimi" in result.response or result.model_used.startswith("moonshot")
        mock_call.assert_called_once()


class TestSystemPrompt:
    """Tests for system prompt building."""

    def test_base_prompt_without_context(self):
        prompt = _build_system_prompt("")
        assert "Velox" in prompt
        assert "voice AI assistant" in prompt
        assert "concise" in prompt

    def test_prompt_with_context(self):
        context = "Business hours are 9-5"
        prompt = _build_system_prompt(context)
        assert "KNOWLEDGE BASE" in prompt
        assert context in prompt

    def test_prompt_mentions_no_markdown(self):
        prompt = _build_system_prompt("")
        assert "markdown" in prompt.lower()


class TestRoutingThresholds:
    """Tests for routing threshold constants."""

    def test_t1_max_words_is_reasonable(self):
        assert T1_MAX_WORDS == 15
        assert T1_MAX_WORDS > 0

    def test_t2_max_words_is_greater_than_t1(self):
        assert T2_MAX_WORDS > T1_MAX_WORDS
        assert T2_MAX_WORDS == 50

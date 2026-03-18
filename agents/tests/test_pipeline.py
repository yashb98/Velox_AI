"""
test_pipeline.py — Unit tests for the ADK pipeline routing logic.

Reference: docs/architecture/08-mlops-cicd.md §8.3
"""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from pipeline import (
    PipelineRequest,
    PipelineResponse,
    run_pipeline,
    _build_system_prompt,
    PHI3_MAX_WORDS,
    FLASH_MAX_WORDS,
)


class TestPipelineRouting:
    """Tests for model routing based on word count."""

    @pytest.mark.asyncio
    @patch("pipeline._call_phi3")
    @patch("pipeline._build_flash_agent")
    async def test_short_message_routes_to_phi3(self, mock_flash, mock_phi3):
        """Messages under PHI3_MAX_WORDS should try Phi-3 first."""
        mock_phi3.return_value = "Phi-3 response"

        request = PipelineRequest(
            user_message="Hello",  # 1 word < 15
            context="",
        )

        result = await run_pipeline(request)

        assert result.model_used == "phi-3-mini"
        assert result.response == "Phi-3 response"
        mock_phi3.assert_called_once()
        mock_flash.assert_not_called()

    @pytest.mark.asyncio
    @patch("pipeline._call_phi3")
    @patch("pipeline._build_flash_agent")
    async def test_phi3_fallback_to_flash(self, mock_flash_builder, mock_phi3):
        """When Phi-3 fails, should fall back to Gemini Flash."""
        mock_phi3.return_value = None  # Phi-3 failure

        mock_agent = MagicMock()
        mock_agent.run_async = AsyncMock(return_value=MagicMock(text="Flash response"))
        mock_flash_builder.return_value = mock_agent

        request = PipelineRequest(
            user_message="Hello there",  # Short but Phi-3 fails
            context="",
        )

        result = await run_pipeline(request)

        assert result.model_used == "gemini-2.5-flash"
        mock_phi3.assert_called_once()

    @pytest.mark.asyncio
    @patch("pipeline._call_phi3")
    @patch("pipeline._build_flash_agent")
    async def test_medium_message_routes_to_flash(self, mock_flash_builder, mock_phi3):
        """Messages between PHI3_MAX_WORDS and FLASH_MAX_WORDS go to Flash."""
        mock_agent = MagicMock()
        mock_agent.run_async = AsyncMock(return_value=MagicMock(text="Flash response"))
        mock_flash_builder.return_value = mock_agent

        # Create message with 20 words (> 15, < 50)
        request = PipelineRequest(
            user_message=" ".join(["word"] * 20),
            context="",
        )

        result = await run_pipeline(request)

        assert result.model_used == "gemini-2.5-flash"
        mock_phi3.assert_not_called()  # Skipped Phi-3 due to word count

    @pytest.mark.asyncio
    @patch("pipeline._call_phi3")
    @patch("pipeline._build_pro_agent")
    async def test_long_message_routes_to_pro(self, mock_pro_builder, mock_phi3):
        """Messages >= FLASH_MAX_WORDS go to Gemini Pro."""
        mock_agent = MagicMock()
        mock_agent.run_async = AsyncMock(return_value=MagicMock(text="Pro response"))
        mock_pro_builder.return_value = mock_agent

        # Create message with 60 words (>= 50)
        request = PipelineRequest(
            user_message=" ".join(["word"] * 60),
            context="",
        )

        result = await run_pipeline(request)

        assert result.model_used == "gemini-2.5-pro"
        mock_phi3.assert_not_called()


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

    def test_phi3_max_words_is_reasonable(self):
        assert PHI3_MAX_WORDS == 15
        assert PHI3_MAX_WORDS > 0

    def test_flash_max_words_is_greater_than_phi3(self):
        assert FLASH_MAX_WORDS > PHI3_MAX_WORDS
        assert FLASH_MAX_WORDS == 50

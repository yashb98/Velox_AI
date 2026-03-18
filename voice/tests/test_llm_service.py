# voice/tests/test_llm_service.py
"""Tests for LLM service."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from src.services.llm_service import (
    LLMService,
    LLMResponse,
    ModelTier,
    build_voice_prompt,
    DEFAULT_VOICE_PROMPT,
)


class TestLLMService:
    """Tests for LLMService."""

    def test_select_tier_slm(self):
        """Short messages should select fast tier (SLM fallback)."""
        service = LLMService()

        tier = service.select_tier(5)
        assert tier == ModelTier.FAST

        tier = service.select_tier(14)
        assert tier == ModelTier.FAST

    def test_select_tier_fast(self):
        """Medium messages should select fast tier."""
        service = LLMService()

        tier = service.select_tier(15)
        assert tier == ModelTier.FAST

        tier = service.select_tier(49)
        assert tier == ModelTier.FAST

    def test_select_tier_powerful(self):
        """Long messages should select powerful tier."""
        service = LLMService()

        tier = service.select_tier(50)
        assert tier == ModelTier.POWERFUL

        tier = service.select_tier(100)
        assert tier == ModelTier.POWERFUL

    def test_get_model_returns_string(self):
        """Should return model name string."""
        service = LLMService()

        model = service._get_model(ModelTier.FAST)
        assert isinstance(model, str)
        assert len(model) > 0

    @pytest.mark.asyncio
    async def test_generate_returns_response(self):
        """Generate should return LLMResponse."""
        service = LLMService()

        # Mock the HTTP call
        with patch.object(service, '_call_openai_compatible', new_callable=AsyncMock) as mock_call:
            mock_call.return_value = "Hello! How can I help you?"

            response = await service.generate(
                user_message="Hello",
                system_prompt="You are a helpful assistant.",
            )

            assert isinstance(response, LLMResponse)
            assert response.text == "Hello! How can I help you?"
            assert response.tier == ModelTier.FAST

    @pytest.mark.asyncio
    async def test_generate_with_context(self):
        """Generate should include RAG context in prompt."""
        service = LLMService()

        with patch.object(service, '_call_openai_compatible', new_callable=AsyncMock) as mock_call:
            mock_call.return_value = "Based on the knowledge base..."

            await service.generate(
                user_message="What are your hours?",
                system_prompt="You are a helpful assistant.",
                context="Store hours: 9am-5pm Monday-Friday",
            )

            # Check that context was included in the system prompt
            call_args = mock_call.call_args
            system_prompt = call_args.kwargs.get('system_prompt') or call_args.args[1]
            assert "KNOWLEDGE BASE" in system_prompt
            assert "9am-5pm" in system_prompt

    @pytest.mark.asyncio
    async def test_generate_error_handling(self):
        """Generate should handle errors gracefully."""
        service = LLMService()

        with patch.object(service, '_call_openai_compatible', new_callable=AsyncMock) as mock_call:
            mock_call.side_effect = Exception("API error")

            response = await service.generate(
                user_message="Hello",
                system_prompt="You are a helpful assistant.",
            )

            # Should return fallback response
            assert "trouble processing" in response.text.lower()
            assert "(error)" in response.model_used


class TestBuildVoicePrompt:
    """Tests for build_voice_prompt helper."""

    def test_default_prompt(self):
        """Should return default prompt when no agent prompt."""
        prompt = build_voice_prompt()
        assert prompt == DEFAULT_VOICE_PROMPT

    def test_custom_prompt(self):
        """Should use custom agent prompt."""
        custom = "You are a restaurant assistant."
        prompt = build_voice_prompt(agent_prompt=custom)
        assert prompt == custom

    def test_prompt_with_context(self):
        """Should append context to prompt."""
        prompt = build_voice_prompt(
            agent_prompt="You are helpful.",
            context="Business hours: 9-5",
        )
        assert "KNOWLEDGE BASE" in prompt
        assert "Business hours" in prompt

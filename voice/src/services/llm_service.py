# voice/src/services/llm_service.py
"""
Multi-provider LLM service for voice pipeline.

Supports:
  - Kimi/Moonshot AI (OpenAI-compatible) - primary
  - OpenAI
  - Gemini (future: via SGLang)

Reuses routing logic from agents/pipeline.py:
  - word_count < 15  → SLM tier (future: Nemotron Nano)
  - word_count < 50  → Fast tier (moonshot-v1-8k / gpt-4o-mini)
  - else             → Powerful tier (moonshot-v1-128k / gpt-4o)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Optional, AsyncIterator

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


class ModelTier(Enum):
    """LLM model tiers based on complexity."""

    SLM = "slm"  # Future: Nemotron Nano via SGLang
    FAST = "fast"  # moonshot-v1-8k, gpt-4o-mini
    POWERFUL = "powerful"  # moonshot-v1-128k, gpt-4o


@dataclass
class LLMResponse:
    """Response from LLM service."""

    text: str
    model_used: str
    tier: ModelTier
    tokens_used: int = 0


class LLMService:
    """Multi-provider LLM service with tier-based routing."""

    # Model mappings per provider
    MODELS = {
        "kimi": {
            ModelTier.FAST: settings.kimi_model_fast,
            ModelTier.POWERFUL: settings.kimi_model_powerful,
        },
        "openai": {
            ModelTier.FAST: settings.openai_model_fast,
            ModelTier.POWERFUL: settings.openai_model_powerful,
        },
    }

    def __init__(self):
        self.provider = settings.llm_provider.lower()
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=60.0)
        return self._client

    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    def select_tier(self, word_count: int) -> ModelTier:
        """
        Select model tier based on input word count.

        Routing heuristic (from pipeline.py):
          - < 15 words → SLM (falls back to FAST for now)
          - < 50 words → FAST
          - >= 50 words → POWERFUL
        """
        if word_count < settings.tier_slm_max_words:
            # Future: return ModelTier.SLM when Nemotron Nano is available
            return ModelTier.FAST
        elif word_count < settings.tier_fast_max_words:
            return ModelTier.FAST
        else:
            return ModelTier.POWERFUL

    def _get_model(self, tier: ModelTier) -> str:
        """Get model name for current provider and tier."""
        provider_models = self.MODELS.get(self.provider, self.MODELS["kimi"])
        return provider_models.get(tier, provider_models[ModelTier.FAST])

    def _get_api_config(self) -> tuple[str, str, str]:
        """Get API key, base URL, and model for current provider."""
        if self.provider == "kimi":
            return (
                settings.kimi_api_key,
                settings.kimi_base_url,
                self._get_model(ModelTier.FAST),
            )
        elif self.provider == "openai":
            return (
                settings.openai_api_key,
                "https://api.openai.com/v1",
                self._get_model(ModelTier.FAST),
            )
        else:
            # Default to Kimi
            return (
                settings.kimi_api_key,
                settings.kimi_base_url,
                self._get_model(ModelTier.FAST),
            )

    async def generate(
        self,
        user_message: str,
        system_prompt: str,
        context: str = "",
    ) -> LLMResponse:
        """
        Generate response from LLM.

        Args:
            user_message: User's spoken input
            system_prompt: Agent system prompt
            context: RAG context (knowledge base results)

        Returns:
            LLMResponse with generated text and metadata
        """
        word_count = len(user_message.split())
        tier = self.select_tier(word_count)
        model = self._get_model(tier)

        # Build full system prompt with context
        full_system = system_prompt
        if context:
            full_system += f"\n\n=== KNOWLEDGE BASE ===\n{context}\n======================"

        logger.info(
            "LLM request: provider=%s model=%s tier=%s words=%d",
            self.provider,
            model,
            tier.value,
            word_count,
        )

        try:
            response_text = await self._call_openai_compatible(
                user_message=user_message,
                system_prompt=full_system,
                model=model,
            )

            return LLMResponse(
                text=response_text,
                model_used=model,
                tier=tier,
            )

        except Exception as exc:
            logger.error("LLM call failed: %s", exc)
            # Return fallback response
            return LLMResponse(
                text="I'm having trouble processing that right now. Please try again.",
                model_used=f"{model} (error)",
                tier=tier,
            )

    async def generate_streaming(
        self,
        user_message: str,
        system_prompt: str,
        context: str = "",
    ) -> AsyncIterator[str]:
        """
        Generate streaming response from LLM.

        Yields text chunks as they arrive.
        """
        word_count = len(user_message.split())
        tier = self.select_tier(word_count)
        model = self._get_model(tier)

        # Build full system prompt with context
        full_system = system_prompt
        if context:
            full_system += f"\n\n=== KNOWLEDGE BASE ===\n{context}\n======================"

        logger.info(
            "LLM streaming request: provider=%s model=%s tier=%s words=%d",
            self.provider,
            model,
            tier.value,
            word_count,
        )

        api_key, base_url, _ = self._get_api_config()
        client = await self._get_client()

        try:
            async with client.stream(
                "POST",
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": full_system},
                        {"role": "user", "content": user_message},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 256,
                    "stream": True,
                },
            ) as response:
                response.raise_for_status()

                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break

                        import json

                        try:
                            chunk = json.loads(data)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue

        except Exception as exc:
            logger.error("LLM streaming failed: %s", exc)
            yield "I'm having trouble processing that right now."

    async def _call_openai_compatible(
        self,
        user_message: str,
        system_prompt: str,
        model: str,
    ) -> str:
        """Call OpenAI-compatible API (Kimi, OpenAI)."""
        api_key, base_url, _ = self._get_api_config()
        client = await self._get_client()

        resp = await client.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.7,
                "max_tokens": 256,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


# Default system prompt for voice
DEFAULT_VOICE_PROMPT = (
    "You are Velox, a professional voice AI assistant. "
    "Keep answers concise — under two sentences. "
    "Do not use markdown formatting; your reply will be spoken aloud."
)


def build_voice_prompt(agent_prompt: str = "", context: str = "") -> str:
    """Build system prompt for voice pipeline."""
    base = agent_prompt if agent_prompt else DEFAULT_VOICE_PROMPT
    if context:
        return f"{base}\n\n=== KNOWLEDGE BASE ===\n{context}\n======================"
    return base

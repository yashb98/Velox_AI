# voice/src/config.py
"""
Configuration management using Pydantic Settings.

Loads environment variables with sensible defaults for local development.
All secrets should be provided via environment variables in production.
"""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Voice service configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ─── Service ──────────────────────────────────────────────────────────────
    port: int = 8003
    debug: bool = False
    log_level: str = "INFO"

    # ─── Database ─────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://postgres:devpass@db:5432/velox_local"

    # ─── Redis ────────────────────────────────────────────────────────────────
    redis_host: str = "redis"
    redis_port: int = 6379
    redis_url: Optional[str] = None

    @property
    def redis_connection_url(self) -> str:
        """Return Redis URL, constructing from host/port if not provided."""
        if self.redis_url:
            return self.redis_url
        return f"redis://{self.redis_host}:{self.redis_port}"

    # ─── Daily.co (WebRTC transport) ──────────────────────────────────────────
    daily_api_key: str = ""
    daily_api_url: str = "https://api.daily.co/v1"

    # ─── Twilio (PSTN) ────────────────────────────────────────────────────────
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # ─── Deepgram (STT) ───────────────────────────────────────────────────────
    deepgram_api_key: str = ""
    deepgram_model: str = "nova-2"
    deepgram_language: str = "en"

    # ─── Cartesia (TTS - primary) ─────────────────────────────────────────────
    cartesia_api_key: str = ""
    cartesia_voice_id: str = "a0e99841-438c-4a64-b679-ae501e7d6091"  # Default voice

    # ─── ElevenLabs (TTS - fallback) ──────────────────────────────────────────
    elevenlabs_api_key: str = ""

    # ─── LLM Providers ────────────────────────────────────────────────────────
    llm_provider: str = "sglang"  # sglang | kimi | openai

    # SGLang (self-hosted on Modal) - primary for T1/T2
    sglang_base_url: str = ""  # e.g. https://your-modal-app.modal.run/v1
    sglang_api_key: str = ""
    sglang_model_t0: str = "Qwen/Qwen2.5-3B-Instruct"       # Router
    sglang_model_t1: str = "nvidia/Nemotron-3-Nano-4B-Instruct"  # Fast
    sglang_model_t2: str = "Qwen/Qwen2.5-32B-Instruct"      # Medium

    # Kimi / Moonshot AI (T3 fallback + alternative provider)
    kimi_api_key: str = ""
    kimi_base_url: str = "https://api.moonshot.cn/v1"
    kimi_model_fast: str = "moonshot-v1-8k"
    kimi_model_powerful: str = "kimi-k2.5"  # T3 Heavy

    # OpenAI (alternative fallback)
    openai_api_key: str = ""
    openai_model_fast: str = "gpt-4o-mini"
    openai_model_powerful: str = "gpt-4o"

    # ─── Model Routing Thresholds ─────────────────────────────────────────────
    # Word count thresholds for tier selection
    tier_t1_max_words: int = 15   # < 15 words → T1 Fast (Nemotron Nano)
    tier_t2_max_words: int = 50   # < 50 words → T2 Medium (Qwen 32B)
    # >= 50 words → T3 Heavy (Kimi K2.5)

    # ─── Billing Integration ──────────────────────────────────────────────────
    # Internal endpoint on Node.js API for billing deductions
    billing_api_url: str = "http://api:8080"
    voice_internal_secret: str = ""  # Shared secret for internal API auth

    # Billing intervals
    billing_interval_seconds: int = 30  # Deduct 0.5 minutes every 30 seconds
    min_credit_balance: int = 1  # Minimum minutes required to start call

    # ─── Observability ────────────────────────────────────────────────────────
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    # ─── Voice Pipeline ───────────────────────────────────────────────────────
    # VAD (Voice Activity Detection)
    vad_threshold: float = 0.5
    vad_min_speech_duration_ms: int = 250
    vad_min_silence_duration_ms: int = 300

    # Endpointing (silence detection for turn end)
    endpointing_ms: int = 300  # 300ms silence → end of turn
    utterance_end_ms: int = 1000  # 1s hard guard

    # Latency targets (for monitoring)
    target_stt_latency_ms: int = 100
    target_llm_ttft_ms: int = 200
    target_tts_ttfb_ms: int = 75
    target_total_latency_ms: int = 800


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Convenience alias
settings = get_settings()

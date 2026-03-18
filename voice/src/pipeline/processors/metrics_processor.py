# voice/src/pipeline/processors/metrics_processor.py
"""
Prometheus metrics processor for Pipecat pipeline.

Tracks latency at each pipeline stage:
  - STT latency (speech end → transcription complete)
  - LLM TTFT (transcription → first LLM token)
  - TTS TTFB (LLM complete → first audio byte)
  - Total voice-to-voice latency

Exposes metrics via /metrics endpoint for Prometheus scraping.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from prometheus_client import Counter, Histogram, Gauge

from pipecat.frames.frames import (
    Frame,
    TranscriptionFrame,
    TextFrame,
    AudioRawFrame,
    LLMFullResponseStartFrame,
    LLMFullResponseEndFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from ...config import settings

logger = logging.getLogger(__name__)


# ─── Prometheus Metrics ───────────────────────────────────────────────────────

# Latency histograms (in milliseconds)
STT_LATENCY = Histogram(
    "velox_stt_latency_ms",
    "Speech-to-text latency in milliseconds",
    buckets=[25, 50, 75, 100, 150, 200, 300, 500, 1000],
)

LLM_TTFT = Histogram(
    "velox_llm_ttft_ms",
    "LLM time-to-first-token in milliseconds",
    buckets=[50, 100, 150, 200, 300, 400, 500, 750, 1000, 2000],
)

TTS_TTFB = Histogram(
    "velox_tts_ttfb_ms",
    "TTS time-to-first-byte in milliseconds",
    buckets=[25, 50, 75, 100, 150, 200, 300, 500],
)

TOTAL_LATENCY = Histogram(
    "velox_voice_latency_ms",
    "Total voice-to-voice latency in milliseconds",
    buckets=[200, 400, 600, 800, 1000, 1500, 2000, 3000, 5000],
)

# Counters
TURNS_TOTAL = Counter(
    "velox_turns_total",
    "Total conversation turns processed",
    ["model_tier"],
)

INTERRUPTS_TOTAL = Counter(
    "velox_interrupts_total",
    "Total barge-in interruptions",
)

ERRORS_TOTAL = Counter(
    "velox_errors_total",
    "Total pipeline errors",
    ["stage"],
)

# Gauges
ACTIVE_CALLS = Gauge(
    "velox_active_calls",
    "Number of active voice calls",
)


class MetricsProcessor(FrameProcessor):
    """
    Pipecat processor that collects latency metrics.

    Tracks timestamps at each stage and calculates latencies.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

        # Timestamp tracking for current turn
        self._speech_end_time: Optional[float] = None
        self._transcription_time: Optional[float] = None
        self._llm_start_time: Optional[float] = None
        self._llm_first_token_time: Optional[float] = None
        self._tts_start_time: Optional[float] = None
        self._tts_first_byte_time: Optional[float] = None

        # Turn counter
        self._turn_count: int = 0

    def _reset_turn(self):
        """Reset timestamps for new turn."""
        self._speech_end_time = None
        self._transcription_time = None
        self._llm_start_time = None
        self._llm_first_token_time = None
        self._tts_start_time = None
        self._tts_first_byte_time = None

    def _record_stt_latency(self):
        """Record STT latency if timestamps available."""
        if self._speech_end_time and self._transcription_time:
            latency_ms = (self._transcription_time - self._speech_end_time) * 1000
            STT_LATENCY.observe(latency_ms)
            logger.debug("STT latency: %.1fms", latency_ms)

    def _record_llm_ttft(self):
        """Record LLM TTFT if timestamps available."""
        if self._transcription_time and self._llm_first_token_time:
            latency_ms = (self._llm_first_token_time - self._transcription_time) * 1000
            LLM_TTFT.observe(latency_ms)
            logger.debug("LLM TTFT: %.1fms", latency_ms)

    def _record_tts_ttfb(self):
        """Record TTS TTFB if timestamps available."""
        if self._tts_start_time and self._tts_first_byte_time:
            latency_ms = (self._tts_first_byte_time - self._tts_start_time) * 1000
            TTS_TTFB.observe(latency_ms)
            logger.debug("TTS TTFB: %.1fms", latency_ms)

    def _record_total_latency(self):
        """Record total voice-to-voice latency."""
        if self._speech_end_time and self._tts_first_byte_time:
            latency_ms = (self._tts_first_byte_time - self._speech_end_time) * 1000
            TOTAL_LATENCY.observe(latency_ms)

            # Log warning if exceeding target
            if latency_ms > settings.target_total_latency_ms:
                logger.warning(
                    "Latency exceeded target: %.1fms > %dms",
                    latency_ms,
                    settings.target_total_latency_ms,
                )
            else:
                logger.info("Turn latency: %.1fms (target: %dms)", latency_ms, settings.target_total_latency_ms)

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """Process frame and collect metrics."""
        await super().process_frame(frame, direction)

        now = time.time()

        # Track transcription completion
        if isinstance(frame, TranscriptionFrame):
            self._transcription_time = now

            # Get speech end time from frame metadata if available
            if hasattr(frame, "metadata") and frame.metadata:
                speech_end = frame.metadata.get("speech_end_time")
                if speech_end:
                    self._speech_end_time = speech_end

            self._record_stt_latency()

            # Get model tier from routing metadata
            tier = "unknown"
            if hasattr(frame, "metadata") and frame.metadata:
                routing = frame.metadata.get("routing", {})
                tier = routing.get("tier", "unknown")
            TURNS_TOTAL.labels(model_tier=tier).inc()
            self._turn_count += 1

        # Track LLM response start (first token)
        if isinstance(frame, LLMFullResponseStartFrame):
            if self._llm_first_token_time is None:
                self._llm_first_token_time = now
                self._record_llm_ttft()

        # Track TTS start
        if isinstance(frame, TTSStartedFrame):
            self._tts_start_time = now

        # Track first audio byte
        if isinstance(frame, AudioRawFrame):
            if self._tts_first_byte_time is None and self._tts_start_time:
                self._tts_first_byte_time = now
                self._record_tts_ttfb()
                self._record_total_latency()

        # Track TTS completion → reset for next turn
        if isinstance(frame, TTSStoppedFrame):
            self._reset_turn()

        await self.push_frame(frame, direction)

    def record_interrupt(self):
        """Record a barge-in interruption."""
        INTERRUPTS_TOTAL.inc()
        self._reset_turn()

    def record_error(self, stage: str):
        """Record an error at a pipeline stage."""
        ERRORS_TOTAL.labels(stage=stage).inc()

    @property
    def turn_count(self) -> int:
        """Total turns processed."""
        return self._turn_count


def increment_active_calls():
    """Increment active call gauge."""
    ACTIVE_CALLS.inc()


def decrement_active_calls():
    """Decrement active call gauge."""
    ACTIVE_CALLS.dec()

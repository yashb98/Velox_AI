# voice/src/pipeline/voice_pipeline.py
"""
Main Pipecat voice pipeline for Velox AI.

Pipeline architecture:
  Transport (Daily.co WebRTC)
    → Silero VAD (<75ms)
    → Deepgram STT (<100ms streaming)
    → Context Aggregator
    → Model Router (selects LLM tier)
    → RAG Processor (2-tier: fast <100ms, complex <500ms)
    → LLM Service (<200ms TTFT)
    → Cartesia TTS (<75ms TTFB)
    → Transport

Target: <800ms voice-to-voice latency (excluding PSTN overhead)
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Optional, Dict, Any

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.processors.aggregators.llm_response import LLMAssistantResponseAggregator, LLMUserResponseAggregator
from pipecat.services.deepgram import DeepgramSTTService
from pipecat.services.cartesia import CartesiaTTSService
from pipecat.services.openai import OpenAILLMService
from pipecat.transports.services.daily import DailyTransport, DailyParams

from ..config import settings
from ..db.postgres import Database
from ..services.billing_client import BillingClient
from ..transport.daily_transport import DailyTransport as DailyRoomManager, DailyRoomInfo
from .processors.model_router import ModelRouterProcessor
from .processors.billing_processor import BillingProcessor, BillingExhaustedFrame
from .processors.metrics_processor import MetricsProcessor, increment_active_calls, decrement_active_calls
from .processors.rag_processor import RAGProcessor

logger = logging.getLogger(__name__)


@dataclass
class CallContext:
    """Context for an active call."""

    call_sid: str
    agent_id: str
    org_id: str
    conversation_id: str
    room_info: DailyRoomInfo
    agent_config: Dict[str, Any]


class VoicePipelineManager:
    """
    Manages Pipecat voice pipelines for multiple concurrent calls.

    Each call gets its own pipeline instance running in a separate task.
    """

    def __init__(self, db: Database, billing_client: BillingClient):
        self.db = db
        self.billing_client = billing_client
        self._daily_manager = DailyRoomManager()
        self._active_pipelines: Dict[str, PipelineTask] = {}
        self._call_contexts: Dict[str, CallContext] = {}

    async def create_room(
        self,
        call_sid: str,
        agent_id: str,
        org_id: str,
        conversation_id: str,
    ) -> Dict[str, Any]:
        """
        Create a Daily.co room for a new call.

        Returns:
            Room info dict with room_name, room_url, sip_uri, token
        """
        room_info = await self._daily_manager.create_room(call_sid)

        return {
            "room_name": room_info.room_name,
            "room_url": room_info.room_url,
            "sip_uri": room_info.sip_uri,
            "token": room_info.token,
        }

    async def run_pipeline(
        self,
        room_info: Dict[str, Any],
        agent: Dict[str, Any],
        org_id: str,
        conversation_id: str,
        call_sid: str,
    ):
        """
        Run the voice pipeline for a call.

        This is called as a background task when a call connects.
        """
        increment_active_calls()

        try:
            # Build call context
            context = CallContext(
                call_sid=call_sid,
                agent_id=agent["id"],
                org_id=org_id,
                conversation_id=conversation_id,
                room_info=DailyRoomInfo(
                    room_name=room_info["room_name"],
                    room_url=room_info["room_url"],
                    sip_uri=room_info["sip_uri"],
                    token=room_info["token"],
                    expires_at=0,
                ),
                agent_config=agent,
            )

            self._call_contexts[call_sid] = context

            # Build and run pipeline
            pipeline_task = await self._build_pipeline(context)
            self._active_pipelines[call_sid] = pipeline_task

            logger.info(
                "Pipeline started: call_sid=%s agent=%s room=%s",
                call_sid,
                agent["name"],
                room_info["room_name"],
            )

            # Run until completion
            await pipeline_task.run()

        except Exception as exc:
            logger.error("Pipeline error: call_sid=%s error=%s", call_sid, exc)

        finally:
            decrement_active_calls()
            await self._cleanup_call(call_sid)

    async def _build_pipeline(self, context: CallContext) -> PipelineTask:
        """
        Build the Pipecat pipeline for a call.

        Pipeline stages:
          1. Daily transport (WebRTC)
          2. VAD (Silero)
          3. STT (Deepgram Nova-2)
          4. Context aggregation
          5. Model routing
          6. RAG retrieval
          7. LLM inference
          8. TTS (Cartesia)
          9. Transport out
        """
        # Daily.co transport
        transport = DailyTransport(
            context.room_info.room_url,
            context.room_info.token,
            "Velox AI",
            DailyParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                vad_enabled=True,
                vad_audio_passthrough=True,
            ),
        )

        # Deepgram STT
        stt = DeepgramSTTService(
            api_key=settings.deepgram_api_key,
            model=settings.deepgram_model,
            language=settings.deepgram_language,
        )

        # Cartesia TTS
        tts = CartesiaTTSService(
            api_key=settings.cartesia_api_key,
            voice_id=context.agent_config.get("voice_id") or settings.cartesia_voice_id,
        )

        # LLM (OpenAI-compatible for Kimi)
        llm = OpenAILLMService(
            api_key=settings.kimi_api_key or settings.openai_api_key,
            base_url=settings.kimi_base_url if settings.kimi_api_key else "https://api.openai.com/v1",
            model=settings.kimi_model_fast,
        )

        # Context aggregator
        system_prompt = context.agent_config.get("system_prompt") or (
            "You are Velox, a professional voice AI assistant. "
            "Keep answers concise — under two sentences. "
            "Do not use markdown formatting; your reply will be spoken aloud."
        )

        messages = [{"role": "system", "content": system_prompt}]
        llm_context = OpenAILLMContext(messages)
        context_aggregator = llm_context.create_context_aggregator(llm)

        # Custom processors
        model_router = ModelRouterProcessor(
            provider=settings.llm_provider,
            slm_max_words=settings.tier_slm_max_words,
            fast_max_words=settings.tier_fast_max_words,
        )

        rag_processor = RAGProcessor(
            kb_id=context.agent_config.get("kb_id"),
            fast_timeout_ms=100,
            complex_timeout_ms=500,
        )

        billing_processor = BillingProcessor(
            billing_client=self.billing_client,
            org_id=context.org_id,
            conversation_id=context.conversation_id,
            interval_seconds=settings.billing_interval_seconds,
            on_exhausted=lambda: self._handle_billing_exhausted(context.call_sid),
        )

        metrics_processor = MetricsProcessor()

        # Build pipeline
        pipeline = Pipeline(
            [
                transport.input(),
                stt,
                metrics_processor,
                model_router,
                rag_processor,
                context_aggregator.user(),
                llm,
                billing_processor,
                tts,
                transport.output(),
                context_aggregator.assistant(),
            ]
        )

        # Create task
        task = PipelineTask(
            pipeline,
            params=PipelineParams(
                allow_interruptions=True,
                enable_metrics=True,
            ),
        )

        # Register event handlers
        @transport.event_handler("on_first_participant_joined")
        async def on_participant_joined(transport, participant):
            logger.info("Participant joined: %s", participant.get("id"))

        @transport.event_handler("on_participant_left")
        async def on_participant_left(transport, participant, reason):
            logger.info("Participant left: %s reason=%s", participant.get("id"), reason)
            await task.stop()

        @transport.event_handler("on_call_state_updated")
        async def on_call_state_updated(transport, state):
            logger.info("Call state: %s", state)
            if state == "left":
                await task.stop()

        return task

    async def _handle_billing_exhausted(self, call_sid: str):
        """Handle billing exhaustion — terminate call gracefully."""
        logger.warning("Billing exhausted for call: %s", call_sid)

        context = self._call_contexts.get(call_sid)
        if context:
            # Update conversation status
            await self.db.update_conversation_status(
                context.conversation_id,
                "COMPLETED",
            )

        # Stop pipeline
        task = self._active_pipelines.get(call_sid)
        if task:
            await task.stop()

    async def handle_call_end(self, call_sid: str):
        """
        Handle call end (from Twilio status callback).

        Cleanup resources and finalize billing.
        """
        await self._cleanup_call(call_sid)

    async def _cleanup_call(self, call_sid: str):
        """Cleanup resources for a completed call."""
        # Remove from active pipelines
        task = self._active_pipelines.pop(call_sid, None)
        context = self._call_contexts.pop(call_sid, None)

        if context:
            # Update conversation status
            from datetime import datetime

            await self.db.update_conversation_status(
                context.conversation_id,
                "COMPLETED",
                end_time=datetime.utcnow(),
            )

            # Delete Daily room
            await self._daily_manager.delete_room(context.room_info.room_name)

            logger.info(
                "Call cleanup complete: call_sid=%s conv=%s",
                call_sid,
                context.conversation_id,
            )

    async def shutdown(self):
        """Shutdown all active pipelines."""
        logger.info("Shutting down %d active pipelines", len(self._active_pipelines))

        # Stop all active pipelines
        for call_sid, task in list(self._active_pipelines.items()):
            try:
                await task.stop()
            except Exception as exc:
                logger.error("Error stopping pipeline %s: %s", call_sid, exc)

        # Cleanup Daily rooms
        for call_sid, context in list(self._call_contexts.items()):
            try:
                await self._daily_manager.delete_room(context.room_info.room_name)
            except Exception as exc:
                logger.error("Error deleting room %s: %s", context.room_info.room_name, exc)

        # Close Daily client
        await self._daily_manager.close()

        self._active_pipelines.clear()
        self._call_contexts.clear()

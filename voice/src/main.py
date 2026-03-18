# voice/src/main.py
"""
FastAPI entrypoint for Velox AI Voice Service.

Endpoints:
  POST /voice/incoming  — Twilio webhook, returns TwiML to connect to Daily.co
  GET  /health          — Liveness probe
  GET  /metrics         — Prometheus metrics

The voice pipeline runs asynchronously via Pipecat + Daily.co WebRTC.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from .config import settings
from .transport.twilio_bridge import (
    validate_twilio_signature,
    create_dial_twiml,
    TwilioWebhookData,
)
from .pipeline.voice_pipeline import VoicePipelineManager
from .services.billing_client import BillingClient
from .db.postgres import Database

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Singletons ───────────────────────────────────────────────────────────────
db: Optional[Database] = None
billing_client: Optional[BillingClient] = None
pipeline_manager: Optional[VoicePipelineManager] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize and cleanup resources."""
    global db, billing_client, pipeline_manager

    logger.info("Starting Velox Voice Service...")

    # Initialize database connection
    db = Database(settings.database_url)
    await db.connect()
    logger.info("Database connected")

    # Initialize billing client
    billing_client = BillingClient(
        base_url=settings.billing_api_url,
        secret=settings.voice_internal_secret,
    )
    logger.info("Billing client initialized")

    # Initialize pipeline manager
    pipeline_manager = VoicePipelineManager(db=db, billing_client=billing_client)
    logger.info("Pipeline manager initialized")

    yield

    # Cleanup
    logger.info("Shutting down Velox Voice Service...")
    if pipeline_manager:
        await pipeline_manager.shutdown()
    if db:
        await db.disconnect()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Velox Voice Service",
    description="Pipecat-based voice pipeline for AI phone calls",
    version="1.0.0",
    lifespan=lifespan,
)


# ─── Health Check ─────────────────────────────────────────────────────────────


@app.get("/health")
async def health_check():
    """Liveness probe for container orchestration."""
    return {"status": "ok", "service": "voice"}


@app.get("/ready")
async def readiness_check():
    """Readiness probe — checks database connectivity."""
    if db is None or not db.is_connected:
        raise HTTPException(status_code=503, detail="Database not connected")
    return {"status": "ready"}


# ─── Prometheus Metrics ───────────────────────────────────────────────────────


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )


# ─── Twilio Webhook ───────────────────────────────────────────────────────────


@app.post("/voice/incoming")
async def voice_incoming(request: Request, background_tasks: BackgroundTasks):
    """
    Twilio webhook for incoming voice calls.

    Flow:
    1. Validate Twilio signature (security)
    2. Look up agent by phone number
    3. Check org credit balance
    4. Create Daily.co room
    5. Return TwiML to dial into Daily.co SIP
    6. Start Pipecat pipeline in background
    """
    # Parse form data from Twilio
    form_data = await request.form()
    webhook_data = TwilioWebhookData(
        call_sid=form_data.get("CallSid", ""),
        from_number=form_data.get("From", ""),
        to_number=form_data.get("To", ""),
        call_status=form_data.get("CallStatus", ""),
    )

    logger.info(
        "Incoming call: CallSid=%s From=%s To=%s",
        webhook_data.call_sid,
        webhook_data.from_number,
        webhook_data.to_number,
    )

    # Validate Twilio signature in production
    if settings.twilio_auth_token and not settings.debug:
        url = str(request.url)
        signature = request.headers.get("X-Twilio-Signature", "")
        if not validate_twilio_signature(
            settings.twilio_auth_token,
            url,
            dict(form_data),
            signature,
        ):
            logger.warning("Invalid Twilio signature for CallSid=%s", webhook_data.call_sid)
            raise HTTPException(status_code=403, detail="Invalid signature")

    # Look up agent by phone number
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    agent = await db.get_agent_by_phone(webhook_data.to_number)
    if not agent:
        logger.warning("No agent found for phone number: %s", webhook_data.to_number)
        # Return TwiML that says the number is not configured
        return Response(
            content="""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Sorry, this number is not configured. Goodbye.</Say>
    <Hangup/>
</Response>""",
            media_type="application/xml",
        )

    # Check org credit balance
    org = await db.get_organization(agent["org_id"])
    if not org or org["credit_balance"] < settings.min_credit_balance:
        logger.warning(
            "Insufficient balance for org=%s balance=%s",
            agent["org_id"],
            org["credit_balance"] if org else 0,
        )
        return Response(
            content="""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Sorry, this account has insufficient balance. Please contact the account owner.</Say>
    <Hangup/>
</Response>""",
            media_type="application/xml",
        )

    # Create conversation record
    conversation = await db.create_conversation(
        twilio_sid=webhook_data.call_sid,
        agent_id=agent["id"],
    )

    # Create Daily.co room and get SIP URI
    if pipeline_manager is None:
        raise HTTPException(status_code=503, detail="Pipeline manager not available")

    room_info = await pipeline_manager.create_room(
        call_sid=webhook_data.call_sid,
        agent_id=agent["id"],
        org_id=agent["org_id"],
        conversation_id=conversation["id"],
    )

    # Start pipeline in background
    background_tasks.add_task(
        pipeline_manager.run_pipeline,
        room_info=room_info,
        agent=agent,
        org_id=agent["org_id"],
        conversation_id=conversation["id"],
        call_sid=webhook_data.call_sid,
    )

    # Return TwiML to dial into Daily.co SIP
    twiml = create_dial_twiml(room_info["sip_uri"])
    logger.info(
        "Call connected: CallSid=%s Room=%s ConversationId=%s",
        webhook_data.call_sid,
        room_info["room_name"],
        conversation["id"],
    )

    return Response(content=twiml, media_type="application/xml")


# ─── Call Status Webhook ──────────────────────────────────────────────────────


@app.post("/voice/status")
async def voice_status(request: Request):
    """
    Twilio status callback webhook.

    Called when call status changes (ringing, in-progress, completed, etc.)
    Used for logging and cleanup.
    """
    form_data = await request.form()
    call_sid = form_data.get("CallSid", "")
    call_status = form_data.get("CallStatus", "")
    call_duration = form_data.get("CallDuration", "0")

    logger.info(
        "Call status update: CallSid=%s Status=%s Duration=%s",
        call_sid,
        call_status,
        call_duration,
    )

    # Handle call completion
    if call_status in ("completed", "busy", "failed", "no-answer", "canceled"):
        if pipeline_manager:
            await pipeline_manager.handle_call_end(call_sid)

    return {"status": "ok"}


# ─── Run Server ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.debug,
    )

# voice/src/transport/twilio_bridge.py
"""
Twilio PSTN bridge for Pipecat voice pipeline.

Handles:
  - Twilio webhook signature validation
  - TwiML generation for Daily.co SIP dial
  - Webhook data parsing
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, Any

from twilio.request_validator import RequestValidator

logger = logging.getLogger(__name__)


@dataclass
class TwilioWebhookData:
    """Parsed Twilio webhook data."""

    call_sid: str
    from_number: str
    to_number: str
    call_status: str


def validate_twilio_signature(
    auth_token: str,
    url: str,
    params: Dict[str, Any],
    signature: str,
) -> bool:
    """
    Validate Twilio webhook signature.

    Args:
        auth_token: Twilio auth token
        url: Full request URL
        params: Request parameters (form data)
        signature: X-Twilio-Signature header value

    Returns:
        True if signature is valid
    """
    if not auth_token or not signature:
        return False

    validator = RequestValidator(auth_token)
    return validator.validate(url, params, signature)


def create_dial_twiml(sip_uri: str) -> str:
    """
    Create TwiML to dial into Daily.co SIP endpoint.

    This connects the Twilio PSTN call to the Daily.co WebRTC room
    where the Pipecat pipeline handles the conversation.

    Args:
        sip_uri: Daily.co SIP URI (e.g., sip:room@sip.daily.co)

    Returns:
        TwiML XML string
    """
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial>
        <Sip>{sip_uri}</Sip>
    </Dial>
</Response>"""


def create_hangup_twiml(message: str = "") -> str:
    """
    Create TwiML to hang up with optional message.

    Args:
        message: Optional message to play before hangup

    Returns:
        TwiML XML string
    """
    if message:
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>{message}</Say>
    <Hangup/>
</Response>"""
    else:
        return """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Hangup/>
</Response>"""


def create_hold_twiml(music_url: str = "") -> str:
    """
    Create TwiML to put caller on hold.

    Args:
        music_url: Optional hold music URL

    Returns:
        TwiML XML string
    """
    if music_url:
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play loop="0">{music_url}</Play>
</Response>"""
    else:
        return """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Please hold while we connect you.</Say>
    <Pause length="60"/>
</Response>"""

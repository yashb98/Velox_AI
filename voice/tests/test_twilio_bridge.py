# voice/tests/test_twilio_bridge.py
"""Tests for Twilio bridge module."""

import pytest
from src.transport.twilio_bridge import (
    TwilioWebhookData,
    create_dial_twiml,
    create_hangup_twiml,
    create_hold_twiml,
)


class TestTwilioWebhookData:
    """Tests for TwilioWebhookData dataclass."""

    def test_create_webhook_data(self):
        """Should create webhook data from params."""
        data = TwilioWebhookData(
            call_sid="CA123456",
            from_number="+15551234567",
            to_number="+15559876543",
            call_status="ringing",
        )

        assert data.call_sid == "CA123456"
        assert data.from_number == "+15551234567"
        assert data.to_number == "+15559876543"
        assert data.call_status == "ringing"


class TestTwiMLGeneration:
    """Tests for TwiML generation functions."""

    def test_create_dial_twiml(self):
        """Should create valid TwiML for SIP dial."""
        sip_uri = "sip:test-room@sip.daily.co"
        twiml = create_dial_twiml(sip_uri)

        assert '<?xml version="1.0"' in twiml
        assert "<Response>" in twiml
        assert "<Dial>" in twiml
        assert f"<Sip>{sip_uri}</Sip>" in twiml
        assert "</Dial>" in twiml
        assert "</Response>" in twiml

    def test_create_hangup_twiml_with_message(self):
        """Should create TwiML with message before hangup."""
        message = "Goodbye!"
        twiml = create_hangup_twiml(message)

        assert "<Say>Goodbye!</Say>" in twiml
        assert "<Hangup/>" in twiml

    def test_create_hangup_twiml_no_message(self):
        """Should create TwiML with just hangup."""
        twiml = create_hangup_twiml()

        assert "<Say>" not in twiml
        assert "<Hangup/>" in twiml

    def test_create_hold_twiml_with_music(self):
        """Should create TwiML with hold music URL."""
        music_url = "https://example.com/hold-music.mp3"
        twiml = create_hold_twiml(music_url)

        assert f'<Play loop="0">{music_url}</Play>' in twiml

    def test_create_hold_twiml_no_music(self):
        """Should create TwiML with default hold message."""
        twiml = create_hold_twiml()

        assert "<Say>Please hold" in twiml
        assert "<Pause" in twiml

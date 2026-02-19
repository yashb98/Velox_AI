import { Router } from "express";
import { validateTwilioWebhook } from "../middleware/twilioAuth";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /voice/incoming
 *
 * Twilio calls this webhook when a call arrives on one of our purchased numbers.
 * Responsibilities:
 *  1. Validate the Twilio request signature (middleware)
 *  2. Look up the agent assigned to this phone number
 *  3. Verify the org has sufficient credit balance
 *  4. Create a pre-auth CallReservation (5-minute hold)
 *  5. Create a pending Conversation record
 *  6. Return TwiML that upgrades the connection to a WebSocket Media Stream
 */
router.post("/incoming", validateTwilioWebhook, async (req, res) => {
  // Twilio always sends `To` (the number dialled) and `CallSid`
  const { To, CallSid } = req.body as { To: string; CallSid: string };

  // ── 1. Look up the agent by the phone number that was called ──────────────
  const agent = await prisma.agent.findFirst({
    where: {
      phone_number: To,
      deletedAt: null,
      is_active: true,   // 7 — reject calls to disabled agents
    },
    include: { org: true },
  });

  if (!agent) {
    logger.warn({ To, CallSid }, "Incoming call — no agent found for number");
    // Return a polite rejection so callers hear something rather than silence
    const twiml = new VoiceResponse();
    twiml.say("Sorry, this number is not in service. Goodbye.");
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  // ── 2. Billing gate — reject if the org has no credit ────────────────────
  const MIN_REQUIRED = 1; // at least 1 minute of credit to accept a call
  if (agent.org.credit_balance < MIN_REQUIRED) {
    logger.warn(
      { orgId: agent.org_id, balance: agent.org.credit_balance, CallSid },
      "Call rejected — insufficient credit balance"
    );
    const twiml = new VoiceResponse();
    twiml.say(
      "We are unable to take your call at this time. Please try again later."
    );
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  // ── 3. Pre-auth: reserve 5 minutes against the org balance ───────────────
  //    The final charge (actual minutes used) is applied in streamHandler when
  //    the call ends, and this reservation is then deleted.
  try {
    await prisma.callReservation.create({
      data: {
        call_sid: CallSid,
        org_id: agent.org_id,
        reserved_minutes: 5,
      },
    });
  } catch (err) {
    // Duplicate call_sid — Twilio can retry webhooks; safe to continue
    logger.warn({ err, CallSid }, "CallReservation already exists — skipping create");
  }

  // ── 4. Create a Conversation record so we can attach messages immediately ─
  const conversation = await prisma.conversation.create({
    data: {
      twilio_sid: CallSid,
      agent_id: agent.id,
      status: "ACTIVE",
    },
  });

  logger.info(
    { CallSid, agentId: agent.id, orgId: agent.org_id, conversationId: conversation.id },
    "Incoming call accepted — connecting to Media Stream"
  );

  // ── 5. Return TwiML that upgrades the HTTP call → WebSocket stream ────────
  //    The path must match the WebSocketServer path in server.ts (/media-stream)
  const twiml = new VoiceResponse();
  const connect = twiml.connect();
  const stream = connect.stream({
    url: `wss://${req.headers.host}/media-stream`,
  });

  // Pass identifiers as custom stream parameters so the WebSocket handler
  // can load the correct agent config without a second DB round-trip.
  stream.parameter({ name: "agentId", value: agent.id });
  stream.parameter({ name: "conversationId", value: conversation.id });
  stream.parameter({ name: "orgId", value: agent.org_id });

  res.type("text/xml");
  res.send(twiml.toString());
});

export default router;

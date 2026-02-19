// velox-api/src/websocket/streamHandler.ts

import WebSocket from "ws";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";
import { CallOrchestrator } from "../services/orchestrator";
import { callService } from "../services/callService";
import { billingService } from "../services/billingService";

const prisma = new PrismaClient();

export const handleAudioStream = (ws: WebSocket, req: any) => {
  let orchestrator: CallOrchestrator | null = null;
  let callSid: string | null = null;
  let conversationId: string | null = null;
  let orgId: string | null = null;             // extracted from stream params (Day 1)
  let startTime: Date | null = null;

  // Interval handles — cleared in handleCallEnd to prevent timer leaks
  let billingInterval: ReturnType<typeof setInterval> | null = null;
  let ghostCallTimer: ReturnType<typeof setInterval> | null = null;

  // Ghost call protection — updated on every audio packet
  let lastAudioTs = Date.now();

  // Guard so handleCallEnd is idempotent (stop/close can both fire)
  let callEndHandled = false;

  ws.on("message", async (message) => {
    try {
      const msg = JSON.parse(message.toString());

      switch (msg.event) {
        case "connected":
          logger.info("Audio Stream Connected");
          break;

        case "start": {
          callSid       = msg.start.callSid;
          const streamSid = msg.start.streamSid;
          const agentId = msg.start.customParameters?.agentId || "default";
          conversationId = msg.start.customParameters?.conversationId;
          orgId         = msg.start.customParameters?.orgId || null;
          startTime     = new Date();
          lastAudioTs   = Date.now();

          logger.info({ callSid, agentId, orgId }, "Call started");

          // Verify the conversation exists
          if (conversationId) {
            const conversation = await prisma.conversation.findUnique({
              where: { id: conversationId },
            });
            if (!conversation) {
              logger.error({ conversationId }, "Conversation not found — closing stream");
              ws.close(1008, "Conversation not found");
              return;
            }
          }

          if (!callSid) {
            logger.error("No callSid provided — closing stream");
            ws.close(1008, "Missing callSid");
            return;
          }

          // Initialise the call orchestrator (STT → LLM → TTS pipeline)
          orchestrator = new CallOrchestrator(ws, callSid, streamSid, agentId);
          logger.info({ callSid }, "Orchestrator initialised");

          // ── 30-second billing ticker ─────────────────────────────────────
          // Deducts 0.5 minutes (= 30 seconds) every 30 s using the new
          // optimistic-locking deductMinutes() method. Terminates the call
          // immediately if the org runs out of credit mid-call.
          if (orgId && conversationId) {
            billingInterval = setInterval(async () => {
              if (!orgId || !conversationId) return;
              const deducted = await billingService.deductMinutes(
                orgId,
                0.5,
                conversationId
              );
              if (!deducted) {
                logger.warn(
                  { orgId, callSid },
                  "Credit exhausted mid-call — terminating connection"
                );
                ws.close(1008, "Insufficient balance");
              }
            }, 30_000);
          } else {
            logger.warn(
              { callSid },
              "orgId or conversationId missing — billing ticker not started"
            );
          }

          // ── Ghost call protection ─────────────────────────────────────────
          // If Twilio connects but never sends audio (network drop, spoofed
          // connection), close after 10 seconds of silence to free resources.
          ghostCallTimer = setInterval(() => {
            if (Date.now() - lastAudioTs > 10_000) {
              logger.warn({ callSid }, "Ghost call detected — no audio for 10 s, closing");
              ws.close(1008, "Ghost call timeout");
            }
          }, 5_000);

          break;
        }

        case "media":
          // Refresh ghost-call watchdog on every packet
          lastAudioTs = Date.now();
          if (orchestrator) {
            orchestrator.handleAudio(msg.media.payload);
          }
          break;

        case "stop":
          logger.info({ callSid }, "Call stop event received");
          await handleCallEnd();
          break;
      }
    } catch (err) {
      logger.error({ err }, "WebSocket message error");
    }
  });

  ws.on("close", async () => {
    logger.info({ callSid }, "Stream disconnected");
    await handleCallEnd();
  });

  ws.on("error", (error) => {
    logger.error({ error, callSid }, "WebSocket error");
  });

  /**
   * handleCallEnd — idempotent teardown called on stop event OR ws close.
   *
   * Order of operations:
   *  1. Clear billing ticker and ghost-call timer
   *  2. Cleanup orchestrator (stops STT/TTS)
   *  3. Release CallReservation pre-auth
   *  4. Mark conversation COMPLETED with end_time
   *  5. Apply final billing deduction via callService
   */
  const handleCallEnd = async () => {
    // Idempotency guard — stop/close can both fire for the same call
    if (callEndHandled) return;
    callEndHandled = true;

    try {
      // 1. Stop recurring timers immediately to prevent spurious ticks after end
      if (billingInterval) {
        clearInterval(billingInterval);
        billingInterval = null;
      }
      if (ghostCallTimer) {
        clearInterval(ghostCallTimer);
        ghostCallTimer = null;
      }

      // 2. Shut down the STT/TTS pipeline
      if (orchestrator) {
        orchestrator.cleanup();
        orchestrator = null;
      }

      if (!callSid || !conversationId) {
        logger.warn({ callSid }, "No callSid or conversationId — skipping billing cleanup");
        return;
      }

      // 3. Release the pre-auth reservation created in voice.ts
      await prisma.callReservation.deleteMany({
        where: { call_sid: callSid },
      });
      logger.info({ callSid }, "CallReservation released");

      // 4. Mark conversation as complete
      const conversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          end_time: new Date(),
          status: "COMPLETED",
        },
        include: {
          agent: { include: { org: true } },
        },
      });

      logger.info(
        { callSid, durationMinutes: getDurationMinutes(conversation) },
        "Call ended"
      );

      // 5. Final billing deduction (remaining minutes not yet covered by ticker)
      try {
        const billingResult = await callService.handleCallEnd(conversationId);
        logger.info(
          {
            conversationId,
            duration: billingResult.duration,
            cost: billingResult.cost,
            orgId: conversation.agent.org_id,
            remainingBalance: conversation.agent.org.credit_balance,
          },
          "Final billing processed"
        );

        if (conversation.agent.org.credit_balance < 100) {
          logger.warn(
            { orgId: conversation.agent.org_id, balance: conversation.agent.org.credit_balance },
            "Low balance warning — organisation should be notified"
          );
          // TODO: Send low-balance notification email / webhook
        }
      } catch (billingError) {
        // Non-fatal — log for manual review but don't re-throw
        logger.error(
          { error: billingError, conversationId, orgId: conversation.agent.org_id },
          "Final billing failed"
        );
      }
    } catch (error) {
      logger.error({ error, callSid, conversationId }, "Error in handleCallEnd");
    }
  };

  /**
   * Returns call duration in whole minutes (ceiling).
   */
  const getDurationMinutes = (conversation: any): number => {
    if (!conversation.start_time || !conversation.end_time) return 0;
    const durationMs =
      conversation.end_time.getTime() - conversation.start_time.getTime();
    return Math.ceil(durationMs / 60_000);
  };
};

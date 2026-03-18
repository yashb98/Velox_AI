"use strict";
// velox-api/src/websocket/streamHandler.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAudioStream = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("../utils/logger");
const orchestrator_1 = require("../services/orchestrator");
const callService_1 = require("../services/callService");
const billingService_1 = require("../services/billingService");
const prisma = new client_1.PrismaClient();
const handleAudioStream = (ws, req) => {
    let orchestrator = null;
    let callSid = null;
    let conversationId = null;
    let orgId = null; // extracted from stream params (Day 1)
    let startTime = null;
    // Interval handles — cleared in handleCallEnd to prevent timer leaks
    let billingInterval = null;
    let ghostCallTimer = null;
    // Ghost call protection — updated on every audio packet
    let lastAudioTs = Date.now();
    // Guard so handleCallEnd is idempotent (stop/close can both fire)
    let callEndHandled = false;
    ws.on("message", async (message) => {
        try {
            const msg = JSON.parse(message.toString());
            switch (msg.event) {
                case "connected":
                    logger_1.logger.info("Audio Stream Connected");
                    break;
                case "start": {
                    callSid = msg.start.callSid;
                    const streamSid = msg.start.streamSid;
                    const agentId = msg.start.customParameters?.agentId || "default";
                    conversationId = msg.start.customParameters?.conversationId;
                    orgId = msg.start.customParameters?.orgId || null;
                    startTime = new Date();
                    lastAudioTs = Date.now();
                    logger_1.logger.info({ callSid, agentId, orgId }, "Call started");
                    // Verify the conversation exists
                    if (conversationId) {
                        const conversation = await prisma.conversation.findUnique({
                            where: { id: conversationId },
                        });
                        if (!conversation) {
                            logger_1.logger.error({ conversationId }, "Conversation not found — closing stream");
                            ws.close(1008, "Conversation not found");
                            return;
                        }
                    }
                    if (!callSid) {
                        logger_1.logger.error("No callSid provided — closing stream");
                        ws.close(1008, "Missing callSid");
                        return;
                    }
                    // Initialise the call orchestrator (STT → LLM → TTS pipeline)
                    orchestrator = new orchestrator_1.CallOrchestrator(ws, callSid, streamSid, agentId);
                    logger_1.logger.info({ callSid }, "Orchestrator initialised");
                    // ── 30-second billing ticker ─────────────────────────────────────
                    // Deducts 0.5 minutes (= 30 seconds) every 30 s using the new
                    // optimistic-locking deductMinutes() method. Terminates the call
                    // immediately if the org runs out of credit mid-call.
                    if (orgId && conversationId) {
                        billingInterval = setInterval(async () => {
                            if (!orgId || !conversationId)
                                return;
                            const deducted = await billingService_1.billingService.deductMinutes(orgId, 0.5, conversationId);
                            if (!deducted) {
                                logger_1.logger.warn({ orgId, callSid }, "Credit exhausted mid-call — terminating connection");
                                ws.close(1008, "Insufficient balance");
                            }
                        }, 30000);
                    }
                    else {
                        logger_1.logger.warn({ callSid }, "orgId or conversationId missing — billing ticker not started");
                    }
                    // ── Ghost call protection ─────────────────────────────────────────
                    // If Twilio connects but never sends audio (network drop, spoofed
                    // connection), close after 10 seconds of silence to free resources.
                    ghostCallTimer = setInterval(() => {
                        if (Date.now() - lastAudioTs > 10000) {
                            logger_1.logger.warn({ callSid }, "Ghost call detected — no audio for 10 s, closing");
                            ws.close(1008, "Ghost call timeout");
                        }
                    }, 5000);
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
                    logger_1.logger.info({ callSid }, "Call stop event received");
                    await handleCallEnd();
                    break;
            }
        }
        catch (err) {
            logger_1.logger.error({ err }, "WebSocket message error");
        }
    });
    ws.on("close", async () => {
        logger_1.logger.info({ callSid }, "Stream disconnected");
        await handleCallEnd();
    });
    ws.on("error", (error) => {
        logger_1.logger.error({ error, callSid }, "WebSocket error");
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
        if (callEndHandled)
            return;
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
                logger_1.logger.warn({ callSid }, "No callSid or conversationId — skipping billing cleanup");
                return;
            }
            // 3. Release the pre-auth reservation created in voice.ts
            await prisma.callReservation.deleteMany({
                where: { call_sid: callSid },
            });
            logger_1.logger.info({ callSid }, "CallReservation released");
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
            logger_1.logger.info({ callSid, durationMinutes: getDurationMinutes(conversation) }, "Call ended");
            // 5. Final billing deduction (remaining minutes not yet covered by ticker)
            try {
                const billingResult = await callService_1.callService.handleCallEnd(conversationId);
                logger_1.logger.info({
                    conversationId,
                    duration: billingResult.duration,
                    cost: billingResult.cost,
                    orgId: conversation.agent.org_id,
                    remainingBalance: conversation.agent.org.credit_balance,
                }, "Final billing processed");
                if (conversation.agent.org.credit_balance < 100) {
                    logger_1.logger.warn({ orgId: conversation.agent.org_id, balance: conversation.agent.org.credit_balance }, "Low balance warning — organisation should be notified");
                    // TODO: Send low-balance notification email / webhook
                }
            }
            catch (billingError) {
                // Non-fatal — log for manual review but don't re-throw
                logger_1.logger.error({ error: billingError, conversationId, orgId: conversation.agent.org_id }, "Final billing failed");
            }
        }
        catch (error) {
            logger_1.logger.error({ error, callSid, conversationId }, "Error in handleCallEnd");
        }
    };
    /**
     * Returns call duration in whole minutes (ceiling).
     */
    const getDurationMinutes = (conversation) => {
        if (!conversation.start_time || !conversation.end_time)
            return 0;
        const durationMs = conversation.end_time.getTime() - conversation.start_time.getTime();
        return Math.ceil(durationMs / 60000);
    };
};
exports.handleAudioStream = handleAudioStream;

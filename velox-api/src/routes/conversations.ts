// src/routes/conversations.ts
//
// 5.3 — GET /api/conversations  (paginated list for the org)
//       GET /api/conversations/:conversationId  (single + messages)

import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

const router = Router();
const prisma = new PrismaClient();

// ── GET /api/conversations ───────────────────────────────────────────────────
// Query params:  ?page=1&limit=20&agentId=xxx&status=COMPLETED
router.get("/", async (req, res) => {
  try {
    const orgId = (req as any).auth?.orgId as string | undefined;
    if (!orgId) return res.status(401).json({ error: "Organization ID missing from token" });

    const page    = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit   = Math.min(100, parseInt(req.query.limit as string) || 20);
    const skip    = (page - 1) * limit;
    const agentId = req.query.agentId as string | undefined;
    const status  = req.query.status  as string | undefined;

    const where: any = {
      agent: { org_id: orgId, deletedAt: null },
      deletedAt: null,
      ...(agentId && { agent_id: agentId }),
      ...(status  && { status }),
    };

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        select: {
          id: true,
          twilio_sid: true,
          status: true,
          start_time: true,
          end_time: true,
          cost_accrued: true,
          sentiment_score: true,
          agent_id: true,
          agent: { select: { name: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { start_time: "desc" },
        skip,
        take: limit,
      }),
      prisma.conversation.count({ where }),
    ]);

    res.json({
      conversations,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    logger.error({ error }, "GET /api/conversations failed");
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// ── GET /api/conversations/:conversationId ───────────────────────────────────
router.get("/:conversationId", async (req, res) => {
  try {
    const orgId = (req as any).auth?.orgId as string | undefined;
    if (!orgId) return res.status(401).json({ error: "Organization ID missing from token" });

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: req.params.conversationId,
        agent: { org_id: orgId },
        deletedAt: null,
      },
      include: {
        agent: { select: { id: true, name: true } },
        messages: {
          orderBy: { created_at: "asc" },
          select: { id: true, role: true, content: true, latency_ms: true, created_at: true },
        },
      },
    });

    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    res.json(conversation);
  } catch (error: any) {
    logger.error({ error }, "GET /api/conversations/:id failed");
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

export default router;

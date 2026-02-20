// src/routes/agents.ts
//
// 5.3 — GET /api/agents  (list all agents for the authenticated org)
//       GET /api/agents/:agentId  (single agent detail)
//       POST /api/agents  (create agent)
//       PATCH /api/agents/:agentId  (update agent — includes is_active toggle)
//       DELETE /api/agents/:agentId  (soft-delete agent)

import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

const router = Router();
const prisma = new PrismaClient();

// ── GET /api/agents ─────────────────────────────────────────────────────────
// Returns all non-deleted agents for the requesting org (from Clerk JWT).
router.get("/", async (req, res) => {
  try {
    const orgId = (req as any).auth?.orgId as string | undefined;
    if (!orgId) return res.status(401).json({ error: "Organization ID missing from token" });

    const agents = await prisma.agent.findMany({
      where: { org_id: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        voice_id: true,
        phone_number: true,
        tools_enabled: true,
        llm_config: true,
        kb_id: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { created_at: "desc" },
    });

    res.json({ agents, total: agents.length });
  } catch (error: any) {
    logger.error({ error }, "GET /api/agents failed");
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

// ── GET /api/agents/:agentId ─────────────────────────────────────────────────
router.get("/:agentId", async (req, res) => {
  try {
    const orgId = (req as any).auth?.orgId as string | undefined;
    if (!orgId) return res.status(401).json({ error: "Organization ID missing from token" });

    const agent = await prisma.agent.findFirst({
      where: { id: req.params.agentId, org_id: orgId, deletedAt: null },
      include: {
        kb: { select: { id: true, name: true } },
        _count: { select: { conversations: true } },
      },
    });

    if (!agent) return res.status(404).json({ error: "Agent not found" });

    res.json(agent);
  } catch (error: any) {
    logger.error({ error }, "GET /api/agents/:agentId failed");
    res.status(500).json({ error: "Failed to fetch agent" });
  }
});

// ── POST /api/agents ─────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const orgId = (req as any).auth?.orgId as string | undefined;
    if (!orgId) return res.status(401).json({ error: "Organization ID missing from token" });

    const { name, system_prompt, voice_id, phone_number, kb_id, tools_enabled, llm_config } = req.body;

    if (!name || !system_prompt || !voice_id) {
      return res.status(400).json({ error: "name, system_prompt, and voice_id are required" });
    }

    const agent = await prisma.agent.create({
      data: {
        name,
        system_prompt,
        voice_id,
        phone_number: phone_number ?? null,
        kb_id: kb_id ?? null,
        tools_enabled: tools_enabled ?? [],
        llm_config: llm_config ?? {},
        is_active: true,
        org_id: orgId,
      },
    });

    res.status(201).json(agent);
  } catch (error: any) {
    logger.error({ error }, "POST /api/agents failed");
    res.status(500).json({ error: "Failed to create agent" });
  }
});

// ── PATCH /api/agents/:agentId ───────────────────────────────────────────────
router.patch("/:agentId", async (req, res) => {
  try {
    const orgId = (req as any).auth?.orgId as string | undefined;
    if (!orgId) return res.status(401).json({ error: "Organization ID missing from token" });

    const existing = await prisma.agent.findFirst({
      where: { id: req.params.agentId, org_id: orgId, deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: "Agent not found" });

    const { name, system_prompt, voice_id, phone_number, kb_id, tools_enabled, llm_config, is_active } = req.body;

    const updated = await prisma.agent.update({
      where: { id: req.params.agentId },
      data: {
        ...(name !== undefined && { name }),
        ...(system_prompt !== undefined && { system_prompt }),
        ...(voice_id !== undefined && { voice_id }),
        ...(phone_number !== undefined && { phone_number }),
        ...(kb_id !== undefined && { kb_id }),
        ...(tools_enabled !== undefined && { tools_enabled }),
        ...(llm_config !== undefined && { llm_config }),
        ...(is_active !== undefined && { is_active }),
      },
    });

    res.json(updated);
  } catch (error: any) {
    logger.error({ error }, "PATCH /api/agents/:agentId failed");
    res.status(500).json({ error: "Failed to update agent" });
  }
});

// ── PUT /api/agents/:agentId ─────────────────────────────────────────────────
// Full replace of llm_config (used by flow builder to persist flows)
router.put("/:agentId", async (req, res) => {
  try {
    const orgId = (req as any).auth?.orgId as string | undefined;
    if (!orgId) return res.status(401).json({ error: "Organization ID missing from token" });

    const existing = await prisma.agent.findFirst({
      where: { id: req.params.agentId, org_id: orgId, deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: "Agent not found" });

    const { name, system_prompt, voice_id, phone_number, kb_id, tools_enabled, llm_config, is_active } = req.body;

    const updated = await prisma.agent.update({
      where: { id: req.params.agentId },
      data: {
        ...(name !== undefined && { name }),
        ...(system_prompt !== undefined && { system_prompt }),
        ...(voice_id !== undefined && { voice_id }),
        ...(phone_number !== undefined && { phone_number }),
        ...(kb_id !== undefined && { kb_id }),
        ...(tools_enabled !== undefined && { tools_enabled }),
        ...(llm_config !== undefined && { llm_config }),
        ...(is_active !== undefined && { is_active }),
      },
    });

    res.json(updated);
  } catch (error: any) {
    logger.error({ error }, "PUT /api/agents/:agentId failed");
    res.status(500).json({ error: "Failed to update agent" });
  }
});

// ── DELETE /api/agents/:agentId ──────────────────────────────────────────────
// Soft-delete: sets deletedAt and deactivates the agent.
router.delete("/:agentId", async (req, res) => {
  try {
    const orgId = (req as any).auth?.orgId as string | undefined;
    if (!orgId) return res.status(401).json({ error: "Organization ID missing from token" });

    const existing = await prisma.agent.findFirst({
      where: { id: req.params.agentId, org_id: orgId, deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: "Agent not found" });

    await prisma.agent.update({
      where: { id: req.params.agentId },
      data: {
        deletedAt: new Date(),
        is_active: false,
      },
    });

    res.status(204).send();
  } catch (error: any) {
    logger.error({ error }, "DELETE /api/agents/:agentId failed");
    res.status(500).json({ error: "Failed to delete agent" });
  }
});

export default router;

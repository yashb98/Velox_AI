-- Migration: add_agent_is_active
-- Adds is_active Boolean field to agents table.
-- Existing agents default to TRUE so no calls are rejected after deploy.

ALTER TABLE "agents" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT TRUE;

-- Index for fast lookup in voice.ts (phone_number + is_active + deletedAt)
CREATE INDEX IF NOT EXISTS "agents_is_active_idx" ON "agents"("is_active");

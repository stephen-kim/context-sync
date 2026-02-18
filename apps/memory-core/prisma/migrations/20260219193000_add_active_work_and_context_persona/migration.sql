CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  CREATE TYPE "ContextPersona" AS ENUM ('default', 'author', 'reviewer', 'architect');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ActiveWorkStatus" AS ENUM ('inferred', 'confirmed', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "persona_weights" JSONB NOT NULL DEFAULT '{"default":{"decision":1.0,"constraint":1.0,"active_work":1.0,"recent_activity":1.0},"author":{"active_work":2.0,"recent_activity":1.5,"decision":0.8,"constraint":0.8},"reviewer":{"constraint":2.0,"decision":1.5,"recent_activity":1.0,"active_work":0.9},"architect":{"decision":2.0,"constraint":1.5,"active_work":1.0,"recent_activity":0.9}}'::jsonb;

CREATE TABLE IF NOT EXISTS "user_settings" (
  "user_id" TEXT PRIMARY KEY,
  "context_persona" "ContextPersona" NOT NULL DEFAULT 'default',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_settings_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "active_work" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "evidence_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "status" "ActiveWorkStatus" NOT NULL DEFAULT 'inferred',
  "last_updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "active_work_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "active_work_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "active_work_workspace_id_project_id_title_key"
    UNIQUE ("workspace_id", "project_id", "title")
);

CREATE INDEX IF NOT EXISTS "active_work_project_id_status_last_updated_at_idx"
  ON "active_work"("project_id", "status", "last_updated_at" DESC);

CREATE INDEX IF NOT EXISTS "active_work_workspace_id_project_id_status_idx"
  ON "active_work"("workspace_id", "project_id", "status");

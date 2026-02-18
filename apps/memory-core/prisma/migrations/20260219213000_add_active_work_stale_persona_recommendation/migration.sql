DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContextPersona') THEN
    BEGIN
      ALTER TYPE "ContextPersona" RENAME VALUE 'default' TO 'neutral';
    EXCEPTION
      WHEN invalid_parameter_value THEN
        NULL;
      WHEN undefined_object THEN
        NULL;
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActiveWorkEventType') THEN
    CREATE TYPE "ActiveWorkEventType" AS ENUM (
      'created',
      'updated',
      'stale_marked',
      'stale_cleared',
      'confirmed',
      'closed',
      'reopened'
    );
  END IF;
END $$;

ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "active_work_stale_days" INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS "active_work_auto_close_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "active_work_auto_close_days" INTEGER NOT NULL DEFAULT 45;

ALTER TABLE "workspace_settings"
  ALTER COLUMN "persona_weights"
  SET DEFAULT '{"neutral":{"decision":1.0,"constraint":1.0,"active_work":1.1,"recent_activity":1.0},"author":{"active_work":2.0,"recent_activity":1.5,"decision":0.8,"constraint":0.8},"reviewer":{"constraint":2.0,"decision":1.5,"recent_activity":1.0,"active_work":0.9},"architect":{"decision":2.0,"constraint":1.5,"active_work":1.0,"recent_activity":0.9}}'::jsonb;

UPDATE "workspace_settings"
SET "persona_weights" = jsonb_set("persona_weights" - 'default', '{neutral}', ("persona_weights"->'default'), true)
WHERE "persona_weights" ? 'default' AND NOT ("persona_weights" ? 'neutral');

ALTER TABLE "user_settings"
  ALTER COLUMN "context_persona" SET DEFAULT 'neutral';

ALTER TABLE "active_work"
  ADD COLUMN IF NOT EXISTS "stale" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stale_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "last_evidence_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "active_work_project_id_stale_last_evidence_at_idx"
  ON "active_work"("project_id", "stale", "last_evidence_at" DESC);

CREATE TABLE IF NOT EXISTS "active_work_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "active_work_id" UUID NOT NULL,
  "event_type" "ActiveWorkEventType" NOT NULL,
  "details" JSONB DEFAULT '{}'::jsonb,
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "active_work_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "active_work_events_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "active_work_events_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "active_work_events_active_work_id_fkey"
    FOREIGN KEY ("active_work_id") REFERENCES "active_work"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "active_work_events_project_id_created_at_idx"
  ON "active_work_events"("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "active_work_events_active_work_id_created_at_idx"
  ON "active_work_events"("active_work_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "active_work_events_workspace_id_correlation_id_idx"
  ON "active_work_events"("workspace_id", "correlation_id");

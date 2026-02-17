-- Retention mode enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RetentionMode') THEN
    CREATE TYPE "RetentionMode" AS ENUM ('archive', 'hard_delete');
  END IF;
END $$;

-- Workspace settings retention policy
ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "retention_policy_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "audit_retention_days" INTEGER NOT NULL DEFAULT 365,
  ADD COLUMN IF NOT EXISTS "raw_retention_days" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS "retention_mode" "RetentionMode" NOT NULL DEFAULT 'archive';

-- Correlation id on audit logs
ALTER TABLE "audit_logs"
  ADD COLUMN IF NOT EXISTS "correlation_id" TEXT;

CREATE INDEX IF NOT EXISTS "audit_logs_workspace_id_correlation_id_idx"
  ON "audit_logs" ("workspace_id", "correlation_id");

-- Archive table for audit retention
CREATE TABLE IF NOT EXISTS "audit_logs_archive" (
  "id" UUID PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "project_id" TEXT,
  "actor_user_id" TEXT NOT NULL,
  "correlation_id" TEXT,
  "action" TEXT NOT NULL,
  "target" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "audit_logs_archive_workspace_id_created_at_idx"
  ON "audit_logs_archive" ("workspace_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "audit_logs_archive_workspace_id_correlation_id_idx"
  ON "audit_logs_archive" ("workspace_id", "correlation_id");

CREATE INDEX IF NOT EXISTS "audit_logs_archive_project_id_created_at_idx"
  ON "audit_logs_archive" ("project_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "audit_logs_archive_action_created_at_idx"
  ON "audit_logs_archive" ("action", "created_at" DESC);

-- Append-only guard for audit logs.
-- NOTE: retention worker temporarily sets `claustrum.audit_maintenance=on`
-- inside a transaction to archive/delete old rows.
CREATE OR REPLACE FUNCTION "claustrum_prevent_audit_logs_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('claustrum.audit_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS "audit_logs_append_only_guard" ON "audit_logs";
CREATE TRIGGER "audit_logs_append_only_guard"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "claustrum_prevent_audit_logs_mutation"();

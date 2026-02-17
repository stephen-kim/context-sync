DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditSinkType') THEN
    CREATE TYPE "AuditSinkType" AS ENUM ('webhook', 'http');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditDeliveryStatus') THEN
    CREATE TYPE "AuditDeliveryStatus" AS ENUM ('queued', 'sending', 'delivered', 'failed');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SecuritySeverity') THEN
    CREATE TYPE "SecuritySeverity" AS ENUM ('low', 'medium', 'high');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SecurityCategory') THEN
    CREATE TYPE "SecurityCategory" AS ENUM ('auth', 'access', 'data', 'config');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DetectionStatus') THEN
    CREATE TYPE "DetectionStatus" AS ENUM ('open', 'ack', 'closed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "audit_sinks" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "type" "AuditSinkType" NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "endpoint_url" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "event_filter" JSONB NOT NULL DEFAULT '{"include_prefixes":[],"exclude_actions":[]}'::jsonb,
  "retry_policy" JSONB NOT NULL DEFAULT '{"max_attempts":5,"backoff_sec":[1,5,30,120,600]}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "audit_sinks_workspace_id_enabled_updated_at_idx"
  ON "audit_sinks" ("workspace_id", "enabled", "updated_at" DESC);

ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "security_stream_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "security_stream_sink_id" UUID,
  ADD COLUMN IF NOT EXISTS "security_stream_min_severity" "SecuritySeverity" NOT NULL DEFAULT 'medium';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_settings_security_stream_sink_id_fkey'
  ) THEN
    ALTER TABLE "workspace_settings"
      ADD CONSTRAINT "workspace_settings_security_stream_sink_id_fkey"
      FOREIGN KEY ("security_stream_sink_id")
      REFERENCES "audit_sinks"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "workspace_settings_security_stream_sink_id_idx"
  ON "workspace_settings" ("security_stream_sink_id");

CREATE TABLE IF NOT EXISTS "audit_delivery_queue" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sink_id" UUID NOT NULL REFERENCES "audit_sinks"("id") ON DELETE CASCADE,
  "audit_log_id" UUID NOT NULL REFERENCES "audit_logs"("id") ON DELETE CASCADE,
  "workspace_id" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "status" "AuditDeliveryStatus" NOT NULL DEFAULT 'queued',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_delivery_queue_sink_id_audit_log_id_key" UNIQUE ("sink_id", "audit_log_id")
);

CREATE INDEX IF NOT EXISTS "audit_delivery_queue_workspace_id_status_next_attempt_at_idx"
  ON "audit_delivery_queue" ("workspace_id", "status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "audit_delivery_queue_sink_id_status_next_attempt_at_idx"
  ON "audit_delivery_queue" ("sink_id", "status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "audit_delivery_queue_audit_log_id_idx"
  ON "audit_delivery_queue" ("audit_log_id");

CREATE TABLE IF NOT EXISTS "detection_rules" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "severity" "SecuritySeverity" NOT NULL DEFAULT 'medium',
  "condition" JSONB NOT NULL,
  "notify" JSONB NOT NULL DEFAULT '{"via":"security_stream"}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "detection_rules_workspace_id_enabled_updated_at_idx"
  ON "detection_rules" ("workspace_id", "enabled", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "detections" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "rule_id" UUID NOT NULL REFERENCES "detection_rules"("id") ON DELETE CASCADE,
  "triggered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor_user_id" TEXT,
  "correlation_id" TEXT,
  "evidence" JSONB,
  "status" "DetectionStatus" NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "detections_workspace_id_status_triggered_at_idx"
  ON "detections" ("workspace_id", "status", "triggered_at" DESC);
CREATE INDEX IF NOT EXISTS "detections_rule_id_status_triggered_at_idx"
  ON "detections" ("rule_id", "status", "triggered_at" DESC);
CREATE INDEX IF NOT EXISTS "detections_workspace_id_correlation_id_idx"
  ON "detections" ("workspace_id", "correlation_id");

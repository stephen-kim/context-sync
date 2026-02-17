DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GithubWebhookSyncMode') THEN
    CREATE TYPE "GithubWebhookSyncMode" AS ENUM ('add_only', 'add_and_remove');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GithubWebhookEventStatus') THEN
    CREATE TYPE "GithubWebhookEventStatus" AS ENUM ('queued', 'processing', 'done', 'failed');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GithubTeamMappingTargetType') THEN
    CREATE TYPE "GithubTeamMappingTargetType" AS ENUM ('workspace', 'project');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GithubTeamMappingRole') THEN
    CREATE TYPE "GithubTeamMappingRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'MAINTAINER', 'WRITER', 'READER');
  END IF;
END
$$;

ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "github_webhook_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "github_webhook_sync_mode" "GithubWebhookSyncMode" NOT NULL DEFAULT 'add_only',
  ADD COLUMN IF NOT EXISTS "github_team_mapping_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "github_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT,
  "installation_id" BIGINT NOT NULL,
  "event_type" TEXT NOT NULL,
  "delivery_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "GithubWebhookEventStatus" NOT NULL DEFAULT 'queued',
  "error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "github_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "github_webhook_events_delivery_id_key"
  ON "github_webhook_events" ("delivery_id");

CREATE INDEX IF NOT EXISTS "github_webhook_events_workspace_id_status_updated_at_idx"
  ON "github_webhook_events" ("workspace_id", "status", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "github_webhook_events_installation_id_status_updated_at_idx"
  ON "github_webhook_events" ("installation_id", "status", "updated_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'github_webhook_events_workspace_id_fkey'
  ) THEN
    ALTER TABLE "github_webhook_events"
      ADD CONSTRAINT "github_webhook_events_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "github_team_mappings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "provider_installation_id" BIGINT,
  "github_team_id" BIGINT NOT NULL,
  "github_team_slug" TEXT NOT NULL,
  "github_org_login" TEXT NOT NULL,
  "target_type" "GithubTeamMappingTargetType" NOT NULL,
  "target_key" TEXT NOT NULL,
  "role" "GithubTeamMappingRole" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "github_team_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "github_team_mappings_workspace_id_github_team_id_target_type_target_key_key"
  ON "github_team_mappings" ("workspace_id", "github_team_id", "target_type", "target_key");

CREATE INDEX IF NOT EXISTS "github_team_mappings_workspace_id_enabled_priority_updated_at_idx"
  ON "github_team_mappings" ("workspace_id", "enabled", "priority", "updated_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'github_team_mappings_workspace_id_fkey'
  ) THEN
    ALTER TABLE "github_team_mappings"
      ADD CONSTRAINT "github_team_mappings_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

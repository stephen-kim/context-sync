DO $$
BEGIN
  CREATE TYPE "OutboundIntegrationType" AS ENUM ('slack', 'jira', 'confluence', 'notion', 'webhook', 'email');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "OutboundMessageMode" AS ENUM ('template', 'llm');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "OutboundMessageStyle" AS ENUM ('short', 'normal', 'verbose');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "default_outbound_locale" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS "supported_outbound_locales" JSONB NOT NULL DEFAULT '["en","ko","ja","es","zh"]'::jsonb;

CREATE TABLE IF NOT EXISTS "outbound_message_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "integration_type" "OutboundIntegrationType" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "locale_default" TEXT NOT NULL DEFAULT 'en',
  "supported_locales" JSONB NOT NULL DEFAULT '["en","ko","ja","es","zh"]'::jsonb,
  "mode" "OutboundMessageMode" NOT NULL DEFAULT 'template',
  "style" "OutboundMessageStyle" NOT NULL DEFAULT 'short',
  "template_overrides" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "llm_prompt_system" TEXT,
  "llm_prompt_user" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbound_message_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbound_message_policies_workspace_id_integration_type_key" UNIQUE ("workspace_id", "integration_type")
);

DO $$
BEGIN
  ALTER TABLE "outbound_message_policies"
    ADD CONSTRAINT "outbound_message_policies_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "outbound_message_policies_workspace_id_integration_type_enabled_idx"
  ON "outbound_message_policies"("workspace_id", "integration_type", "enabled");

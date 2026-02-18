DO $$ BEGIN
  CREATE TYPE "GlobalRulesRoutingMode" AS ENUM ('semantic', 'keyword', 'hybrid');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "global_rules_routing_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "global_rules_routing_mode" "GlobalRulesRoutingMode" NOT NULL DEFAULT 'hybrid',
  ADD COLUMN IF NOT EXISTS "global_rules_routing_top_k" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "global_rules_routing_min_score" DOUBLE PRECISION NOT NULL DEFAULT 0.2;

ALTER TABLE "global_rules"
  ADD COLUMN IF NOT EXISTS "tags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "last_routed_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "global_rules_workspace_scope_enabled_last_routed_idx"
  ON "global_rules" ("workspace_id", "scope", "enabled", "last_routed_at" DESC);

CREATE INDEX IF NOT EXISTS "global_rules_tags_gin_idx"
  ON "global_rules" USING GIN ("tags");

ALTER TABLE "workspace_settings"
  DROP CONSTRAINT IF EXISTS "workspace_settings_global_rules_routing_top_k_ck";
ALTER TABLE "workspace_settings"
  ADD CONSTRAINT "workspace_settings_global_rules_routing_top_k_ck"
  CHECK ("global_rules_routing_top_k" >= 1 AND "global_rules_routing_top_k" <= 100);

ALTER TABLE "workspace_settings"
  DROP CONSTRAINT IF EXISTS "workspace_settings_global_rules_routing_min_score_ck";
ALTER TABLE "workspace_settings"
  ADD CONSTRAINT "workspace_settings_global_rules_routing_min_score_ck"
  CHECK ("global_rules_routing_min_score" >= 0 AND "global_rules_routing_min_score" <= 1);

DO $$
BEGIN
  CREATE TYPE "GlobalRuleScope" AS ENUM ('workspace', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "GlobalRuleCategory" AS ENUM ('policy', 'security', 'style', 'process', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "GlobalRuleSeverity" AS ENUM ('low', 'medium', 'high');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "GlobalRulesSelectionMode" AS ENUM ('score', 'recent', 'priority_only');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "bundle_token_budget_total" INTEGER NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS "bundle_budget_global_workspace_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  ADD COLUMN IF NOT EXISTS "bundle_budget_global_user_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS "bundle_budget_project_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.45,
  ADD COLUMN IF NOT EXISTS "bundle_budget_retrieval_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
  ADD COLUMN IF NOT EXISTS "global_rules_recommend_max" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "global_rules_warn_threshold" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "global_rules_summary_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "global_rules_summary_min_count" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "global_rules_selection_mode" "GlobalRulesSelectionMode" NOT NULL DEFAULT 'score';

CREATE TABLE IF NOT EXISTS "global_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope" "GlobalRuleScope" NOT NULL,
  "workspace_id" TEXT,
  "user_id" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" "GlobalRuleCategory" NOT NULL DEFAULT 'policy',
  "priority" INTEGER NOT NULL DEFAULT 3,
  "severity" "GlobalRuleSeverity" NOT NULL DEFAULT 'medium',
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "usage_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "global_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "global_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "global_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "global_rules_scope_ck" CHECK (
    (
      "scope" = 'workspace'
      AND "workspace_id" IS NOT NULL
      AND "user_id" IS NULL
    )
    OR (
      "scope" = 'user'
      AND "user_id" IS NOT NULL
    )
  ),
  CONSTRAINT "global_rules_priority_ck" CHECK ("priority" >= 1 AND "priority" <= 5)
);

CREATE INDEX IF NOT EXISTS "global_rules_workspace_scope_enabled_updated_idx"
  ON "global_rules" ("workspace_id", "scope", "enabled", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "global_rules_user_scope_enabled_updated_idx"
  ON "global_rules" ("user_id", "scope", "enabled", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "global_rule_summaries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT,
  "user_id" TEXT,
  "scope" "GlobalRuleScope" NOT NULL,
  "summary" TEXT NOT NULL,
  "source_rule_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "global_rule_summaries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "global_rule_summaries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "global_rule_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "global_rule_summaries_scope_ck" CHECK (
    (
      "scope" = 'workspace'
      AND "workspace_id" IS NOT NULL
      AND "user_id" IS NULL
    )
    OR (
      "scope" = 'user'
      AND "user_id" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "global_rule_summaries_scope_workspace_uidx"
  ON "global_rule_summaries" ("scope", "workspace_id")
  WHERE "workspace_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "global_rule_summaries_scope_user_uidx"
  ON "global_rule_summaries" ("scope", "user_id")
  WHERE "user_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "global_rule_summaries_workspace_scope_updated_idx"
  ON "global_rule_summaries" ("workspace_id", "scope", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "global_rule_summaries_user_scope_updated_idx"
  ON "global_rule_summaries" ("user_id", "scope", "updated_at" DESC);

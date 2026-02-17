DO $$
BEGIN
  CREATE TYPE "DecisionExtractionMode" AS ENUM ('llm_only', 'hybrid_priority');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DecisionDefaultStatus" AS ENUM ('draft', 'confirmed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "enable_activity_auto_log" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enable_decision_extraction" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "decision_extraction_mode" "DecisionExtractionMode" NOT NULL DEFAULT 'llm_only',
  ADD COLUMN IF NOT EXISTS "decision_default_status" "DecisionDefaultStatus" NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "decision_auto_confirm_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "decision_auto_confirm_min_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.90,
  ADD COLUMN IF NOT EXISTS "decision_batch_size" INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS "decision_backfill_days" INTEGER NOT NULL DEFAULT 30;

CREATE TABLE IF NOT EXISTS "decision_keyword_policies" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "positive_keywords" JSONB NOT NULL DEFAULT '["migrate","rename","deprecate","remove","switch","refactor"]'::jsonb,
  "negative_keywords" JSONB NOT NULL DEFAULT '["wip","tmp","debug","test","try"]'::jsonb,
  "file_path_positive_patterns" JSONB NOT NULL DEFAULT '["prisma/**","apps/memory-core/**","packages/shared/**"]'::jsonb,
  "file_path_negative_patterns" JSONB NOT NULL DEFAULT '["**/*.test.*","**/__tests__/**","**/tmp/**"]'::jsonb,
  "weight_positive" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "weight_negative" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "decision_keyword_policies_workspace_id_enabled_updated_at_idx"
  ON "decision_keyword_policies" ("workspace_id", "enabled", "updated_at" DESC);

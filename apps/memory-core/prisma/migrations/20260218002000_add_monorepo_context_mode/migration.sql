DO $$
BEGIN
  CREATE TYPE "MonorepoContextMode" AS ENUM ('shared_repo', 'split_subproject');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "monorepo_context_mode" "MonorepoContextMode" NOT NULL DEFAULT 'shared_repo',
  ADD COLUMN IF NOT EXISTS "monorepo_subpath_metadata_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "monorepo_subpath_boost_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "monorepo_subpath_boost_weight" DOUBLE PRECISION NOT NULL DEFAULT 1.5;

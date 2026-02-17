ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "github_cache_ttl_seconds" INTEGER NOT NULL DEFAULT 900;

CREATE TABLE IF NOT EXISTS "github_repo_teams_cache" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "github_repo_id" BIGINT NOT NULL,
  "teams_json" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "github_repo_teams_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "github_repo_teams_cache_workspace_id_github_repo_id_key"
  ON "github_repo_teams_cache" ("workspace_id", "github_repo_id");

CREATE INDEX IF NOT EXISTS "github_repo_teams_cache_workspace_id_updated_at_idx"
  ON "github_repo_teams_cache" ("workspace_id", "updated_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'github_repo_teams_cache_workspace_id_fkey'
  ) THEN
    ALTER TABLE "github_repo_teams_cache"
      ADD CONSTRAINT "github_repo_teams_cache_workspace_id_fkey"
      FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "github_team_members_cache" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "github_team_id" BIGINT NOT NULL,
  "members_json" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "github_team_members_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "github_team_members_cache_workspace_id_github_team_id_key"
  ON "github_team_members_cache" ("workspace_id", "github_team_id");

CREATE INDEX IF NOT EXISTS "github_team_members_cache_workspace_id_updated_at_idx"
  ON "github_team_members_cache" ("workspace_id", "updated_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'github_team_members_cache_workspace_id_fkey'
  ) THEN
    ALTER TABLE "github_team_members_cache"
      ADD CONSTRAINT "github_team_members_cache_workspace_id_fkey"
      FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END$$;

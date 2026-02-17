DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GithubPermissionSyncMode') THEN
    CREATE TYPE "GithubPermissionSyncMode" AS ENUM ('add_only', 'add_and_remove');
  END IF;
END$$;

ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "github_permission_sync_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "github_permission_sync_mode" "GithubPermissionSyncMode" NOT NULL DEFAULT 'add_only',
  ADD COLUMN IF NOT EXISTS "github_role_mapping" JSONB NOT NULL DEFAULT '{"admin":"maintainer","maintain":"maintainer","write":"writer","triage":"reader","read":"reader"}'::jsonb;

CREATE TABLE IF NOT EXISTS "github_user_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "github_user_id" BIGINT,
  "github_login" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "github_user_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "github_user_links_workspace_id_user_id_key"
  ON "github_user_links" ("workspace_id", "user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "github_user_links_workspace_id_github_login_key"
  ON "github_user_links" ("workspace_id", "github_login");

CREATE INDEX IF NOT EXISTS "github_user_links_workspace_id_github_user_id_idx"
  ON "github_user_links" ("workspace_id", "github_user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'github_user_links_workspace_id_fkey'
  ) THEN
    ALTER TABLE "github_user_links"
      ADD CONSTRAINT "github_user_links_workspace_id_fkey"
      FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'github_user_links_user_id_fkey'
  ) THEN
    ALTER TABLE "github_user_links"
      ADD CONSTRAINT "github_user_links_user_id_fkey"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "github_permission_cache" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "github_repo_id" BIGINT NOT NULL,
  "github_user_id" BIGINT NOT NULL,
  "permission" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "github_permission_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "github_permission_cache_workspace_id_github_repo_id_github_user_id_key"
  ON "github_permission_cache" ("workspace_id", "github_repo_id", "github_user_id");

CREATE INDEX IF NOT EXISTS "github_permission_cache_workspace_id_github_repo_id_updated_at_idx"
  ON "github_permission_cache" ("workspace_id", "github_repo_id", "updated_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'github_permission_cache_workspace_id_fkey'
  ) THEN
    ALTER TABLE "github_permission_cache"
      ADD CONSTRAINT "github_permission_cache_workspace_id_fkey"
      FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END$$;

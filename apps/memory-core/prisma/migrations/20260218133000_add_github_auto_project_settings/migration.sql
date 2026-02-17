ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "github_auto_create_projects" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "github_auto_create_subprojects" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "github_project_key_prefix" TEXT NOT NULL DEFAULT 'github:';

UPDATE "workspace_settings"
SET "github_project_key_prefix" = COALESCE(NULLIF(TRIM("auto_create_key_prefix"), ''), 'github:')
WHERE "github_project_key_prefix" IS NULL
   OR TRIM("github_project_key_prefix") = '';

ALTER TABLE "github_repo_links"
  ADD COLUMN IF NOT EXISTS "linked_project_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'github_repo_links_linked_project_id_fkey'
  ) THEN
    ALTER TABLE "github_repo_links"
      ADD CONSTRAINT "github_repo_links_linked_project_id_fkey"
      FOREIGN KEY ("linked_project_id")
      REFERENCES "projects"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "github_repo_links_workspace_id_linked_project_id_idx"
  ON "github_repo_links"("workspace_id", "linked_project_id");

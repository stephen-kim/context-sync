CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "invitation_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "project_roles" JSONB,
  "token_hash" TEXT NOT NULL UNIQUE,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "used_at" TIMESTAMPTZ,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitation_tokens_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "invitation_tokens_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "invitation_tokens_workspace_id_idx"
ON "invitation_tokens" ("workspace_id");

CREATE INDEX IF NOT EXISTS "invitation_tokens_email_idx"
ON "invitation_tokens" ("email");

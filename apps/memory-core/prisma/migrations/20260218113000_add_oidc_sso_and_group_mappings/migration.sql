CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  CREATE TYPE "OidcClaimGroupsFormat" AS ENUM ('id', 'name');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "OidcSyncMode" AS ENUM ('add_only', 'add_and_remove');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "OidcGroupMappingTargetType" AS ENUM ('workspace', 'project');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "OidcGroupMappingRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'MAINTAINER', 'WRITER', 'READER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "workspace_settings"
  ADD COLUMN IF NOT EXISTS "oidc_sync_mode" "OidcSyncMode" NOT NULL DEFAULT 'add_only',
  ADD COLUMN IF NOT EXISTS "oidc_allow_auto_provision" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "oidc_providers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "issuer_url" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "client_secret" TEXT NOT NULL,
  "discovery_enabled" BOOLEAN NOT NULL DEFAULT true,
  "scopes" TEXT NOT NULL DEFAULT 'openid profile email',
  "claim_groups_name" TEXT NOT NULL DEFAULT 'groups',
  "claim_groups_format" "OidcClaimGroupsFormat" NOT NULL DEFAULT 'id',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oidc_providers_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "oidc_providers_workspace_id_enabled_updated_at_idx"
ON "oidc_providers" ("workspace_id", "enabled", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "user_identities" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "provider_id" UUID NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "email" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_identities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_identities_provider_id_fkey"
    FOREIGN KEY ("provider_id") REFERENCES "oidc_providers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_identities_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_identities_provider_id_issuer_subject_key"
ON "user_identities" ("provider_id", "issuer", "subject");

CREATE INDEX IF NOT EXISTS "user_identities_user_id_idx"
ON "user_identities" ("user_id");

CREATE INDEX IF NOT EXISTS "user_identities_workspace_id_idx"
ON "user_identities" ("workspace_id");

CREATE TABLE IF NOT EXISTS "oidc_group_mappings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" TEXT NOT NULL,
  "provider_id" UUID NOT NULL,
  "claim_name" TEXT NOT NULL DEFAULT 'groups',
  "group_id" TEXT NOT NULL,
  "group_display_name" TEXT NOT NULL,
  "target_type" "OidcGroupMappingTargetType" NOT NULL,
  "target_key" TEXT NOT NULL,
  "role" "OidcGroupMappingRole" NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oidc_group_mappings_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "oidc_group_mappings_provider_id_fkey"
    FOREIGN KEY ("provider_id") REFERENCES "oidc_providers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "oidc_group_mappings_workspace_provider_claim_group_target_role_key"
ON "oidc_group_mappings" (
  "workspace_id",
  "provider_id",
  "claim_name",
  "group_id",
  "target_type",
  "target_key",
  "role"
);

CREATE INDEX IF NOT EXISTS "oidc_group_mappings_workspace_provider_enabled_priority_idx"
ON "oidc_group_mappings" ("workspace_id", "provider_id", "enabled", "priority");

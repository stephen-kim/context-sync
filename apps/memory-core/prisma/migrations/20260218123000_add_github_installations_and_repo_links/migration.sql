-- CreateEnum
CREATE TYPE "GithubAccountType" AS ENUM ('Organization', 'User');

-- CreateEnum
CREATE TYPE "GithubRepositorySelection" AS ENUM ('all', 'selected', 'unknown');

-- CreateTable
CREATE TABLE "github_installations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "installation_id" BIGINT NOT NULL,
    "account_type" "GithubAccountType" NOT NULL,
    "account_login" TEXT NOT NULL,
    "repository_selection" "GithubRepositorySelection" NOT NULL DEFAULT 'unknown',
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_repo_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "github_repo_id" BIGINT NOT NULL,
    "full_name" TEXT NOT NULL,
    "private" BOOLEAN NOT NULL,
    "default_branch" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_repo_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "github_installations_workspace_id_key" ON "github_installations"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "github_installations_installation_id_key" ON "github_installations"("installation_id");

-- CreateIndex
CREATE UNIQUE INDEX "github_repo_links_workspace_id_github_repo_id_key" ON "github_repo_links"("workspace_id", "github_repo_id");

-- CreateIndex
CREATE INDEX "github_repo_links_workspace_id_is_active_updated_at_idx" ON "github_repo_links"("workspace_id", "is_active", "updated_at" DESC);

-- AddForeignKey
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_repo_links" ADD CONSTRAINT "github_repo_links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

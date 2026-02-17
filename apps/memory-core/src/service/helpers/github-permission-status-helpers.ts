import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../auth.js';
import { assertWorkspaceAccess } from '../access-control.js';
import { getEffectiveWorkspaceSettings } from '../workspace-resolution.js';
import { normalizeGithubRoleMapping } from './github-permission-sync-utils.js';

type GithubPermissionStatusDeps = {
  prisma: PrismaClient;
  getWorkspaceByKey: (workspaceKey: string) => Promise<{ id: string; key: string }>;
};

export async function getGithubPermissionStatusHandler(
  deps: GithubPermissionStatusDeps,
  args: { auth: AuthContext; workspaceKey: string }
): Promise<{
  workspace_key: string;
  github_permission_sync_enabled: boolean;
  github_permission_sync_mode: 'add_only' | 'add_and_remove';
  github_cache_ttl_seconds: number;
  github_role_mapping: Record<string, 'owner' | 'maintainer' | 'writer' | 'reader'>;
  last_sync: null | {
    created_at: string;
    dry_run: boolean;
    repos_processed: number;
    users_matched: number;
    added: number;
    updated: number;
    removed: number;
    skipped_unmatched: number;
  };
  unmatched_users: Array<{
    repo_full_name: string;
    github_login: string | null;
    github_user_id: string | null;
    permission: string;
  }>;
}> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id, 'MEMBER');
  const settings = await getEffectiveWorkspaceSettings(deps.prisma, workspace.id);
  const last = await deps.prisma.auditLog.findFirst({
    where: {
      workspaceId: workspace.id,
      action: {
        in: ['github.permissions.computed', 'github.permissions.applied', 'github.permissions.synced'],
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      createdAt: true,
      target: true,
    },
  });

  const target = (last?.target || {}) as Record<string, unknown>;
  const toNumber = (value: unknown): number =>
    Number.isFinite(Number(value)) ? Number(value) : 0;
  const unmatched =
    Array.isArray(target.unmatched_users) &&
    target.unmatched_users.every((row) => row && typeof row === 'object')
      ? (target.unmatched_users as Array<{
          repo_full_name: string;
          github_login: string | null;
          github_user_id: string | null;
          permission: string;
        }>)
      : [];

  return {
    workspace_key: workspace.key,
    github_permission_sync_enabled: settings.githubPermissionSyncEnabled,
    github_permission_sync_mode: settings.githubPermissionSyncMode,
    github_cache_ttl_seconds: settings.githubCacheTtlSeconds,
    github_role_mapping: normalizeGithubRoleMapping(settings.githubRoleMapping),
    last_sync: last
      ? {
          created_at: last.createdAt.toISOString(),
          dry_run: target.dry_run === true,
          repos_processed: toNumber(target.repos_processed),
          users_matched: toNumber(target.users_matched),
          added: toNumber(target.added),
          updated: toNumber(target.updated),
          removed: toNumber(target.removed),
          skipped_unmatched: toNumber(target.skipped_unmatched),
        }
      : null,
    unmatched_users: unmatched,
  };
}

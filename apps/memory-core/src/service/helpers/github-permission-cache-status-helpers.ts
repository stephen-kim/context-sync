import type { AuthContext } from '../../auth.js';
import { assertWorkspaceAdmin } from '../access-control.js';
import { getEffectiveWorkspaceSettings } from '../workspace-resolution.js';
import type { GithubPermissionSyncDeps } from './github-permission-sync-types.js';

export async function getGithubCacheStatusHandler(
  deps: GithubPermissionSyncDeps,
  args: { auth: AuthContext; workspaceKey: string }
): Promise<{
  workspace_key: string;
  ttl_seconds: number;
  repo_teams_cache_count: number;
  team_members_cache_count: number;
  permission_cache_count: number;
  latest_repo_teams_cache_at: string | null;
  latest_team_members_cache_at: string | null;
  latest_permission_cache_at: string | null;
}> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  const settings = await getEffectiveWorkspaceSettings(deps.prisma, workspace.id);

  const [repoTeamsCount, teamMembersCount, permissionCount, latestRepoTeams, latestTeamMembers, latestPerm] =
    await Promise.all([
      deps.prisma.githubRepoTeamsCache.count({ where: { workspaceId: workspace.id } }),
      deps.prisma.githubTeamMembersCache.count({ where: { workspaceId: workspace.id } }),
      deps.prisma.githubPermissionCache.count({ where: { workspaceId: workspace.id } }),
      deps.prisma.githubRepoTeamsCache.findFirst({
        where: { workspaceId: workspace.id },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      deps.prisma.githubTeamMembersCache.findFirst({
        where: { workspaceId: workspace.id },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      deps.prisma.githubPermissionCache.findFirst({
        where: { workspaceId: workspace.id },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);

  return {
    workspace_key: workspace.key,
    ttl_seconds: settings.githubCacheTtlSeconds,
    repo_teams_cache_count: repoTeamsCount,
    team_members_cache_count: teamMembersCount,
    permission_cache_count: permissionCount,
    latest_repo_teams_cache_at: latestRepoTeams?.updatedAt.toISOString() || null,
    latest_team_members_cache_at: latestTeamMembers?.updatedAt.toISOString() || null,
    latest_permission_cache_at: latestPerm?.updatedAt.toISOString() || null,
  };
}

import { WorkspaceRole } from '@prisma/client';
import type { AuthContext } from '../../auth.js';
import { normalizeLegacyProjectRole } from '../../permissions.js';
import { assertWorkspaceAdmin } from '../access-control.js';
import { NotFoundError } from '../errors.js';
import {
  issueGithubAppJwt,
  issueInstallationAccessToken,
} from './github/github-api-client.js';
import { getEffectiveWorkspaceSettings } from '../workspace-resolution.js';
import {
  compareGithubPermission,
  compareRoleRank,
  isProtectedRoleChange,
  mapGithubPermissionToProjectRole,
  normalizeGithubLogin,
  normalizeGithubRoleMapping,
  requireGithubAppConfig,
} from './github-permission-sync-utils.js';
import { buildAccessAuditParams, resolveAccessAuditAction } from './access-audit-helpers.js';
import {
  computeRepoPermissions,
  listTargetRepos,
} from './github-permission-compute-helpers.js';
import type { GithubPermissionSyncDeps } from './github-permission-sync-types.js';

export { mapGithubPermissionToProjectRole, normalizeGithubLogin } from './github-permission-sync-utils.js';

export async function syncGithubPermissionsHandler(
  deps: GithubPermissionSyncDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    dryRun?: boolean;
    projectKeyPrefix?: string;
    repos?: string[];
    modeOverride?: 'add_only' | 'add_and_remove';
    correlationId?: string;
  }
): Promise<{
  workspace_key: string;
  dry_run: boolean;
  repos_processed: number;
  users_matched: number;
  added: number;
  updated: number;
  removed: number;
  skipped_unmatched: number;
  rate_limit_warnings: string[];
  unmatched_users: Array<{
    repo_full_name: string;
    github_login: string | null;
    github_user_id: string | null;
    permission: string;
  }>;
  repo_errors: Array<{ repo_full_name: string; error: string }>;
}> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  const settings = await getEffectiveWorkspaceSettings(deps.prisma, workspace.id);

  const installation = await deps.prisma.githubInstallation.findUnique({
    where: { workspaceId: workspace.id },
    select: { installationId: true },
  });
  if (!installation) {
    throw new NotFoundError('GitHub installation is not connected for this workspace.');
  }

  const targetRepos = await listTargetRepos(deps, {
    workspaceId: workspace.id,
    repos: args.repos,
    projectKeyPrefix: args.projectKeyPrefix,
  });
  const projectKeyById = new Map<string, string>();
  for (const repo of targetRepos) {
    if (repo.linkedProject) {
      projectKeyById.set(repo.linkedProject.id, repo.linkedProject.key);
    }
  }

  const appConfig = requireGithubAppConfig(deps.securityConfig);
  const appJwt = await callIssueGithubAppJwt(deps, appConfig.appId, appConfig.privateKey);
  const installationToken = await callIssueInstallationAccessToken(
    deps,
    appJwt,
    installation.installationId
  );

  const roleMapping = normalizeGithubRoleMapping(settings.githubRoleMapping);
  const mode = args.modeOverride || settings.githubPermissionSyncMode;
  const dryRun = args.dryRun === true;
  const cacheTtlSeconds = settings.githubCacheTtlSeconds;

  const userLinks = await deps.prisma.githubUserLink.findMany({
    where: { workspaceId: workspace.id },
    include: {
      user: { select: { id: true, email: true } },
    },
  });

  const linkedUserIds = new Set(userLinks.map((link) => link.userId));
  const userByGithubId = new Map<string, { userId: string; email: string }>();
  const userByGithubLogin = new Map<string, { userId: string; email: string }>();
  for (const link of userLinks) {
    if (link.githubUserId !== null) {
      userByGithubId.set(link.githubUserId.toString(), { userId: link.userId, email: link.user.email });
    }
    userByGithubLogin.set(normalizeGithubLogin(link.githubLogin), {
      userId: link.userId,
      email: link.user.email,
    });
  }

  const projectIds = targetRepos
    .map((row) => row.linkedProject?.id || null)
    .filter((value): value is string => Boolean(value));
  const existingMembers = projectIds.length
    ? await deps.prisma.projectMember.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, userId: true, role: true },
      })
    : [];

  const protectedWorkspaceUsers = await deps.prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, role: { in: [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] } },
    select: { userId: true },
  });
  const protectedUserSet = new Set(protectedWorkspaceUsers.map((row) => row.userId));

  const desired = new Map<string, { projectId: string; userId: string; role: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER' }>();
  const unmatchedUsers: Array<{
    repo_full_name: string;
    github_login: string | null;
    github_user_id: string | null;
    permission: string;
  }> = [];
  const repoErrors: Array<{ repo_full_name: string; error: string }> = [];
  const rateLimitWarnings: string[] = [];
  const successfullyProcessedProjectIds = new Set<string>();
  const usersMatched = new Set<string>();
  let reposProcessed = 0;

  for (const repo of targetRepos) {
    if (!repo.linkedProject) {
      continue;
    }

    let computed;
    try {
      computed = await computeRepoPermissions(deps, {
        workspaceId: workspace.id,
        installationToken,
        repo,
        cacheTtlSeconds,
        rateLimitWarnings,
      });
      reposProcessed += 1;
      successfullyProcessedProjectIds.add(repo.linkedProject.id);
    } catch (error) {
      repoErrors.push({ repo_full_name: repo.fullName, error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    for (const row of computed) {
      const matched =
        userByGithubId.get(row.github_user_id) ||
        (row.github_login ? userByGithubLogin.get(normalizeGithubLogin(row.github_login)) : undefined);

      if (!matched) {
        unmatchedUsers.push({
          repo_full_name: repo.fullName,
          github_login: row.github_login,
          github_user_id: row.github_user_id,
          permission: row.permission,
        });
      } else {
        usersMatched.add(matched.userId);
        const role = mapGithubPermissionToProjectRole(row.permission, roleMapping);
        const key = `${repo.linkedProject.id}:${matched.userId}`;
        const existing = desired.get(key);
        if (!existing || compareRoleRank(role, existing.role) > 0) {
          desired.set(key, { projectId: repo.linkedProject.id, userId: matched.userId, role });
        }
      }

      if (!dryRun) {
        await deps.prisma.githubPermissionCache.upsert({
          where: {
            workspaceId_githubRepoId_githubUserId: {
              workspaceId: workspace.id,
              githubRepoId: repo.githubRepoId,
              githubUserId: BigInt(row.github_user_id),
            },
          },
          update: { permission: row.permission },
          create: {
            workspaceId: workspace.id,
            githubRepoId: repo.githubRepoId,
            githubUserId: BigInt(row.github_user_id),
            permission: row.permission,
          },
        });
      }
    }
  }

  const existingByKey = new Map<string, { projectId: string; userId: string; role: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER' }>();
  for (const member of existingMembers) {
    if (!successfullyProcessedProjectIds.has(member.projectId)) {
      continue;
    }
    existingByKey.set(`${member.projectId}:${member.userId}`, {
      projectId: member.projectId,
      userId: member.userId,
      role: normalizeLegacyProjectRole(member.role),
    });
  }

  const toAdd: Array<{ projectId: string; userId: string; role: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER' }> = [];
  const toUpdate: Array<{ projectId: string; userId: string; role: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER' }> = [];
  const toRemove: Array<{ projectId: string; userId: string }> = [];

  for (const wanted of desired.values()) {
    const key = `${wanted.projectId}:${wanted.userId}`;
    const existing = existingByKey.get(key);
    if (!existing) {
      toAdd.push(wanted);
      continue;
    }
    if (existing.role === wanted.role) {
      continue;
    }

    if (mode === 'add_only') {
      if (compareRoleRank(wanted.role, existing.role) > 0) {
        toUpdate.push(wanted);
      }
      continue;
    }

    if (isProtectedRoleChange(existing.userId, existing.role, protectedUserSet)) {
      continue;
    }
    toUpdate.push(wanted);
  }

  if (mode === 'add_and_remove') {
    for (const existing of existingByKey.values()) {
      const key = `${existing.projectId}:${existing.userId}`;
      if (!linkedUserIds.has(existing.userId)) {
        continue;
      }
      if (desired.has(key)) {
        continue;
      }
      if (isProtectedRoleChange(existing.userId, existing.role, protectedUserSet)) {
        continue;
      }
      toRemove.push({ projectId: existing.projectId, userId: existing.userId });
    }
  }

  if (!dryRun) {
    await deps.prisma.$transaction(async (tx) => {
      for (const item of toAdd) {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: item.projectId, userId: item.userId } },
          update: { role: item.role },
          create: { projectId: item.projectId, userId: item.userId, role: item.role },
        });
      }
      for (const item of toUpdate) {
        await tx.projectMember.update({
          where: { projectId_userId: { projectId: item.projectId, userId: item.userId } },
          data: { role: item.role },
        });
      }
      for (const item of toRemove) {
        await tx.projectMember.deleteMany({ where: { projectId: item.projectId, userId: item.userId } });
      }
    });
    for (const item of toAdd) {
      const projectKey = projectKeyById.get(item.projectId);
      if (!projectKey) {
        continue;
      }
      await deps.recordAudit({
        workspaceId: workspace.id,
        projectId: item.projectId,
        workspaceKey: workspace.key,
        actorUserId: args.auth.user.id,
        actorUserEmail: args.auth.user.email,
        action: 'access.project_member.added',
        target: buildAccessAuditParams({
          source: 'github',
          targetUserId: item.userId,
          oldRole: null,
          newRole: item.role,
          workspaceKey: workspace.key,
          projectKey,
          correlationId: args.correlationId || null,
          evidence: {
            mode,
            dry_run: false,
          },
        }),
      });
    }
    for (const item of toUpdate) {
      const key = `${item.projectId}:${item.userId}`;
      const existing = existingByKey.get(key);
      if (!existing) {
        continue;
      }
      const projectKey = projectKeyById.get(item.projectId);
      if (!projectKey) {
        continue;
      }
      const action = resolveAccessAuditAction({
        kind: 'project',
        oldRole: existing.role,
        newRole: item.role,
      });
      if (!action) {
        continue;
      }
      await deps.recordAudit({
        workspaceId: workspace.id,
        projectId: item.projectId,
        workspaceKey: workspace.key,
        actorUserId: args.auth.user.id,
        actorUserEmail: args.auth.user.email,
        action,
        target: buildAccessAuditParams({
          source: 'github',
          targetUserId: item.userId,
          oldRole: existing.role,
          newRole: item.role,
          workspaceKey: workspace.key,
          projectKey,
          correlationId: args.correlationId || null,
          evidence: {
            mode,
            dry_run: false,
          },
        }),
      });
    }
    for (const item of toRemove) {
      const key = `${item.projectId}:${item.userId}`;
      const existing = existingByKey.get(key);
      const projectKey = projectKeyById.get(item.projectId);
      if (!existing || !projectKey) {
        continue;
      }
      await deps.recordAudit({
        workspaceId: workspace.id,
        projectId: item.projectId,
        workspaceKey: workspace.key,
        actorUserId: args.auth.user.id,
        actorUserEmail: args.auth.user.email,
        action: 'access.project_member.removed',
        target: buildAccessAuditParams({
          source: 'github',
          targetUserId: item.userId,
          oldRole: existing.role,
          newRole: null,
          workspaceKey: workspace.key,
          projectKey,
          correlationId: args.correlationId || null,
          evidence: {
            mode,
            dry_run: false,
          },
        }),
      });
    }
  }

  const result = {
    workspace_key: workspace.key,
    dry_run: dryRun,
    repos_processed: reposProcessed,
    users_matched: usersMatched.size,
    added: toAdd.length,
    updated: toUpdate.length,
    removed: toRemove.length,
    skipped_unmatched: unmatchedUsers.length,
    rate_limit_warnings: Array.from(new Set(rateLimitWarnings)),
    unmatched_users: unmatchedUsers.slice(0, 1000),
    repo_errors: repoErrors,
  };

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'github.permissions.computed',
    target: {
      workspace_key: workspace.key,
      dry_run: dryRun,
      mode,
      repos_filter: normalizeRepoFilter(args.repos),
      correlation_id: args.correlationId || null,
      project_key_prefix: String(args.projectKeyPrefix || '').trim() || null,
      github_cache_ttl_seconds: cacheTtlSeconds,
      repos_processed: result.repos_processed,
      users_matched: result.users_matched,
      added: result.added,
      updated: result.updated,
      removed: result.removed,
      skipped_unmatched: result.skipped_unmatched,
      unmatched_users: result.unmatched_users,
      repo_errors: result.repo_errors,
      rate_limit_warnings: result.rate_limit_warnings,
    },
  });

  if (!dryRun) {
    await deps.recordAudit({
      workspaceId: workspace.id,
      workspaceKey: workspace.key,
      actorUserId: args.auth.user.id,
      actorUserEmail: args.auth.user.email,
      action: 'github.permissions.applied',
      target: {
        workspace_key: workspace.key,
        mode,
        repos_processed: result.repos_processed,
        users_matched: result.users_matched,
        added: result.added,
        updated: result.updated,
        removed: result.removed,
      },
    });
  }

  return result;
}

export async function getGithubPermissionPreviewHandler(
  deps: GithubPermissionSyncDeps,
  args: { auth: AuthContext; workspaceKey: string; repo: string }
): Promise<{
  workspace_key: string;
  repo_full_name: string;
  project_key: string | null;
  computed_permissions: Array<{
    github_user_id: string;
    github_login: string | null;
    permission: 'admin' | 'maintain' | 'write' | 'triage' | 'read';
    matched_user_id: string | null;
    matched_user_email: string | null;
    mapped_project_role: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER' | null;
  }>;
  unmatched_users: Array<{
    github_user_id: string;
    github_login: string | null;
    permission: 'admin' | 'maintain' | 'write' | 'triage' | 'read';
  }>;
  rate_limit_warnings: string[];
}> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  const settings = await getEffectiveWorkspaceSettings(deps.prisma, workspace.id);

  const repoName = String(args.repo || '').trim().toLowerCase();
  const repoLink = await deps.prisma.githubRepoLink.findFirst({
    where: {
      workspaceId: workspace.id,
      fullName: { equals: repoName, mode: 'insensitive' },
      isActive: true,
      linkedProjectId: { not: null },
    },
    include: {
      linkedProject: { select: { key: true } },
    },
  });
  if (!repoLink || !repoLink.linkedProject) {
    throw new NotFoundError('Linked GitHub repo not found for permission preview.');
  }

  const installation = await deps.prisma.githubInstallation.findUnique({
    where: { workspaceId: workspace.id },
    select: { installationId: true },
  });
  if (!installation) {
    throw new NotFoundError('GitHub installation is not connected for this workspace.');
  }

  const appConfig = requireGithubAppConfig(deps.securityConfig);
  const appJwt = await callIssueGithubAppJwt(deps, appConfig.appId, appConfig.privateKey);
  const installationToken = await callIssueInstallationAccessToken(
    deps,
    appJwt,
    installation.installationId
  );

  const rateLimitWarnings: string[] = [];
  const computed = await computeRepoPermissions(deps, {
    workspaceId: workspace.id,
    installationToken,
    repo: repoLink,
    cacheTtlSeconds: settings.githubCacheTtlSeconds,
    rateLimitWarnings,
  });

  const roleMapping = normalizeGithubRoleMapping(settings.githubRoleMapping);
  const userLinks = await deps.prisma.githubUserLink.findMany({
    where: { workspaceId: workspace.id },
    include: {
      user: { select: { id: true, email: true } },
    },
  });
  const byGithubId = new Map<string, { userId: string; email: string }>();
  const byLogin = new Map<string, { userId: string; email: string }>();
  for (const link of userLinks) {
    if (link.githubUserId !== null) {
      byGithubId.set(link.githubUserId.toString(), { userId: link.userId, email: link.user.email });
    }
    byLogin.set(normalizeGithubLogin(link.githubLogin), { userId: link.userId, email: link.user.email });
  }

  const rows = computed
    .map((row) => {
      const matched =
        byGithubId.get(row.github_user_id) ||
        (row.github_login ? byLogin.get(normalizeGithubLogin(row.github_login)) : undefined);
      return {
        github_user_id: row.github_user_id,
        github_login: row.github_login,
        permission: row.permission,
        matched_user_id: matched?.userId || null,
        matched_user_email: matched?.email || null,
        mapped_project_role: matched ? mapGithubPermissionToProjectRole(row.permission, roleMapping) : null,
      };
    })
    .sort((a, b) => {
      const permCmp = compareGithubPermission(b.permission, a.permission);
      if (permCmp !== 0) {
        return permCmp;
      }
      return a.github_user_id.localeCompare(b.github_user_id);
    });

  return {
    workspace_key: workspace.key,
    repo_full_name: repoLink.fullName,
    project_key: repoLink.linkedProject.key,
    computed_permissions: rows,
    unmatched_users: rows
      .filter((row) => !row.matched_user_id)
      .map((row) => ({
        github_user_id: row.github_user_id,
        github_login: row.github_login,
        permission: row.permission,
      })),
    rate_limit_warnings: Array.from(new Set(rateLimitWarnings)),
  };
}

async function callIssueGithubAppJwt(
  deps: GithubPermissionSyncDeps,
  appId: string,
  privateKey: string
): Promise<string> {
  if (deps.githubApiClient?.issueGithubAppJwt) {
    return deps.githubApiClient.issueGithubAppJwt(appId, privateKey);
  }
  return issueGithubAppJwt(appId, privateKey);
}

async function callIssueInstallationAccessToken(
  deps: GithubPermissionSyncDeps,
  appJwt: string,
  installationId: bigint
): Promise<string> {
  if (deps.githubApiClient?.issueInstallationAccessToken) {
    return deps.githubApiClient.issueInstallationAccessToken(appJwt, installationId);
  }
  return issueInstallationAccessToken(appJwt, installationId);
}

function normalizeRepoFilter(repos?: string[]): string[] {
  return Array.from(
    new Set((repos || []).map((item) => String(item || '').trim()).filter((item) => item.length > 0))
  );
}

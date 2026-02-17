import { WorkspaceRole } from '@prisma/client';
import { normalizeLegacyProjectRole } from '../../permissions.js';
import { getEffectiveWorkspaceSettings } from '../workspace-resolution.js';
import {
  compareRoleRank,
  isProtectedRoleChange,
  normalizeGithubLogin,
  requireGithubAppConfig,
  toErrorMessage,
  type CanonicalProjectRole,
} from './github-permission-sync-utils.js';
import {
  buildAccessAuditParams,
  resolveAccessAuditAction,
} from './access-audit-helpers.js';
import {
  callIssueGithubAppJwt,
  callIssueInstallationAccessToken,
  callListTeamMembers,
  compareWorkspaceRoleRank,
  teamMappingRoleToProjectRole,
  teamMappingRoleToWorkspaceRole,
  type GithubTeamMappingDeps,
} from './github-team-mapping-shared.js';

export async function applyGithubTeamMappingsHandler(
  deps: GithubTeamMappingDeps,
  args: {
    workspaceId: string;
    workspaceKey: string;
    installationId: bigint;
    eventType: string;
    correlationId?: string;
    actorUserId: string;
    actorUserEmail?: string;
  }
): Promise<{
  mode: 'add_only' | 'add_and_remove';
  mappings_processed: number;
  teams_fetched: number;
  users_matched: number;
  added: number;
  updated: number;
  removed: number;
  skipped_unmatched: number;
  unmatched_users: Array<{ github_login: string; github_user_id: string | null; team_slug: string }>;
  team_errors: Array<{ team_slug: string; org_login: string; error: string }>;
  target_errors: Array<{ target_type: 'workspace' | 'project'; target_key: string; error: string }>;
}> {
  const settings = await getEffectiveWorkspaceSettings(deps.prisma, args.workspaceId);
  const mode = settings.githubWebhookSyncMode;
  if (!settings.githubTeamMappingEnabled) {
    return emptyResult(mode);
  }

  const mappings = await deps.prisma.githubTeamMapping.findMany({
    where: {
      workspaceId: args.workspaceId,
      enabled: true,
      OR: [{ providerInstallationId: null }, { providerInstallationId: args.installationId }],
    },
    orderBy: [{ priority: 'asc' }, { githubOrgLogin: 'asc' }, { githubTeamSlug: 'asc' }],
  });
  if (mappings.length === 0) {
    return emptyResult(mode);
  }

  const appConfig = requireGithubAppConfig(deps.securityConfig);
  const appJwt = await callIssueGithubAppJwt(deps, appConfig.appId, appConfig.privateKey);
  const installationToken = await callIssueInstallationAccessToken(deps, appJwt, args.installationId);

  const userLinks = await deps.prisma.githubUserLink.findMany({
    where: { workspaceId: args.workspaceId },
    select: { userId: true, githubUserId: true, githubLogin: true },
  });
  const linkedUserIds = new Set<string>();
  const userByGithubId = new Map<string, string>();
  const userByGithubLogin = new Map<string, string>();
  for (const link of userLinks) {
    linkedUserIds.add(link.userId);
    userByGithubLogin.set(normalizeGithubLogin(link.githubLogin), link.userId);
    if (link.githubUserId !== null) {
      userByGithubId.set(link.githubUserId.toString(), link.userId);
    }
  }

  const teamMembersByKey = new Map<string, Array<{ id: number; login: string }>>();
  const teamErrors: Array<{ team_slug: string; org_login: string; error: string }> = [];

  for (const mapping of mappings) {
    const teamKey = `${mapping.githubOrgLogin.toLowerCase()}/${mapping.githubTeamSlug.toLowerCase()}`;
    if (teamMembersByKey.has(teamKey)) {
      continue;
    }
    try {
      const members = await callListTeamMembers(
        deps,
        installationToken,
        mapping.githubOrgLogin,
        mapping.githubTeamSlug
      );
      teamMembersByKey.set(teamKey, members);
    } catch (error) {
      teamMembersByKey.set(teamKey, []);
      teamErrors.push({
        team_slug: mapping.githubTeamSlug,
        org_login: mapping.githubOrgLogin,
        error: toErrorMessage(error),
      });
    }
  }

  const targetProjectKeys = Array.from(
    new Set(mappings.filter((mapping) => mapping.targetType === 'project').map((mapping) => mapping.targetKey))
  );
  const projects = targetProjectKeys.length
    ? await deps.prisma.project.findMany({
        where: {
          workspaceId: args.workspaceId,
          key: { in: targetProjectKeys },
        },
        select: { id: true, key: true },
      })
    : [];
  const projectByKey = new Map(projects.map((project) => [project.key, project.id]));

  const desiredWorkspace = new Map<string, WorkspaceRole>();
  const desiredProject = new Map<string, Map<string, CanonicalProjectRole>>();
  const mappedProjectIds = new Set<string>();
  const hasWorkspaceMapping = mappings.some((mapping) => mapping.targetType === 'workspace');
  const unmatchedUsers: Array<{ github_login: string; github_user_id: string | null; team_slug: string }> = [];
  const targetErrors: Array<{ target_type: 'workspace' | 'project'; target_key: string; error: string }> = [];
  const matchedUsers = new Set<string>();

  for (const mapping of mappings) {
    const teamKey = `${mapping.githubOrgLogin.toLowerCase()}/${mapping.githubTeamSlug.toLowerCase()}`;
    const members = teamMembersByKey.get(teamKey) || [];

    if (mapping.targetType === 'project' && !projectByKey.has(mapping.targetKey)) {
      targetErrors.push({
        target_type: 'project',
        target_key: mapping.targetKey,
        error: 'Target project not found in workspace',
      });
      continue;
    }
    if (mapping.targetType === 'project') {
      const projectId = projectByKey.get(mapping.targetKey);
      if (projectId) {
        mappedProjectIds.add(projectId);
      }
    }

    for (const member of members) {
      const githubLogin = normalizeGithubLogin(member.login);
      const githubUserId = Number.isFinite(member.id) ? String(member.id) : null;
      const matchedUserId =
        (githubUserId ? userByGithubId.get(githubUserId) : undefined) || userByGithubLogin.get(githubLogin);
      if (!matchedUserId) {
        unmatchedUsers.push({
          github_login: githubLogin,
          github_user_id: githubUserId,
          team_slug: mapping.githubTeamSlug,
        });
        continue;
      }
      matchedUsers.add(matchedUserId);

      if (mapping.targetType === 'workspace') {
        const role = teamMappingRoleToWorkspaceRole(mapping.role);
        if (!role) {
          continue;
        }
        const current = desiredWorkspace.get(matchedUserId);
        if (!current || compareWorkspaceRoleRank(role, current) > 0) {
          desiredWorkspace.set(matchedUserId, role);
        }
        continue;
      }

      const role = teamMappingRoleToProjectRole(mapping.role);
      if (!role) {
        continue;
      }
      const projectId = projectByKey.get(mapping.targetKey);
      if (!projectId) {
        continue;
      }
      const perProject = desiredProject.get(projectId) || new Map<string, CanonicalProjectRole>();
      const current = perProject.get(matchedUserId);
      if (!current || compareRoleRank(role, current) > 0) {
        perProject.set(matchedUserId, role);
      }
      desiredProject.set(projectId, perProject);
    }
  }

  const workspaceOps = await applyWorkspaceOps({
    deps,
    workspaceId: args.workspaceId,
    linkedUserIds,
    desiredWorkspace,
    mode,
    hasWorkspaceMapping,
  });

  const projectOps = await applyProjectOps({
    deps,
    workspaceId: args.workspaceId,
    linkedUserIds,
    desiredProject,
    projectScopeIds: mappedProjectIds,
    mode,
  });

  const result = {
    mode,
    mappings_processed: mappings.length,
    teams_fetched: teamMembersByKey.size,
    users_matched: matchedUsers.size,
    added: workspaceOps.added + projectOps.added,
    updated: workspaceOps.updated + projectOps.updated,
    removed: workspaceOps.removed + projectOps.removed,
    skipped_unmatched: unmatchedUsers.length,
    unmatched_users: unmatchedUsers.slice(0, 500),
    team_errors: teamErrors,
    target_errors: targetErrors,
  };

  for (const change of workspaceOps.changes) {
    const action = resolveAccessAuditAction({
      kind: 'workspace',
      oldRole: change.oldRole,
      newRole: change.newRole,
    });
    if (!action) {
      continue;
    }
    await deps.recordAudit({
      workspaceId: args.workspaceId,
      workspaceKey: args.workspaceKey,
      actorUserId: args.actorUserId,
      actorUserEmail: args.actorUserEmail,
      action,
      target: buildAccessAuditParams({
        source: 'github',
        targetUserId: change.userId,
        oldRole: change.oldRole,
        newRole: change.newRole,
        workspaceKey: args.workspaceKey,
        correlationId: args.correlationId || null,
        evidence: {
          installation_id: args.installationId.toString(),
          event_type: args.eventType,
          mapping_source: 'github_team_mapping',
        },
      }),
    });
  }

  for (const change of projectOps.changes) {
    const action = resolveAccessAuditAction({
      kind: 'project',
      oldRole: change.oldRole,
      newRole: change.newRole,
    });
    if (!action) {
      continue;
    }
    await deps.recordAudit({
      workspaceId: args.workspaceId,
      projectId: change.projectId,
      workspaceKey: args.workspaceKey,
      actorUserId: args.actorUserId,
      actorUserEmail: args.actorUserEmail,
      action,
      target: buildAccessAuditParams({
        source: 'github',
        targetUserId: change.userId,
        oldRole: change.oldRole,
        newRole: change.newRole,
        workspaceKey: args.workspaceKey,
        projectKey: change.projectKey,
        correlationId: args.correlationId || null,
        evidence: {
          installation_id: args.installationId.toString(),
          event_type: args.eventType,
          mapping_source: 'github_team_mapping',
        },
      }),
    });
  }

  await deps.recordAudit({
    workspaceId: args.workspaceId,
    workspaceKey: args.workspaceKey,
    actorUserId: args.actorUserId,
    actorUserEmail: args.actorUserEmail,
    action: 'github.team_mappings.applied',
    target: {
      workspace_key: args.workspaceKey,
      installation_id: args.installationId.toString(),
      event_type: args.eventType,
      ...result,
    },
  });

  return result;
}

async function applyWorkspaceOps(args: {
  deps: GithubTeamMappingDeps;
  workspaceId: string;
  linkedUserIds: Set<string>;
  desiredWorkspace: Map<string, WorkspaceRole>;
  mode: 'add_only' | 'add_and_remove';
  hasWorkspaceMapping: boolean;
}): Promise<{
  added: number;
  updated: number;
  removed: number;
  changes: Array<{ userId: string; oldRole: WorkspaceRole | null; newRole: WorkspaceRole | null }>;
}> {
  if (!args.hasWorkspaceMapping) {
    return { added: 0, updated: 0, removed: 0, changes: [] };
  }
  const existingMembers = await args.deps.prisma.workspaceMember.findMany({
    where: {
      workspaceId: args.workspaceId,
      userId: { in: Array.from(args.linkedUserIds) },
    },
    select: { userId: true, role: true },
  });
  const existingByUser = new Map(existingMembers.map((row) => [row.userId, row.role]));

  const toAdd: Array<{ userId: string; role: WorkspaceRole }> = [];
  const toUpdate: Array<{ userId: string; role: WorkspaceRole }> = [];
  const toRemove: string[] = [];

  for (const [userId, desiredRole] of args.desiredWorkspace.entries()) {
    const existingRole = existingByUser.get(userId);
    if (!existingRole) {
      toAdd.push({ userId, role: desiredRole });
      continue;
    }
    if (existingRole === desiredRole) {
      continue;
    }
    if (args.mode === 'add_only') {
      if (compareWorkspaceRoleRank(desiredRole, existingRole) > 0) {
        toUpdate.push({ userId, role: desiredRole });
      }
      continue;
    }
    const isDowngrade = compareWorkspaceRoleRank(desiredRole, existingRole) < 0;
    if (isDowngrade && (existingRole === 'OWNER' || existingRole === 'ADMIN')) {
      continue;
    }
    toUpdate.push({ userId, role: desiredRole });
  }

  if (args.mode === 'add_and_remove') {
    for (const row of existingMembers) {
      if (args.desiredWorkspace.has(row.userId)) {
        continue;
      }
      if (row.role === 'OWNER' || row.role === 'ADMIN') {
        continue;
      }
      toRemove.push(row.userId);
    }
  }

  if (toAdd.length || toUpdate.length || toRemove.length) {
    await args.deps.prisma.$transaction(async (tx) => {
      for (const row of toAdd) {
        await tx.workspaceMember.upsert({
          where: {
            workspaceId_userId: { workspaceId: args.workspaceId, userId: row.userId },
          },
          update: { role: row.role },
          create: { workspaceId: args.workspaceId, userId: row.userId, role: row.role },
        });
      }
      for (const row of toUpdate) {
        await tx.workspaceMember.update({
          where: {
            workspaceId_userId: { workspaceId: args.workspaceId, userId: row.userId },
          },
          data: { role: row.role },
        });
      }
      for (const userId of toRemove) {
        await tx.workspaceMember.deleteMany({
          where: { workspaceId: args.workspaceId, userId },
        });
      }
    });
  }

  return {
    added: toAdd.length,
    updated: toUpdate.length,
    removed: toRemove.length,
    changes: [
      ...toAdd.map((row) => ({ userId: row.userId, oldRole: null, newRole: row.role })),
      ...toUpdate.map((row) => ({
        userId: row.userId,
        oldRole: existingByUser.get(row.userId) || null,
        newRole: row.role,
      })),
      ...toRemove.map((userId) => ({
        userId,
        oldRole: existingByUser.get(userId) || null,
        newRole: null,
      })),
    ],
  };
}

async function applyProjectOps(args: {
  deps: GithubTeamMappingDeps;
  workspaceId: string;
  linkedUserIds: Set<string>;
  desiredProject: Map<string, Map<string, CanonicalProjectRole>>;
  projectScopeIds: Set<string>;
  mode: 'add_only' | 'add_and_remove';
}): Promise<{
  added: number;
  updated: number;
  removed: number;
  changes: Array<{
    projectId: string;
    projectKey: string;
    userId: string;
    oldRole: CanonicalProjectRole | null;
    newRole: CanonicalProjectRole | null;
  }>;
}> {
  const projectIds = Array.from(args.projectScopeIds);
  if (projectIds.length === 0) {
    return { added: 0, updated: 0, removed: 0, changes: [] };
  }
  const projects = await args.deps.prisma.project.findMany({
    where: {
      id: { in: projectIds },
    },
    select: { id: true, key: true },
  });
  const projectKeyById = new Map(projects.map((project) => [project.id, project.key]));

  const existingProjectMembers = await args.deps.prisma.projectMember.findMany({
    where: {
      projectId: { in: projectIds },
      userId: { in: Array.from(args.linkedUserIds) },
    },
    select: { projectId: true, userId: true, role: true },
  });
  const existingByKey = new Map<string, CanonicalProjectRole>();
  for (const row of existingProjectMembers) {
    existingByKey.set(`${row.projectId}:${row.userId}`, normalizeLegacyProjectRole(row.role));
  }

  const protectedWorkspaceUsers = await args.deps.prisma.workspaceMember.findMany({
    where: {
      workspaceId: args.workspaceId,
      role: { in: [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] },
    },
    select: { userId: true },
  });
  const protectedSet = new Set(protectedWorkspaceUsers.map((row) => row.userId));

  const toAdd: Array<{ projectId: string; userId: string; role: CanonicalProjectRole }> = [];
  const toUpdate: Array<{ projectId: string; userId: string; role: CanonicalProjectRole }> = [];
  const toRemove: Array<{ projectId: string; userId: string }> = [];

  for (const [projectId, desiredByUser] of args.desiredProject.entries()) {
    for (const [userId, desiredRole] of desiredByUser.entries()) {
      const key = `${projectId}:${userId}`;
      const existingRole = existingByKey.get(key);
      if (!existingRole) {
        toAdd.push({ projectId, userId, role: desiredRole });
        continue;
      }
      if (existingRole === desiredRole) {
        continue;
      }
      if (args.mode === 'add_only') {
        if (compareRoleRank(desiredRole, existingRole) > 0) {
          toUpdate.push({ projectId, userId, role: desiredRole });
        }
        continue;
      }
      if (isProtectedRoleChange(userId, existingRole, protectedSet)) {
        if (compareRoleRank(desiredRole, existingRole) > 0) {
          toUpdate.push({ projectId, userId, role: desiredRole });
        }
        continue;
      }
      toUpdate.push({ projectId, userId, role: desiredRole });
    }
  }

  if (args.mode === 'add_and_remove') {
    for (const row of existingProjectMembers) {
      const desired = args.desiredProject.get(row.projectId);
      if (desired?.has(row.userId)) {
        continue;
      }
      const normalized = normalizeLegacyProjectRole(row.role);
      if (isProtectedRoleChange(row.userId, normalized, protectedSet)) {
        continue;
      }
      toRemove.push({ projectId: row.projectId, userId: row.userId });
    }
  }

  if (toAdd.length || toUpdate.length || toRemove.length) {
    await args.deps.prisma.$transaction(async (tx) => {
      for (const row of toAdd) {
        await tx.projectMember.upsert({
          where: {
            projectId_userId: { projectId: row.projectId, userId: row.userId },
          },
          update: { role: row.role },
          create: { projectId: row.projectId, userId: row.userId, role: row.role },
        });
      }
      for (const row of toUpdate) {
        await tx.projectMember.update({
          where: {
            projectId_userId: { projectId: row.projectId, userId: row.userId },
          },
          data: { role: row.role },
        });
      }
      for (const row of toRemove) {
        await tx.projectMember.deleteMany({
          where: { projectId: row.projectId, userId: row.userId },
        });
      }
    });
  }

  return {
    added: toAdd.length,
    updated: toUpdate.length,
    removed: toRemove.length,
    changes: [
      ...toAdd.map((row) => ({
        projectId: row.projectId,
        projectKey: projectKeyById.get(row.projectId) || row.projectId,
        userId: row.userId,
        oldRole: null,
        newRole: row.role,
      })),
      ...toUpdate.map((row) => ({
        projectId: row.projectId,
        projectKey: projectKeyById.get(row.projectId) || row.projectId,
        userId: row.userId,
        oldRole: existingByKey.get(`${row.projectId}:${row.userId}`) || null,
        newRole: row.role,
      })),
      ...toRemove.map((row) => ({
        projectId: row.projectId,
        projectKey: projectKeyById.get(row.projectId) || row.projectId,
        userId: row.userId,
        oldRole: existingByKey.get(`${row.projectId}:${row.userId}`) || null,
        newRole: null,
      })),
    ],
  };
}

function emptyResult(mode: 'add_only' | 'add_and_remove') {
  return {
    mode,
    mappings_processed: 0,
    teams_fetched: 0,
    users_matched: 0,
    added: 0,
    updated: 0,
    removed: 0,
    skipped_unmatched: 0,
    unmatched_users: [],
    team_errors: [],
    target_errors: [],
  };
}

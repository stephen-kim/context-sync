import {
  listRepositoryCollaboratorsWithPermissions,
  listRepositoryTeams,
  listTeamMembers,
} from './github/github-api-client.js';
import {
  deriveCollaboratorPermission,
  maxGithubPermission,
  normalizeGithubPermission,
  normalizeGithubLogin,
  parseOwnerRepo,
  toErrorMessage,
} from './github-permission-sync-utils.js';
import type {
  ComputedRepoPermission,
  GithubPermissionSyncDeps,
  SyncRepo,
} from './github-permission-sync-types.js';

export async function listTargetRepos(
  deps: GithubPermissionSyncDeps,
  args: { workspaceId: string; repos?: string[]; projectKeyPrefix?: string }
): Promise<SyncRepo[]> {
  const projectKeyPrefix = String(args.projectKeyPrefix || '').trim();
  const repoFilter = new Set(
    (args.repos || []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
  );

  const linkedRepos = await deps.prisma.githubRepoLink.findMany({
    where: {
      workspaceId: args.workspaceId,
      isActive: true,
      linkedProjectId: { not: null },
    },
    include: {
      linkedProject: {
        select: {
          id: true,
          key: true,
          name: true,
        },
      },
    },
    orderBy: [{ fullName: 'asc' }],
  });

  return linkedRepos.filter((row) => {
    if (!row.linkedProject) {
      return false;
    }
    if (projectKeyPrefix && !row.linkedProject.key.startsWith(projectKeyPrefix)) {
      return false;
    }
    if (repoFilter.size > 0 && !repoFilter.has(row.fullName.toLowerCase())) {
      return false;
    }
    return true;
  });
}

export async function computeRepoPermissions(
  deps: GithubPermissionSyncDeps,
  args: {
    workspaceId: string;
    installationToken: string;
    repo: Pick<SyncRepo, 'workspaceId' | 'githubRepoId' | 'fullName'>;
    cacheTtlSeconds: number;
    rateLimitWarnings: string[];
  }
): Promise<ComputedRepoPermission[]> {
  const parsed = parseOwnerRepo(args.repo.fullName);
  if (!parsed) {
    throw new Error(`Invalid repository full name: ${args.repo.fullName}`);
  }

  const computed = new Map<
    string,
    { permission: 'admin' | 'maintain' | 'write' | 'triage' | 'read'; github_login: string | null }
  >();

  const collaborators = await retryGithubApiCall(
    () => callListRepositoryCollaboratorsWithPermissions(deps, args.installationToken, parsed.owner, parsed.repo),
    `collaborators:${args.repo.fullName}`,
    args.rateLimitWarnings
  );

  for (const collaborator of collaborators) {
    const permission = deriveCollaboratorPermission(collaborator);
    if (!permission) {
      continue;
    }
    const userId = Number.isFinite(collaborator.id) ? String(collaborator.id) : '';
    if (!userId) {
      continue;
    }
    const githubLogin = normalizeGithubLogin(collaborator.login) || null;
    const existing = computed.get(userId);
    if (!existing) {
      computed.set(userId, { permission, github_login: githubLogin });
      continue;
    }
    computed.set(userId, {
      permission: maxGithubPermission(existing.permission, permission),
      github_login: existing.github_login || githubLogin,
    });
  }

  const repoTeams = await getRepoTeamsCached(deps, {
    workspaceId: args.workspaceId,
    githubRepoId: args.repo.githubRepoId,
    cacheTtlSeconds: args.cacheTtlSeconds,
    installationToken: args.installationToken,
    owner: parsed.owner,
    repo: parsed.repo,
    rateLimitWarnings: args.rateLimitWarnings,
  });

  for (const team of repoTeams) {
    const permission = normalizeGithubPermission(team.permission);
    if (!permission) {
      continue;
    }
    const members = await getTeamMembersCached(deps, {
      workspaceId: args.workspaceId,
      githubTeamId: team.team_id,
      cacheTtlSeconds: args.cacheTtlSeconds,
      installationToken: args.installationToken,
      orgLogin: team.org_login,
      teamSlug: team.team_slug,
      rateLimitWarnings: args.rateLimitWarnings,
    });

    for (const githubUserId of members) {
      const existing = computed.get(githubUserId);
      if (!existing) {
        computed.set(githubUserId, { permission, github_login: null });
        continue;
      }
      computed.set(githubUserId, {
        permission: maxGithubPermission(existing.permission, permission),
        github_login: existing.github_login,
      });
    }
  }

  return [...computed.entries()].map(([githubUserId, row]) => ({
    github_user_id: githubUserId,
    github_login: row.github_login,
    permission: row.permission,
  }));
}

async function getRepoTeamsCached(
  deps: GithubPermissionSyncDeps,
  args: {
    workspaceId: string;
    githubRepoId: bigint;
    cacheTtlSeconds: number;
    installationToken: string;
    owner: string;
    repo: string;
    rateLimitWarnings: string[];
  }
): Promise<Array<{ team_id: string; team_slug: string; org_login: string; permission: string }>> {
  const cache = await deps.prisma.githubRepoTeamsCache.findUnique({
    where: {
      workspaceId_githubRepoId: {
        workspaceId: args.workspaceId,
        githubRepoId: args.githubRepoId,
      },
    },
    select: {
      teamsJson: true,
      updatedAt: true,
    },
  });

  if (cache && isFresh(cache.updatedAt, args.cacheTtlSeconds)) {
    return parseRepoTeamsJson(cache.teamsJson);
  }

  const fetched = await retryGithubApiCall(
    () => callListRepositoryTeams(deps, args.installationToken, args.owner, args.repo),
    `repo-teams:${args.owner}/${args.repo}`,
    args.rateLimitWarnings
  );
  const normalized = fetched
    .map((team) => ({
      team_id: String(team.id),
      team_slug: String(team.slug || '').trim(),
      org_login: String(team.organization_login || '').trim(),
      permission: String(team.permission || '').trim().toLowerCase(),
    }))
    .filter((team) => team.team_id && team.team_slug && team.org_login && team.permission);

  await deps.prisma.githubRepoTeamsCache.upsert({
    where: {
      workspaceId_githubRepoId: {
        workspaceId: args.workspaceId,
        githubRepoId: args.githubRepoId,
      },
    },
    update: {
      teamsJson: normalized,
    },
    create: {
      workspaceId: args.workspaceId,
      githubRepoId: args.githubRepoId,
      teamsJson: normalized,
    },
  });

  return normalized;
}

async function getTeamMembersCached(
  deps: GithubPermissionSyncDeps,
  args: {
    workspaceId: string;
    githubTeamId: string;
    cacheTtlSeconds: number;
    installationToken: string;
    orgLogin: string;
    teamSlug: string;
    rateLimitWarnings: string[];
  }
): Promise<string[]> {
  const githubTeamIdBigInt = BigInt(args.githubTeamId);
  const cache = await deps.prisma.githubTeamMembersCache.findUnique({
    where: {
      workspaceId_githubTeamId: {
        workspaceId: args.workspaceId,
        githubTeamId: githubTeamIdBigInt,
      },
    },
    select: {
      membersJson: true,
      updatedAt: true,
    },
  });

  if (cache && isFresh(cache.updatedAt, args.cacheTtlSeconds)) {
    return parseTeamMembersJson(cache.membersJson);
  }

  const fetched = await retryGithubApiCall(
    () => callListTeamMembers(deps, args.installationToken, args.orgLogin, args.teamSlug),
    `team-members:${args.orgLogin}/${args.teamSlug}`,
    args.rateLimitWarnings
  );
  const ids = fetched
    .map((member) => (Number.isFinite(member.id) ? String(member.id) : ''))
    .filter((id) => id.length > 0);

  await deps.prisma.githubTeamMembersCache.upsert({
    where: {
      workspaceId_githubTeamId: {
        workspaceId: args.workspaceId,
        githubTeamId: githubTeamIdBigInt,
      },
    },
    update: {
      membersJson: ids,
    },
    create: {
      workspaceId: args.workspaceId,
      githubTeamId: githubTeamIdBigInt,
      membersJson: ids,
    },
  });

  return ids;
}

async function retryGithubApiCall<T>(
  run: () => Promise<T>,
  operation: string,
  warnings: string[]
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < 3) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      attempt += 1;
      const message = toErrorMessage(error).toLowerCase();
      const rateLimited = message.includes('rate limit') || message.includes('secondary rate limit');
      const retryable = rateLimited || message.includes(' 50') || message.includes('timeout');
      if (rateLimited) {
        warnings.push(`Rate limit while running ${operation} (attempt ${attempt}).`);
      }
      if (!retryable || attempt >= 3) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }

  throw lastError;
}

function isFresh(updatedAt: Date, ttlSeconds: number): boolean {
  const ttl = Math.max(30, Number(ttlSeconds) || 900);
  return Date.now() - updatedAt.getTime() < ttl * 1000;
}

function parseRepoTeamsJson(
  input: unknown
): Array<{ team_id: string; team_slug: string; org_login: string; permission: string }> {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const row = item as Record<string, unknown>;
      const teamId = String(row.team_id || '').trim();
      const teamSlug = String(row.team_slug || '').trim();
      const orgLogin = String(row.org_login || '').trim();
      const permission = String(row.permission || '').trim().toLowerCase();
      if (!teamId || !teamSlug || !orgLogin || !permission) {
        return null;
      }
      return {
        team_id: teamId,
        team_slug: teamSlug,
        org_login: orgLogin,
        permission,
      };
    })
    .filter((value): value is { team_id: string; team_slug: string; org_login: string; permission: string } => Boolean(value));
}

function parseTeamMembersJson(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => {
      if (typeof item === 'string' || typeof item === 'number') {
        return String(item).trim();
      }
      return '';
    })
    .filter((value) => value.length > 0);
}

async function callListRepositoryCollaboratorsWithPermissions(
  deps: GithubPermissionSyncDeps,
  installationToken: string,
  owner: string,
  repo: string
) {
  if (deps.githubApiClient?.listRepositoryCollaboratorsWithPermissions) {
    return deps.githubApiClient.listRepositoryCollaboratorsWithPermissions(
      installationToken,
      owner,
      repo
    );
  }
  return listRepositoryCollaboratorsWithPermissions(installationToken, owner, repo);
}

async function callListRepositoryTeams(
  deps: GithubPermissionSyncDeps,
  installationToken: string,
  owner: string,
  repo: string
) {
  if (deps.githubApiClient?.listRepositoryTeams) {
    return deps.githubApiClient.listRepositoryTeams(installationToken, owner, repo);
  }
  return listRepositoryTeams(installationToken, owner, repo);
}

async function callListTeamMembers(
  deps: GithubPermissionSyncDeps,
  installationToken: string,
  orgLogin: string,
  teamSlug: string
) {
  if (deps.githubApiClient?.listTeamMembers) {
    return deps.githubApiClient.listTeamMembers(installationToken, orgLogin, teamSlug);
  }
  return listTeamMembers(installationToken, orgLogin, teamSlug);
}

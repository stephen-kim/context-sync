import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapGithubPermissionToProjectRole,
  normalizeGithubLogin,
  syncGithubPermissionsHandler,
} from './helpers/github-permission-sync-helpers.js';
import { maxGithubPermission } from './helpers/github-permission-sync-utils.js';

type HarnessOptions = {
  mode: 'add_only' | 'add_and_remove';
  collaboratorsByRepo: Record<
    string,
    Array<{ id: number; login: string; role_name?: string; permission?: string; permissions?: Record<string, boolean> }>
  >;
  repoTeamsByRepo?: Record<
    string,
    Array<{ id: number; slug: string; permission: string; organization_login: string }>
  >;
  teamMembersByTeam?: Record<string, Array<{ id: number; login: string }>>;
  initialProjectMembers: Array<{ projectId: string; userId: string; role: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER' }>;
  githubUserLinks: Array<{ userId: string; githubLogin: string; githubUserId?: bigint }>;
  dryRun?: boolean;
  cacheTtlSeconds?: number;
};

function buildHarness(options: HarnessOptions) {
  const workspace = { id: 'w1', key: 'team' };
  const repo = {
    id: 'gr1',
    workspaceId: workspace.id,
    githubRepoId: BigInt(11),
    fullName: 'acme/platform',
    isActive: true,
    linkedProjectId: 'p1',
    linkedProject: { id: 'p1', key: 'github:acme/platform', name: 'acme/platform' },
  };

  const projectMembers = new Map<string, { projectId: string; userId: string; role: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER' }>();
  for (const row of options.initialProjectMembers) {
    projectMembers.set(`${row.projectId}:${row.userId}`, { ...row });
  }

  const githubUserLinks = new Map<string, { userId: string; githubLogin: string; githubUserId: bigint | null }>();
  for (const row of options.githubUserLinks) {
    githubUserLinks.set(row.userId, {
      userId: row.userId,
      githubLogin: row.githubLogin,
      githubUserId: row.githubUserId ?? null,
    });
  }

  const repoTeamsCache = new Map<string, { teamsJson: unknown; updatedAt: Date }>();
  const teamMembersCache = new Map<string, { membersJson: unknown; updatedAt: Date }>();

  let projectMemberWriteCount = 0;
  let permissionCacheWriteCount = 0;
  let repoTeamsApiCallCount = 0;
  let teamMembersApiCallCount = 0;

  const prisma: any = {
    workspaceMember: {
      findUnique: async (args: { where: { workspaceId_userId: { workspaceId: string; userId: string } } }) => {
        const userId = args.where.workspaceId_userId.userId;
        if (userId === 'admin-user') {
          return { workspaceId: workspace.id, userId, role: 'ADMIN' };
        }
        if (userId === 'u-admin-protected') {
          return { workspaceId: workspace.id, userId, role: 'ADMIN' };
        }
        if (githubUserLinks.has(userId)) {
          return { workspaceId: workspace.id, userId, role: 'MEMBER' };
        }
        return null;
      },
      findMany: async () => [{ userId: 'admin-user' }, { userId: 'u-admin-protected' }],
    },
    workspaceSettings: {
      findUnique: async () => ({
        githubPermissionSyncEnabled: true,
        githubPermissionSyncMode: options.mode,
        githubCacheTtlSeconds: options.cacheTtlSeconds ?? 900,
        githubRoleMapping: {
          admin: 'maintainer',
          maintain: 'maintainer',
          write: 'writer',
          triage: 'reader',
          read: 'reader',
        },
      }),
    },
    githubInstallation: {
      findUnique: async (args: { where: { workspaceId: string } }) => {
        if (args.where.workspaceId !== workspace.id) {
          return null;
        }
        return { installationId: BigInt(101) };
      },
    },
    githubRepoLink: {
      findMany: async () => [repo],
    },
    githubUserLink: {
      findMany: async () =>
        [...githubUserLinks.values()].map((row) => ({
          userId: row.userId,
          githubLogin: row.githubLogin,
          githubUserId: row.githubUserId,
          user: {
            id: row.userId,
            email: `${row.userId}@example.com`,
          },
        })),
    },
    projectMember: {
      findMany: async () => [...projectMembers.values()],
      upsert: async (args: {
        where: { projectId_userId: { projectId: string; userId: string } };
        update: { role: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER' };
        create: { projectId: string; userId: string; role: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER' };
      }) => {
        const key = `${args.where.projectId_userId.projectId}:${args.where.projectId_userId.userId}`;
        const existing = projectMembers.get(key);
        if (existing) {
          existing.role = args.update.role;
        } else {
          projectMembers.set(key, {
            projectId: args.create.projectId,
            userId: args.create.userId,
            role: args.create.role,
          });
        }
        projectMemberWriteCount += 1;
        return {};
      },
      update: async (args: {
        where: { projectId_userId: { projectId: string; userId: string } };
        data: { role: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER' };
      }) => {
        const key = `${args.where.projectId_userId.projectId}:${args.where.projectId_userId.userId}`;
        const existing = projectMembers.get(key);
        if (existing) {
          existing.role = args.data.role;
        }
        projectMemberWriteCount += 1;
        return {};
      },
      deleteMany: async (args: { where: { projectId: string; userId: string } }) => {
        projectMembers.delete(`${args.where.projectId}:${args.where.userId}`);
        projectMemberWriteCount += 1;
        return { count: 1 };
      },
    },
    githubPermissionCache: {
      upsert: async () => {
        permissionCacheWriteCount += 1;
        return {};
      },
    },
    githubRepoTeamsCache: {
      findUnique: async (args: { where: { workspaceId_githubRepoId: { workspaceId: string; githubRepoId: bigint } } }) => {
        const key = `${args.where.workspaceId_githubRepoId.workspaceId}:${args.where.workspaceId_githubRepoId.githubRepoId.toString()}`;
        return repoTeamsCache.get(key) || null;
      },
      upsert: async (args: {
        where: { workspaceId_githubRepoId: { workspaceId: string; githubRepoId: bigint } };
        update: { teamsJson: unknown };
        create: { workspaceId: string; githubRepoId: bigint; teamsJson: unknown };
      }) => {
        const key = `${args.where.workspaceId_githubRepoId.workspaceId}:${args.where.workspaceId_githubRepoId.githubRepoId.toString()}`;
        repoTeamsCache.set(key, {
          teamsJson: args.update.teamsJson ?? args.create.teamsJson,
          updatedAt: new Date(),
        });
        return {};
      },
    },
    githubTeamMembersCache: {
      findUnique: async (args: { where: { workspaceId_githubTeamId: { workspaceId: string; githubTeamId: bigint } } }) => {
        const key = `${args.where.workspaceId_githubTeamId.workspaceId}:${args.where.workspaceId_githubTeamId.githubTeamId.toString()}`;
        return teamMembersCache.get(key) || null;
      },
      upsert: async (args: {
        where: { workspaceId_githubTeamId: { workspaceId: string; githubTeamId: bigint } };
        update: { membersJson: unknown };
        create: { workspaceId: string; githubTeamId: bigint; membersJson: unknown };
      }) => {
        const key = `${args.where.workspaceId_githubTeamId.workspaceId}:${args.where.workspaceId_githubTeamId.githubTeamId.toString()}`;
        teamMembersCache.set(key, {
          membersJson: args.update.membersJson ?? args.create.membersJson,
          updatedAt: new Date(),
        });
        return {};
      },
    },
    $transaction: async <T>(run: (tx: any) => Promise<T>) => run(prisma),
  };

  const deps = {
    prisma,
    securityConfig: {
      githubAppId: '1',
      githubAppPrivateKey: 'dummy',
    },
    githubApiClient: {
      issueGithubAppJwt: async () => 'app-jwt',
      issueInstallationAccessToken: async () => 'installation-token',
      listRepositoryCollaboratorsWithPermissions: async (_token: string, owner: string, repoName: string) =>
        options.collaboratorsByRepo[`${owner}/${repoName}`] || [],
      listRepositoryTeams: async (_token: string, owner: string, repoName: string) => {
        repoTeamsApiCallCount += 1;
        return options.repoTeamsByRepo?.[`${owner}/${repoName}`] || [];
      },
      listTeamMembers: async (_token: string, orgLogin: string, teamSlug: string) => {
        teamMembersApiCallCount += 1;
        return options.teamMembersByTeam?.[`${orgLogin}/${teamSlug}`] || [];
      },
    },
    getWorkspaceByKey: async () => workspace,
    recordAudit: async () => {},
  };

  const auth = {
    user: { id: 'admin-user', email: 'admin@example.com', source: 'database', envAdmin: false },
    projectAccessBypass: false,
    authMethod: 'api_key',
    mustChangePassword: false,
  } as const;

  return {
    deps,
    auth,
    workspace,
    projectMembers,
    getProjectMemberWriteCount: () => projectMemberWriteCount,
    getPermissionCacheWriteCount: () => permissionCacheWriteCount,
    getRepoTeamsApiCallCount: () => repoTeamsApiCallCount,
    getTeamMembersApiCallCount: () => teamMembersApiCallCount,
    markCachesStale: () => {
      const staleAt = new Date(Date.now() - 3_600_000);
      for (const value of repoTeamsCache.values()) {
        value.updatedAt = staleAt;
      }
      for (const value of teamMembersCache.values()) {
        value.updatedAt = staleAt;
      }
    },
  };
}

test('maps github permission to claustrum role and orders max permission', () => {
  const mapping = {
    admin: 'maintainer',
    maintain: 'maintainer',
    write: 'writer',
    triage: 'reader',
    read: 'reader',
  } as const;
  assert.equal(mapGithubPermissionToProjectRole('admin', mapping), 'MAINTAINER');
  assert.equal(mapGithubPermissionToProjectRole('write', mapping), 'WRITER');
  assert.equal(normalizeGithubLogin('@OctoCat'), 'octocat');
  assert.equal(maxGithubPermission('read', 'write'), 'write');
  assert.equal(maxGithubPermission('maintain', 'admin'), 'admin');
});

test('compute merges direct collaborator and team permissions with max()', async () => {
  const h = buildHarness({
    mode: 'add_only',
    collaboratorsByRepo: {
      'acme/platform': [{ id: 101, login: 'octo-one', role_name: 'read' }],
    },
    repoTeamsByRepo: {
      'acme/platform': [{ id: 42, slug: 'platform-team', permission: 'write', organization_login: 'acme' }],
    },
    teamMembersByTeam: {
      'acme/platform-team': [
        { id: 101, login: 'octo-one' },
        { id: 202, login: 'octo-two' },
      ],
    },
    initialProjectMembers: [],
    githubUserLinks: [
      { userId: 'u1', githubLogin: 'octo-one', githubUserId: BigInt(101) },
      { userId: 'u2', githubLogin: 'octo-two', githubUserId: BigInt(202) },
    ],
  });

  const result = await syncGithubPermissionsHandler(h.deps as never, {
    auth: h.auth,
    workspaceKey: h.workspace.key,
  });

  assert.equal(result.added, 2);
  assert.equal(h.projectMembers.get('p1:u1')?.role, 'WRITER');
  assert.equal(h.projectMembers.get('p1:u2')?.role, 'WRITER');
});

test('add_only sync adds or upgrades but does not downgrade', async () => {
  const h = buildHarness({
    mode: 'add_only',
    collaboratorsByRepo: {
      'acme/platform': [
        { id: 101, login: 'octo-one', role_name: 'read' },
        { id: 303, login: 'octo-three', role_name: 'write' },
      ],
    },
    initialProjectMembers: [{ projectId: 'p1', userId: 'u1', role: 'WRITER' }],
    githubUserLinks: [
      { userId: 'u1', githubLogin: 'octo-one', githubUserId: BigInt(101) },
      { userId: 'u3', githubLogin: 'octo-three', githubUserId: BigInt(303) },
    ],
  });

  const result = await syncGithubPermissionsHandler(h.deps as never, {
    auth: h.auth,
    workspaceKey: h.workspace.key,
  });

  assert.equal(result.added, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.removed, 0);
  assert.equal(h.projectMembers.get('p1:u1')?.role, 'WRITER');
  assert.equal(h.projectMembers.get('p1:u3')?.role, 'WRITER');
});

test('add_and_remove sync removes linked users without permission but protects owners', async () => {
  const h = buildHarness({
    mode: 'add_and_remove',
    collaboratorsByRepo: {
      'acme/platform': [{ id: 101, login: 'octo-one', role_name: 'read' }],
    },
    initialProjectMembers: [
      { projectId: 'p1', userId: 'u1', role: 'WRITER' },
      { projectId: 'p1', userId: 'u2', role: 'WRITER' },
      { projectId: 'p1', userId: 'u-owner', role: 'OWNER' },
    ],
    githubUserLinks: [
      { userId: 'u1', githubLogin: 'octo-one', githubUserId: BigInt(101) },
      { userId: 'u2', githubLogin: 'octo-two', githubUserId: BigInt(202) },
      { userId: 'u-owner', githubLogin: 'octo-owner', githubUserId: BigInt(404) },
    ],
  });

  const result = await syncGithubPermissionsHandler(h.deps as never, {
    auth: h.auth,
    workspaceKey: h.workspace.key,
  });

  assert.equal(result.updated, 1);
  assert.equal(result.removed, 1);
  assert.equal(h.projectMembers.get('p1:u1')?.role, 'READER');
  assert.equal(h.projectMembers.has('p1:u2'), false);
  assert.equal(h.projectMembers.get('p1:u-owner')?.role, 'OWNER');
});

test('cache hit within TTL avoids repo-team and team-member API refetch', async () => {
  const h = buildHarness({
    mode: 'add_only',
    cacheTtlSeconds: 900,
    collaboratorsByRepo: {
      'acme/platform': [{ id: 101, login: 'octo-one', role_name: 'write' }],
    },
    repoTeamsByRepo: {
      'acme/platform': [{ id: 42, slug: 'platform-team', permission: 'read', organization_login: 'acme' }],
    },
    teamMembersByTeam: {
      'acme/platform-team': [{ id: 202, login: 'octo-two' }],
    },
    initialProjectMembers: [],
    githubUserLinks: [
      { userId: 'u1', githubLogin: 'octo-one', githubUserId: BigInt(101) },
      { userId: 'u2', githubLogin: 'octo-two', githubUserId: BigInt(202) },
    ],
  });

  await syncGithubPermissionsHandler(h.deps as never, {
    auth: h.auth,
    workspaceKey: h.workspace.key,
  });
  await syncGithubPermissionsHandler(h.deps as never, {
    auth: h.auth,
    workspaceKey: h.workspace.key,
  });

  assert.equal(h.getRepoTeamsApiCallCount(), 1);
  assert.equal(h.getTeamMembersApiCallCount(), 1);
});

test('cache miss after TTL refetches repo-team and team-member data', async () => {
  const h = buildHarness({
    mode: 'add_only',
    cacheTtlSeconds: 900,
    collaboratorsByRepo: {
      'acme/platform': [{ id: 101, login: 'octo-one', role_name: 'write' }],
    },
    repoTeamsByRepo: {
      'acme/platform': [{ id: 42, slug: 'platform-team', permission: 'read', organization_login: 'acme' }],
    },
    teamMembersByTeam: {
      'acme/platform-team': [{ id: 202, login: 'octo-two' }],
    },
    initialProjectMembers: [],
    githubUserLinks: [
      { userId: 'u1', githubLogin: 'octo-one', githubUserId: BigInt(101) },
      { userId: 'u2', githubLogin: 'octo-two', githubUserId: BigInt(202) },
    ],
  });

  await syncGithubPermissionsHandler(h.deps as never, {
    auth: h.auth,
    workspaceKey: h.workspace.key,
  });
  h.markCachesStale();
  await syncGithubPermissionsHandler(h.deps as never, {
    auth: h.auth,
    workspaceKey: h.workspace.key,
  });

  assert.equal(h.getRepoTeamsApiCallCount(), 2);
  assert.equal(h.getTeamMembersApiCallCount(), 2);
});

test('dry_run returns counts without DB writes', async () => {
  const h = buildHarness({
    mode: 'add_only',
    dryRun: true,
    collaboratorsByRepo: {
      'acme/platform': [
        { id: 101, login: 'octo-one', role_name: 'write' },
        { id: 999, login: 'ghost-user', role_name: 'read' },
      ],
    },
    initialProjectMembers: [],
    githubUserLinks: [{ userId: 'u1', githubLogin: 'octo-one', githubUserId: BigInt(101) }],
  });

  const result = await syncGithubPermissionsHandler(h.deps as never, {
    auth: h.auth,
    workspaceKey: h.workspace.key,
    dryRun: true,
  });

  assert.equal(result.users_matched, 1);
  assert.equal(result.skipped_unmatched, 1);
  assert.equal(result.added, 1);
  assert.equal(h.getProjectMemberWriteCount(), 0);
  assert.equal(h.getPermissionCacheWriteCount(), 0);
});

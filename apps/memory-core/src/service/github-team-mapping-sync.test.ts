import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGithubTeamMappingsHandler } from './helpers/github-team-mapping-helpers.js';

type MemberRow = {
  projectId: string;
  userId: string;
  role: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER';
};

function createHarness(options: {
  mode: 'add_only' | 'add_and_remove';
  teamMembers: Array<{ id: number; login: string }>;
  initialProjectMembers: MemberRow[];
}) {
  const workspace = { id: 'w1', key: 'team' };
  const project = { id: 'p1', key: 'github:acme/platform', workspaceId: workspace.id };
  const projectMembers = new Map<string, MemberRow>();
  for (const row of options.initialProjectMembers) {
    projectMembers.set(`${row.projectId}:${row.userId}`, { ...row });
  }

  const prisma: any = {
    workspaceSettings: {
      findUnique: async () => ({
        githubWebhookEnabled: true,
        githubWebhookSyncMode: options.mode,
        githubTeamMappingEnabled: true,
      }),
    },
    githubTeamMapping: {
      findMany: async () => [
        {
          id: 'm1',
          workspaceId: workspace.id,
          providerInstallationId: null,
          githubTeamId: BigInt(11),
          githubTeamSlug: 'platform-team',
          githubOrgLogin: 'acme',
          targetType: 'project',
          targetKey: project.key,
          role: 'WRITER',
          enabled: true,
          priority: 100,
        },
      ],
    },
    githubUserLink: {
      findMany: async () => [
        { userId: 'u1', githubUserId: BigInt(101), githubLogin: 'octo-one' },
        { userId: 'u2', githubUserId: BigInt(102), githubLogin: 'octo-two' },
      ],
    },
    project: {
      findMany: async () => [
        {
          id: project.id,
          key: project.key,
        },
      ],
    },
    workspaceMember: {
      findMany: async (args: { where?: { role?: { in?: Array<'OWNER' | 'ADMIN'> } } }) => {
        if (args.where?.role?.in) {
          return [];
        }
        return [
          { userId: 'u1', role: 'MEMBER' },
          { userId: 'u2', role: 'MEMBER' },
        ];
      },
      upsert: async () => ({}),
      update: async () => ({}),
      deleteMany: async () => ({ count: 1 }),
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
        return {};
      },
      deleteMany: async (args: { where: { projectId: string; userId: string } }) => {
        projectMembers.delete(`${args.where.projectId}:${args.where.userId}`);
        return { count: 1 };
      },
    },
    $transaction: async <T>(run: (tx: any) => Promise<T>) => run(prisma),
  };

  const audits: Array<{ action: string; target: Record<string, unknown> }> = [];

  return {
    workspace,
    project,
    projectMembers,
    audits,
    deps: {
      prisma,
      securityConfig: {
        githubAppId: '1',
        githubAppPrivateKey: 'dummy',
      },
      githubApiClient: {
        issueGithubAppJwt: async () => 'app-jwt',
        issueInstallationAccessToken: async () => 'installation-token',
        listTeamMembers: async () => options.teamMembers,
      },
      getWorkspaceByKey: async () => workspace,
      recordAudit: async (entry: { action: string; target: Record<string, unknown> }) => {
        audits.push(entry);
      },
    },
  };
}

test('team mapping add_only updates and adds project members', async () => {
  const h = createHarness({
    mode: 'add_only',
    teamMembers: [
      { id: 101, login: 'octo-one' },
      { id: 102, login: 'octo-two' },
    ],
    initialProjectMembers: [{ projectId: 'p1', userId: 'u1', role: 'READER' }],
  });

  const result = await applyGithubTeamMappingsHandler(h.deps as never, {
    workspaceId: h.workspace.id,
    workspaceKey: h.workspace.key,
    installationId: BigInt(1001),
    eventType: 'team',
    actorUserId: 'admin-user',
  });

  assert.equal(result.mode, 'add_only');
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.removed, 0);
  assert.equal(h.projectMembers.get('p1:u1')?.role, 'WRITER');
  assert.equal(h.projectMembers.get('p1:u2')?.role, 'WRITER');
});

test('team mapping add_and_remove removes project members no longer in team', async () => {
  const h = createHarness({
    mode: 'add_and_remove',
    teamMembers: [{ id: 101, login: 'octo-one' }],
    initialProjectMembers: [
      { projectId: 'p1', userId: 'u1', role: 'WRITER' },
      { projectId: 'p1', userId: 'u2', role: 'WRITER' },
    ],
  });

  const result = await applyGithubTeamMappingsHandler(h.deps as never, {
    workspaceId: h.workspace.id,
    workspaceKey: h.workspace.key,
    installationId: BigInt(1001),
    eventType: 'membership',
    actorUserId: 'admin-user',
  });

  assert.equal(result.mode, 'add_and_remove');
  assert.equal(result.removed, 1);
  assert.equal(h.projectMembers.has('p1:u2'), false);
  assert.equal(h.projectMembers.has('p1:u1'), true);
});

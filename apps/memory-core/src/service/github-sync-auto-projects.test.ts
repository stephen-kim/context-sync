import assert from 'node:assert/strict';
import test from 'node:test';
import { syncGithubReposHandler } from './helpers/github-integration-helpers.js';

type HarnessOptions = {
  githubAutoCreateProjects: boolean;
};

function buildSyncHarness(options: HarnessOptions) {
  const workspace = { id: 'w1', key: 'team' };
  const audits: Array<{ action: string; target: Record<string, unknown> }> = [];
  const projects = new Map<string, { id: string; key: string; name: string }>();
  const mappings = new Map<string, { id: string; externalId: string; projectId: string; priority: number }>();
  const repoLinks = new Map<string, { githubRepoId: bigint; linkedProjectId: string | null; isActive: boolean }>();
  let projectSeq = 1;
  let mappingSeq = 1;

  const tx = {
    githubRepoLink: {
      updateMany: async () => {
        for (const row of repoLinks.values()) {
          row.isActive = false;
        }
        return { count: repoLinks.size };
      },
      upsert: async (args: {
        where: { workspaceId_githubRepoId: { workspaceId: string; githubRepoId: bigint } };
        update: {
          linkedProjectId?: string | null;
          isActive: boolean;
        };
        create: {
          linkedProjectId?: string | null;
          githubRepoId: bigint;
          isActive: boolean;
        };
      }) => {
        const key = args.where.workspaceId_githubRepoId.githubRepoId.toString();
        const current = repoLinks.get(key);
        if (current) {
          current.isActive = args.update.isActive;
          if (Object.prototype.hasOwnProperty.call(args.update, 'linkedProjectId')) {
            current.linkedProjectId = args.update.linkedProjectId ?? null;
          }
          return current;
        }
        const created = {
          githubRepoId: args.create.githubRepoId,
          linkedProjectId: args.create.linkedProjectId ?? null,
          isActive: args.create.isActive,
        };
        repoLinks.set(key, created);
        return created;
      },
    },
    project: {
      findUnique: async (args: { where: { workspaceId_key: { workspaceId: string; key: string } } }) => {
        return projects.get(args.where.workspaceId_key.key) || null;
      },
      upsert: async (args: {
        where: { workspaceId_key: { workspaceId: string; key: string } };
        update: { name: string };
        create: { workspaceId: string; key: string; name: string };
        select: { id: true };
      }) => {
        const key = args.where.workspaceId_key.key;
        const existing = projects.get(key);
        if (existing) {
          existing.name = args.update.name;
          return { id: existing.id };
        }
        const created = { id: `p-${projectSeq++}`, key, name: args.create.name };
        projects.set(key, created);
        return { id: created.id };
      },
    },
    projectMapping: {
      findUnique: async (args: {
        where: {
          workspaceId_kind_externalId: { workspaceId: string; kind: 'github_remote'; externalId: string };
        };
      }) => {
        const row = mappings.get(args.where.workspaceId_kind_externalId.externalId);
        return row ? { id: row.id } : null;
      },
      update: async (args: { where: { id: string }; data: { projectId: string; isEnabled: boolean } }) => {
        const row = [...mappings.values()].find((item) => item.id === args.where.id);
        if (!row) {
          throw new Error('mapping not found');
        }
        row.projectId = args.data.projectId;
        return row;
      },
      findFirst: async () => {
        const highest = [...mappings.values()].sort((a, b) => b.priority - a.priority)[0];
        return highest ? { priority: highest.priority } : null;
      },
      create: async (args: {
        data: {
          externalId: string;
          projectId: string;
          priority: number;
        };
        select: { id: true };
      }) => {
        const id = `m-${mappingSeq++}`;
        mappings.set(args.data.externalId, {
          id,
          externalId: args.data.externalId,
          projectId: args.data.projectId,
          priority: args.data.priority,
        });
        return { id };
      },
    },
  };

  const deps = {
    prisma: {
      workspaceSettings: {
        findUnique: async () => ({
          githubAutoCreateProjects: options.githubAutoCreateProjects,
          githubProjectKeyPrefix: 'github:',
          githubKeyPrefix: 'github:',
          resolutionOrder: ['github_remote', 'repo_root_slug', 'manual'],
          autoCreateProject: true,
          autoCreateProjectSubprojects: true,
          enableMonorepoResolution: false,
          monorepoMode: 'repo_hash_subpath',
          monorepoContextMode: 'shared_repo',
          monorepoWorkspaceGlobs: ['apps/*', 'packages/*'],
          monorepoExcludeGlobs: ['**/node_modules/**'],
          monorepoMaxDepth: 3,
        }),
      },
      githubInstallation: {
        findUnique: async () => ({
          workspaceId: workspace.id,
          installationId: BigInt(101),
          accountType: 'Organization',
          accountLogin: 'acme',
          repositorySelection: 'all',
          permissions: {},
        }),
      },
      $transaction: async <T>(run: (arg: typeof tx) => Promise<T>) => run(tx),
    },
    securityConfig: {
      githubAppId: '1',
      githubAppPrivateKey: 'dummy',
      githubStateSecret: 'test-secret',
    },
    githubApiClient: {
      issueGithubAppJwt: async () => 'app-jwt',
      issueInstallationAccessToken: async () => 'installation-token',
      listInstallationRepositories: async () => [
        {
          id: 1,
          full_name: 'Acme/Platform',
          private: true,
          default_branch: 'main',
        },
      ],
    },
    getWorkspaceByKey: async () => workspace,
    recordAudit: async (entry: { action: string; target: Record<string, unknown> }) => {
      audits.push({ action: entry.action, target: entry.target });
    },
  };

  const auth = {
    user: { id: 'u1', email: 'u1@example.com', source: 'database', envAdmin: true },
    projectAccessBypass: false,
    authMethod: 'api_key',
    mustChangePassword: false,
  } as const;

  return { deps, auth, workspace, projects, mappings, repoLinks, audits };
}

test('sync-repos creates repo project once and is idempotent on repeated sync', async () => {
  const h = buildSyncHarness({ githubAutoCreateProjects: true });

  const first = await syncGithubReposHandler(h.deps as never, {
    auth: h.auth,
    workspaceKey: h.workspace.key,
  });
  const second = await syncGithubReposHandler(h.deps as never, {
    auth: h.auth,
    workspaceKey: h.workspace.key,
  });

  assert.equal(first.projects_auto_created, 1);
  assert.equal(first.projects_auto_linked, 1);
  assert.equal(second.projects_auto_created, 0);
  assert.equal(second.projects_auto_linked, 1);
  assert.equal(h.projects.size, 1);
  assert.equal(h.mappings.size, 1);
  const link = h.repoLinks.get('1');
  assert.ok(link?.linkedProjectId);
});

test('sync-repos does not auto-create projects when github_auto_create_projects is disabled', async () => {
  const h = buildSyncHarness({ githubAutoCreateProjects: false });

  const result = await syncGithubReposHandler(h.deps as never, {
    auth: h.auth,
    workspaceKey: h.workspace.key,
  });

  assert.equal(result.projects_auto_created, 0);
  assert.equal(result.projects_auto_linked, 0);
  assert.equal(h.projects.size, 0);
  assert.equal(h.mappings.size, 0);
  const link = h.repoLinks.get('1');
  assert.equal(link?.linkedProjectId ?? null, null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { ResolutionKind } from '@prisma/client';
import { resolveProjectByPriority } from './helpers/resolve-project-helper.js';

type ProjectRow = { id: string; key: string; name: string };
type MappingRow = {
  id: string;
  workspaceId: string;
  kind: ResolutionKind;
  externalId: string;
  priority: number;
  isEnabled: boolean;
  createdAt: Date;
  project: ProjectRow & { workspaceId: string };
};

function buildHarness(settingsOverrides: Record<string, unknown>) {
  const workspace = { id: 'w1', key: 'team' };
  const projects = new Map<string, ProjectRow>();
  const mappings: MappingRow[] = [];
  const splitPolicies = new Set<string>();
  let idSeq = 1;

  const settings = {
    resolutionOrder: [ResolutionKind.github_remote, ResolutionKind.repo_root_slug, ResolutionKind.manual],
    autoCreateProject: true,
    autoCreateProjectSubprojects: true,
    githubAutoCreateProjects: true,
    githubAutoCreateSubprojects: false,
    githubProjectKeyPrefix: 'github:',
    githubKeyPrefix: 'github:',
    localKeyPrefix: 'local:',
    enableMonorepoResolution: true,
    monorepoMode: 'repo_hash_subpath',
    monorepoContextMode: 'shared_repo',
    monorepoWorkspaceGlobs: ['apps/*', 'packages/*'],
    monorepoExcludeGlobs: ['**/node_modules/**', '**/dist/**'],
    monorepoMaxDepth: 3,
    ...settingsOverrides,
  };

  const prisma = {
    workspaceSettings: {
      findUnique: async () => settings,
    },
    projectMapping: {
      findFirst: async (args: {
        where: {
          workspaceId: string;
          kind: ResolutionKind;
          externalId?: { in: string[] };
          isEnabled: boolean;
        };
      }) => {
        const allowedExternalIds =
          typeof args.where.externalId === 'object' && args.where.externalId && 'in' in args.where.externalId
            ? args.where.externalId.in
            : undefined;
        const rows = mappings
          .filter((row) => row.workspaceId === args.where.workspaceId)
          .filter((row) => row.kind === args.where.kind)
          .filter((row) => row.isEnabled === args.where.isEnabled)
          .filter((row) =>
            allowedExternalIds ? allowedExternalIds.includes(row.externalId) : true
          )
          .sort((a, b) => a.priority - b.priority || a.createdAt.getTime() - b.createdAt.getTime());
        return rows[0] ?? null;
      },
    },
    project: {
      findUnique: async (args: { where: { workspaceId_key: { workspaceId: string; key: string } } }) => {
        const row = projects.get(args.where.workspaceId_key.key);
        return row ? { ...row, workspaceId: args.where.workspaceId_key.workspaceId } : null;
      },
    },
    monorepoSubprojectPolicy: {
      findFirst: async (args: {
        where: { workspaceId: string; repoKey: string; subpath: string; enabled: boolean };
      }) => {
        const key = `${args.where.workspaceId}::${args.where.repoKey}::${args.where.subpath}`;
        if (!args.where.enabled) {
          return null;
        }
        return splitPolicies.has(key) ? { id: `policy-${key}` } : null;
      },
    },
  };

  async function createProjectAndMapping(args: {
    workspaceId: string;
    kind: ResolutionKind;
    externalId: string;
    projectKey: string;
    projectName: string;
  }) {
    const existingProject = projects.get(args.projectKey);
    const project =
      existingProject ??
      (() => {
        const created = {
          id: `p-${idSeq++}`,
          key: args.projectKey,
          name: args.projectName,
        };
        projects.set(args.projectKey, created);
        return created;
      })();

    let mapping = mappings.find(
      (row) =>
        row.workspaceId === args.workspaceId &&
        row.kind === args.kind &&
        row.externalId === args.externalId
    );
    if (!mapping) {
      mapping = {
        id: `m-${idSeq++}`,
        workspaceId: args.workspaceId,
        kind: args.kind,
        externalId: args.externalId,
        priority: mappings.length,
        isEnabled: true,
        createdAt: new Date(),
        project: { ...project, workspaceId: args.workspaceId },
      };
      mappings.push(mapping);
    } else {
      mapping.project = { ...project, workspaceId: args.workspaceId };
      mapping.isEnabled = true;
    }

    return {
      project,
      mapping: { id: mapping.id },
      created: !existingProject,
    };
  }

  async function ensureProjectMapping() {
    return { id: `m-ensure-${idSeq++}` };
  }

  return {
    workspace,
    projects,
    mappings,
    splitPolicies,
    prisma,
    createProjectAndMapping,
    ensureProjectMapping,
  };
}

function buildAuth() {
  return {
    user: { id: 'u1', email: 'u1@example.com', source: 'database', envAdmin: true },
    projectAccessBypass: false,
    authMethod: 'api_key',
    mustChangePassword: false,
  } as const;
}

test('shared_repo keeps a single repo-level project even when subpath is detected', async () => {
  const h = buildHarness({
    monorepoContextMode: 'shared_repo',
    githubAutoCreateSubprojects: true,
  });

  const first = await resolveProjectByPriority({
    prisma: h.prisma as never,
    auth: buildAuth(),
    input: {
      workspace_key: h.workspace.key,
      github_remote: { normalized: 'acme/platform' },
      monorepo: { enabled: true, candidate_subpaths: ['apps/admin-ui'] },
      relative_path: 'apps/admin-ui/src',
    },
    getWorkspaceByKey: async () => h.workspace,
    createProjectAndMapping: h.createProjectAndMapping,
    ensureProjectMapping: h.ensureProjectMapping,
  });

  const second = await resolveProjectByPriority({
    prisma: h.prisma as never,
    auth: buildAuth(),
    input: {
      workspace_key: h.workspace.key,
      github_remote: { normalized: 'acme/platform' },
      monorepo: { enabled: true, candidate_subpaths: ['apps/memory-core'] },
      relative_path: 'apps/memory-core/src',
    },
    getWorkspaceByKey: async () => h.workspace,
    createProjectAndMapping: h.createProjectAndMapping,
    ensureProjectMapping: h.ensureProjectMapping,
  });

  assert.equal(first.project.key, 'github:acme/platform');
  assert.equal(second.project.key, 'github:acme/platform');
  assert.equal(h.projects.size, 1);
});

test('split_on_demand falls back to repo-level when subpath policy is not listed', async () => {
  const h = buildHarness({
    monorepoContextMode: 'split_on_demand',
    githubAutoCreateSubprojects: true,
  });

  const resolved = await resolveProjectByPriority({
    prisma: h.prisma as never,
    auth: buildAuth(),
    input: {
      workspace_key: h.workspace.key,
      github_remote: { normalized: 'acme/platform' },
      monorepo: { enabled: true, candidate_subpaths: ['apps/memory-core'] },
      relative_path: 'apps/memory-core/src',
    },
    getWorkspaceByKey: async () => h.workspace,
    createProjectAndMapping: h.createProjectAndMapping,
    ensureProjectMapping: h.ensureProjectMapping,
  });

  assert.equal(resolved.project.key, 'github:acme/platform');
  assert.equal(h.projects.size, 1);
});

test('split_on_demand creates repo#subpath when policy is listed', async () => {
  const h = buildHarness({
    monorepoContextMode: 'split_on_demand',
    githubAutoCreateSubprojects: false,
  });
  h.splitPolicies.add(`${h.workspace.id}::github:acme/platform::apps/memory-core`);

  const resolved = await resolveProjectByPriority({
    prisma: h.prisma as never,
    auth: buildAuth(),
    input: {
      workspace_key: h.workspace.key,
      github_remote: { normalized: 'acme/platform' },
      monorepo: { enabled: true, candidate_subpaths: ['apps/memory-core'] },
      relative_path: 'apps/memory-core/src/routes',
    },
    getWorkspaceByKey: async () => h.workspace,
    createProjectAndMapping: h.createProjectAndMapping,
    ensureProjectMapping: h.ensureProjectMapping,
  });

  assert.equal(resolved.project.key, 'github:acme/platform#apps/memory-core');
  assert.ok(h.projects.has('github:acme/platform'));
  assert.ok(h.projects.has('github:acme/platform#apps/memory-core'));
});

test('split_auto keeps previous auto-create behavior', async () => {
  const h = buildHarness({
    monorepoContextMode: 'split_auto',
    githubAutoCreateSubprojects: true,
  });

  const resolved = await resolveProjectByPriority({
    prisma: h.prisma as never,
    auth: buildAuth(),
    input: {
      workspace_key: h.workspace.key,
      github_remote: { normalized: 'acme/platform' },
      monorepo: { enabled: true, candidate_subpaths: ['apps/admin-ui'] },
      relative_path: 'apps/admin-ui/src/routes',
    },
    getWorkspaceByKey: async () => h.workspace,
    createProjectAndMapping: h.createProjectAndMapping,
    ensureProjectMapping: h.ensureProjectMapping,
  });

  assert.equal(resolved.project.key, 'github:acme/platform#apps/admin-ui');
});

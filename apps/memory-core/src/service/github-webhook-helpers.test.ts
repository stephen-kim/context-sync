import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import {
  enqueueGithubWebhookEventHandler,
  processGithubWebhookQueueHandler,
} from './helpers/github-webhook-helpers.js';

type WebhookRow = {
  id: string;
  workspaceId: string | null;
  installationId: bigint;
  eventType: string;
  deliveryId: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'processing' | 'done' | 'failed';
  affectedReposCount: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RepoLink = {
  workspaceId: string;
  githubRepoId: bigint;
  fullName: string;
  linkedProjectId: string | null;
  defaultBranch: string | null;
  private: boolean;
  isActive: boolean;
};

function createHarness(options?: {
  githubPermissionSyncEnabled?: boolean;
  githubWebhookSyncMode?: 'add_only' | 'add_and_remove';
}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const workspace = { id: `w-${suffix}`, key: `team-${suffix}` };
  let seq = 1;
  const rows = new Map<string, WebhookRow>();
  const byDelivery = new Map<string, string>();
  const audits: Array<{ action: string; target: Record<string, unknown> }> = [];
  const repoLinks = new Map<string, RepoLink>();
  const repoTeamsCache = new Map<string, unknown>();

  repoLinks.set('2001', {
    workspaceId: workspace.id,
    githubRepoId: BigInt(2001),
    fullName: 'acme/platform',
    linkedProjectId: 'p1',
    defaultBranch: 'main',
    private: false,
    isActive: true,
  });
  repoLinks.set('2002', {
    workspaceId: workspace.id,
    githubRepoId: BigInt(2002),
    fullName: 'acme/ui',
    linkedProjectId: 'p2',
    defaultBranch: 'main',
    private: true,
    isActive: true,
  });

  repoTeamsCache.set('2001', [{ team_id: '3001', team_slug: 'platform-team', org_login: 'acme', permission: 'write' }]);
  repoTeamsCache.set('2002', [{ team_id: '3002', team_slug: 'ui-team', org_login: 'acme', permission: 'write' }]);

  const cacheDeletes = {
    repoTeams: 0,
    teamMembers: 0,
    permission: 0,
  };

  const syncCalls: {
    reposSync: Array<{ workspaceKey: string; repos?: string[] }>;
    permissionSync: Array<{ workspaceKey: string; repos?: string[]; mode?: 'add_only' | 'add_and_remove' }>;
  } = {
    reposSync: [],
    permissionSync: [],
  };

  const prisma: any = {
    githubInstallation: {
      findUnique: async (args: { where: { installationId: bigint } }) => {
        if (args.where.installationId !== BigInt(1001)) {
          return null;
        }
        return {
          workspaceId: workspace.id,
          workspace: { key: workspace.key },
        };
      },
    },
    githubWebhookEvent: {
      create: async (args: {
        data: {
          workspaceId: string | null;
          installationId: bigint;
          eventType: string;
          deliveryId: string;
          payload: Record<string, unknown>;
          status: 'queued';
        };
      }) => {
        if (byDelivery.has(args.data.deliveryId)) {
          throw Object.assign(new Error('unique violation'), { code: 'P2002' });
        }
        const id = `e${seq++}`;
        const now = new Date();
        const row: WebhookRow = {
          id,
          workspaceId: args.data.workspaceId,
          installationId: args.data.installationId,
          eventType: args.data.eventType,
          deliveryId: args.data.deliveryId,
          payload: args.data.payload,
          status: 'queued',
          affectedReposCount: 0,
          error: null,
          createdAt: now,
          updatedAt: now,
        };
        rows.set(id, row);
        byDelivery.set(row.deliveryId, id);
        return row;
      },
      findMany: async () => {
        return [...rows.values()].filter((row) => row.status === 'queued');
      },
      updateMany: async (args: {
        where: { id: string; status: 'queued' };
        data: { status: 'processing'; error: null };
      }) => {
        const row = rows.get(args.where.id);
        if (!row || row.status !== args.where.status) {
          return { count: 0 };
        }
        row.status = args.data.status;
        row.error = args.data.error;
        row.updatedAt = new Date();
        return { count: 1 };
      },
      update: async (args: {
        where: { id: string };
        data: { status: 'done' | 'failed'; error: string | null; affectedReposCount?: number };
      }) => {
        const row = rows.get(args.where.id);
        if (!row) {
          throw new Error('missing row');
        }
        row.status = args.data.status;
        row.error = args.data.error;
        row.affectedReposCount = args.data.affectedReposCount ?? row.affectedReposCount;
        row.updatedAt = new Date();
        return row;
      },
      findUnique: async (args: { where: { id: string } }) => {
        const row = rows.get(args.where.id);
        return row
          ? {
              id: row.id,
              workspaceId: row.workspaceId,
              installationId: row.installationId,
              eventType: row.eventType,
              deliveryId: row.deliveryId,
              payload: row.payload,
            }
          : null;
      },
    },
    workspace: {
      findUnique: async (args: { where: { id: string } }) => {
        return args.where.id === workspace.id ? workspace : null;
      },
    },
    workspaceSettings: {
      findUnique: async () => ({
        githubWebhookEnabled: true,
        githubWebhookSyncMode: options?.githubWebhookSyncMode || 'add_only',
        githubTeamMappingEnabled: true,
        githubPermissionSyncEnabled: options?.githubPermissionSyncEnabled ?? true,
      }),
    },
    githubRepoLink: {
      findMany: async (args: {
        where: {
          workspaceId: string;
          githubRepoId?: { in: bigint[] };
          linkedProjectId?: { not: null };
        };
        select?: { fullName: true };
      }) => {
        const ids = args.where.githubRepoId?.in || [];
        return [...repoLinks.values()]
          .filter((row) => row.workspaceId === args.where.workspaceId)
          .filter((row) => (ids.length > 0 ? ids.some((id) => id === row.githubRepoId) : true))
          .filter((row) => (args.where.linkedProjectId?.not === null ? true : row.linkedProjectId !== null))
          .map((row) => ({ fullName: row.fullName }));
      },
      updateMany: async (args: {
        where: { workspaceId: string; githubRepoId: bigint };
        data: { fullName: string; defaultBranch: string | null; private: boolean; isActive: boolean };
      }) => {
        for (const row of repoLinks.values()) {
          if (row.workspaceId === args.where.workspaceId && row.githubRepoId === args.where.githubRepoId) {
            row.fullName = args.data.fullName;
            row.defaultBranch = args.data.defaultBranch;
            row.private = args.data.private;
            row.isActive = args.data.isActive;
          }
        }
        return { count: 1 };
      },
    },
    githubRepoTeamsCache: {
      findMany: async (args: { where: { workspaceId: string } }) => {
        return [...repoTeamsCache.entries()].map(([repoId, teamsJson]) => ({
          githubRepoId: BigInt(repoId),
          teamsJson,
        }));
      },
      deleteMany: async (args: { where: { workspaceId: string; githubRepoId: { in: bigint[] } } }) => {
        cacheDeletes.repoTeams += 1;
        for (const repoId of args.where.githubRepoId.in) {
          repoTeamsCache.delete(repoId.toString());
        }
        return { count: args.where.githubRepoId.in.length };
      },
    },
    githubTeamMembersCache: {
      deleteMany: async () => {
        cacheDeletes.teamMembers += 1;
        return { count: 1 };
      },
    },
    githubPermissionCache: {
      deleteMany: async () => {
        cacheDeletes.permission += 1;
        return { count: 1 };
      },
    },
  };

  const deps = {
    prisma,
    securityConfig: {
      githubAppWebhookSecret: 'webhook-secret',
      githubStateSecret: 'state-secret',
    },
    getWorkspaceByKey: async (workspaceKey: string) => {
      if (workspaceKey !== workspace.key) {
        throw new Error('unknown workspace');
      }
      return workspace;
    },
    recordAudit: async (entry: { action: string; target: Record<string, unknown> }) => {
      audits.push(entry);
    },
    syncGithubRepos: async (workspaceKey: string, repos?: string[]) => {
      syncCalls.reposSync.push({ workspaceKey, repos });
    },
    syncGithubPermissions: async (args: {
      workspaceKey: string;
      repos?: string[];
      mode?: 'add_only' | 'add_and_remove';
    }) => {
      syncCalls.permissionSync.push(args);
    },
    applyGithubTeamMappings: async () => {
      return { ok: true };
    },
  };

  return { workspace, rows, audits, deps, cacheDeletes, syncCalls, repoLinks };
}

function signPayload(secret: string, payloadRaw: Buffer): string {
  return `sha256=${createHmac('sha256', secret).update(payloadRaw).digest('hex')}`;
}

test('enqueue is idempotent by GitHub delivery id', async () => {
  const h = createHarness();
  const payload = { installation: { id: 1001 }, action: 'added' };
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = signPayload('webhook-secret', raw);

  const first = await enqueueGithubWebhookEventHandler(h.deps as never, {
    eventType: 'installation_repositories',
    deliveryId: 'delivery-1',
    signature256: signature,
    payload,
    payloadRaw: raw,
  });
  const second = await enqueueGithubWebhookEventHandler(h.deps as never, {
    eventType: 'installation_repositories',
    deliveryId: 'delivery-1',
    signature256: signature,
    payload,
    payloadRaw: raw,
  });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(h.rows.size, 1);
});

test('installation_repositories triggers partial repo sync + partial permission recompute', async () => {
  const h = createHarness();
  const payload = {
    installation: { id: 1001 },
    repositories_added: [
      { id: 2001, full_name: 'acme/platform' },
      { id: 2002, full_name: 'acme/ui' },
    ],
    repositories_removed: [{ id: 2999, full_name: 'acme/old-repo' }],
  };
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');

  await enqueueGithubWebhookEventHandler(h.deps as never, {
    eventType: 'installation_repositories',
    deliveryId: 'delivery-install',
    signature256: signPayload('webhook-secret', raw),
    payload,
    payloadRaw: raw,
  });

  const result = await processGithubWebhookQueueHandler(h.deps as never, { batchSize: 10 });
  assert.equal(result.processed, 1);
  assert.equal(result.failed, 0);
  assert.equal(h.syncCalls.reposSync.length, 1);
  assert.deepEqual(h.syncCalls.reposSync[0].repos, ['acme/platform', 'acme/ui', 'acme/old-repo']);
  assert.equal(h.syncCalls.permissionSync.length, 1);
  assert.deepEqual(h.syncCalls.permissionSync[0].repos, ['acme/platform', 'acme/ui']);
  assert.equal(h.cacheDeletes.repoTeams > 0, true);
  assert.equal(h.cacheDeletes.permission > 0, true);

  const row = [...h.rows.values()][0];
  assert.equal(row.status, 'done');
  assert.equal(row.affectedReposCount, 2);
});

test('membership event recomputes only repos affected by the changed team', async () => {
  const h = createHarness();
  const payload = {
    installation: { id: 1001 },
    team: { id: 3002, slug: 'ui-team' },
  };
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');

  await enqueueGithubWebhookEventHandler(h.deps as never, {
    eventType: 'membership',
    deliveryId: 'delivery-membership',
    signature256: signPayload('webhook-secret', raw),
    payload,
    payloadRaw: raw,
  });

  const result = await processGithubWebhookQueueHandler(h.deps as never, { batchSize: 10 });
  assert.equal(result.processed, 1);
  assert.equal(result.failed, 0);
  assert.equal(h.cacheDeletes.teamMembers > 0, true);
  assert.equal(h.syncCalls.permissionSync.length, 1);
  assert.deepEqual(h.syncCalls.permissionSync[0].repos, ['acme/ui']);

  const row = [...h.rows.values()][0];
  assert.equal(row.status, 'done');
  assert.equal(row.affectedReposCount, 1);
});

test('webhook sync mode add_and_remove is propagated to permission recompute', async () => {
  const h = createHarness({ githubWebhookSyncMode: 'add_and_remove' });
  const payload = {
    installation: { id: 1001 },
    team: { id: 3001, slug: 'platform-team' },
  };
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');

  await enqueueGithubWebhookEventHandler(h.deps as never, {
    eventType: 'team',
    deliveryId: 'delivery-team-mode',
    signature256: signPayload('webhook-secret', raw),
    payload,
    payloadRaw: raw,
  });

  await processGithubWebhookQueueHandler(h.deps as never, { batchSize: 10 });
  assert.equal(h.syncCalls.permissionSync.length, 1);
  assert.equal(h.syncCalls.permissionSync[0].mode, 'add_and_remove');
});

test('invalid signature returns auth error and writes signature_failed audit', async () => {
  const h = createHarness();
  const payload = { installation: { id: 1001 } };
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');

  await assert.rejects(
    () =>
      enqueueGithubWebhookEventHandler(h.deps as never, {
        eventType: 'installation_repositories',
        deliveryId: 'delivery-bad-signature',
        signature256: signPayload('wrong-secret', raw),
        payload,
        payloadRaw: raw,
      }),
    /Invalid GitHub webhook signature/
  );

  assert.equal(h.rows.size, 0);
  assert.equal(h.audits.some((item) => item.action === 'github.webhook.signature_failed'), true);
});

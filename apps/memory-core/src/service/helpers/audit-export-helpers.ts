import { Prisma, type PrismaClient } from '@prisma/client';
import { Readable } from 'node:stream';
import type { AuthContext } from '../../auth.js';
import { assertWorkspaceAdmin } from '../access-control.js';
import { readJsonString, resolveAccessTimelineActionKeys, toJsonObject } from './access-audit-helpers.js';

type Workspace = { id: string; key: string };

type AuditExportDeps = {
  prisma: PrismaClient;
  getWorkspaceByKey: (workspaceKey: string) => Promise<Workspace>;
  recordAudit: (args: {
    workspaceId: string;
    projectId?: string;
    workspaceKey?: string;
    actorUserId: string;
    actorUserEmail?: string;
    action: string;
    target: Record<string, unknown>;
    correlationId?: string;
  }) => Promise<void>;
};

type AuditExportArgs = {
  auth: AuthContext;
  workspaceKey: string;
  projectKey?: string;
  from?: string;
  to?: string;
  format: 'csv' | 'json';
  source?: 'manual' | 'github' | 'oidc' | 'system';
  action?: string;
};

type Cursor = {
  createdAt: Date;
  id: string;
};

export async function createAuditExportStreamHandler(
  deps: AuditExportDeps,
  args: AuditExportArgs
): Promise<{ contentType: string; filename: string; stream: Readable }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);

  const format = args.format === 'json' ? 'json' : 'csv';
  const fromDate = parseOptionalDate(args.from);
  const toDate = parseOptionalDate(args.to);
  const actionFilter = normalizeActionFilter(args.action);

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'audit.export',
    target: {
      workspace_key: workspace.key,
      project_key: args.projectKey || null,
      from: fromDate?.toISOString() || null,
      to: toDate?.toISOString() || null,
      format,
      source: args.source || null,
      action: args.action || null,
    },
  });

  const generator = exportRowsAsStream({
    deps,
    workspace,
    auth: args.auth,
    projectKey: args.projectKey,
    fromDate,
    toDate,
    source: args.source,
    actionFilter,
    format,
  });

  const nowStamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    contentType: format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
    filename: `audit-export-${workspace.key}-${nowStamp}.${format}`,
    stream: Readable.from(generator),
  };
}

async function* exportRowsAsStream(args: {
  deps: AuditExportDeps;
  workspace: Workspace;
  auth: AuthContext;
  projectKey?: string;
  fromDate?: Date;
  toDate?: Date;
  source?: 'manual' | 'github' | 'oidc' | 'system';
  actionFilter:
    | { mode: 'all' }
    | { mode: 'exact'; actionKey: string }
    | { mode: 'access-family'; actionKeys: ReadonlyArray<string> };
  format: 'csv' | 'json';
}): AsyncGenerator<string> {
  const whereBase: Prisma.AuditLogWhereInput = {
    workspaceId: args.workspace.id,
    project: args.projectKey ? { key: args.projectKey } : undefined,
    createdAt: {
      ...(args.fromDate ? { gte: args.fromDate } : {}),
      ...(args.toDate ? { lte: args.toDate } : {}),
    },
    ...(args.source
      ? {
          target: {
            path: ['source'],
            equals: args.source,
          } as Prisma.JsonFilter,
        }
      : {}),
    ...(args.actionFilter.mode === 'exact'
      ? { action: args.actionFilter.actionKey }
      : args.actionFilter.mode === 'access-family'
        ? { action: { in: [...args.actionFilter.actionKeys] } }
        : {}),
  };

  if (args.format === 'csv') {
    yield [
      'id',
      'created_at',
      'workspace_key',
      'project_id',
      'actor_user_id',
      'system_actor',
      'action_key',
      'source',
      'correlation_id',
      'params_json',
    ].join(',') + '\n';
  } else {
    yield '[\n';
  }

  let cursor: Cursor | null = null;
  let isFirstJsonItem = true;
  const take = 500;

  while (true) {
    const where: Prisma.AuditLogWhereInput = cursor
      ? {
          AND: [
            whereBase,
            {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                {
                  AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }],
                },
              ],
            },
          ],
        }
      : whereBase;

    const rows = await args.deps.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        createdAt: true,
        projectId: true,
        actorUserId: true,
        action: true,
        correlationId: true,
        target: true,
      },
    });

    if (rows.length === 0) {
      break;
    }

    const last = rows[rows.length - 1];
    cursor = {
      createdAt: last.createdAt,
      id: last.id,
    };

    for (const row of rows) {
      const params = toJsonObject(row.target);
      const source = readJsonString(params, 'source') || '';
      const correlationId = row.correlationId || readJsonString(params, 'correlation_id') || '';
      const systemActor =
        readJsonString(params, 'system_actor') ||
        (row.actorUserId.startsWith('system:') ? row.actorUserId : '');
      const actorUserId = systemActor ? '' : row.actorUserId;

      if (args.format === 'csv') {
        yield [
          escapeCsv(row.id),
          escapeCsv(row.createdAt.toISOString()),
          escapeCsv(args.workspace.key),
          escapeCsv(row.projectId || ''),
          escapeCsv(actorUserId),
          escapeCsv(systemActor),
          escapeCsv(row.action),
          escapeCsv(source),
          escapeCsv(correlationId),
          escapeCsv(JSON.stringify(params)),
        ].join(',') + '\n';
      } else {
        const payload = {
          id: row.id,
          created_at: row.createdAt.toISOString(),
          workspace_key: args.workspace.key,
          project_id: row.projectId,
          actor_user_id: actorUserId || null,
          system_actor: systemActor || null,
          action_key: row.action,
          source: source || null,
          correlation_id: correlationId || null,
          params,
        };
        if (!isFirstJsonItem) {
          yield ',\n';
        }
        yield JSON.stringify(payload);
        isFirstJsonItem = false;
      }
    }
  }

  if (args.format === 'json') {
    yield '\n]\n';
  }
}

function normalizeActionFilter(
  input?: string
):
  | { mode: 'all' }
  | { mode: 'exact'; actionKey: string }
  | { mode: 'access-family'; actionKeys: ReadonlyArray<string> } {
  const normalized = String(input || '').trim();
  if (!normalized) {
    return { mode: 'all' };
  }

  const lowered = normalized.toLowerCase();
  if (lowered === 'add' || lowered === 'change' || lowered === 'remove') {
    return {
      mode: 'access-family',
      actionKeys: resolveAccessTimelineActionKeys(lowered),
    };
  }

  return {
    mode: 'exact',
    actionKey: normalized,
  };
}

function parseOptionalDate(input?: string): Date | undefined {
  const value = String(input || '').trim();
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

function escapeCsv(value: string): string {
  const plain = String(value ?? '');
  if (!/[",\n\r]/.test(plain)) {
    return plain;
  }
  return `"${plain.replace(/"/g, '""')}"`;
}

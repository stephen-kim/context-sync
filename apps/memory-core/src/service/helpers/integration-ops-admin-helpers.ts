import { IntegrationProvider, Prisma, type PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../auth.js';
import { assertWorkspaceAccess, assertWorkspaceAdmin } from '../access-control.js';
import { AuthorizationError, ValidationError } from '../errors.js';
import { diffFields, normalizeReason } from '../audit-utils.js';
import {
  normalizeTimelineActor,
  readJsonString,
  resolveAccessTimelineActionKeys,
  toJsonObject as toAuditJsonObject,
} from './access-audit-helpers.js';
import {
  normalizeIntegrationConfig,
  toIntegrationProvider,
  toIntegrationSummary,
  toJsonObject,
} from '../integration-utils.js';
import { getEnvAuditReasonerConfigAsJson, hasEnvAuditReasonerPreference, type AuditReasonerEnvConfig } from '../audit-reasoner-config.js';

type Workspace = { id: string; key: string };

type IntegrationDeps = {
  prisma: PrismaClient;
  notionClient?: unknown;
  jiraClient?: unknown;
  confluenceClient?: unknown;
  linearClient?: unknown;
  notionWriteEnabled: boolean;
  auditSlackEnabled: boolean;
  auditReasonerEnvConfig: AuditReasonerEnvConfig;
  getWorkspaceByKey: (workspaceKey: string) => Promise<Workspace>;
  getNotionClientForWorkspace: (workspaceId: string) => Promise<{ client: any; writeEnabled: boolean }>;
  getJiraClientForWorkspace: (workspaceId: string) => Promise<any>;
  getConfluenceClientForWorkspace: (workspaceId: string) => Promise<any>;
  getLinearClientForWorkspace: (workspaceId: string) => Promise<any>;
  isIntegrationLocked: (provider: IntegrationProvider) => boolean;
  recordAudit: (args: {
    workspaceId: string;
    projectId?: string;
    workspaceKey?: string;
    actorUserId: string;
    actorUserEmail?: string;
    action: string;
    target: Record<string, unknown>;
  }) => Promise<void>;
};


export async function notionWriteHandler(
  deps: IntegrationDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    title: string;
    content: string;
    pageId?: string;
    parentPageId?: string;
  }
) {
  const title = args.title.trim();
  const content = args.content.trim();
  if (!title) {
    throw new ValidationError('title is required');
  }
  if (!content) {
    throw new ValidationError('content is required');
  }

  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  const notionConfig = await deps.getNotionClientForWorkspace(workspace.id);
  if (!notionConfig.writeEnabled) {
    throw new AuthorizationError(
      'Notion write is disabled. Configure write_enabled in workspace integration or set MEMORY_CORE_NOTION_WRITE_ENABLED=true.'
    );
  }
  const result = await notionConfig.client.upsertPage({
    title,
    content,
    pageId: args.pageId,
    parentPageId: args.parentPageId,
  });

  await deps.recordAudit({
    workspaceId: workspace.id,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'notion.write',
    target: {
      mode: result.mode,
      page_id: result.id,
      parent_page_id: args.parentPageId ?? null,
    },
  });

  return result;
}

export async function getWorkspaceIntegrationsHandler(
  deps: IntegrationDeps,
  args: { auth: AuthContext; workspaceKey: string }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);

  const rows = await deps.prisma.workspaceIntegration.findMany({
    where: {
      workspaceId: workspace.id,
      provider: {
        in: [
          IntegrationProvider.notion,
          IntegrationProvider.jira,
          IntegrationProvider.confluence,
          IntegrationProvider.linear,
          IntegrationProvider.slack,
          IntegrationProvider.audit_reasoner,
        ],
      },
    },
  });
  const byProvider = new Map<IntegrationProvider, (typeof rows)[number]>();
  for (const row of rows) {
    byProvider.set(row.provider, row);
  }
  const reasonerEnvPreferred = hasEnvAuditReasonerPreference(deps.auditReasonerEnvConfig);

  return {
    workspace_key: workspace.key,
    integrations: {
      notion: toIntegrationSummary({
        provider: IntegrationProvider.notion,
        row: byProvider.get(IntegrationProvider.notion),
        configuredFromEnv: Boolean(deps.notionClient),
        notionWriteEnabled: deps.notionWriteEnabled,
        locked: deps.isIntegrationLocked(IntegrationProvider.notion),
      }),
      jira: toIntegrationSummary({
        provider: IntegrationProvider.jira,
        row: byProvider.get(IntegrationProvider.jira),
        configuredFromEnv: Boolean(deps.jiraClient),
        notionWriteEnabled: deps.notionWriteEnabled,
        locked: deps.isIntegrationLocked(IntegrationProvider.jira),
      }),
      confluence: toIntegrationSummary({
        provider: IntegrationProvider.confluence,
        row: byProvider.get(IntegrationProvider.confluence),
        configuredFromEnv: Boolean(deps.confluenceClient),
        notionWriteEnabled: deps.notionWriteEnabled,
        locked: deps.isIntegrationLocked(IntegrationProvider.confluence),
      }),
      linear: toIntegrationSummary({
        provider: IntegrationProvider.linear,
        row: byProvider.get(IntegrationProvider.linear),
        configuredFromEnv: Boolean(deps.linearClient),
        notionWriteEnabled: deps.notionWriteEnabled,
        locked: deps.isIntegrationLocked(IntegrationProvider.linear),
      }),
      slack: toIntegrationSummary({
        provider: IntegrationProvider.slack,
        row: byProvider.get(IntegrationProvider.slack),
        configuredFromEnv: deps.auditSlackEnabled,
        notionWriteEnabled: deps.notionWriteEnabled,
        locked: deps.isIntegrationLocked(IntegrationProvider.slack),
      }),
      audit_reasoner: toIntegrationSummary({
        provider: IntegrationProvider.audit_reasoner,
        row: reasonerEnvPreferred ? undefined : byProvider.get(IntegrationProvider.audit_reasoner),
        configuredFromEnv: reasonerEnvPreferred,
        notionWriteEnabled: deps.notionWriteEnabled,
        locked: deps.isIntegrationLocked(IntegrationProvider.audit_reasoner),
        envConfig: getEnvAuditReasonerConfigAsJson(deps.auditReasonerEnvConfig),
      }),
    },
  };
}

export async function upsertWorkspaceIntegrationHandler(
  deps: IntegrationDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    provider: 'notion' | 'jira' | 'confluence' | 'linear' | 'slack' | 'audit_reasoner';
    enabled?: boolean;
    config?: Record<string, unknown>;
    reason?: string;
  }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);

  const provider = toIntegrationProvider(args.provider);
  if (deps.isIntegrationLocked(provider)) {
    throw new AuthorizationError(
      `Integration provider "${args.provider}" is locked by environment policy and cannot be modified from Admin UI.`
    );
  }
  const existing = await deps.prisma.workspaceIntegration.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId: workspace.id,
        provider,
      },
    },
  });

  const currentConfig = toJsonObject(existing?.config);
  const patch = normalizeIntegrationConfig(provider, args.config || {});
  const mergedConfig = { ...currentConfig };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete mergedConfig[key];
    } else {
      mergedConfig[key] = value;
    }
  }

  const saved = await deps.prisma.workspaceIntegration.upsert({
    where: {
      workspaceId_provider: {
        workspaceId: workspace.id,
        provider,
      },
    },
    update: {
      isEnabled: args.enabled ?? existing?.isEnabled ?? true,
      config: mergedConfig as Prisma.InputJsonValue,
    },
    create: {
      workspaceId: workspace.id,
      provider,
      isEnabled: args.enabled ?? true,
      config: mergedConfig as Prisma.InputJsonValue,
    },
  });

  const before = {
    enabled: existing?.isEnabled ?? null,
    config_keys: Object.keys(currentConfig),
  };
  const after = {
    enabled: saved.isEnabled,
    config_keys: Object.keys(mergedConfig),
  };
  const changedFields = diffFields(before, after);
  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'integration.update',
    target: {
      provider: args.provider,
      workspace_key: workspace.key,
      reason: normalizeReason(args.reason),
      changed_fields: changedFields,
      before,
      after,
    },
  });

  const reasonerEnvPreferred =
    provider === IntegrationProvider.audit_reasoner
      ? hasEnvAuditReasonerPreference(deps.auditReasonerEnvConfig)
      : false;
  return {
    workspace_key: workspace.key,
    provider: args.provider,
    integration: toIntegrationSummary({
      provider,
      row: reasonerEnvPreferred ? undefined : saved,
      configuredFromEnv: reasonerEnvPreferred,
      notionWriteEnabled: deps.notionWriteEnabled,
      envConfig:
        provider === IntegrationProvider.audit_reasoner
          ? getEnvAuditReasonerConfigAsJson(deps.auditReasonerEnvConfig)
          : undefined,
    }),
  };
}

export async function listAuditLogsHandler(
  deps: IntegrationDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    limit?: number;
    projectKey?: string;
    actionKey?: string;
    actionPrefix?: string;
    actorUserId?: string;
  }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  const limit = Math.min(Math.max(args.limit || 50, 1), 200);
  const logs = await deps.prisma.auditLog.findMany({
    where: {
      workspaceId: workspace.id,
      project: args.projectKey
        ? {
            key: args.projectKey,
          }
        : undefined,
      actorUserId: args.actorUserId || undefined,
      action: args.actionKey
        ? args.actionKey
        : args.actionPrefix
          ? {
              startsWith: args.actionPrefix,
            }
          : undefined,
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      projectId: true,
      actorUserId: true,
      correlationId: true,
      action: true,
      target: true,
      createdAt: true,
    },
  });
  return { logs };
}

export async function listAccessAuditTimelineHandler(
  deps: IntegrationDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    projectKey?: string;
    userId?: string;
    source?: 'manual' | 'github' | 'oidc' | 'system';
    action?: string;
    from?: string;
    to?: string;
    limit?: number;
    cursor?: string;
  }
): Promise<{
  items: Array<{
    id: string;
    created_at: string;
    action_key: string;
    actor_user_id: string | null;
    system_actor: string | null;
    correlation_id: string | null;
    params: Record<string, unknown>;
  }>;
  next_cursor: string | null;
}> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);

  const accessActionKeys = resolveAccessTimelineActionKeys(args.action);
  if (accessActionKeys.length === 0) {
    return { items: [], next_cursor: null };
  }

  const limit = Math.min(Math.max(args.limit || 50, 1), 200);
  const windowSize = Math.min(limit * 4, 800);
  const fromDate = parseOptionalDate(args.from);
  const toDate = parseOptionalDate(args.to);

  let seekCursor = decodeAccessTimelineCursor(args.cursor);
  let loops = 0;
  const items: Array<{
    id: string;
    created_at: string;
    action_key: string;
    actor_user_id: string | null;
    system_actor: string | null;
    correlation_id: string | null;
    params: Record<string, unknown>;
  }> = [];
  let lastScanned: { createdAt: string; id: string } | null = null;
  let mayHaveMore = false;

  while (items.length < limit && loops < 10) {
    loops += 1;

    const where: Prisma.AuditLogWhereInput = {
      workspaceId: workspace.id,
      action: {
        in: [...accessActionKeys],
      },
      createdAt: {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      },
      project: args.projectKey
        ? {
            key: args.projectKey,
          }
        : undefined,
      ...(seekCursor
        ? {
            OR: [
              { createdAt: { lt: new Date(seekCursor.createdAt) } },
              {
                AND: [
                  { createdAt: new Date(seekCursor.createdAt) },
                  { id: { lt: seekCursor.id } },
                ],
              },
            ],
          }
        : {}),
    };

    const rows = await deps.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: windowSize,
      select: {
        id: true,
        action: true,
        actorUserId: true,
        correlationId: true,
        target: true,
        createdAt: true,
      },
    });

    if (rows.length === 0) {
      mayHaveMore = false;
      break;
    }

    mayHaveMore = rows.length === windowSize;
    const last = rows[rows.length - 1];
    lastScanned = {
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    };
    seekCursor = lastScanned;

    for (const row of rows) {
      const params = toAuditJsonObject(row.target);
      if (args.userId) {
        const targetUserId = readJsonString(params, 'target_user_id');
        if (targetUserId !== args.userId) {
          continue;
        }
      }
      if (args.source) {
        const source = readJsonString(params, 'source');
        if (source !== args.source) {
          continue;
        }
      }
      const actor = normalizeTimelineActor({
        actorUserId: row.actorUserId,
        params,
      });
      items.push({
        id: row.id,
        created_at: row.createdAt.toISOString(),
        action_key: row.action,
        actor_user_id: actor.actorUserId,
        system_actor: actor.systemActor,
        correlation_id:
          row.correlationId ||
          readJsonString(params, 'correlation_id') ||
          null,
        params,
      });
      if (items.length >= limit) {
        break;
      }
    }

    if (rows.length < windowSize) {
      mayHaveMore = false;
      break;
    }
  }

  const nextCursor =
    items.length >= limit
      ? encodeAccessTimelineCursor({
          createdAt: items[items.length - 1].created_at,
          id: items[items.length - 1].id,
        })
      : mayHaveMore && lastScanned
        ? encodeAccessTimelineCursor(lastScanned)
        : null;

  return {
    items,
    next_cursor: nextCursor,
  };
}

function parseOptionalDate(value?: string): Date | undefined {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

function encodeAccessTimelineCursor(args: { createdAt: string; id: string }): string {
  return Buffer.from(`${args.createdAt}|${args.id}`, 'utf8').toString('base64url');
}

function decodeAccessTimelineCursor(cursor?: string): { createdAt: string; id: string } | null {
  const normalized = String(cursor || '').trim();
  if (!normalized) {
    return null;
  }
  try {
    const decoded = Buffer.from(normalized, 'base64url').toString('utf8');
    const [createdAt, id] = decoded.split('|', 2);
    if (!createdAt || !id) {
      return null;
    }
    const parsed = new Date(createdAt);
    if (!Number.isFinite(parsed.getTime())) {
      return null;
    }
    return {
      createdAt: parsed.toISOString(),
      id,
    };
  } catch {
    return null;
  }
}

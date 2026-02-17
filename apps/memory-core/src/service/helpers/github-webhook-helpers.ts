import { Prisma } from '@prisma/client';
import type { AuthContext } from '../../auth.js';
import { assertWorkspaceAccess } from '../access-control.js';
import { AuthenticationError, ValidationError } from '../errors.js';
import { parseGithubWebhookInstallationId, verifyGithubWebhookSignature } from './github-webhook-signature.js';
import { processSingleGithubWebhookEvent } from './github-webhook-queue-processor.js';
import type { GithubWebhookDeps } from './github-webhook-types.js';

export async function enqueueGithubWebhookEventHandler(
  deps: GithubWebhookDeps,
  args: {
    eventType: string;
    deliveryId: string;
    signature256?: string;
    payload: unknown;
    payloadRaw: Buffer;
  }
): Promise<{
  ok: true;
  delivery_id: string;
  event_type: string;
  queued: true;
  duplicate: boolean;
  workspace_key: string | null;
}> {
  const eventType = String(args.eventType || '').trim();
  const deliveryId = String(args.deliveryId || '').trim();
  if (!eventType) {
    throw new ValidationError('Missing X-GitHub-Event header.');
  }
  if (!deliveryId) {
    throw new ValidationError('Missing X-GitHub-Delivery header.');
  }

  const installationId = parseGithubWebhookInstallationId(args.payload);
  const installation = installationId
    ? await deps.prisma.githubInstallation.findUnique({
        where: { installationId },
        select: {
          workspaceId: true,
          workspace: {
            select: {
              key: true,
            },
          },
        },
      })
    : null;

  const verified = verifyGithubWebhookSignature({
    secret: deps.securityConfig.githubAppWebhookSecret,
    payloadRaw: args.payloadRaw,
    signatureHeader: args.signature256,
  });
  if (!verified) {
    if (installation?.workspaceId && installation.workspace.key) {
      await deps.recordAudit({
        workspaceId: installation.workspaceId,
        workspaceKey: installation.workspace.key,
        actorUserId: 'system:github-webhook',
        actorUserEmail: 'github-webhook@local',
        action: 'github.webhook.signature_failed',
        target: {
          workspace_key: installation.workspace.key,
          installation_id: installationId?.toString() || null,
          delivery_id: deliveryId,
          event_type: eventType,
        },
      });
    }
    throw new AuthenticationError('Invalid GitHub webhook signature.');
  }

  if (!installationId) {
    throw new ValidationError('GitHub webhook payload is missing installation.id.');
  }

  try {
    await deps.prisma.githubWebhookEvent.create({
      data: {
        workspaceId: installation?.workspaceId || null,
        installationId,
        eventType,
        deliveryId,
        payload: args.payload as Prisma.InputJsonValue,
        status: 'queued',
      },
    });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return {
        ok: true,
        delivery_id: deliveryId,
        event_type: eventType,
        queued: true,
        duplicate: true,
        workspace_key: installation?.workspace?.key || null,
      };
    }
    throw error;
  }

  if (installation?.workspaceId && installation.workspace.key) {
    await deps.recordAudit({
      workspaceId: installation.workspaceId,
      workspaceKey: installation.workspace.key,
      actorUserId: 'system:github-webhook',
      actorUserEmail: 'github-webhook@local',
      action: 'github.webhook.received',
      target: {
        workspace_key: installation.workspace.key,
        installation_id: installationId.toString(),
        delivery_id: deliveryId,
        event_type: eventType,
      },
    });
  }

  return {
    ok: true,
    delivery_id: deliveryId,
    event_type: eventType,
    queued: true,
    duplicate: false,
    workspace_key: installation?.workspace?.key || null,
  };
}

export async function listGithubWebhookEventsHandler(
  deps: GithubWebhookDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    status?: 'queued' | 'processing' | 'done' | 'failed';
    limit?: number;
  }
): Promise<{
  workspace_key: string;
  deliveries: Array<{
    id: string;
    delivery_id: string;
    installation_id: string;
    event_type: string;
    status: 'queued' | 'processing' | 'done' | 'failed';
    affected_repos_count: number;
    error: string | null;
    created_at: string;
    updated_at: string;
  }>;
}> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id, 'MEMBER');

  const rows = await deps.prisma.githubWebhookEvent.findMany({
    where: {
      workspaceId: workspace.id,
      status: args.status,
    },
    orderBy: [{ createdAt: 'desc' }],
    take: Math.min(Math.max(args.limit || 50, 1), 200),
  });

  return {
    workspace_key: workspace.key,
    deliveries: rows.map((row) => ({
      id: row.id,
      delivery_id: row.deliveryId,
      installation_id: row.installationId.toString(),
      event_type: row.eventType,
      status: row.status,
      affected_repos_count: row.affectedReposCount,
      error: row.error || null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    })),
  };
}

export async function processGithubWebhookQueueHandler(
  deps: GithubWebhookDeps,
  args?: { batchSize?: number }
): Promise<{ processed: number; failed: number }> {
  const batchSize = Math.min(Math.max(args?.batchSize || 20, 1), 200);
  const events = await deps.prisma.githubWebhookEvent.findMany({
    where: {
      status: 'queued',
    },
    orderBy: [{ createdAt: 'asc' }],
    take: batchSize,
  });

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    const claimed = await deps.prisma.githubWebhookEvent.updateMany({
      where: {
        id: event.id,
        status: 'queued',
      },
      data: {
        status: 'processing',
        error: null,
      },
    });
    if (claimed.count === 0) {
      continue;
    }

    let success = false;
    let lastError = '';
    let affectedReposCount = 0;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        affectedReposCount = await processSingleGithubWebhookEvent(deps, event.id);
        success = true;
        break;
      } catch (error) {
        lastError = toErrorMessage(error);
      }
    }

    if (success) {
      await deps.prisma.githubWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: 'done',
          error: null,
          affectedReposCount,
        },
      });
      processed += 1;
      continue;
    }

    await deps.prisma.githubWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: 'failed',
        error: lastError,
      },
    });
    failed += 1;
  }

  return { processed, failed };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isPrismaUniqueError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === 'P2002';
}

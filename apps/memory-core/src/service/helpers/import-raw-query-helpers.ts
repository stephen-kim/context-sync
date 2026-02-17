import { rm } from 'node:fs/promises';
import type { AuthContext } from '../../auth.js';
import { assertRawAccess } from '../access-control.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { createMemorySnippet } from '../import-utils.js';
import type { SharedDeps } from './import-raw-helpers.js';

export async function rawSearchHandler(
  deps: SharedDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    projectKey?: string;
    q: string;
    limit?: number;
    maxChars?: number;
  }
): Promise<{
  matches: Array<{
    raw_session_id: string;
    source: 'codex' | 'claude' | 'generic';
    source_session_id: string | null;
    message_id: string;
    role: string;
    snippet: string;
    created_at: string;
    project_key?: string;
  }>;
}> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  const normalizedQuery = args.q.trim();
  if (!normalizedQuery) {
    throw new ValidationError('q is required');
  }
  const limit = Math.min(Math.max(args.limit || 10, 1), 20);
  const maxChars = Math.min(Math.max(args.maxChars || 500, 1), 1500);

  let projectId: string | undefined;
  let projectKey: string | undefined;
  if (args.projectKey) {
    const project = await deps.getProjectByKeys(args.workspaceKey, args.projectKey);
    projectId = project.id;
    projectKey = project.key;
  }

  await assertRawAccess(deps.prisma, args.auth, workspace.id, projectId);

  const messages = await deps.prisma.rawMessage.findMany({
    where: {
      content: {
        contains: normalizedQuery,
        mode: 'insensitive',
      },
      rawSession: {
        workspaceId: workspace.id,
        ...(projectId ? { projectId } : {}),
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      rawSession: {
        select: {
          id: true,
          source: true,
          sourceSessionId: true,
          project: {
            select: {
              key: true,
            },
          },
        },
      },
    },
  });

  const matches = messages.map((message) => ({
    raw_session_id: message.rawSession.id,
    source: message.rawSession.source,
    source_session_id: message.rawSession.sourceSessionId,
    message_id: message.id,
    role: message.role,
    snippet: createMemorySnippet(message.content, normalizedQuery, maxChars),
    created_at: message.createdAt.toISOString(),
    project_key: message.rawSession.project?.key,
  }));

  await deps.recordAudit({
    workspaceId: workspace.id,
    projectId: projectId,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'raw.search',
    target: {
      query: normalizedQuery,
      project_key: projectKey || null,
      limit,
      max_chars: maxChars,
      match_count: matches.length,
      raw_session_ids: matches.map((match) => match.raw_session_id),
      message_ids: matches.map((match) => match.message_id),
    },
  });

  return { matches };
}

export async function viewRawMessageHandler(
  deps: SharedDeps,
  args: {
    auth: AuthContext;
    messageId: string;
    maxChars?: number;
  }
): Promise<{
  message_id: string;
  raw_session_id: string;
  role: string;
  snippet: string;
  created_at: string;
  source: 'codex' | 'claude' | 'generic';
  source_session_id: string | null;
  project_key?: string | null;
}> {
  const maxChars = Math.min(Math.max(args.maxChars || 500, 1), 1500);
  const message = await deps.prisma.rawMessage.findUnique({
    where: { id: args.messageId },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      rawSession: {
        select: {
          id: true,
          source: true,
          sourceSessionId: true,
          workspaceId: true,
          projectId: true,
          workspace: {
            select: {
              key: true,
            },
          },
          project: {
            select: {
              key: true,
            },
          },
        },
      },
    },
  });

  if (!message) {
    throw new NotFoundError(`Raw message not found: ${args.messageId}`);
  }

  await assertRawAccess(
    deps.prisma,
    args.auth,
    message.rawSession.workspaceId,
    message.rawSession.projectId || undefined
  );

  const result = {
    message_id: message.id,
    raw_session_id: message.rawSession.id,
    role: message.role,
    snippet: createMemorySnippet(message.content, '', maxChars),
    created_at: message.createdAt.toISOString(),
    source: message.rawSession.source,
    source_session_id: message.rawSession.sourceSessionId,
    project_key: message.rawSession.project?.key || null,
  };

  await deps.recordAudit({
    workspaceId: message.rawSession.workspaceId,
    projectId: message.rawSession.projectId || undefined,
    workspaceKey: message.rawSession.workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'raw.view',
    target: {
      message_id: message.id,
      raw_session_id: message.rawSession.id,
      project_key: message.rawSession.project?.key || null,
      max_chars: maxChars,
    },
  });

  return result;
}

export async function cleanupImportFile(filePath: string | null | undefined): Promise<void> {
  if (!filePath) {
    return;
  }
  try {
    await rm(filePath, { force: true });
  } catch {
    // best effort cleanup
  }
}

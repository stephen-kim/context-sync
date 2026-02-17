import { RawEventType, Prisma, type PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../auth.js';
import { assertProjectAccess, assertWorkspaceAccess, assertWorkspaceAdmin } from '../access-control.js';
import { getEffectiveWorkspaceSettings } from '../workspace-resolution.js';

type Workspace = { id: string; key: string };
type Project = { id: string; key: string };

type GitEventDeps = {
  prisma: PrismaClient;
  getWorkspaceByKey: (workspaceKey: string) => Promise<Workspace>;
  getProjectByKeys: (workspaceKey: string, projectKey: string) => Promise<Project & { workspaceId: string }>;
  splitProjectKey: (projectKey: string) => { repoKey: string; subprojectKey: string | null };
  recordAudit: (args: {
    workspaceId: string;
    projectId?: string;
    workspaceKey?: string;
    actorUserId: string;
    actorUserEmail?: string;
    action: string;
    target: Record<string, unknown>;
  }) => Promise<void>;
  runIntegrationAutoWrites: (args: {
    auth: AuthContext;
    workspaceId: string;
    workspaceKey: string;
    projectKey: string;
    event: 'commit' | 'merge' | 'checkout';
    branch?: string;
    commitHash?: string;
    message?: string;
    metadata: Record<string, unknown>;
  }) => Promise<Array<{ provider: string; status: 'success' | 'skipped' | 'failed'; detail: string }>>;
  runDecisionExtractionBatchForWorkspace: (args: {
    workspaceId: string;
    actorUserId: string;
  }) => Promise<void>;
  updateMemoryEmbedding: (memoryId: string, content: string) => Promise<void>;
};

export async function captureRawEventHandler(
  deps: GitEventDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    projectKey: string;
    eventType: RawEventType | 'post_commit' | 'post_merge' | 'post_checkout';
    branch?: string;
    fromBranch?: string;
    toBranch?: string;
    commitSha?: string;
    commitMessage?: string;
    changedFiles?: string[];
    metadata?: Record<string, unknown>;
  }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  const project = await deps.getProjectByKeys(args.workspaceKey, args.projectKey);
  await assertProjectAccess(deps.prisma, args.auth, workspace.id, project.id);
  const settings = await getEffectiveWorkspaceSettings(deps.prisma, workspace.id);
  const eventType = args.eventType as RawEventType;
  const { repoKey, subprojectKey } = deps.splitProjectKey(project.key);
  const metadata = args.metadata || {};

  const row = await deps.prisma.rawEvent.create({
    data: {
      workspaceId: workspace.id,
      projectId: project.id,
      eventType,
      repoKey,
      subprojectKey,
      branch: args.branch || null,
      fromBranch: args.fromBranch || null,
      toBranch: args.toBranch || null,
      commitSha: args.commitSha || null,
      commitMessage: args.commitMessage || null,
      changedFiles:
        args.changedFiles && args.changedFiles.length > 0
          ? (args.changedFiles as Prisma.InputJsonValue)
          : undefined,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });

  const event =
    eventType === RawEventType.post_commit
      ? 'commit'
      : eventType === RawEventType.post_merge
        ? 'merge'
        : 'checkout';
  const action = event === 'commit' ? 'git.commit' : event === 'merge' ? 'git.merge' : 'git.checkout';

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action,
    target: {
      workspace_key: workspace.key,
      project_key: project.key,
      event_type: eventType,
      branch: args.branch || null,
      from_branch: args.fromBranch || null,
      to_branch: args.toBranch || null,
      commit_sha: args.commitSha || null,
      commit_message: args.commitMessage || null,
      changed_files_count: args.changedFiles?.length || 0,
      raw_event_id: row.id,
      metadata,
    },
  });

  let autoWrites: Array<{ provider: string; status: 'success' | 'skipped' | 'failed'; detail: string }> =
    [];
  if (shouldRunIntegrationWrites(settings, eventType)) {
    autoWrites = await deps.runIntegrationAutoWrites({
      auth: args.auth,
      workspaceId: workspace.id,
      workspaceKey: workspace.key,
      projectKey: project.key,
      event,
      branch: args.branch,
      commitHash: args.commitSha,
      message: args.commitMessage,
      metadata,
    });
  }

  if (
    settings.enableActivityAutoLog &&
    (eventType === RawEventType.post_commit || eventType === RawEventType.post_merge)
  ) {
    const activity = await deps.prisma.memory.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        type: 'activity',
        content: buildActivityContent({
          eventType,
          commitSha: args.commitSha,
          commitMessage: args.commitMessage,
          branch: args.branch,
        }),
        status: 'confirmed',
        source: 'auto',
        confidence: 1,
        evidence: {
          raw_event_ids: [row.id],
          commit_sha: args.commitSha || null,
          changed_files: args.changedFiles || [],
          branch: args.branch || null,
        } as Prisma.InputJsonValue,
        metadata: {
          pipeline: {
            source: 'raw_event',
            event_type: eventType,
            version: 'activity-v1',
          },
        } as Prisma.InputJsonValue,
        createdBy: args.auth.user.id,
      },
      select: {
        id: true,
        content: true,
      },
    });
    await deps.updateMemoryEmbedding(activity.id, activity.content);
  }

  if (
    settings.enableDecisionExtraction &&
    (eventType === RawEventType.post_commit || eventType === RawEventType.post_merge)
  ) {
    setTimeout(() => {
      void deps
        .runDecisionExtractionBatchForWorkspace({
          workspaceId: workspace.id,
          actorUserId: args.auth.user.id,
        })
        .catch((error) => {
          console.error('[memory-core] decision extraction batch failed', error);
        });
    }, 0);
  }

  return {
    ok: true as const,
    workspace_key: workspace.key,
    project_key: project.key,
    event_type: eventType,
    raw_event_id: row.id,
    auto_writes: autoWrites,
  };
}

function shouldRunIntegrationWrites(
  settings: Awaited<ReturnType<typeof getEffectiveWorkspaceSettings>>,
  eventType: RawEventType
): boolean {
  if (!settings.enableGitEvents) {
    return false;
  }
  if (eventType === RawEventType.post_commit) {
    return settings.enableCommitEvents;
  }
  if (eventType === RawEventType.post_merge) {
    return settings.enableMergeEvents;
  }
  if (eventType === RawEventType.post_checkout) {
    return settings.enableCheckoutEvents;
  }
  return false;
}

function buildActivityContent(args: {
  eventType: RawEventType;
  commitSha?: string;
  commitMessage?: string;
  branch?: string;
}): string {
  const summary = firstLine(args.commitMessage || '') || '(no message)';
  const branch = args.branch || 'unknown';
  const shortSha = args.commitSha ? args.commitSha.slice(0, 12) : 'unknown';
  const prefix = args.eventType === RawEventType.post_merge ? 'Merge' : 'Commit';
  return `${prefix} ${shortSha}: ${summary} (branch ${branch})`;
}

function firstLine(input: string): string {
  return input
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) || '';
}

export async function handleGitEventHandler(
  deps: GitEventDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    projectKey: string;
    event: 'commit' | 'merge' | 'checkout';
    branch?: string;
    commitHash?: string;
    message?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const eventType =
    args.event === 'commit'
      ? RawEventType.post_commit
      : args.event === 'merge'
        ? RawEventType.post_merge
        : RawEventType.post_checkout;
  return captureRawEventHandler(deps, {
    auth: args.auth,
    workspaceKey: args.workspaceKey,
    projectKey: args.projectKey,
    eventType,
    branch: args.branch,
    commitSha: args.commitHash,
    commitMessage: args.message,
    metadata: args.metadata,
  });
}

export async function listRawEventsHandler(
  deps: GitEventDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    projectKey?: string;
    eventType?: RawEventType | 'post_commit' | 'post_merge' | 'post_checkout';
    commitSha?: string;
    from?: string;
    to?: string;
    limit?: number;
  }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  const limit = Math.min(Math.max(args.limit || 100, 1), 500);

  let projectId: string | undefined;
  if (args.projectKey) {
    const project = await deps.getProjectByKeys(args.workspaceKey, args.projectKey);
    await assertProjectAccess(deps.prisma, args.auth, workspace.id, project.id);
    projectId = project.id;
  } else {
    await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  }

  const rows = await deps.prisma.rawEvent.findMany({
    where: {
      workspaceId: workspace.id,
      projectId,
      eventType: args.eventType as RawEventType | undefined,
      commitSha: args.commitSha
        ? {
            contains: args.commitSha,
            mode: 'insensitive',
          }
        : undefined,
      createdAt:
        args.from || args.to
          ? {
              gte: args.from ? new Date(args.from) : undefined,
              lte: args.to ? new Date(args.to) : undefined,
            }
          : undefined,
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
    include: {
      project: {
        select: {
          key: true,
          name: true,
        },
      },
    },
  });

  return {
    events: rows.map((row) => ({
      id: row.id,
      event_type: row.eventType,
      workspace_key: workspace.key,
      project_key: row.project.key,
      project_name: row.project.name,
      repo_key: row.repoKey,
      subproject_key: row.subprojectKey,
      branch: row.branch,
      from_branch: row.fromBranch,
      to_branch: row.toBranch,
      commit_sha: row.commitSha,
      commit_message: row.commitMessage,
      changed_files: row.changedFiles,
      metadata: row.metadata,
      created_at: row.createdAt,
    })),
  };
}

export async function handleCiEventHandler(
  deps: GitEventDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    status: 'success' | 'failure';
    provider: 'github_actions' | 'generic';
    projectKey?: string;
    workflowName?: string;
    workflowRunId?: string;
    workflowRunUrl?: string;
    repository?: string;
    branch?: string;
    sha?: string;
    eventName?: string;
    jobName?: string;
    message?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);

  let project: { key: string; id: string } | null = null;
  if (args.projectKey) {
    const resolvedProject = await deps.getProjectByKeys(args.workspaceKey, args.projectKey);
    await assertProjectAccess(deps.prisma, args.auth, workspace.id, resolvedProject.id);
    project = {
      key: resolvedProject.key,
      id: resolvedProject.id,
    };
  }

  const action = args.status === 'success' ? 'ci.success' : 'ci.failure';
  const target = {
    workspace_key: workspace.key,
    project_key: project?.key || null,
    status: args.status,
    provider: args.provider,
    workflow_name: args.workflowName || null,
    workflow_run_id: args.workflowRunId || null,
    workflow_run_url: args.workflowRunUrl || null,
    repository: args.repository || null,
    branch: args.branch || null,
    sha: args.sha || null,
    event_name: args.eventName || null,
    job_name: args.jobName || null,
    message: args.message || null,
    metadata: args.metadata || {},
  };

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action,
    target,
  });

  return {
    ok: true as const,
    workspace_key: workspace.key,
    project_key: project?.key,
    status: args.status,
    action,
  };
}

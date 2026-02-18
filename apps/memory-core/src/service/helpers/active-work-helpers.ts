import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../auth.js';
import { assertProjectAccess } from '../access-control.js';

type RawEventForInference = {
  id: string;
  createdAt: Date;
  branch?: string | null;
  commitMessage?: string | null;
  changedFiles?: unknown;
};

type MemoryForInference = {
  id: string;
  type: string;
  status?: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: unknown;
};

type InferenceInput = {
  now: Date;
  rawEvents: RawEventForInference[];
  memories: MemoryForInference[];
  maxItems?: number;
};

type ActiveWorkEventType =
  | 'created'
  | 'updated'
  | 'stale_marked'
  | 'stale_cleared'
  | 'confirmed'
  | 'closed'
  | 'reopened';

export type ActiveWorkPolicy = {
  staleDays: number;
  autoCloseEnabled: boolean;
  autoCloseDays: number;
};

export type ActiveWorkCandidate = {
  key: string;
  title: string;
  confidence: number;
  score: number;
  evidence_ids: string[];
  last_evidence_at: Date;
  breakdown: {
    recency_weight: number;
    frequency_weight: number;
    decision_status_weight: number;
    commit_keyword_weight: number;
    total: number;
  };
};

export type ActiveWorkApiItem = {
  id: string;
  title: string;
  confidence: number;
  status: 'inferred' | 'confirmed' | 'closed';
  stale: boolean;
  stale_reason?: string | null;
  last_evidence_at?: string | null;
  last_updated_at: string;
  closed_at?: string | null;
  evidence_ids: string[];
};

export async function recomputeActiveWorkHandler(args: {
  prisma: PrismaClient;
  auth: AuthContext;
  workspace: { id: string; key: string };
  project: { id: string; key: string; name: string };
  source: 'manual' | 'nightly';
  recordAudit?: (args: {
    workspaceId: string;
    projectId?: string;
    workspaceKey?: string;
    actorUserId: string;
    actorUserEmail?: string;
    action: string;
    target: Record<string, unknown>;
    correlationId?: string;
  }) => Promise<void>;
}): Promise<{
  workspace_key: string;
  project_key: string;
  created: number;
  updated: number;
  stale_marked: number;
  stale_cleared: number;
  closed: number;
  active_work: ActiveWorkApiItem[];
}> {
  await assertProjectAccess(args.prisma, args.auth, args.workspace.id, args.project.id, 'WRITER');
  const now = new Date();
  const correlationId = `active-work-recompute:${randomUUID()}`;

  const result = await recomputeActiveWorkForProject({
    prisma: args.prisma,
    workspaceId: args.workspace.id,
    projectId: args.project.id,
    now,
    correlationId,
  });

  if (args.recordAudit) {
    await args.recordAudit({
      workspaceId: args.workspace.id,
      projectId: args.project.id,
      workspaceKey: args.workspace.key,
      actorUserId: args.auth.user.id,
      actorUserEmail: args.auth.user.email,
      action: 'active_work.recomputed',
      correlationId,
      target: {
        workspace_key: args.workspace.key,
        project_key: args.project.key,
        source: args.source,
        created: result.created,
        updated: result.updated,
        stale_marked: result.staleMarked,
        stale_cleared: result.staleCleared,
        closed: result.closed,
      },
    });
  }

  return {
    workspace_key: args.workspace.key,
    project_key: args.project.key,
    created: result.created,
    updated: result.updated,
    stale_marked: result.staleMarked,
    stale_cleared: result.staleCleared,
    closed: result.closed,
    active_work: result.rows.map(toActiveWorkApiItem),
  };
}

export async function listActiveWorkHandler(args: {
  prisma: PrismaClient;
  auth: AuthContext;
  workspace: { id: string; key: string };
  project: { id: string; key: string; name: string };
  includeClosed?: boolean;
  limit?: number;
}): Promise<{
  workspace_key: string;
  project_key: string;
  active_work: ActiveWorkApiItem[];
}> {
  await assertProjectAccess(args.prisma, args.auth, args.workspace.id, args.project.id, 'READER');
  const limit = Math.min(Math.max(args.limit || 50, 1), 200);
  const rows = await args.prisma.activeWork.findMany({
    where: {
      workspaceId: args.workspace.id,
      projectId: args.project.id,
      ...(args.includeClosed ? {} : { status: { in: ['inferred', 'confirmed'] } }),
    },
    orderBy: [{ confidence: 'desc' }, { lastUpdatedAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      title: true,
      confidence: true,
      status: true,
      stale: true,
      staleReason: true,
      lastEvidenceAt: true,
      lastUpdatedAt: true,
      closedAt: true,
      evidenceIds: true,
    },
  });

  return {
    workspace_key: args.workspace.key,
    project_key: args.project.key,
    active_work: rows.map(toActiveWorkApiItem),
  };
}

export async function listActiveWorkEventsHandler(args: {
  prisma: PrismaClient;
  auth: AuthContext;
  workspace: { id: string; key: string };
  project: { id: string; key: string; name: string };
  activeWorkId?: string;
  limit?: number;
}): Promise<{
  workspace_key: string;
  project_key: string;
  events: Array<{
    id: string;
    active_work_id: string;
    event_type: ActiveWorkEventType;
    details: Record<string, unknown>;
    correlation_id?: string | null;
    created_at: string;
  }>;
}> {
  await assertProjectAccess(args.prisma, args.auth, args.workspace.id, args.project.id, 'READER');
  const limit = Math.min(Math.max(args.limit || 100, 1), 500);
  const rows = await args.prisma.activeWorkEvent.findMany({
    where: {
      workspaceId: args.workspace.id,
      projectId: args.project.id,
      ...(args.activeWorkId ? { activeWorkId: args.activeWorkId } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      activeWorkId: true,
      eventType: true,
      details: true,
      correlationId: true,
      createdAt: true,
    },
  });

  return {
    workspace_key: args.workspace.key,
    project_key: args.project.key,
    events: rows.map((row) => ({
      id: row.id,
      active_work_id: row.activeWorkId,
      event_type: row.eventType,
      details: asRecord(row.details) || {},
      correlation_id: row.correlationId || null,
      created_at: row.createdAt.toISOString(),
    })),
  };
}

export async function updateActiveWorkStatusHandler(args: {
  prisma: PrismaClient;
  auth: AuthContext;
  workspace: { id: string; key: string };
  project: { id: string; key: string; name: string };
  activeWorkId: string;
  action: 'confirm' | 'close' | 'reopen';
  recordAudit?: (args: {
    workspaceId: string;
    projectId?: string;
    workspaceKey?: string;
    actorUserId: string;
    actorUserEmail?: string;
    action: string;
    target: Record<string, unknown>;
    correlationId?: string;
  }) => Promise<void>;
}): Promise<{
  workspace_key: string;
  project_key: string;
  active_work: ActiveWorkApiItem;
}> {
  await assertProjectAccess(args.prisma, args.auth, args.workspace.id, args.project.id, 'MAINTAINER');
  const existing = await args.prisma.activeWork.findUnique({
    where: { id: args.activeWorkId },
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      title: true,
      confidence: true,
      status: true,
      stale: true,
      staleReason: true,
      lastEvidenceAt: true,
      lastUpdatedAt: true,
      closedAt: true,
      evidenceIds: true,
    },
  });
  if (!existing || existing.workspaceId !== args.workspace.id || existing.projectId !== args.project.id) {
    throw new Error('Active work item not found for this project.');
  }

  const now = new Date();
  const correlationId = `active-work-manual:${randomUUID()}`;
  const previousStatus = existing.status;
  const nextData =
    args.action === 'confirm'
      ? {
          status: 'confirmed' as const,
          stale: false,
          staleReason: null,
          closedAt: null,
          lastUpdatedAt: now,
        }
      : args.action === 'close'
        ? {
            status: 'closed' as const,
            stale: true,
            staleReason: existing.staleReason || 'Manually closed by maintainer.',
            closedAt: now,
            lastUpdatedAt: now,
          }
        : {
            status: 'inferred' as const,
            stale: false,
            staleReason: null,
            closedAt: null,
            lastUpdatedAt: now,
          };

  const updated = await args.prisma.activeWork.update({
    where: { id: existing.id },
    data: nextData,
    select: {
      id: true,
      title: true,
      confidence: true,
      status: true,
      stale: true,
      staleReason: true,
      lastEvidenceAt: true,
      lastUpdatedAt: true,
      closedAt: true,
      evidenceIds: true,
    },
  });

  const eventType: ActiveWorkEventType =
    args.action === 'confirm' ? 'confirmed' : args.action === 'close' ? 'closed' : 'reopened';
  await recordActiveWorkEvent(args.prisma, {
    workspaceId: args.workspace.id,
    projectId: args.project.id,
    activeWorkId: existing.id,
    eventType,
    correlationId,
    details: {
      source: 'manual',
      previous_status: previousStatus,
      next_status: updated.status,
      stale: updated.stale,
      stale_reason: updated.staleReason,
    },
  });

  if (args.recordAudit) {
    const action =
      args.action === 'confirm'
        ? 'active_work.manual_confirm'
        : args.action === 'close'
          ? 'active_work.manual_close'
          : 'active_work.manual_reopen';
    await args.recordAudit({
      workspaceId: args.workspace.id,
      projectId: args.project.id,
      workspaceKey: args.workspace.key,
      actorUserId: args.auth.user.id,
      actorUserEmail: args.auth.user.email,
      action,
      correlationId,
      target: {
        workspace_key: args.workspace.key,
        project_key: args.project.key,
        active_work_id: existing.id,
        title: existing.title,
        previous_status: previousStatus,
        next_status: updated.status,
      },
    });
  }

  return {
    workspace_key: args.workspace.key,
    project_key: args.project.key,
    active_work: toActiveWorkApiItem(updated),
  };
}

export async function recomputeActiveWorkForProject(args: {
  prisma: PrismaClient;
  workspaceId: string;
  projectId: string;
  now: Date;
  policy?: ActiveWorkPolicy;
  correlationId?: string;
}): Promise<{
  created: number;
  updated: number;
  staleMarked: number;
  staleCleared: number;
  closed: number;
  rows: Array<{
    id: string;
    title: string;
    confidence: number;
    status: 'inferred' | 'confirmed' | 'closed';
    stale: boolean;
    staleReason: string | null;
    lastEvidenceAt: Date | null;
    lastUpdatedAt: Date;
    closedAt: Date | null;
    evidenceIds: unknown;
  }>;
  candidates: ActiveWorkCandidate[];
}> {
  const policy = args.policy || (await resolvePolicy(args.prisma, args.workspaceId));
  const correlationId = args.correlationId || `active-work-recompute:${randomUUID()}`;
  const since = new Date(args.now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [rawEvents, memories, existingRows] = await Promise.all([
    args.prisma.rawEvent.findMany({
      where: {
        workspaceId: args.workspaceId,
        projectId: args.projectId,
        createdAt: { gte: since },
        eventType: { in: ['post_commit', 'post_merge', 'post_checkout'] },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 800,
      select: {
        id: true,
        createdAt: true,
        branch: true,
        commitMessage: true,
        changedFiles: true,
      },
    }),
    args.prisma.memory.findMany({
      where: {
        workspaceId: args.workspaceId,
        projectId: args.projectId,
        createdAt: { gte: since },
        type: { in: ['decision', 'goal', 'activity'] },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 400,
      select: {
        id: true,
        type: true,
        status: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        metadata: true,
      },
    }),
    args.prisma.activeWork.findMany({
      where: {
        workspaceId: args.workspaceId,
        projectId: args.projectId,
      },
      select: {
        id: true,
        title: true,
        confidence: true,
        status: true,
        stale: true,
        staleReason: true,
        lastEvidenceAt: true,
        lastUpdatedAt: true,
        closedAt: true,
        evidenceIds: true,
      },
    }),
  ]);

  const candidates = inferActiveWorkCandidates({
    now: args.now,
    rawEvents,
    memories,
    maxItems: 10,
  });

  const existingByTitle = new Map(
    existingRows.map((row) => [normalizeText(row.title), row] as const)
  );

  let created = 0;
  let updated = 0;
  let staleMarked = 0;
  let staleCleared = 0;
  let closed = 0;

  for (const candidate of candidates) {
    const key = normalizeText(candidate.title);
    const existing = existingByTitle.get(key);
    if (existing) {
      const nextStatus = existing.status === 'confirmed' ? 'confirmed' : 'inferred';
      const evidenceChanged = !sameEvidence(existing.evidenceIds, candidate.evidence_ids);
      const confidenceChanged = Math.abs(Number(existing.confidence) - candidate.confidence) >= 0.01;
      const staleWasCleared = existing.stale;

      await args.prisma.activeWork.update({
        where: { id: existing.id },
        data: {
          confidence: candidate.confidence,
          evidenceIds: candidate.evidence_ids,
          status: nextStatus,
          stale: false,
          staleReason: null,
          lastEvidenceAt: candidate.last_evidence_at,
          closedAt: null,
          lastUpdatedAt: args.now,
        },
      });

      if (staleWasCleared) {
        staleCleared += 1;
        await recordActiveWorkEvent(args.prisma, {
          workspaceId: args.workspaceId,
          projectId: args.projectId,
          activeWorkId: existing.id,
          eventType: 'stale_cleared',
          correlationId,
          details: {
            source: 'auto_recompute',
            reason: 'New evidence detected.',
            candidate_score: candidate.score,
          },
        });
      }

      if (confidenceChanged || evidenceChanged || nextStatus !== existing.status) {
        updated += 1;
        await recordActiveWorkEvent(args.prisma, {
          workspaceId: args.workspaceId,
          projectId: args.projectId,
          activeWorkId: existing.id,
          eventType: 'updated',
          correlationId,
          details: {
            source: 'auto_recompute',
            previous: {
              confidence: Number(existing.confidence),
              status: existing.status,
              stale: existing.stale,
            },
            next: {
              confidence: candidate.confidence,
              status: nextStatus,
              stale: false,
            },
            score_breakdown: candidate.breakdown,
            evidence_ids: candidate.evidence_ids,
          },
        });
      }

      continue;
    }

    const createdRow = await args.prisma.activeWork.create({
      data: {
        workspaceId: args.workspaceId,
        projectId: args.projectId,
        title: candidate.title,
        confidence: candidate.confidence,
        evidenceIds: candidate.evidence_ids,
        status: 'inferred',
        stale: false,
        staleReason: null,
        lastEvidenceAt: candidate.last_evidence_at,
        lastUpdatedAt: args.now,
      },
      select: { id: true },
    });
    created += 1;
    await recordActiveWorkEvent(args.prisma, {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      activeWorkId: createdRow.id,
      eventType: 'created',
      correlationId,
      details: {
        source: 'auto_recompute',
        title: candidate.title,
        confidence: candidate.confidence,
        score_breakdown: candidate.breakdown,
        evidence_ids: candidate.evidence_ids,
      },
    });
  }

  const currentRows = await args.prisma.activeWork.findMany({
    where: {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      status: { in: ['inferred', 'confirmed'] },
    },
    select: {
      id: true,
      title: true,
      confidence: true,
      status: true,
      stale: true,
      staleReason: true,
      lastEvidenceAt: true,
      lastUpdatedAt: true,
      closedAt: true,
      evidenceIds: true,
    },
  });

  for (const row of currentRows) {
    const evidenceAt = row.lastEvidenceAt || row.lastUpdatedAt;
    const ageDays = daysBetween(evidenceAt, args.now);
    const shouldClose =
      policy.autoCloseEnabled &&
      row.status === 'inferred' &&
      ageDays >= policy.autoCloseDays;

    if (shouldClose) {
      await args.prisma.activeWork.update({
        where: { id: row.id },
        data: {
          status: 'closed',
          stale: true,
          staleReason: `No evidence for ${policy.autoCloseDays}+ days.`,
          closedAt: args.now,
          lastUpdatedAt: args.now,
        },
      });
      closed += 1;
      await recordActiveWorkEvent(args.prisma, {
        workspaceId: args.workspaceId,
        projectId: args.projectId,
        activeWorkId: row.id,
        eventType: 'closed',
        correlationId,
        details: {
          source: 'auto_recompute',
          reason: 'auto_close',
          age_days: Number(ageDays.toFixed(3)),
          auto_close_days: policy.autoCloseDays,
        },
      });
      continue;
    }

    const shouldStale = ageDays >= policy.staleDays;
    if (shouldStale && !row.stale) {
      await args.prisma.activeWork.update({
        where: { id: row.id },
        data: {
          stale: true,
          staleReason: `No evidence for ${policy.staleDays}+ days.`,
          lastUpdatedAt: args.now,
        },
      });
      staleMarked += 1;
      await recordActiveWorkEvent(args.prisma, {
        workspaceId: args.workspaceId,
        projectId: args.projectId,
        activeWorkId: row.id,
        eventType: 'stale_marked',
        correlationId,
        details: {
          source: 'auto_recompute',
          age_days: Number(ageDays.toFixed(3)),
          stale_days: policy.staleDays,
        },
      });
      continue;
    }

    if (!shouldStale && row.stale) {
      await args.prisma.activeWork.update({
        where: { id: row.id },
        data: {
          stale: false,
          staleReason: null,
          lastUpdatedAt: args.now,
        },
      });
      staleCleared += 1;
      await recordActiveWorkEvent(args.prisma, {
        workspaceId: args.workspaceId,
        projectId: args.projectId,
        activeWorkId: row.id,
        eventType: 'stale_cleared',
        correlationId,
        details: {
          source: 'auto_recompute',
          age_days: Number(ageDays.toFixed(3)),
          stale_days: policy.staleDays,
        },
      });
    }
  }

  const rows = await args.prisma.activeWork.findMany({
    where: {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
    },
    orderBy: [{ status: 'asc' }, { confidence: 'desc' }, { lastUpdatedAt: 'desc' }],
    take: 20,
    select: {
      id: true,
      title: true,
      confidence: true,
      status: true,
      stale: true,
      staleReason: true,
      lastEvidenceAt: true,
      lastUpdatedAt: true,
      closedAt: true,
      evidenceIds: true,
    },
  });

  return {
    created,
    updated,
    staleMarked,
    staleCleared,
    closed,
    rows,
    candidates,
  };
}

export async function recomputeActiveWorkNightly(args: {
  prisma: PrismaClient;
  now: Date;
}): Promise<{
  workspaces_processed: number;
  projects_processed: number;
  changed_projects: number;
}> {
  const workspaces = await args.prisma.workspace.findMany({
    select: { id: true },
  });

  let projectsProcessed = 0;
  let changedProjects = 0;

  for (const workspace of workspaces) {
    const settings = await args.prisma.workspaceSettings.findUnique({
      where: { workspaceId: workspace.id },
      select: {
        enableActivityAutoLog: true,
        activeWorkStaleDays: true,
        activeWorkAutoCloseEnabled: true,
        activeWorkAutoCloseDays: true,
      },
    });
    if (settings?.enableActivityAutoLog === false) {
      continue;
    }

    const projects = await args.prisma.project.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true },
      take: 1000,
    });

    for (const project of projects) {
      projectsProcessed += 1;
      const result = await recomputeActiveWorkForProject({
        prisma: args.prisma,
        workspaceId: workspace.id,
        projectId: project.id,
        now: args.now,
        policy: {
          staleDays: clampInt(settings?.activeWorkStaleDays ?? 14, 14, 1, 3650),
          autoCloseEnabled: settings?.activeWorkAutoCloseEnabled === true,
          autoCloseDays: clampInt(settings?.activeWorkAutoCloseDays ?? 45, 45, 1, 3650),
        },
      });
      if (
        result.created > 0 ||
        result.updated > 0 ||
        result.staleMarked > 0 ||
        result.staleCleared > 0 ||
        result.closed > 0
      ) {
        changedProjects += 1;
      }
    }
  }

  return {
    workspaces_processed: workspaces.length,
    projects_processed: projectsProcessed,
    changed_projects: changedProjects,
  };
}

export function inferActiveWorkCandidates(input: InferenceInput): ActiveWorkCandidate[] {
  const candidateMap = new Map<
    string,
    {
      title: string;
      lastSeen: Date;
      frequency: number;
      decisionWeight: number;
      keywordWeight: number;
      evidenceIds: Set<string>;
      keywords: Set<string>;
    }
  >();

  for (const event of input.rawEvents) {
    const clusterKey = inferClusterKey(event.changedFiles) || inferKeywordTitle(event.commitMessage, event.branch);
    if (!clusterKey) {
      continue;
    }
    const key = `cluster:${clusterKey.toLowerCase()}`;
    const candidate = ensureCandidate(candidateMap, key, humanizeCluster(clusterKey), event.createdAt);
    candidate.frequency += 1;
    candidate.lastSeen = maxDate(candidate.lastSeen, event.createdAt);
    candidate.evidenceIds.add(event.id);

    for (const keyword of extractKeywords(event.commitMessage || '')) {
      candidate.keywords.add(keyword);
    }
  }

  for (const memory of input.memories) {
    const summary = summarizeText(memory.content, 120);
    if (!summary) {
      continue;
    }

    if (memory.type === 'decision' || memory.type === 'goal') {
      const key = `${memory.type}:${normalizeText(summary).slice(0, 120)}`;
      const candidate = ensureCandidate(candidateMap, key, summary, memory.updatedAt || memory.createdAt);
      candidate.lastSeen = maxDate(candidate.lastSeen, memory.updatedAt || memory.createdAt);
      candidate.decisionWeight += memory.status === 'draft' ? 2.0 : 1.0;
      candidate.evidenceIds.add(memory.id);
      for (const keyword of extractKeywords(summary)) {
        candidate.keywords.add(keyword);
      }
      continue;
    }

    if (memory.type === 'activity') {
      const metadata = asRecord(memory.metadata);
      const subpath = typeof metadata?.subpath === 'string' ? metadata.subpath : '';
      const key = subpath
        ? `activity:${subpath.toLowerCase()}`
        : `activity:${normalizeText(summary).slice(0, 80)}`;
      const candidate = ensureCandidate(
        candidateMap,
        key,
        subpath ? `Activity around ${subpath}` : summary,
        memory.updatedAt || memory.createdAt
      );
      candidate.lastSeen = maxDate(candidate.lastSeen, memory.updatedAt || memory.createdAt);
      candidate.keywordWeight += 0.2;
      candidate.evidenceIds.add(memory.id);
      for (const keyword of extractKeywords(summary)) {
        candidate.keywords.add(keyword);
      }
    }
  }

  const results: ActiveWorkCandidate[] = [];
  for (const [key, candidate] of candidateMap.entries()) {
    const ageDays = Math.max(0, (input.now.getTime() - candidate.lastSeen.getTime()) / (24 * 60 * 60 * 1000));
    const recencyWeight = Number((Math.max(0, 1 - ageDays / 14) * 2).toFixed(3));
    const frequencyWeight = Number((Math.min(candidate.frequency, 20) / 20 * 2).toFixed(3));
    const decisionStatusWeight = Number(Math.min(candidate.decisionWeight, 3.5).toFixed(3));
    const commitKeywordWeight = Number(
      (Math.min(candidate.keywords.size, 6) * 0.2 + candidate.keywordWeight).toFixed(3)
    );
    const total = Number((recencyWeight + frequencyWeight + decisionStatusWeight + commitKeywordWeight).toFixed(3));
    if (total <= 0.25) {
      continue;
    }

    const confidence = Number(clampFloat(total / 7.5, 0.15, 0.99).toFixed(3));
    results.push({
      key,
      title: candidate.title,
      confidence,
      score: total,
      evidence_ids: Array.from(candidate.evidenceIds).slice(0, 32),
      last_evidence_at: candidate.lastSeen,
      breakdown: {
        recency_weight: recencyWeight,
        frequency_weight: frequencyWeight,
        decision_status_weight: decisionStatusWeight,
        commit_keyword_weight: commitKeywordWeight,
        total,
      },
    });
  }

  const maxItems = Math.min(Math.max(input.maxItems || 5, 1), 10);
  return results
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.title.localeCompare(b.title))
    .slice(0, maxItems);
}

async function resolvePolicy(prisma: PrismaClient, workspaceId: string): Promise<ActiveWorkPolicy> {
  const settings = await prisma.workspaceSettings.findUnique({
    where: { workspaceId },
    select: {
      activeWorkStaleDays: true,
      activeWorkAutoCloseEnabled: true,
      activeWorkAutoCloseDays: true,
    },
  });
  return {
    staleDays: clampInt(settings?.activeWorkStaleDays ?? 14, 14, 1, 3650),
    autoCloseEnabled: settings?.activeWorkAutoCloseEnabled === true,
    autoCloseDays: clampInt(settings?.activeWorkAutoCloseDays ?? 45, 45, 1, 3650),
  };
}

async function recordActiveWorkEvent(
  prisma: PrismaClient,
  args: {
    workspaceId: string;
    projectId: string;
    activeWorkId: string;
    eventType: ActiveWorkEventType;
    details?: Record<string, unknown>;
    correlationId?: string;
  }
) {
  await prisma.activeWorkEvent.create({
    data: {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      activeWorkId: args.activeWorkId,
      eventType: args.eventType,
      details: (args.details || {}) as Prisma.InputJsonValue,
      correlationId: args.correlationId || null,
    },
  });
}

function toActiveWorkApiItem(row: {
  id: string;
  title: string;
  confidence: number;
  status: 'inferred' | 'confirmed' | 'closed';
  stale: boolean;
  staleReason: string | null;
  lastEvidenceAt: Date | null;
  lastUpdatedAt: Date;
  closedAt: Date | null;
  evidenceIds: unknown;
}): ActiveWorkApiItem {
  return {
    id: row.id,
    title: row.title,
    confidence: Number(row.confidence.toFixed(3)),
    status: row.status,
    stale: row.stale,
    stale_reason: row.staleReason,
    last_evidence_at: row.lastEvidenceAt?.toISOString() || null,
    last_updated_at: row.lastUpdatedAt.toISOString(),
    closed_at: row.closedAt?.toISOString() || null,
    evidence_ids: toStringArray(row.evidenceIds),
  };
}

function sameEvidence(left: unknown, right: string[]): boolean {
  const leftArray = toStringArray(left).slice().sort();
  const rightArray = right.slice().sort();
  if (leftArray.length !== rightArray.length) {
    return false;
  }
  for (let i = 0; i < leftArray.length; i += 1) {
    if (leftArray[i] !== rightArray[i]) {
      return false;
    }
  }
  return true;
}

function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const out: string[] = [];
  for (const value of input) {
    const normalized = String(value || '').trim();
    if (normalized) {
      out.push(normalized);
    }
  }
  return out;
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

function ensureCandidate(
  map: Map<
    string,
    {
      title: string;
      lastSeen: Date;
      frequency: number;
      decisionWeight: number;
      keywordWeight: number;
      evidenceIds: Set<string>;
      keywords: Set<string>;
    }
  >,
  key: string,
  title: string,
  initialDate: Date
) {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const next = {
    title: summarizeText(title, 140),
    lastSeen: initialDate,
    frequency: 0,
    decisionWeight: 0,
    keywordWeight: 0,
    evidenceIds: new Set<string>(),
    keywords: new Set<string>(),
  };
  map.set(key, next);
  return next;
}

function inferClusterKey(changedFiles: unknown): string | null {
  const paths = toChangedFilePaths(changedFiles);
  for (const filePath of paths) {
    const normalized = normalizePath(filePath);
    if (!normalized || isIgnoredPath(normalized)) {
      continue;
    }
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length >= 2 && ['apps', 'packages', 'services', 'libs'].includes(parts[0])) {
      return `${parts[0]}/${parts[1]}`;
    }
    return parts.slice(0, Math.min(2, parts.length)).join('/');
  }
  return null;
}

function inferKeywordTitle(commitMessage?: string | null, branch?: string | null): string | null {
  const fromMessage = summarizeText(commitMessage || '', 80);
  if (fromMessage) {
    return fromMessage;
  }
  const fromBranch = summarizeText(branch || '', 60);
  if (fromBranch) {
    return `branch:${fromBranch}`;
  }
  return null;
}

function humanizeCluster(cluster: string): string {
  const normalized = cluster.replace(/[-_]/g, ' ').replace(/\//g, ' / ').trim();
  return `Focus on ${normalized}`;
}

function toChangedFilePaths(changedFiles: unknown): string[] {
  if (!Array.isArray(changedFiles)) {
    return [];
  }

  const output: string[] = [];
  for (const entry of changedFiles) {
    if (typeof entry === 'string') {
      output.push(entry);
      continue;
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const candidate = record.path || record.file || record.name;
      if (typeof candidate === 'string') {
        output.push(candidate);
      }
    }
  }
  return output;
}

function extractKeywords(input: string): string[] {
  if (!input.trim()) {
    return [];
  }
  const stopwords = new Set([
    'the', 'and', 'for', 'with', 'from', 'into', 'this', 'that', 'these', 'those', 'update', 'fix',
    'feat', 'chore', 'refactor', 'merge', 'branch', 'main', 'release', 'test', 'tests', 'build',
    'wip', 'tmp', 'debug', 'change', 'changes', 'file', 'files', 'project', 'workspace', 'claustrum',
  ]);

  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopwords.has(token))
    .slice(0, 20);
}

function summarizeText(input: string, maxChars: number): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(maxChars - 3, 1)).trimEnd()}...`;
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
}

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isIgnoredPath(pathValue: string): boolean {
  return (
    pathValue.startsWith('node_modules/') ||
    pathValue.startsWith('.git/') ||
    pathValue.startsWith('dist/') ||
    pathValue.startsWith('build/') ||
    pathValue.startsWith('.next/')
  );
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function clampInt(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(value), min), max);
}

function clampFloat(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

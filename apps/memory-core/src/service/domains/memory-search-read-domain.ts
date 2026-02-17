import { Prisma, type PrismaClient } from '@prisma/client';
import {
  createMemorySchema,
  memorySourceSchema,
  memoryStatusSchema,
  memoryTypeSchema,
  type ListMemoriesQuery,
} from '@claustrum/shared';
import type { AuthContext } from '../../auth.js';
import { assertProjectAccess, assertWorkspaceAccess, isWorkspaceAdminRole } from '../access-control.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { getEffectiveWorkspaceSettings } from '../workspace-resolution.js';
import {
  applySubpathBoost,
  normalizeSubpathValue,
  prioritizeRowsBySubpath,
} from '../helpers/monorepo-subpath-helper.js';

type MemorySearchDeps = {
  prisma: PrismaClient;
  getWorkspaceByKey: (workspaceKey: string) => Promise<{ id: string; key: string }>;
  getProjectByKeys: (
    workspaceKey: string,
    projectKey: string
  ) => Promise<{ id: string; workspaceId: string }>;
  updateMemoryEmbedding: (memoryId: string, content: string) => Promise<void>;
  searchMemoryCandidateScores: (args: {
    workspaceId: string;
    q: string;
    projectIds: string[] | null;
    type?: string;
    status?: 'draft' | 'confirmed' | 'rejected';
    source?: 'auto' | 'human' | 'import';
    since?: string;
    confidenceMin?: number;
    confidenceMax?: number;
    limit: number;
    mode: 'keyword' | 'semantic';
  }) => Promise<Array<{ id: string; score: number }>>;
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

type ScoreBreakdown = {
  vector: number;
  fts: number;
  type_boost: number;
  recency_boost: number;
  subpath_boost: number;
  final: number;
};

function clampPositive(value: number, fallback: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, min), max);
}

function computeRecencyBoost(createdAt: Date, halfLifeDays: number): number {
  const safeHalfLife = clampPositive(halfLifeDays, 14, 1, 3650);
  const ageMs = Math.max(Date.now() - createdAt.getTime(), 0);
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return 1 + Math.exp((-Math.LN2 * ageDays) / safeHalfLife);
}

function getTypeBoost(typeWeights: Record<string, number>, type: string): number {
  const normalized = String(type || '').trim().toLowerCase();
  if (!normalized) {
    return 1;
  }
  const candidate = Number(typeWeights[normalized] ?? 1);
  return clampPositive(candidate, 1, 0.1, 100);
}

function maybeAttachBreakdown<T extends Record<string, unknown>>(
  row: T,
  debug: boolean,
  breakdown: ScoreBreakdown
): T | (T & { score_breakdown: ScoreBreakdown }) {
  if (!debug) {
    return row;
  }
  return {
    ...row,
    score_breakdown: breakdown,
  };
}


export async function createMemoryDomain(
  deps: MemorySearchDeps,
  args: { auth: AuthContext; input: unknown }
) {
  const parsed = createMemorySchema.safeParse(args.input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(', '));
  }

  const project = await deps.getProjectByKeys(parsed.data.workspace_key, parsed.data.project_key);
  await assertProjectAccess(deps.prisma, args.auth, project.workspaceId, project.id, 'WRITER');

  const created = await deps.prisma.memory.create({
    data: {
      workspaceId: project.workspaceId,
      projectId: project.id,
      type: parsed.data.type,
      content: parsed.data.content,
      status: parsed.data.status ? memoryStatusSchema.parse(parsed.data.status) : undefined,
      source: parsed.data.source ? memorySourceSchema.parse(parsed.data.source) : undefined,
      confidence:
        typeof parsed.data.confidence === 'number'
          ? Math.min(Math.max(parsed.data.confidence, 0), 1)
          : undefined,
      evidence: (parsed.data.evidence as Prisma.InputJsonValue | undefined) ?? undefined,
      metadata: (parsed.data.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
      createdBy: args.auth.user.id,
    },
    select: {
      id: true,
      type: true,
      content: true,
      status: true,
      source: true,
      confidence: true,
      evidence: true,
      metadata: true,
      createdBy: true,
      createdAt: true,
      project: {
        select: {
          key: true,
          workspace: {
            select: { key: true },
          },
        },
      },
    },
  });
  await deps.updateMemoryEmbedding(created.id, created.content);
  await deps.recordAudit({
    workspaceId: project.workspaceId,
    projectId: project.id,
    workspaceKey: parsed.data.workspace_key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'memory.create',
    target: {
      workspace_key: parsed.data.workspace_key,
      project_key: parsed.data.project_key,
      project_id: project.id,
      memory_id: created.id,
      memory_type: created.type,
    },
  });
  return created;
}

export async function listMemoriesDomain(
  deps: MemorySearchDeps,
  args: { auth: AuthContext; query: ListMemoriesQuery }
) {
  const workspace = await deps.getWorkspaceByKey(args.query.workspace_key);
  const settings = await getEffectiveWorkspaceSettings(deps.prisma, workspace.id);
  const defaultLimit = Math.min(Math.max(settings.searchDefaultLimit || 20, 1), 500);
  const limit = Math.min(Math.max(args.query.limit || defaultLimit, 1), 500);
  const membership = await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);

  let projectId: string | undefined;
  if (args.query.project_key) {
    const project = await deps.getProjectByKeys(args.query.workspace_key, args.query.project_key);
    await assertProjectAccess(deps.prisma, args.auth, project.workspaceId, project.id);
    projectId = project.id;
  }

  const type = args.query.type ? memoryTypeSchema.parse(args.query.type) : undefined;
  const status = args.query.status ? memoryStatusSchema.parse(args.query.status) : undefined;
  const source = args.query.source ? memorySourceSchema.parse(args.query.source) : undefined;
  const confidenceMin =
    typeof args.query.confidence_min === 'number'
      ? Math.min(Math.max(args.query.confidence_min, 0), 1)
      : undefined;
  const confidenceMax =
    typeof args.query.confidence_max === 'number'
      ? Math.min(Math.max(args.query.confidence_max, 0), 1)
      : undefined;

  const where: Prisma.MemoryWhereInput = {};
  let allowedProjectIds: string[] | null = null;
  if (projectId) {
    where.projectId = projectId;
    where.workspaceId = workspace.id;
    allowedProjectIds = [projectId];
  } else if (
    args.auth.projectAccessBypass ||
    args.auth.user.envAdmin ||
    isWorkspaceAdminRole(membership.role)
  ) {
    where.workspaceId = workspace.id;
    allowedProjectIds = null;
  } else {
    const memberships = await deps.prisma.projectMember.findMany({
      where: {
        userId: args.auth.user.id,
        project: {
          workspaceId: workspace.id,
        },
      },
      select: {
        projectId: true,
      },
    });
    const projectIds = memberships.map((item) => item.projectId);
    if (projectIds.length === 0) {
      return [];
    }
    where.workspaceId = workspace.id;
    where.projectId = { in: projectIds };
    allowedProjectIds = projectIds;
  }
  if (type) {
    where.type = type;
  }
  if (status) {
    where.status = status;
  }
  if (source) {
    where.source = source;
  }
  if (confidenceMin !== undefined || confidenceMax !== undefined) {
    where.confidence = {
      gte: confidenceMin,
      lte: confidenceMax,
    };
  }
  if (args.query.since) {
    where.createdAt = {
      gte: new Date(args.query.since),
    };
  }
  const currentSubpath = normalizeSubpathValue(args.query.current_subpath);
  const subpathBoostEnabled =
    settings.monorepoContextMode === 'shared_repo' &&
    settings.monorepoSubpathBoostEnabled &&
    Boolean(currentSubpath);
  const subpathBoostWeight = clampPositive(
    settings.searchSubpathBoostWeight ?? settings.monorepoSubpathBoostWeight,
    settings.monorepoSubpathBoostWeight ?? 1.5,
    1,
    10
  );
  const typeWeights = settings.searchTypeWeights || {};
  const recencyHalfLifeDays = settings.searchRecencyHalfLifeDays || 14;
  const debug = args.query.debug === true;
  const mode = (args.query.mode ||
    settings.searchDefaultMode ||
    'hybrid') as 'hybrid' | 'keyword' | 'semantic';
  const q = (args.query.q || '').trim();
  if (!q) {
    const rows = await deps.prisma.memory.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: subpathBoostEnabled ? Math.min(limit * 5, 1000) : limit,
      select: {
        id: true,
        type: true,
        content: true,
        status: true,
        source: true,
        confidence: true,
        evidence: true,
        metadata: true,
        createdBy: true,
        createdAt: true,
        project: {
          select: {
            key: true,
            name: true,
            workspace: {
              select: {
                key: true,
                name: true,
              },
            },
          },
        },
      },
    });
    if (!subpathBoostEnabled) {
      if (!debug) {
        return rows;
      }
      return rows.map((row) =>
        maybeAttachBreakdown(row, true, {
          vector: 0,
          fts: 0,
          type_boost: getTypeBoost(typeWeights, row.type),
          recency_boost: computeRecencyBoost(row.createdAt, recencyHalfLifeDays),
          subpath_boost: 1,
          final:
            getTypeBoost(typeWeights, row.type) *
            computeRecencyBoost(row.createdAt, recencyHalfLifeDays),
        })
      );
    }
    const prioritized = prioritizeRowsBySubpath(rows, currentSubpath, true).slice(0, limit);
    return prioritized.map((row) => {
      const subpathBoost = applySubpathBoost({
        baseScore: 1,
        metadata: row.metadata,
        currentSubpath,
        enabled: true,
        weight: subpathBoostWeight,
      });
      const typeBoost = getTypeBoost(typeWeights, row.type);
      const recencyBoost = computeRecencyBoost(row.createdAt, recencyHalfLifeDays);
      return maybeAttachBreakdown(row, debug, {
        vector: 0,
        fts: 0,
        type_boost: typeBoost,
        recency_boost: recencyBoost,
        subpath_boost: subpathBoost,
        final: typeBoost * recencyBoost * subpathBoost,
      });
    });
  }

  const rankingTake = subpathBoostEnabled ? Math.min(Math.max(limit * 4, limit), 2000) : limit;
  const keywordCandidates = await deps.searchMemoryCandidateScores({
    workspaceId: workspace.id,
    q,
    projectIds: allowedProjectIds,
    type,
    status,
    source,
    since: args.query.since,
    confidenceMin,
    confidenceMax,
    limit: Math.max(limit * 10, 200),
    mode: 'keyword',
  });
  let rankedIds: string[] = [];
  const scoreById = new Map<string, number>();
  const keywordScoreById = new Map<string, number>();
  const semanticScoreById = new Map<string, number>();
  for (const candidate of keywordCandidates) {
    keywordScoreById.set(candidate.id, candidate.score);
  }
  if (mode === 'keyword') {
    const ranked = keywordCandidates.sort((a, b) => b.score - a.score).slice(0, rankingTake);
    rankedIds = ranked.map((item) => item.id);
    for (const item of ranked) {
      scoreById.set(item.id, item.score);
    }
  } else {
    const semanticCandidates = await deps.searchMemoryCandidateScores({
      workspaceId: workspace.id,
      q,
      projectIds: allowedProjectIds,
      type,
      status,
      source,
      since: args.query.since,
      confidenceMin,
      confidenceMax,
      limit: Math.max(limit * 10, 200),
      mode: 'semantic',
    });
    for (const candidate of semanticCandidates) {
      semanticScoreById.set(candidate.id, candidate.score);
    }
    if (mode === 'semantic') {
      const ranked = semanticCandidates.sort((a, b) => b.score - a.score).slice(0, rankingTake);
      rankedIds = ranked.map((item) => item.id);
      for (const item of ranked) {
        scoreById.set(item.id, item.score);
      }
    } else {
      const combined = new Map<string, number>();
      for (const candidate of keywordCandidates) {
        combined.set(
          candidate.id,
          (combined.get(candidate.id) || 0) + settings.searchHybridBeta * candidate.score
        );
      }
      for (const candidate of semanticCandidates) {
        combined.set(
          candidate.id,
          (combined.get(candidate.id) || 0) + settings.searchHybridAlpha * candidate.score
        );
      }
      rankedIds = [...combined.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, rankingTake)
        .map(([id]) => id);
      for (const [id, score] of combined.entries()) {
        scoreById.set(id, score);
      }
    }
  }
  if (rankedIds.length === 0) {
    return [];
  }
  const rows = await deps.prisma.memory.findMany({
    where: {
      id: { in: rankedIds },
    },
    select: {
      id: true,
      type: true,
      content: true,
      status: true,
      source: true,
      confidence: true,
      evidence: true,
      metadata: true,
      createdBy: true,
      createdAt: true,
      project: {
        select: {
          key: true,
          name: true,
          workspace: {
            select: {
              key: true,
              name: true,
            },
          },
        },
      },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const normalized = rankedIds
    .map((id, index) => {
      const row = byId.get(id);
      if (!row) {
        return null;
      }
      const fallbackScore = Math.max(rankedIds.length - index, 0);
      const vectorScore = semanticScoreById.get(id) ?? 0;
      const ftsScore = keywordScoreById.get(id) ?? 0;
      const baseScore =
        mode === 'keyword'
          ? ftsScore || scoreById.get(id) || fallbackScore
          : mode === 'semantic'
            ? vectorScore || scoreById.get(id) || fallbackScore
            : scoreById.get(id) || fallbackScore;
      const typeBoost = getTypeBoost(typeWeights, row.type);
      const recencyBoost = computeRecencyBoost(row.createdAt, recencyHalfLifeDays);
      const subpathBoost = applySubpathBoost({
        baseScore: 1,
        metadata: row.metadata,
        currentSubpath,
        enabled: subpathBoostEnabled,
        weight: subpathBoostWeight,
      });
      const finalScore = baseScore * typeBoost * recencyBoost * subpathBoost;
      return {
        id,
        row,
        score: finalScore,
        breakdown: {
          vector: vectorScore,
          fts: ftsScore,
          type_boost: typeBoost,
          recency_boost: recencyBoost,
          subpath_boost: subpathBoost,
          final: finalScore,
        } satisfies ScoreBreakdown,
      };
    })
    .filter(
      (item): item is {
        id: string;
        row: (typeof rows)[number];
        score: number;
        breakdown: ScoreBreakdown;
      } => Boolean(item)
    );

  normalized.sort((a, b) => b.score - a.score || b.row.createdAt.getTime() - a.row.createdAt.getTime());
  return normalized
    .slice(0, limit)
    .map((item) => maybeAttachBreakdown(item.row, debug, item.breakdown));
}

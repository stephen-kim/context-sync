import { type PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../auth.js';
import { assertProjectAccess } from '../access-control.js';
import { getEffectiveWorkspaceSettings } from '../workspace-resolution.js';

type ContextBundleDeps = {
  prisma: PrismaClient;
  getWorkspaceByKey: (workspaceKey: string) => Promise<{ id: string; key: string; name: string }>;
  getProjectByKeys: (
    workspaceKey: string,
    projectKey: string
  ) => Promise<{ id: string; key: string; name: string; workspaceId: string }>;
  listMemories: (args: {
    auth: AuthContext;
    query: {
      workspace_key: string;
      project_key: string;
      type?: string;
      q?: string;
      mode?: 'hybrid' | 'keyword' | 'semantic';
      status?: 'draft' | 'confirmed' | 'rejected';
      limit?: number;
      since?: string;
      current_subpath?: string;
      debug?: boolean;
    };
  }) => Promise<Array<Record<string, unknown>>>;
};

type BundleResult = {
  project: { key: string; name: string };
  snapshot: {
    summary: string;
    top_decisions: Array<{
      id: string;
      summary: string;
      status: string;
      created_at: string;
      evidence_ref?: Record<string, unknown>;
    }>;
    top_constraints: Array<{
      id: string;
      snippet: string;
      created_at: string;
      evidence_ref?: Record<string, unknown>;
    }>;
    active_work: Array<{
      id: string;
      snippet: string;
      created_at: string;
      evidence_ref?: Record<string, unknown>;
    }>;
    recent_activity: Array<{
      id: string;
      title: string;
      created_at: string;
      subpath?: string;
    }>;
  };
  retrieval: {
    query?: string;
    results: Array<{
      id: string;
      type: string;
      snippet: string;
      score_breakdown?: Record<string, unknown>;
      evidence_ref?: Record<string, unknown>;
    }>;
  };
  debug?: {
    resolved_workspace: string;
    resolved_project: string;
    monorepo_mode: string;
    current_subpath?: string;
    boosts_applied: {
      type_weights: Record<string, number>;
      recency_half_life_days: number;
      subpath_boost_weight: number;
      subpath_boost_enabled: boolean;
    };
    token_budget: {
      requested: number;
      retrieval_limit: number;
      per_item_chars: number;
    };
    decision_extractor_recent: Array<{
      raw_event_id: string;
      created_at: string;
      result?: string;
      confidence?: number;
      memory_id?: string;
      error?: string;
    }>;
  };
};

export async function getContextBundleHandler(
  deps: ContextBundleDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    projectKey: string;
    q?: string;
    currentSubpath?: string;
    mode?: 'default' | 'debug';
    budget?: number;
  }
): Promise<BundleResult> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  const project = await deps.getProjectByKeys(args.workspaceKey, args.projectKey);
  await assertProjectAccess(deps.prisma, args.auth, workspace.id, project.id, 'READER');

  const settings = await getEffectiveWorkspaceSettings(deps.prisma, workspace.id);
  const mode = args.mode === 'debug' ? 'debug' : 'default';
  const budget = Math.min(Math.max(Math.floor(args.budget || 1200), 300), 8000);
  const perItemChars = 280;
  const retrievalLimit = Math.min(Math.max(Math.floor(budget / 220), 5), 30);

  const [summaryRows, decisionRows, constraintRows, activeWorkRows, activityRows] = await Promise.all([
    deps.listMemories({
      auth: args.auth,
      query: {
        workspace_key: workspace.key,
        project_key: project.key,
        type: 'summary',
        status: 'confirmed',
        limit: 3,
      },
    }),
    deps.listMemories({
      auth: args.auth,
      query: {
        workspace_key: workspace.key,
        project_key: project.key,
        type: 'decision',
        status: 'confirmed',
        limit: 6,
      },
    }),
    deps.listMemories({
      auth: args.auth,
      query: {
        workspace_key: workspace.key,
        project_key: project.key,
        type: 'constraint',
        limit: 6,
      },
    }),
    deps.listMemories({
      auth: args.auth,
      query: {
        workspace_key: workspace.key,
        project_key: project.key,
        type: 'active_work',
        limit: 6,
      },
    }),
    deps.listMemories({
      auth: args.auth,
      query: {
        workspace_key: workspace.key,
        project_key: project.key,
        type: 'activity',
        limit: 10,
      },
    }),
  ]);

  let retrievalRows: Array<Record<string, unknown>> = [];
  const query = String(args.q || '').trim();
  if (query.length > 0) {
    retrievalRows = await deps.listMemories({
      auth: args.auth,
      query: {
        workspace_key: workspace.key,
        project_key: project.key,
        q: query,
        mode: settings.searchDefaultMode,
        limit: retrievalLimit,
        current_subpath: args.currentSubpath,
        debug: mode === 'debug',
      },
    });
  }

  const summaryText =
    summaryRows
      .map((row) => snippetFromMemory(row, 400))
      .filter(Boolean)
      .join('\n\n') || `Project ${project.name} (${project.key})`;

  const result: BundleResult = {
    project: { key: project.key, name: project.name },
    snapshot: {
      summary: summaryText,
      top_decisions: decisionRows.slice(0, 5).map((row) => ({
        id: asString(row.id),
        summary: extractDecisionSummary(asString(row.content)),
        status: asString(row.status || 'draft'),
        created_at: asIso(row.createdAt),
        evidence_ref: toRecord(row.evidence),
      })),
      top_constraints: constraintRows.slice(0, 5).map((row) => ({
        id: asString(row.id),
        snippet: snippetFromMemory(row, perItemChars),
        created_at: asIso(row.createdAt),
        evidence_ref: toRecord(row.evidence),
      })),
      active_work: activeWorkRows.slice(0, 5).map((row) => ({
        id: asString(row.id),
        snippet: snippetFromMemory(row, perItemChars),
        created_at: asIso(row.createdAt),
        evidence_ref: toRecord(row.evidence),
      })),
      recent_activity: activityRows.slice(0, 8).map((row) => ({
        id: asString(row.id),
        title: snippetFromMemory(row, 160),
        created_at: asIso(row.createdAt),
        subpath: extractSubpathFromMetadata(row.metadata),
      })),
    },
    retrieval: {
      query: query || undefined,
      results: retrievalRows.map((row) => ({
        id: asString(row.id),
        type: asString(row.type),
        snippet: snippetFromMemory(row, perItemChars),
        score_breakdown: mode === 'debug' ? toRecord(row.score_breakdown) : undefined,
        evidence_ref: toRecord(row.evidence),
      })),
    },
  };

  if (mode === 'debug') {
    const recentExtraction = await listRecentDecisionExtraction(deps.prisma, workspace.id, project.id);
    result.debug = {
      resolved_workspace: workspace.key,
      resolved_project: project.key,
      monorepo_mode: settings.monorepoContextMode,
      current_subpath: normalizeSubpath(args.currentSubpath) || undefined,
      boosts_applied: {
        type_weights: settings.searchTypeWeights,
        recency_half_life_days: settings.searchRecencyHalfLifeDays,
        subpath_boost_weight: settings.searchSubpathBoostWeight,
        subpath_boost_enabled:
          settings.monorepoContextMode === 'shared_repo' && settings.monorepoSubpathBoostEnabled,
      },
      token_budget: {
        requested: budget,
        retrieval_limit: retrievalLimit,
        per_item_chars: perItemChars,
      },
      decision_extractor_recent: recentExtraction,
    };
  }

  return result;
}

async function listRecentDecisionExtraction(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string
): Promise<
  Array<{
    raw_event_id: string;
    created_at: string;
    result?: string;
    confidence?: number;
    memory_id?: string;
    error?: string;
  }>
> {
  const rows = await prisma.rawEvent.findMany({
    where: {
      workspaceId,
      projectId,
      eventType: {
        in: ['post_commit', 'post_merge'],
      },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 20,
    select: {
      id: true,
      createdAt: true,
      metadata: true,
    },
  });

  return rows
    .map((row) => {
      const metadata = toRecord(row.metadata);
      if (!metadata) {
        return null;
      }
      return {
        raw_event_id: row.id,
        created_at: row.createdAt.toISOString(),
        result: asOptionalString(metadata.decision_extraction_result),
        confidence: asOptionalNumber(metadata.decision_extraction_confidence),
        memory_id: asOptionalString(metadata.decision_extraction_memory_id),
        error: asOptionalString(metadata.decision_extraction_last_error),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 10);
}

function extractDecisionSummary(content: string): string {
  const lines = content.split('\n').map((line) => line.trim());
  const summaryHeaderIndex = lines.findIndex((line) => line === 'Summary:' || line.startsWith('Summary:'));
  if (summaryHeaderIndex >= 0) {
    const inline = lines[summaryHeaderIndex].replace(/^Summary:\s*/, '').trim();
    if (inline) {
      return inline;
    }
    const next = lines.slice(summaryHeaderIndex + 1).find((line) => line.length > 0 && !line.endsWith(':'));
    if (next) {
      return trimSnippet(next, 200);
    }
  }
  return trimSnippet(content, 200);
}

function snippetFromMemory(row: Record<string, unknown>, maxChars: number): string {
  return trimSnippet(asString(row.content), maxChars);
}

function trimSnippet(input: string, maxChars: number): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(maxChars - 3, 1)).trimEnd()}...`;
}

function extractSubpathFromMetadata(metadata: unknown): string | undefined {
  const record = toRecord(metadata);
  const raw = record?.subpath;
  const normalized = normalizeSubpath(raw);
  return normalized || undefined;
}

function normalizeSubpath(input: unknown): string | null {
  const value = asOptionalString(input);
  if (!value) {
    return null;
  }
  return value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function asString(input: unknown): string {
  return typeof input === 'string' ? input : input instanceof Date ? input.toISOString() : String(input || '');
}

function asOptionalString(input: unknown): string | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asIso(input: unknown): string {
  if (input instanceof Date) {
    return input.toISOString();
  }
  const asText = asOptionalString(input);
  return asText || new Date(0).toISOString();
}

function toRecord(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  return input as Record<string, unknown>;
}

function asOptionalNumber(input: unknown): number | undefined {
  const value = Number(input);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

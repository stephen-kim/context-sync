import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../auth.js';
import { assertWorkspaceAccess, assertWorkspaceAdmin, isWorkspaceAdminRole } from '../access-control.js';
import { normalizeReason } from '../audit-utils.js';
import { ValidationError } from '../errors.js';
import type { EffectiveWorkspaceSettings } from '../workspace-resolution.js';

type WorkspaceRef = { id: string; key: string };

type GlobalRulesDeps = {
  prisma: PrismaClient;
  getWorkspaceByKey: (workspaceKey: string) => Promise<WorkspaceRef>;
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

type RuleScope = 'workspace' | 'user';
type RuleCategory = 'policy' | 'security' | 'style' | 'process' | 'other';
type RuleSeverity = 'low' | 'medium' | 'high';
type SelectionMode = 'score' | 'recent' | 'priority_only';
type RoutingMode = 'semantic' | 'keyword' | 'hybrid';

export type GlobalRuleApiRecord = {
  id: string;
  scope: RuleScope;
  workspace_id?: string | null;
  user_id?: string | null;
  title: string;
  content: string;
  category: RuleCategory;
  priority: number;
  severity: RuleSeverity;
  pinned: boolean;
  enabled: boolean;
  tags: string[];
  usage_count: number;
  last_routed_at?: string;
  created_at: string;
  updated_at: string;
};

type GlobalRuleInput = {
  scope?: RuleScope;
  user_id?: string;
  title?: string;
  content?: string;
  category?: RuleCategory;
  priority?: number;
  severity?: RuleSeverity;
  pinned?: boolean;
  enabled?: boolean;
  tags?: string[];
  reason?: string;
};

type RuleForSelection = {
  id: string;
  title: string;
  content: string;
  category: RuleCategory;
  priority: number;
  severity: RuleSeverity;
  pinned: boolean;
  enabled: boolean;
  tags: string[];
  usageCount: number;
  updatedAt: Date;
};

type RoutingScoreBreakdown = {
  rule_id: string;
  scope: RuleScope;
  semantic: number;
  keyword: number;
  priority: number;
  recency: number;
  length_penalty: number;
  final: number;
  selected: boolean;
  reason: string;
};

export type SelectedRule = {
  id: string;
  title: string;
  content: string;
  category: RuleCategory;
  priority: number;
  severity: RuleSeverity;
  pinned: boolean;
  token_estimate: number;
  selected_reason: string;
  score?: number;
};

export type RuleSelectionResult = {
  selected: SelectedRule[];
  omittedCount: number;
  warnings: Array<{ level: 'info' | 'warn'; message: string }>;
  usedSummary: boolean;
  summaryReason?: string;
  routing?: {
    mode: RoutingMode;
    qUsed?: string;
    selectedRuleIds: string[];
    droppedRuleIds: string[];
    scoreBreakdown: RoutingScoreBreakdown[];
  };
};

function toJsonValue(input: unknown): Prisma.InputJsonValue {
  return input as Prisma.InputJsonValue;
}

function clampInt(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(value), min), max);
}

function clampFloat(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, min), max);
}

function normalizeScope(input: unknown): RuleScope {
  if (input === 'workspace' || input === 'user') {
    return input;
  }
  return 'workspace';
}

function normalizeCategory(input: unknown): RuleCategory {
  if (
    input === 'policy' ||
    input === 'security' ||
    input === 'style' ||
    input === 'process' ||
    input === 'other'
  ) {
    return input;
  }
  return 'policy';
}

function normalizeSeverity(input: unknown): RuleSeverity {
  if (input === 'low' || input === 'high') {
    return input;
  }
  return 'medium';
}

function normalizeTitle(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input.trim().slice(0, 200);
}

function normalizeContent(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input.trim().slice(0, 10000);
}

function normalizeTags(input: unknown): string[] {
  const source = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[,\n]/g)
      : [];
  const tags = source
    .map((item) => String(item || '').trim().toLowerCase())
    .map((item) => item.replace(/\s+/g, '-'))
    .filter((item) => item.length > 0 && item.length <= 64);
  return Array.from(new Set(tags)).slice(0, 100);
}

function normalizeRuleInput(input: GlobalRuleInput, mode: 'create' | 'update') {
  const normalized = {
    scope: normalizeScope(input.scope),
    user_id: typeof input.user_id === 'string' ? input.user_id.trim() : '',
    title: normalizeTitle(input.title),
    content: normalizeContent(input.content),
    category: normalizeCategory(input.category),
    priority: clampInt(Number(input.priority ?? 3), 3, 1, 5),
    severity: normalizeSeverity(input.severity),
    pinned: input.pinned === true,
    enabled: input.enabled !== false,
    tags: normalizeTags(input.tags),
  };

  if (mode === 'create') {
    if (!normalized.title) {
      throw new ValidationError('title is required');
    }
    if (!normalized.content) {
      throw new ValidationError('content is required');
    }
  }

  return normalized;
}

async function assertScopeAccess(args: {
  prisma: PrismaClient;
  auth: AuthContext;
  workspaceId: string;
  scope: RuleScope;
  targetUserId?: string;
}): Promise<void> {
  const membership = await assertWorkspaceAccess(args.prisma, args.auth, args.workspaceId);
  if (args.scope === 'workspace') {
    if (!isWorkspaceAdminRole(membership.role)) {
      throw new ValidationError('Workspace-scope global rules require admin role.');
    }
    return;
  }

  const targetUserId = args.targetUserId || args.auth.user.id;
  if (targetUserId === args.auth.user.id) {
    return;
  }
  if (!isWorkspaceAdminRole(membership.role)) {
    throw new ValidationError('Only workspace admin can manage other user rules.');
  }

  const targetMembership = await args.prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: args.workspaceId,
        userId: targetUserId,
      },
    },
    select: { userId: true },
  });
  if (!targetMembership) {
    throw new ValidationError('target user is not a member of this workspace.');
  }
}

function toApiRecord(row: {
  id: string;
  scope: RuleScope;
  workspaceId: string | null;
  userId: string | null;
  title: string;
  content: string;
  category: RuleCategory;
  priority: number;
  severity: RuleSeverity;
  pinned: boolean;
  enabled: boolean;
  tags: unknown;
  usageCount: number;
  lastRoutedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): GlobalRuleApiRecord {
  return {
    id: row.id,
    scope: row.scope,
    workspace_id: row.workspaceId,
    user_id: row.userId,
    title: row.title,
    content: row.content,
    category: row.category,
    priority: row.priority,
    severity: row.severity,
    pinned: row.pinned,
    enabled: row.enabled,
    tags: normalizeTags(row.tags),
    usage_count: row.usageCount,
    last_routed_at: row.lastRoutedAt ? row.lastRoutedAt.toISOString() : undefined,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function estimateTokens(text: string): number {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 1;
  }
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function summarizeInline(text: string, maxChars = 140): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '-';
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(maxChars - 3, 1)).trimEnd()}...`;
}

function scoreRule(rule: RuleForSelection): number {
  const priorityWeight = (6 - clampInt(rule.priority, 3, 1, 5)) * 2;
  const ageDays = Math.max((Date.now() - rule.updatedAt.getTime()) / (24 * 60 * 60 * 1000), 0);
  const recencyWeight = Math.max(0, 10 - ageDays / 3);
  const usageWeight = Math.min(Math.max(rule.usageCount || 0, 0), 100) * 0.05;
  const lengthPenalty = estimateTokens(rule.content) / 250;
  return priorityWeight + recencyWeight + usageWeight - lengthPenalty;
}

function tokenizeForRouting(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 512);
}

function toFrequencyMap(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const token of tokens) {
    map.set(token, (map.get(token) || 0) + 1);
  }
  return map;
}

function cosineSimilarity(queryTokens: string[], documentTokens: string[]): number {
  if (queryTokens.length === 0 || documentTokens.length === 0) {
    return 0;
  }
  const left = toFrequencyMap(queryTokens);
  const right = toFrequencyMap(documentTokens);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const value of left.values()) {
    leftNorm += value * value;
  }
  for (const value of right.values()) {
    rightNorm += value * value;
  }
  for (const [token, leftValue] of left.entries()) {
    const rightValue = right.get(token);
    if (rightValue) {
      dot += leftValue * rightValue;
    }
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function keywordOverlapScore(queryTokens: string[], ruleTokens: string[]): number {
  if (queryTokens.length === 0 || ruleTokens.length === 0) {
    return 0;
  }
  const querySet = new Set(queryTokens);
  const ruleSet = new Set(ruleTokens);
  let overlap = 0;
  for (const token of querySet) {
    if (ruleSet.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(querySet.size, 1);
}

function computeRoutingBreakdown(args: {
  scope: RuleScope;
  rule: RuleForSelection;
  queryTokens: string[];
  mode: RoutingMode;
}): RoutingScoreBreakdown {
  const joinedRuleText = `${args.rule.title} ${args.rule.content} ${args.rule.tags.join(' ')}`;
  const ruleTokens = tokenizeForRouting(joinedRuleText);
  const semantic = cosineSimilarity(args.queryTokens, ruleTokens);
  const keyword = keywordOverlapScore(args.queryTokens, ruleTokens);
  const priority = (6 - clampInt(args.rule.priority, 3, 1, 5)) / 5;
  const ageDays = Math.max((Date.now() - args.rule.updatedAt.getTime()) / (24 * 60 * 60 * 1000), 0);
  const recency = Math.exp(-ageDays / 21);
  const lengthPenalty = Math.min(estimateTokens(args.rule.content) / 800, 0.6);

  const semanticWeight = args.mode === 'semantic' ? 1 : args.mode === 'keyword' ? 0 : 0.65;
  const keywordWeight = args.mode === 'keyword' ? 1 : args.mode === 'semantic' ? 0 : 0.35;
  const final =
    semantic * semanticWeight +
    keyword * keywordWeight +
    priority * 0.2 +
    recency * 0.12 -
    lengthPenalty * 0.08;

  return {
    rule_id: args.rule.id,
    scope: args.scope,
    semantic: Number(semantic.toFixed(6)),
    keyword: Number(keyword.toFixed(6)),
    priority: Number(priority.toFixed(6)),
    recency: Number(recency.toFixed(6)),
    length_penalty: Number(lengthPenalty.toFixed(6)),
    final: Number(final.toFixed(6)),
    selected: false,
    reason: '',
  };
}

export function selectRulesWithinBudget(args: {
  rules: RuleForSelection[];
  budgetTokens: number;
  selectionMode: SelectionMode;
  recommendMax: number;
  warnThreshold: number;
  summaryEnabled: boolean;
  summaryMinCount: number;
  scope: RuleScope;
  routing?: {
    enabled: boolean;
    mode: RoutingMode;
    query?: string;
    topK: number;
    minScore: number;
  };
}): RuleSelectionResult {
  const budget = clampInt(args.budgetTokens, 300, 100, 50000);
  const enabledRules = args.rules.filter((rule) => rule.enabled);
  const warnings: Array<{ level: 'info' | 'warn'; message: string }> = [];

  if (enabledRules.length > args.recommendMax) {
    warnings.push({
      level: 'info',
      message: `Recommended: keep ≤ ${args.recommendMax} core rules for better context focus.`,
    });
  }
  if (enabledRules.length >= args.warnThreshold) {
    warnings.push({
      level: 'warn',
      message: `${enabledRules.length} active rules may reduce context clarity. Consider summarize/compression.`,
    });
  }

  const selected: SelectedRule[] = [];
  const selectedIds = new Set<string>();
  let spent = 0;

  const pinned = enabledRules.filter((rule) => rule.pinned);
  const high = enabledRules.filter((rule) => !rule.pinned && rule.severity === 'high');

  for (const rule of pinned) {
    const tokenEstimate = estimateTokens(`${rule.title}\n${rule.content}`);
    selected.push({
      id: rule.id,
      title: rule.title,
      content: rule.content,
      category: rule.category,
      priority: rule.priority,
      severity: rule.severity,
      pinned: rule.pinned,
      token_estimate: tokenEstimate,
      selected_reason: 'pinned',
      score: scoreRule(rule),
    });
    spent += tokenEstimate;
    selectedIds.add(rule.id);
  }

  let highDroppedForBudget = 0;
  for (const rule of high) {
    const tokenEstimate = estimateTokens(`${rule.title}\n${rule.content}`);
    if (spent + tokenEstimate > budget && pinned.length > 0) {
      highDroppedForBudget += 1;
      continue;
    }
    selected.push({
      id: rule.id,
      title: rule.title,
      content: rule.content,
      category: rule.category,
      priority: rule.priority,
      severity: rule.severity,
      pinned: rule.pinned,
      token_estimate: tokenEstimate,
      selected_reason: 'high_severity',
      score: scoreRule(rule),
    });
    spent += tokenEstimate;
    selectedIds.add(rule.id);
  }

  if (spent > budget) {
    warnings.push({
      level: 'warn',
      message: `Pinned rules exceed the global budget (${spent}/${budget} tokens). Consider consolidating pinned rules.`,
    });
  }
  if (highDroppedForBudget > 0) {
    warnings.push({
      level: 'warn',
      message: `${highDroppedForBudget} high-severity rules could not fit budget after pinned rules and were compressed into summary.`,
    });
  }

  const remaining = enabledRules.filter((rule) => !selectedIds.has(rule.id));
  const scoreByRuleId = new Map<string, number>();
  const routedIds = new Set<string>();
  const routingBreakdownByRuleId = new Map<string, RoutingScoreBreakdown>();

  const routingEnabled = args.routing?.enabled === true;
  const qUsed = String(args.routing?.query || '').trim();
  if (routingEnabled && qUsed) {
    const queryTokens = tokenizeForRouting(qUsed);
    if (queryTokens.length > 0) {
      const routingScores = remaining.map((rule) =>
        computeRoutingBreakdown({
          scope: args.scope,
          rule,
          queryTokens,
          mode: args.routing?.mode || 'hybrid',
        })
      );
      for (const score of routingScores) {
        routingBreakdownByRuleId.set(score.rule_id, score);
        scoreByRuleId.set(score.rule_id, score.final);
      }
      routingScores
        .filter((score) => score.final >= (args.routing?.minScore ?? 0.2))
        .sort((left, right) => right.final - left.final)
        .slice(0, Math.max(1, args.routing?.topK || 5))
        .forEach((score) => {
          routedIds.add(score.rule_id);
        });
    }
  }

  const sorted = [...remaining].sort((a, b) => {
    if (args.selectionMode === 'recent') {
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    }
    if (args.selectionMode === 'priority_only') {
      return a.priority - b.priority || b.updatedAt.getTime() - a.updatedAt.getTime();
    }
    return scoreRule(b) - scoreRule(a) || b.updatedAt.getTime() - a.updatedAt.getTime();
  });
  const routedSorted = sorted.filter((rule) => routedIds.has(rule.id)).sort((left, right) => {
    return (scoreByRuleId.get(right.id) || 0) - (scoreByRuleId.get(left.id) || 0);
  });
  const fallbackSorted = sorted.filter((rule) => !routedIds.has(rule.id));
  const finalOrder = [...routedSorted, ...fallbackSorted];

  for (const rule of finalOrder) {
    const tokenEstimate = estimateTokens(`${rule.title}\n${rule.content}`);
    if (spent + tokenEstimate > budget) {
      continue;
    }
    const breakdown = routingBreakdownByRuleId.get(rule.id);
    if (breakdown) {
      breakdown.selected = true;
      breakdown.reason = routedIds.has(rule.id)
        ? `routing_${args.routing?.mode || 'hybrid'}`
        : 'budget_fallback';
    }
    selected.push({
      id: rule.id,
      title: rule.title,
      content: rule.content,
      category: rule.category,
      priority: rule.priority,
      severity: rule.severity,
      pinned: rule.pinned,
      token_estimate: tokenEstimate,
      selected_reason:
        routedIds.has(rule.id)
          ? `routing_${args.routing?.mode || 'hybrid'}`
          : args.selectionMode === 'priority_only'
            ? 'priority'
            : args.selectionMode === 'recent'
              ? 'recent'
              : 'score',
      score: scoreByRuleId.get(rule.id) ?? scoreRule(rule),
    });
    spent += tokenEstimate;
    selectedIds.add(rule.id);
  }

  const omittedCount = enabledRules.length - selected.length;
  const usedSummary =
    args.summaryEnabled && enabledRules.length >= args.summaryMinCount && omittedCount > 0;

  return {
    selected,
    omittedCount,
    warnings,
    usedSummary,
    summaryReason: usedSummary ? 'rule_count_or_budget' : undefined,
    routing:
      routingEnabled && qUsed
        ? {
            mode: args.routing?.mode || 'hybrid',
            qUsed,
            selectedRuleIds: selected.map((rule) => rule.id),
            droppedRuleIds: enabledRules
              .map((rule) => rule.id)
              .filter((ruleId) => !selectedIds.has(ruleId)),
            scoreBreakdown: Array.from(routingBreakdownByRuleId.values()),
          }
        : undefined,
  };
}

export function buildRulesSummaryText(args: {
  scope: RuleScope;
  rules: Array<{
    title: string;
    content: string;
    category: RuleCategory;
    severity: RuleSeverity;
    priority: number;
    pinned: boolean;
  }>;
}): string {
  const header =
    args.scope === 'workspace'
      ? 'Workspace Global Rules Summary'
      : 'User Global Rules Summary';
  const lines = args.rules.slice(0, 20).map((rule) => {
    const tags = [`${rule.category}`, `${rule.severity}`, `p${rule.priority}`];
    if (rule.pinned) {
      tags.push('pinned');
    }
    return `- [${tags.join('|')}] ${rule.title}: ${summarizeInline(rule.content, 180)}`;
  });
  return `${header}\n${lines.join('\n') || '- No active rules.'}`;
}

export async function listGlobalRulesHandler(
  deps: GlobalRulesDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    scope: RuleScope;
    userId?: string;
  }
): Promise<{ workspace_key: string; scope: RuleScope; rules: GlobalRuleApiRecord[] }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  const targetUserId = args.userId || args.auth.user.id;

  await assertScopeAccess({
    prisma: deps.prisma,
    auth: args.auth,
    workspaceId: workspace.id,
    scope: args.scope,
    targetUserId,
  });

  const rows = await deps.prisma.globalRule.findMany({
    where:
      args.scope === 'workspace'
        ? {
            scope: 'workspace',
            workspaceId: workspace.id,
          }
        : {
            scope: 'user',
            workspaceId: workspace.id,
            userId: targetUserId,
          },
    orderBy: [{ pinned: 'desc' }, { severity: 'desc' }, { priority: 'asc' }, { updatedAt: 'desc' }],
  });

  return {
    workspace_key: workspace.key,
    scope: args.scope,
    rules: rows.map(toApiRecord),
  };
}

export async function createGlobalRuleHandler(
  deps: GlobalRulesDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    input: GlobalRuleInput;
  }
): Promise<GlobalRuleApiRecord> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  const payload = normalizeRuleInput(args.input, 'create');
  const targetUserId = payload.scope === 'user' ? payload.user_id || args.auth.user.id : undefined;

  await assertScopeAccess({
    prisma: deps.prisma,
    auth: args.auth,
    workspaceId: workspace.id,
    scope: payload.scope,
    targetUserId,
  });

  const created = await deps.prisma.globalRule.create({
    data: {
      scope: payload.scope,
      workspaceId: workspace.id,
      userId: payload.scope === 'user' ? targetUserId! : null,
      title: payload.title,
      content: payload.content,
      category: payload.category,
      priority: payload.priority,
      severity: payload.severity,
      pinned: payload.pinned,
      enabled: payload.enabled,
      tags: toJsonValue(payload.tags),
    },
  });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'global_rules.create',
    target: {
      rule_id: created.id,
      scope: created.scope,
      user_id: created.userId,
      title: created.title,
      tags: normalizeTags(created.tags),
      reason: normalizeReason(args.input.reason),
    },
  });

  return toApiRecord(created);
}

export async function updateGlobalRuleHandler(
  deps: GlobalRulesDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    ruleId: string;
    input: GlobalRuleInput;
  }
): Promise<GlobalRuleApiRecord> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  const existing = await deps.prisma.globalRule.findUnique({ where: { id: args.ruleId } });
  if (!existing || existing.workspaceId !== workspace.id) {
    throw new ValidationError('global rule not found in workspace');
  }

  const payload = normalizeRuleInput(args.input, 'update');
  await assertScopeAccess({
    prisma: deps.prisma,
    auth: args.auth,
    workspaceId: workspace.id,
    scope: existing.scope,
    targetUserId: existing.userId || undefined,
  });

  const updated = await deps.prisma.globalRule.update({
    where: { id: existing.id },
    data: {
      title: payload.title || undefined,
      content: payload.content || undefined,
      category: args.input.category === undefined ? undefined : payload.category,
      priority: args.input.priority === undefined ? undefined : payload.priority,
      severity: args.input.severity === undefined ? undefined : payload.severity,
      pinned: typeof args.input.pinned === 'boolean' ? payload.pinned : undefined,
      enabled: typeof args.input.enabled === 'boolean' ? payload.enabled : undefined,
      tags: args.input.tags === undefined ? undefined : toJsonValue(payload.tags),
    },
  });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'global_rules.update',
    target: {
      rule_id: updated.id,
      scope: updated.scope,
      user_id: updated.userId,
      title: updated.title,
      tags: normalizeTags(updated.tags),
      reason: normalizeReason(args.input.reason),
    },
  });

  return toApiRecord(updated);
}

export async function deleteGlobalRuleHandler(
  deps: GlobalRulesDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    ruleId: string;
    reason?: string;
  }
): Promise<{ deleted: true; id: string }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  const existing = await deps.prisma.globalRule.findUnique({ where: { id: args.ruleId } });
  if (!existing || existing.workspaceId !== workspace.id) {
    throw new ValidationError('global rule not found in workspace');
  }

  await assertScopeAccess({
    prisma: deps.prisma,
    auth: args.auth,
    workspaceId: workspace.id,
    scope: existing.scope,
    targetUserId: existing.userId || undefined,
  });

  await deps.prisma.globalRule.delete({ where: { id: existing.id } });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'global_rules.delete',
    target: {
      rule_id: existing.id,
      scope: existing.scope,
      user_id: existing.userId,
      title: existing.title,
      reason: normalizeReason(args.reason),
    },
  });

  return { deleted: true, id: existing.id };
}

export async function summarizeGlobalRulesHandler(
  deps: GlobalRulesDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    scope: RuleScope;
    userId?: string;
    mode: 'preview' | 'replace';
    reason?: string;
  }
): Promise<{
    workspace_key: string;
    scope: RuleScope;
    user_id?: string;
    mode: 'preview' | 'replace';
    summary: string;
    source_rule_ids: string[];
    updated_at?: string;
  }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  const targetUserId = args.scope === 'user' ? args.userId || args.auth.user.id : undefined;

  await assertScopeAccess({
    prisma: deps.prisma,
    auth: args.auth,
    workspaceId: workspace.id,
    scope: args.scope,
    targetUserId,
  });

  const rules = await deps.prisma.globalRule.findMany({
    where:
      args.scope === 'workspace'
        ? { workspaceId: workspace.id, scope: 'workspace', enabled: true }
        : { workspaceId: workspace.id, scope: 'user', userId: targetUserId, enabled: true },
    orderBy: [{ pinned: 'desc' }, { severity: 'desc' }, { priority: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      severity: true,
      priority: true,
      pinned: true,
    },
  });

  const summary = buildRulesSummaryText({
    scope: args.scope,
    rules,
  });

  const sourceRuleIds = rules.map((rule) => rule.id);
  if (args.mode === 'preview') {
    return {
      workspace_key: workspace.key,
      scope: args.scope,
      user_id: targetUserId,
      mode: 'preview',
      summary,
      source_rule_ids: sourceRuleIds,
    };
  }

  const existingSummary = await deps.prisma.globalRuleSummary.findFirst({
    where: {
      scope: args.scope,
      workspaceId: workspace.id,
      userId: args.scope === 'user' ? targetUserId! : null,
    },
    select: { id: true },
  });
  const saved = existingSummary
    ? await deps.prisma.globalRuleSummary.update({
        where: { id: existingSummary.id },
        data: {
          summary,
          sourceRuleIds: toJsonValue(sourceRuleIds),
        },
      })
    : await deps.prisma.globalRuleSummary.create({
        data: {
          scope: args.scope,
          workspaceId: workspace.id,
          userId: targetUserId || null,
          summary,
          sourceRuleIds: toJsonValue(sourceRuleIds),
        },
      });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'global_rules.summarized',
    target: {
      scope: args.scope,
      user_id: targetUserId,
      summary_id: saved.id,
      source_rule_count: sourceRuleIds.length,
      reason: normalizeReason(args.reason),
    },
  });

  return {
    workspace_key: workspace.key,
    scope: args.scope,
    user_id: targetUserId,
    mode: 'replace',
    summary,
    source_rule_ids: sourceRuleIds,
    updated_at: saved.updatedAt.toISOString(),
  };
}

export async function buildGlobalRulesBundle(args: {
  prisma: PrismaClient;
  auth: AuthContext;
  workspace: WorkspaceRef;
  settings: EffectiveWorkspaceSettings;
  totalBudget?: number;
  queryText?: string;
  contextHintText?: string;
  includeRoutingDebug?: boolean;
}): Promise<{
  workspace_rules: SelectedRule[];
  user_rules: SelectedRule[];
  workspace_summary?: string;
  user_summary?: string;
  routing: {
    mode: RoutingMode;
    q_used?: string;
    selected_rule_ids: string[];
    dropped_rule_ids: string[];
    score_breakdown?: RoutingScoreBreakdown[];
  };
  warnings: Array<{ level: 'info' | 'warn'; message: string }>;
  debug: {
    workspace_budget_tokens: number;
    user_budget_tokens: number;
    workspace_selected_count: number;
    user_selected_count: number;
    workspace_omitted_count: number;
    user_omitted_count: number;
    selection_mode: SelectionMode;
    routing_enabled: boolean;
    routing_mode: RoutingMode;
    routing_top_k: number;
    routing_min_score: number;
    q_used?: string;
  };
}> {
  const totalBudget = clampInt(
    Number(args.totalBudget ?? args.settings.bundleTokenBudgetTotal),
    args.settings.bundleTokenBudgetTotal,
    100,
    50000
  );
  const workspaceBudget = Math.max(
    50,
    Math.floor(totalBudget * args.settings.bundleBudgetGlobalWorkspacePct)
  );
  const userBudget = Math.max(
    30,
    Math.floor(totalBudget * args.settings.bundleBudgetGlobalUserPct)
  );
  const explicitQuery = String(args.queryText || '').trim();
  const contextHint = String(args.contextHintText || '').trim();
  const qUsed = explicitQuery || contextHint;
  const routingMode: RoutingMode = args.settings.globalRulesRoutingMode;
  const routingEnabled = args.settings.globalRulesRoutingEnabled === true;

  const [workspaceRules, userRules, workspaceSummaryRow, userSummaryRow] = await Promise.all([
    args.prisma.globalRule.findMany({
      where: {
        workspaceId: args.workspace.id,
        scope: 'workspace',
        enabled: true,
      },
      orderBy: [{ pinned: 'desc' }, { severity: 'desc' }, { priority: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        priority: true,
        severity: true,
        pinned: true,
        enabled: true,
        tags: true,
        usageCount: true,
        lastRoutedAt: true,
        updatedAt: true,
      },
    }),
    args.prisma.globalRule.findMany({
      where: {
        workspaceId: args.workspace.id,
        scope: 'user',
        userId: args.auth.user.id,
        enabled: true,
      },
      orderBy: [{ pinned: 'desc' }, { severity: 'desc' }, { priority: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        priority: true,
        severity: true,
        pinned: true,
        enabled: true,
        tags: true,
        usageCount: true,
        lastRoutedAt: true,
        updatedAt: true,
      },
    }),
    args.prisma.globalRuleSummary.findFirst({
      where: {
        workspaceId: args.workspace.id,
        scope: 'workspace',
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: { summary: true },
    }),
    args.prisma.globalRuleSummary.findFirst({
      where: {
        workspaceId: args.workspace.id,
        scope: 'user',
        userId: args.auth.user.id,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: { summary: true },
    }),
  ]);

  const selectionMode = args.settings.globalRulesSelectionMode;
  const workspaceSelectionRules: RuleForSelection[] = workspaceRules.map((rule) => ({
    ...rule,
    tags: normalizeTags(rule.tags),
  }));
  const userSelectionRules: RuleForSelection[] = userRules.map((rule) => ({
    ...rule,
    tags: normalizeTags(rule.tags),
  }));
  const workspaceSelection = selectRulesWithinBudget({
    rules: workspaceSelectionRules,
    budgetTokens: workspaceBudget,
    selectionMode,
    recommendMax: args.settings.globalRulesRecommendMax,
    warnThreshold: args.settings.globalRulesWarnThreshold,
    summaryEnabled: args.settings.globalRulesSummaryEnabled,
    summaryMinCount: args.settings.globalRulesSummaryMinCount,
    scope: 'workspace',
    routing: {
      enabled: routingEnabled,
      mode: routingMode,
      query: qUsed,
      topK: args.settings.globalRulesRoutingTopK,
      minScore: args.settings.globalRulesRoutingMinScore,
    },
  });
  const userSelection = selectRulesWithinBudget({
    rules: userSelectionRules,
    budgetTokens: userBudget,
    selectionMode,
    recommendMax: args.settings.globalRulesRecommendMax,
    warnThreshold: args.settings.globalRulesWarnThreshold,
    summaryEnabled: args.settings.globalRulesSummaryEnabled,
    summaryMinCount: args.settings.globalRulesSummaryMinCount,
    scope: 'user',
    routing: {
      enabled: routingEnabled,
      mode: routingMode,
      query: qUsed,
      topK: args.settings.globalRulesRoutingTopK,
      minScore: args.settings.globalRulesRoutingMinScore,
    },
  });

  const workspaceSummary =
    workspaceSelection.usedSummary && args.settings.globalRulesSummaryEnabled
      ? workspaceSummaryRow?.summary ||
        buildRulesSummaryText({
          scope: 'workspace',
          rules: workspaceRules,
        })
      : undefined;

  const userSummary =
    userSelection.usedSummary && args.settings.globalRulesSummaryEnabled
      ? userSummaryRow?.summary ||
        buildRulesSummaryText({
          scope: 'user',
          rules: userRules,
        })
      : undefined;

  const selectedRuleIds = [
    ...workspaceSelection.selected.map((rule) => rule.id),
    ...userSelection.selected.map((rule) => rule.id),
  ];
  const selectedIdSet = new Set(selectedRuleIds);
  const droppedRuleIds = [...workspaceRules, ...userRules]
    .map((rule) => rule.id)
    .filter((id) => !selectedIdSet.has(id));
  const routingScoreBreakdown = [
    ...(workspaceSelection.routing?.scoreBreakdown || []),
    ...(userSelection.routing?.scoreBreakdown || []),
  ];

  if (routingEnabled && qUsed && selectedRuleIds.length > 0) {
    await args.prisma.globalRule.updateMany({
      where: {
        id: {
          in: selectedRuleIds,
        },
      },
      data: {
        lastRoutedAt: new Date(),
        usageCount: {
          increment: 1,
        },
      },
    });
  }

  return {
    workspace_rules: workspaceSelection.selected,
    user_rules: userSelection.selected,
    workspace_summary: workspaceSummary,
    user_summary: userSummary,
    routing: {
      mode: routingMode,
      q_used: qUsed || undefined,
      selected_rule_ids: selectedRuleIds,
      dropped_rule_ids: droppedRuleIds,
      score_breakdown: args.includeRoutingDebug ? routingScoreBreakdown : undefined,
    },
    warnings: [...workspaceSelection.warnings, ...userSelection.warnings],
    debug: {
      workspace_budget_tokens: workspaceBudget,
      user_budget_tokens: userBudget,
      workspace_selected_count: workspaceSelection.selected.length,
      user_selected_count: userSelection.selected.length,
      workspace_omitted_count: workspaceSelection.omittedCount,
      user_omitted_count: userSelection.omittedCount,
      selection_mode: selectionMode,
      routing_enabled: routingEnabled,
      routing_mode: routingMode,
      routing_top_k: args.settings.globalRulesRoutingTopK,
      routing_min_score: args.settings.globalRulesRoutingMinScore,
      q_used: qUsed || undefined,
    },
  };
}

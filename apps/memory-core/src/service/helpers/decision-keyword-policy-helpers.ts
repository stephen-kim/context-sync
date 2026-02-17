import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../auth.js';
import { assertWorkspaceAccess, assertWorkspaceAdmin } from '../access-control.js';
import { ValidationError } from '../errors.js';
import { normalizeReason } from '../audit-utils.js';

type Workspace = { id: string; key: string };

type PolicyDeps = {
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
  }) => Promise<void>;
};

type DecisionKeywordPolicyInput = {
  name?: string;
  positive_keywords?: string[];
  negative_keywords?: string[];
  file_path_positive_patterns?: string[];
  file_path_negative_patterns?: string[];
  weight_positive?: number;
  weight_negative?: number;
  enabled?: boolean;
  reason?: string;
};

export type DecisionKeywordPolicyRecord = {
  id: string;
  name: string;
  positive_keywords: string[];
  negative_keywords: string[];
  file_path_positive_patterns: string[];
  file_path_negative_patterns: string[];
  weight_positive: number;
  weight_negative: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

export async function listDecisionKeywordPoliciesHandler(
  deps: PolicyDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
  }
): Promise<{ workspace_key: string; policies: DecisionKeywordPolicyRecord[] }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);
  const rows = await deps.prisma.decisionKeywordPolicy.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ updatedAt: 'desc' }],
  });
  return {
    workspace_key: workspace.key,
    policies: rows.map(toApiRecord),
  };
}

export async function createDecisionKeywordPolicyHandler(
  deps: PolicyDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    input: DecisionKeywordPolicyInput;
  }
): Promise<DecisionKeywordPolicyRecord> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  const payload = normalizePolicyInput(args.input, false);

  const row = await deps.prisma.decisionKeywordPolicy.create({
    data: {
      workspaceId: workspace.id,
      name: payload.name || 'Default keywords',
      positiveKeywords: payload.positive_keywords,
      negativeKeywords: payload.negative_keywords,
      filePathPositivePatterns: payload.file_path_positive_patterns,
      filePathNegativePatterns: payload.file_path_negative_patterns,
      weightPositive: payload.weight_positive,
      weightNegative: payload.weight_negative,
      enabled: payload.enabled,
    },
  });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'decision_keyword_policy.create',
    target: {
      policy_id: row.id,
      name: row.name,
      reason: normalizeReason(args.input.reason),
    },
  });

  return toApiRecord(row);
}

export async function updateDecisionKeywordPolicyHandler(
  deps: PolicyDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    policyId: string;
    input: DecisionKeywordPolicyInput;
  }
): Promise<DecisionKeywordPolicyRecord> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  const row = await deps.prisma.decisionKeywordPolicy.findUnique({
    where: { id: args.policyId },
  });
  if (!row || row.workspaceId !== workspace.id) {
    throw new ValidationError('Decision keyword policy not found in workspace.');
  }

  const payload = normalizePolicyInput(args.input, true);
  const next = await deps.prisma.decisionKeywordPolicy.update({
    where: { id: row.id },
    data: {
      name: payload.name ?? undefined,
      positiveKeywords: payload.positive_keywords,
      negativeKeywords: payload.negative_keywords,
      filePathPositivePatterns: payload.file_path_positive_patterns,
      filePathNegativePatterns: payload.file_path_negative_patterns,
      weightPositive: payload.weight_positive,
      weightNegative: payload.weight_negative,
      enabled: payload.enabled,
    },
  });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'decision_keyword_policy.update',
    target: {
      policy_id: next.id,
      name: next.name,
      reason: normalizeReason(args.input.reason),
    },
  });

  return toApiRecord(next);
}

export async function deleteDecisionKeywordPolicyHandler(
  deps: PolicyDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    policyId: string;
    reason?: string;
  }
): Promise<{ deleted: true; id: string }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  const row = await deps.prisma.decisionKeywordPolicy.findUnique({
    where: { id: args.policyId },
  });
  if (!row || row.workspaceId !== workspace.id) {
    throw new ValidationError('Decision keyword policy not found in workspace.');
  }
  await deps.prisma.decisionKeywordPolicy.delete({ where: { id: row.id } });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'decision_keyword_policy.delete',
    target: {
      policy_id: row.id,
      name: row.name,
      reason: normalizeReason(args.reason),
    },
  });

  return { deleted: true, id: row.id };
}

export type KeywordPriorityScoreInput = {
  commitMessage?: string | null;
  changedFiles?: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  filePathPositivePatterns: string[];
  filePathNegativePatterns: string[];
  weightPositive: number;
  weightNegative: number;
};

export function calculateKeywordPriorityScore(input: KeywordPriorityScoreInput): number {
  const message = (input.commitMessage || '').toLowerCase();
  const changedFiles = input.changedFiles || [];
  let score = 0;

  for (const keyword of input.positiveKeywords) {
    if (message.includes(keyword.toLowerCase())) {
      score += input.weightPositive;
    }
  }
  for (const keyword of input.negativeKeywords) {
    if (message.includes(keyword.toLowerCase())) {
      score -= input.weightNegative;
    }
  }
  for (const filePath of changedFiles) {
    for (const pattern of input.filePathPositivePatterns) {
      if (matchGlob(pattern, filePath)) {
        score += input.weightPositive;
      }
    }
    for (const pattern of input.filePathNegativePatterns) {
      if (matchGlob(pattern, filePath)) {
        score -= input.weightNegative;
      }
    }
  }
  return score;
}

function normalizePolicyInput(input: DecisionKeywordPolicyInput, allowPartial: boolean) {
  const normalized = {
    name: normalizeOptionalString(input.name),
    positive_keywords: normalizeStringArray(input.positive_keywords),
    negative_keywords: normalizeStringArray(input.negative_keywords),
    file_path_positive_patterns: normalizeStringArray(input.file_path_positive_patterns),
    file_path_negative_patterns: normalizeStringArray(input.file_path_negative_patterns),
    weight_positive: normalizeWeight(input.weight_positive),
    weight_negative: normalizeWeight(input.weight_negative),
    enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
  };
  if (!allowPartial) {
    if (!normalized.name) {
      throw new ValidationError('name is required');
    }
    return normalized;
  }
  return {
    name: normalized.name ?? undefined,
    positive_keywords:
      input.positive_keywords === undefined ? undefined : normalized.positive_keywords,
    negative_keywords:
      input.negative_keywords === undefined ? undefined : normalized.negative_keywords,
    file_path_positive_patterns:
      input.file_path_positive_patterns === undefined
        ? undefined
        : normalized.file_path_positive_patterns,
    file_path_negative_patterns:
      input.file_path_negative_patterns === undefined
        ? undefined
        : normalized.file_path_negative_patterns,
    weight_positive:
      input.weight_positive === undefined ? undefined : normalized.weight_positive,
    weight_negative:
      input.weight_negative === undefined ? undefined : normalized.weight_negative,
    enabled: input.enabled === undefined ? undefined : normalized.enabled,
  };
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return Array.from(
    new Set(
      input
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    )
  );
}

function normalizeWeight(input: unknown): number {
  const value = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(value) || value < 0) {
    return 1;
  }
  return Math.min(value, 100);
}

function toApiRecord(row: {
  id: string;
  name: string;
  positiveKeywords: unknown;
  negativeKeywords: unknown;
  filePathPositivePatterns: unknown;
  filePathNegativePatterns: unknown;
  weightPositive: number;
  weightNegative: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): DecisionKeywordPolicyRecord {
  return {
    id: row.id,
    name: row.name,
    positive_keywords: normalizeStringArray(row.positiveKeywords),
    negative_keywords: normalizeStringArray(row.negativeKeywords),
    file_path_positive_patterns: normalizeStringArray(row.filePathPositivePatterns),
    file_path_negative_patterns: normalizeStringArray(row.filePathNegativePatterns),
    weight_positive: row.weightPositive,
    weight_negative: row.weightNegative,
    enabled: row.enabled,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function matchGlob(pattern: string, input: string): boolean {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  const regex = new RegExp(`^${escaped}$`, 'i');
  return regex.test(input);
}

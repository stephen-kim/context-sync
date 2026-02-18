import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRulesSummaryText,
  selectRulesWithinBudget,
  summarizeGlobalRulesHandler,
} from './global-rules-helpers.js';

function makeRule(overrides: Partial<{
  id: string;
  title: string;
  content: string;
  category: 'policy' | 'security' | 'style' | 'process' | 'other';
  priority: number;
  severity: 'low' | 'medium' | 'high';
  pinned: boolean;
  enabled: boolean;
  tags: string[];
  usageCount: number;
  updatedAt: Date;
}> = {}) {
  return {
    id: overrides.id || 'rule-1',
    title: overrides.title || 'Default Rule',
    content: overrides.content || 'Always keep code deterministic and observable.',
    category: overrides.category || 'policy',
    priority: overrides.priority ?? 3,
    severity: overrides.severity || 'medium',
    pinned: overrides.pinned ?? false,
    enabled: overrides.enabled ?? true,
    tags: overrides.tags || [],
    usageCount: overrides.usageCount ?? 0,
    updatedAt: overrides.updatedAt || new Date('2026-02-19T00:00:00.000Z'),
  };
}

test('selection keeps pinned and high-severity rules under budget', () => {
  const rules = [
    makeRule({ id: 'pinned', pinned: true, severity: 'medium' }),
    makeRule({ id: 'high', severity: 'high', content: 'High severity rule content.' }),
    makeRule({ id: 'normal', priority: 1, content: 'Normal rule content.' }),
  ];

  const result = selectRulesWithinBudget({
    rules,
    budgetTokens: 300,
    selectionMode: 'score',
    recommendMax: 5,
    warnThreshold: 10,
    summaryEnabled: true,
    summaryMinCount: 8,
    scope: 'workspace',
  });

  const ids = result.selected.map((item) => item.id);
  assert.ok(ids.includes('pinned'));
  assert.ok(ids.includes('high'));
  assert.equal(result.usedSummary, false);
});

test('selection falls back to summary warning when budget is tight', () => {
  const longText = 'x'.repeat(1200);
  const rules = [
    makeRule({ id: 'pinned-a', pinned: true, content: longText }),
    makeRule({ id: 'pinned-b', pinned: true, content: longText }),
    makeRule({ id: 'high-a', severity: 'high', content: longText }),
    makeRule({ id: 'high-b', severity: 'high', content: longText }),
    makeRule({ id: 'normal-a', content: longText }),
    makeRule({ id: 'normal-b', content: longText }),
    makeRule({ id: 'normal-c', content: longText }),
    makeRule({ id: 'normal-d', content: longText }),
  ];

  const result = selectRulesWithinBudget({
    rules,
    budgetTokens: 300,
    selectionMode: 'score',
    recommendMax: 5,
    warnThreshold: 10,
    summaryEnabled: true,
    summaryMinCount: 8,
    scope: 'workspace',
  });

  assert.equal(result.usedSummary, true);
  assert.ok(result.warnings.some((warning) => warning.message.includes('high-severity')));
});

test('selection warnings follow recommend/warn thresholds', () => {
  const sixRules = Array.from({ length: 6 }, (_, index) =>
    makeRule({ id: `info-${index + 1}`, title: `Info Rule ${index + 1}` })
  );
  const infoResult = selectRulesWithinBudget({
    rules: sixRules,
    budgetTokens: 2000,
    selectionMode: 'recent',
    recommendMax: 5,
    warnThreshold: 10,
    summaryEnabled: true,
    summaryMinCount: 8,
    scope: 'workspace',
  });
  assert.ok(infoResult.warnings.some((warning) => warning.level === 'info'));
  assert.equal(infoResult.warnings.some((warning) => warning.level === 'warn'), false);

  const rules = Array.from({ length: 10 }, (_, index) =>
    makeRule({ id: `r-${index + 1}`, title: `Rule ${index + 1}` })
  );

  const result = selectRulesWithinBudget({
    rules,
    budgetTokens: 2000,
    selectionMode: 'recent',
    recommendMax: 5,
    warnThreshold: 10,
    summaryEnabled: true,
    summaryMinCount: 8,
    scope: 'workspace',
  });

  assert.ok(result.warnings.some((warning) => warning.level === 'info'));
  assert.ok(result.warnings.some((warning) => warning.level === 'warn'));
});

test('summary builder outputs structured lines', () => {
  const summary = buildRulesSummaryText({
    scope: 'workspace',
    rules: [
      {
        title: 'Secure API keys',
        content: 'Never store plain API keys in logs or persistent storage.',
        category: 'security',
        severity: 'high',
        priority: 1,
        pinned: true,
      },
    ],
  });

  assert.ok(summary.includes('Workspace Global Rules Summary'));
  assert.ok(summary.includes('Secure API keys'));
  assert.ok(summary.includes('[security|high|p1|pinned]'));
});

test('routing prefers commit/policy rule for "commit policy" query', () => {
  const rules = [
    makeRule({
      id: 'security',
      title: 'Security baseline',
      content: 'Always rotate credentials and protect secrets.',
      tags: ['security', 'secrets'],
    }),
    makeRule({
      id: 'commit-policy',
      title: 'Commit policy',
      content: 'Every commit message should include impact and rollback notes.',
      tags: ['commit', 'policy'],
      priority: 2,
    }),
    makeRule({
      id: 'naming',
      title: 'Naming style',
      content: 'Use kebab-case filenames for backend modules.',
      tags: ['style', 'naming'],
    }),
  ];

  const result = selectRulesWithinBudget({
    rules,
    budgetTokens: 500,
    selectionMode: 'score',
    recommendMax: 5,
    warnThreshold: 10,
    summaryEnabled: true,
    summaryMinCount: 8,
    scope: 'workspace',
    routing: {
      enabled: true,
      mode: 'hybrid',
      query: 'commit policy',
      topK: 2,
      minScore: 0.2,
    },
  });

  assert.ok(result.selected.some((item) => item.id === 'commit-policy'));
  assert.ok(
    result.selected.find((item) => item.id === 'commit-policy')?.selected_reason.includes('routing_')
  );
});

test('routing prefers security rule for "security audit" query', () => {
  const rules = [
    makeRule({
      id: 'commit',
      title: 'Commit format',
      content: 'Use imperative present tense for commit subject.',
      tags: ['commit', 'style'],
    }),
    makeRule({
      id: 'security-audit',
      title: 'Security audit process',
      content: 'Run security audit and dependency checks before release.',
      tags: ['security', 'audit'],
      priority: 1,
    }),
  ];

  const result = selectRulesWithinBudget({
    rules,
    budgetTokens: 400,
    selectionMode: 'score',
    recommendMax: 5,
    warnThreshold: 10,
    summaryEnabled: true,
    summaryMinCount: 8,
    scope: 'workspace',
    routing: {
      enabled: true,
      mode: 'hybrid',
      query: 'security audit',
      topK: 1,
      minScore: 0.2,
    },
  });

  assert.equal(result.selected[0]?.id, 'security-audit');
});

test('routing top_k limit is respected', () => {
  const rules = [
    makeRule({ id: 'r1', title: 'Commit policy', tags: ['commit', 'policy'], priority: 1 }),
    makeRule({ id: 'r2', title: 'Commit standards', tags: ['commit', 'standards'], priority: 2 }),
    makeRule({ id: 'r3', title: 'Commit lint', tags: ['commit', 'lint'], priority: 3 }),
  ];

  const result = selectRulesWithinBudget({
    rules,
    budgetTokens: 120,
    selectionMode: 'score',
    recommendMax: 5,
    warnThreshold: 10,
    summaryEnabled: true,
    summaryMinCount: 8,
    scope: 'workspace',
    routing: {
      enabled: true,
      mode: 'keyword',
      query: 'commit',
      topK: 1,
      minScore: 0.1,
    },
  });

  const routed = result.selected.filter((rule) => rule.selected_reason === 'routing_keyword');
  assert.ok(routed.length <= 1);
});

test('routing falls back to default selection when query is empty', () => {
  const rules = [
    makeRule({ id: 'pinned', pinned: true, title: 'Always include' }),
    makeRule({ id: 'normal', title: 'General engineering guideline', priority: 2 }),
  ];

  const result = selectRulesWithinBudget({
    rules,
    budgetTokens: 250,
    selectionMode: 'recent',
    recommendMax: 5,
    warnThreshold: 10,
    summaryEnabled: true,
    summaryMinCount: 8,
    scope: 'workspace',
    routing: {
      enabled: true,
      mode: 'hybrid',
      query: '',
      topK: 5,
      minScore: 0.2,
    },
  });

  assert.ok(result.selected.some((item) => item.id === 'pinned'));
  assert.equal(result.routing, undefined);
});

test('summarize handler supports preview and replace modes', async () => {
  const summaries = new Map<string, { id: string; summary: string; updatedAt: Date }>();
  const audits: Array<{ action: string }> = [];
  const now = new Date('2026-02-18T10:00:00.000Z');

  const prisma = {
    globalRule: {
      findMany: async () => [
        {
          id: 'rule-a',
          title: 'Require secure API key storage',
          content: 'Store only hash values for API keys and redact logs.',
          category: 'security',
          severity: 'high',
          priority: 1,
          pinned: true,
        },
      ],
    },
    globalRuleSummary: {
      findFirst: async () => (summaries.get('workspace') ? { id: summaries.get('workspace')!.id } : null),
      create: async (args: { data: { summary: string } }) => {
        const row = { id: 'summary-1', summary: args.data.summary, updatedAt: now };
        summaries.set('workspace', row);
        return row;
      },
      update: async (args: { where: { id: string }; data: { summary: string } }) => {
        const row = { id: args.where.id, summary: args.data.summary, updatedAt: now };
        summaries.set('workspace', row);
        return row;
      },
    },
  } as any;

  const auth = {
    user: {
      id: 'user-1',
      email: 'admin@example.com',
      envAdmin: true,
    },
    projectAccessBypass: false,
    method: 'api_key',
  } as any;

  const deps = {
    prisma,
    getWorkspaceByKey: async () => ({ id: 'ws-1', key: 'personal' }),
    recordAudit: async (entry: { action: string }) => {
      audits.push({ action: entry.action });
    },
  };

  const preview = await summarizeGlobalRulesHandler(deps as any, {
    auth,
    workspaceKey: 'personal',
    scope: 'workspace',
    mode: 'preview',
  });
  assert.equal(preview.mode, 'preview');
  assert.ok(preview.summary.includes('Workspace Global Rules Summary'));

  const replace = await summarizeGlobalRulesHandler(deps as any, {
    auth,
    workspaceKey: 'personal',
    scope: 'workspace',
    mode: 'replace',
  });
  assert.equal(replace.mode, 'replace');
  assert.ok(replace.updated_at);
  assert.ok(audits.some((item) => item.action === 'global_rules.summarized'));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import {
  applyPersonaWeightsToRetrievalRows,
  getContextBundleHandler,
  recommendContextPersona,
} from './context-bundle-helpers.js';

test('applyPersonaWeightsToRetrievalRows changes ranking order based on persona weights', () => {
  const rows = [
    {
      id: 'decision-1',
      type: 'decision',
      content: 'Decision content',
      score_breakdown: {
        final: 0.9,
      },
    },
    {
      id: 'activity-1',
      type: 'activity',
      content: 'Activity content',
      score_breakdown: {
        final: 0.8,
      },
    },
  ];

  const ranked = applyPersonaWeightsToRetrievalRows({
    rows,
    personaWeights: {
      decision: 0.8,
      activity: 2.0,
      default: 1.0,
    },
    includeDebug: true,
  });

  assert.equal(String(ranked[0].id), 'activity-1');
  assert.ok((ranked[0].persona_adjustment as Record<string, unknown>).persona_weight);
});

test('context bundle excludes closed or low-confidence active work in default mode', async () => {
  const now = new Date('2026-02-19T12:00:00.000Z');
  const prisma = {
    workspaceSettings: {
      findUnique: async () => null,
    },
    userSetting: {
      findUnique: async () => ({ contextPersona: 'reviewer' }),
    },
    activeWork: {
      findMany: async () => [
        {
          id: 'aw-1',
          title: 'Stabilize permission sync',
          confidence: 0.92,
          status: 'confirmed',
          stale: false,
          staleReason: null,
          lastEvidenceAt: now,
          lastUpdatedAt: now,
          closedAt: null,
          evidenceIds: ['evt-1'],
        },
        {
          id: 'aw-2',
          title: 'Low confidence candidate',
          confidence: 0.12,
          status: 'inferred',
          stale: false,
          staleReason: null,
          lastEvidenceAt: now,
          lastUpdatedAt: now,
          closedAt: null,
          evidenceIds: ['evt-2'],
        },
        {
          id: 'aw-3',
          title: 'Closed candidate',
          confidence: 0.95,
          status: 'closed',
          stale: true,
          staleReason: 'closed',
          lastEvidenceAt: now,
          lastUpdatedAt: now,
          closedAt: now,
          evidenceIds: ['evt-3'],
        },
      ],
    },
    rawEvent: {
      findMany: async () => [],
    },
    memory: {
      findMany: async () => [],
    },
  } as unknown as PrismaClient;

  const bundle = await getContextBundleHandler(
    {
      prisma,
      getWorkspaceByKey: async () => ({ id: 'ws-1', key: 'acme', name: 'Acme' }),
      getProjectByKeys: async () => ({ id: 'prj-1', key: 'github:acme/claustrum', name: 'Claustrum', workspaceId: 'ws-1' }),
      listMemories: async ({ query }) => {
        if (query.type === 'summary') {
          return [
            {
              id: 'sum-1',
              type: 'summary',
              content: 'Project summary content',
              createdAt: now,
            },
          ];
        }
        return [];
      },
    },
    {
      auth: {
        user: {
          id: 'user-1',
          email: 'admin@example.com',
          source: 'database',
        },
        authMethod: 'session',
        mustChangePassword: false,
        projectAccessBypass: true,
      },
      workspaceKey: 'acme',
      projectKey: 'github:acme/claustrum',
      mode: 'default',
    }
  );

  assert.equal(bundle.snapshot.active_work.length, 1);
  assert.equal(bundle.snapshot.active_work[0].id, 'aw-1');
});

test('recommendContextPersona returns reviewer for security-oriented query', () => {
  const recommendation = recommendContextPersona({
    query: 'review security permissions and audit risks',
    allowContextFallback: false,
  });
  assert.equal(recommendation.recommended, 'reviewer');
  assert.ok(recommendation.confidence >= 0.45);
  assert.ok(recommendation.reasons.some((reason) => reason.toLowerCase().includes('security')));
});

test('debug bundle includes persona recommendation and token budget allocations', async () => {
  const now = new Date('2026-02-19T12:00:00.000Z');
  const prisma = {
    workspaceSettings: {
      findUnique: async () => null,
    },
    userSetting: {
      findUnique: async () => ({ contextPersona: 'neutral' }),
    },
    activeWork: {
      findMany: async () => [],
    },
    rawEvent: {
      findMany: async () => [],
    },
    memory: {
      findMany: async () => [],
    },
  } as unknown as PrismaClient;

  const bundle = await getContextBundleHandler(
    {
      prisma,
      getWorkspaceByKey: async () => ({ id: 'ws-1', key: 'acme', name: 'Acme' }),
      getProjectByKeys: async () => ({ id: 'prj-1', key: 'github:acme/claustrum', name: 'Claustrum', workspaceId: 'ws-1' }),
      listMemories: async ({ query }) => {
        if (query.type === 'summary') {
          return [
            {
              id: 'sum-1',
              type: 'summary',
              content: 'Project summary content',
              createdAt: now,
            },
          ];
        }
        return [];
      },
    },
    {
      auth: {
        user: {
          id: 'user-1',
          email: 'admin@example.com',
          source: 'database',
        },
        authMethod: 'session',
        mustChangePassword: false,
        projectAccessBypass: true,
      },
      workspaceKey: 'acme',
      projectKey: 'github:acme/claustrum',
      q: 'security audit checklist',
      mode: 'debug',
      budget: 2000,
    }
  );

  assert.ok(bundle.debug);
  assert.equal(bundle.debug?.token_budget.total, 2000);
  assert.ok(bundle.debug?.token_budget.allocations.retrieval);
  assert.ok(bundle.debug?.persona_recommended);
});

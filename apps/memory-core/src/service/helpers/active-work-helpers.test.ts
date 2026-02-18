import assert from 'node:assert/strict';
import test from 'node:test';
import { inferActiveWorkCandidates } from './active-work-helpers.js';

test('inferActiveWorkCandidates builds prioritized active work from raw events and draft decisions', () => {
  const now = new Date('2026-02-19T12:00:00.000Z');
  const candidates = inferActiveWorkCandidates({
    now,
    rawEvents: [
      {
        id: 'evt-1',
        createdAt: new Date('2026-02-19T11:00:00.000Z'),
        branch: 'feature/context-bundle',
        commitMessage: 'refactor context bundle ranking',
        changedFiles: ['apps/memory-core/src/service/helpers/context-bundle-helpers.ts'],
      },
      {
        id: 'evt-2',
        createdAt: new Date('2026-02-19T10:00:00.000Z'),
        branch: 'feature/context-bundle',
        commitMessage: 'add active work scoring',
        changedFiles: ['apps/memory-core/src/service/helpers/active-work-helpers.ts'],
      },
    ],
    memories: [
      {
        id: 'mem-1',
        type: 'decision',
        status: 'draft',
        content: 'Summary: Use hybrid ranking in context bundle.',
        createdAt: new Date('2026-02-18T12:00:00.000Z'),
        updatedAt: new Date('2026-02-19T09:30:00.000Z'),
      },
    ],
    maxItems: 5,
  });

  assert.ok(candidates.length > 0);
  assert.ok(candidates[0].score > 0);
  assert.ok(candidates[0].confidence > 0);
  assert.ok(candidates.some((candidate) => candidate.evidence_ids.includes('evt-1')));
});

test('inferActiveWorkCandidates returns empty array when there is no useful signal', () => {
  const candidates = inferActiveWorkCandidates({
    now: new Date('2026-02-19T12:00:00.000Z'),
    rawEvents: [],
    memories: [],
  });

  assert.deepEqual(candidates, []);
});

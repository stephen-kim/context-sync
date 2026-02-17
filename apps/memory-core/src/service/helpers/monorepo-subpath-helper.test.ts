import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySubpathBoost,
  extractSubpathFromMetadata,
  prioritizeRowsBySubpath,
} from './monorepo-subpath-helper.js';

test('extractSubpathFromMetadata reads normalized subpath', () => {
  assert.equal(extractSubpathFromMetadata({ subpath: 'Apps/Admin-UI/' }), 'apps/admin-ui');
  assert.equal(extractSubpathFromMetadata({}), null);
});

test('applySubpathBoost multiplies score only for matching subpath', () => {
  const boosted = applySubpathBoost({
    baseScore: 2,
    metadata: { subpath: 'apps/memory-core' },
    currentSubpath: 'apps/memory-core',
    enabled: true,
    weight: 1.5,
  });
  assert.equal(boosted, 3);

  const unchanged = applySubpathBoost({
    baseScore: 2,
    metadata: { subpath: 'apps/admin-ui' },
    currentSubpath: 'apps/memory-core',
    enabled: true,
    weight: 1.5,
  });
  assert.equal(unchanged, 2);
});

test('prioritizeRowsBySubpath places current subpath rows first', () => {
  const now = new Date('2026-02-17T10:00:00.000Z');
  const rows = [
    {
      id: 'older-match',
      metadata: { subpath: 'apps/admin-ui' },
      createdAt: new Date('2026-02-17T09:00:00.000Z'),
    },
    {
      id: 'newer-other',
      metadata: { subpath: 'apps/memory-core' },
      createdAt: now,
    },
  ];
  const prioritized = prioritizeRowsBySubpath(rows, 'apps/admin-ui', true);
  assert.equal(prioritized[0]?.id, 'older-match');
  assert.equal(prioritized[1]?.id, 'newer-other');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachSubpathMetadata,
  resolveProjectKeyByContextMode,
  shouldUseCurrentSubpathBoost,
} from './monorepo-context-mode.js';

test('shared_repo keeps repo key and split_on_demand uses repo#subpath key', () => {
  const repoKey = 'github:org/repo';
  const splitKeyA = 'github:org/repo#apps/a';
  const splitKeyB = 'github:org/repo#apps/b';

  assert.equal(
    resolveProjectKeyByContextMode({
      mode: 'shared_repo',
      repoProjectKey: repoKey,
      splitProjectKey: splitKeyA,
    }),
    repoKey
  );

  assert.equal(
    resolveProjectKeyByContextMode({
      mode: 'split_on_demand',
      repoProjectKey: repoKey,
      splitProjectKey: splitKeyA,
    }),
    splitKeyA
  );

  assert.notEqual(splitKeyA, splitKeyB);
});

test('shared_repo can attach metadata.subpath when enabled', () => {
  const metadata = attachSubpathMetadata({
    mode: 'shared_repo',
    metadata: { source: 'mcp' },
    subpath: 'apps/admin-ui',
    enabled: true,
  });
  assert.equal(metadata?.subpath, 'apps/admin-ui');
});

test('shared_repo current_subpath boost applies only when enabled', () => {
  assert.equal(
    shouldUseCurrentSubpathBoost({
      mode: 'shared_repo',
      enabled: true,
      currentSubpath: 'apps/memory-core',
    }),
    true
  );
  assert.equal(
    shouldUseCurrentSubpathBoost({
      mode: 'split_auto',
      enabled: true,
      currentSubpath: 'apps/memory-core',
    }),
    false
  );
});

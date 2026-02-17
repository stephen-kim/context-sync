import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMonorepoSubpath } from './workspace-resolution-monorepo.js';

test('resolveMonorepoSubpath sanitizes candidate and extracts workspace root', () => {
  const subpath = resolveMonorepoSubpath(
    {
      workspace_key: 'team',
      relative_path: 'Apps/Memory Core/src/routes',
      monorepo: {
        enabled: true,
        candidate_subpaths: ['Apps/Memory Core'],
      },
    },
    {
      monorepoMode: 'repo_hash_subpath',
      monorepoWorkspaceGlobs: ['apps/*', 'packages/*'],
      monorepoExcludeGlobs: ['**/node_modules/**', '**/dist/**'],
      monorepoMaxDepth: 3,
    }
  );
  assert.equal(subpath, 'apps/memory-core');
});

test('resolveMonorepoSubpath excludes blocked directories', () => {
  const subpath = resolveMonorepoSubpath(
    {
      workspace_key: 'team',
      relative_path: 'apps/memory-core/node_modules/something',
      monorepo: {
        enabled: true,
        candidate_subpaths: ['apps/memory-core/node_modules'],
      },
    },
    {
      monorepoMode: 'repo_hash_subpath',
      monorepoWorkspaceGlobs: ['apps/*'],
      monorepoExcludeGlobs: ['**/node_modules/**', '**/dist/**'],
      monorepoMaxDepth: 4,
    }
  );
  assert.equal(subpath, null);
});

test('resolveMonorepoSubpath enforces max depth', () => {
  const subpath = resolveMonorepoSubpath(
    {
      workspace_key: 'team',
      relative_path: 'apps/memory-core/deeper/path',
      monorepo: {
        enabled: true,
        candidate_subpaths: ['apps/memory-core/deeper'],
      },
    },
    {
      monorepoMode: 'repo_hash_subpath',
      monorepoWorkspaceGlobs: ['apps/*/*'],
      monorepoExcludeGlobs: ['**/node_modules/**'],
      monorepoMaxDepth: 2,
    }
  );
  assert.equal(subpath, null);
});

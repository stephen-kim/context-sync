import assert from 'node:assert/strict';
import test from 'node:test';
import { rawSearchHandler } from './helpers/import-raw-query-helpers.js';
import { AuthorizationError } from './errors.js';

function buildDeps(projectRole: 'WRITER' | 'READER') {
  const audits: Array<Record<string, unknown>> = [];
  const deps = {
    prisma: {
      workspaceSettings: {
        findUnique: async () => ({ rawAccessMinRole: 'WRITER' }),
      },
      workspaceMember: {
        findUnique: async () => ({ role: 'MEMBER' }),
      },
      projectMember: {
        findUnique: async () => ({ role: projectRole }),
      },
      rawMessage: {
        findMany: async () => [
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'this message includes migration decision details',
            createdAt: new Date('2026-02-17T00:00:00.000Z'),
            rawSession: {
              id: 'session-1',
              source: 'codex',
              sourceSessionId: 'session-a',
              project: { key: 'github:owner/repo' },
            },
          },
        ],
      },
    },
    getWorkspaceByKey: async () => ({ id: 'w1', key: 'default' }),
    getProjectByKeys: async () => ({ id: 'p1', key: 'github:owner/repo', workspaceId: 'w1' }),
    getImportRecordById: async () => {
      throw new Error('not used');
    },
    updateMemoryEmbedding: async () => {
      throw new Error('not used');
    },
    recordAudit: async (entry: Record<string, unknown>) => {
      audits.push(entry);
    },
  };
  return { deps, audits };
}

test('raw.search allows writer and writes audit log', async () => {
  const { deps, audits } = buildDeps('WRITER');
  const result = await rawSearchHandler(deps as never, {
    auth: {
      user: { id: 'u1', email: 'u1@example.com', source: 'database', envAdmin: false },
      projectAccessBypass: false,
      authMethod: 'api_key',
      mustChangePassword: false,
    },
    workspaceKey: 'default',
    projectKey: 'github:owner/repo',
    q: 'migration',
    limit: 10,
    maxChars: 300,
  });

  assert.equal(result.matches.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'raw.search');
});

test('raw.search denies reader when raw_access_min_role is writer', async () => {
  const { deps, audits } = buildDeps('READER');
  await assert.rejects(
    () =>
      rawSearchHandler(deps as never, {
        auth: {
          user: { id: 'u1', email: 'u1@example.com', source: 'database', envAdmin: false },
          projectAccessBypass: false,
          authMethod: 'api_key',
          mustChangePassword: false,
        },
        workspaceKey: 'default',
        projectKey: 'github:owner/repo',
        q: 'migration',
      }),
    AuthorizationError
  );
  assert.equal(audits.length, 0);
});

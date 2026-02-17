import assert from 'node:assert/strict';
import test from 'node:test';
import { assertProjectAccess } from './access-control.js';
import { AuthorizationError } from './errors.js';

function makePrisma(projectRole: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER') {
  return {
    workspaceMember: {
      findUnique: async () => ({ role: 'MEMBER' }),
    },
    projectMember: {
      findUnique: async () => ({ role: projectRole }),
    },
  };
}

test('reader cannot write', async () => {
  const prisma = makePrisma('READER');
  await assert.rejects(
    () =>
      assertProjectAccess(
        prisma as never,
        {
          user: { id: 'u1', email: 'u1@example.com', source: 'database', envAdmin: false },
          projectAccessBypass: false,
          authMethod: 'api_key',
          mustChangePassword: false,
        },
        'w1',
        'p1',
        'WRITER'
      ),
    AuthorizationError
  );
});

test('writer can create memory', async () => {
  const prisma = makePrisma('WRITER');
  await assert.doesNotReject(() =>
    assertProjectAccess(
      prisma as never,
      {
        user: { id: 'u1', email: 'u1@example.com', source: 'database', envAdmin: false },
        projectAccessBypass: false,
        authMethod: 'api_key',
        mustChangePassword: false,
      },
      'w1',
      'p1',
      'WRITER'
    )
  );
});

test('maintainer can confirm decision', async () => {
  const prisma = makePrisma('MAINTAINER');
  await assert.doesNotReject(() =>
    assertProjectAccess(
      prisma as never,
      {
        user: { id: 'u1', email: 'u1@example.com', source: 'database', envAdmin: false },
        projectAccessBypass: false,
        authMethod: 'api_key',
        mustChangePassword: false,
      },
      'w1',
      'p1',
      'MAINTAINER'
    )
  );
});

test('workspace admin override grants project access without project membership', async () => {
  const prisma = {
    workspaceMember: {
      findUnique: async () => ({ role: 'ADMIN' }),
    },
    projectMember: {
      findUnique: async () => null,
    },
  };
  await assert.doesNotReject(() =>
    assertProjectAccess(
      prisma as never,
      {
        user: { id: 'u1', email: 'u1@example.com', source: 'database', envAdmin: false },
        projectAccessBypass: false,
        authMethod: 'api_key',
        mustChangePassword: false,
      },
      'w1',
      'p1',
      'OWNER'
    )
  );
});

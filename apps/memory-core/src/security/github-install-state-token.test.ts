import assert from 'node:assert/strict';
import test from 'node:test';
import { issueGithubInstallStateToken, verifyGithubInstallStateToken } from './github-install-state-token.js';

test('issue/verify github install state token', () => {
  const secret = 'test-secret';
  const token = issueGithubInstallStateToken({
    workspaceKey: 'acme',
    actorUserId: 'user-1',
    secret,
    nonce: 'nonce-1',
    ttlSeconds: 600,
  });

  const payload = verifyGithubInstallStateToken(token, secret);
  assert(payload);
  assert.equal(payload.workspace_key, 'acme');
  assert.equal(payload.actor_user_id, 'user-1');
  assert.equal(payload.nonce, 'nonce-1');
});

test('verify rejects invalid secret', () => {
  const token = issueGithubInstallStateToken({
    workspaceKey: 'acme',
    actorUserId: 'user-1',
    secret: 'secret-a',
  });
  const payload = verifyGithubInstallStateToken(token, 'secret-b');
  assert.equal(payload, null);
});

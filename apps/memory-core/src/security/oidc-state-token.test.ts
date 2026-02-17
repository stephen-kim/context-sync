import assert from 'node:assert/strict';
import test from 'node:test';
import { issueOidcStateToken, verifyOidcStateToken } from './oidc-state-token.js';

test('oidc state token roundtrip', () => {
  const token = issueOidcStateToken({
    workspaceKey: 'personal',
    providerId: 'provider-1',
    codeVerifier: 'verifier',
    nonce: 'nonce',
    redirectUri: 'http://localhost:8080/v1/auth/oidc/personal/callback',
    secret: 'test-secret',
    ttlSeconds: 300,
  });

  const payload = verifyOidcStateToken(token, 'test-secret');
  assert.ok(payload);
  assert.equal(payload?.workspace_key, 'personal');
  assert.equal(payload?.provider_id, 'provider-1');
  assert.equal(payload?.code_verifier, 'verifier');
});

test('oidc state token rejects invalid signature', () => {
  const token = issueOidcStateToken({
    workspaceKey: 'personal',
    providerId: 'provider-1',
    codeVerifier: 'verifier',
    nonce: 'nonce',
    redirectUri: 'http://localhost:8080/v1/auth/oidc/personal/callback',
    secret: 'secret-a',
    ttlSeconds: 300,
  });
  const payload = verifyOidcStateToken(token, 'secret-b');
  assert.equal(payload, null);
});

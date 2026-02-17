import assert from 'node:assert/strict';
import test from 'node:test';
import { issueOneTimeKeyToken, verifyOneTimeKeyToken } from './one-time-key-token.js';

test('one-time key token verifies with matching secret', () => {
  const token = issueOneTimeKeyToken({
    apiKeyId: 'api-key-1',
    apiKey: 'clst_example_plain_key',
    userId: 'user-1',
    expiresAtUnixMs: Date.now() + 60_000,
    secret: 'test-secret',
  });
  const payload = verifyOneTimeKeyToken(token, 'test-secret');
  assert.ok(payload);
  assert.equal(payload?.api_key_id, 'api-key-1');
  assert.equal(payload?.user_id, 'user-1');
  assert.equal(payload?.api_key, 'clst_example_plain_key');
});

test('one-time key token fails with wrong secret or expired payload', () => {
  const token = issueOneTimeKeyToken({
    apiKeyId: 'api-key-2',
    apiKey: 'clst_example_plain_key_2',
    userId: 'user-2',
    expiresAtUnixMs: Date.now() - 1_000,
    secret: 'test-secret',
  });
  assert.equal(verifyOneTimeKeyToken(token, 'another-secret'), null);
  assert.equal(verifyOneTimeKeyToken(token, 'test-secret'), null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import {
  parseGithubWebhookInstallationId,
  verifyGithubWebhookSignature,
} from './github-webhook-signature.js';

test('verifies GitHub webhook signature using sha256', () => {
  const payload = Buffer.from(JSON.stringify({ installation: { id: 101 } }), 'utf8');
  const secret = 'webhook-secret';
  const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

  assert.equal(
    verifyGithubWebhookSignature({
      secret,
      payloadRaw: payload,
      signatureHeader: signature,
    }),
    true
  );

  assert.equal(
    verifyGithubWebhookSignature({
      secret,
      payloadRaw: payload,
      signatureHeader: 'sha256=deadbeef',
    }),
    false
  );
});

test('extracts installation id from webhook payload', () => {
  assert.equal(parseGithubWebhookInstallationId({ installation: { id: 123 } }), BigInt(123));
  assert.equal(parseGithubWebhookInstallationId({ installation: { id: '456' } }), BigInt(456));
  assert.equal(parseGithubWebhookInstallationId({ installation: { id: 'x' } }), null);
  assert.equal(parseGithubWebhookInstallationId({}), null);
});

import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyGithubWebhookSignature(args: {
  secret?: string;
  payloadRaw: Buffer;
  signatureHeader?: string;
}): boolean {
  const secret = String(args.secret || '').trim();
  const provided = String(args.signatureHeader || '').trim();
  if (!secret || !provided.startsWith('sha256=')) {
    return false;
  }

  const expectedHex = createHmac('sha256', secret).update(args.payloadRaw).digest('hex');
  const expected = Buffer.from(`sha256=${expectedHex}`, 'utf8');
  const actual = Buffer.from(provided, 'utf8');
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

export function parseGithubWebhookInstallationId(payload: unknown): bigint | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const installation = (payload as { installation?: unknown }).installation;
  if (!installation || typeof installation !== 'object') {
    return null;
  }
  const rawId = (installation as { id?: unknown }).id;
  if (typeof rawId === 'number' && Number.isFinite(rawId) && rawId >= 0) {
    return BigInt(Math.trunc(rawId));
  }
  if (typeof rawId === 'string' && /^\d+$/.test(rawId.trim())) {
    return BigInt(rawId.trim());
  }
  return null;
}

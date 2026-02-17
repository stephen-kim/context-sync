import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'cs1';

type SessionPayload = {
  sub: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(payloadEncoded: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadEncoded).digest('base64url');
}

export function issueSessionToken(args: {
  userId: string;
  secret: string;
  ttlSeconds: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: args.userId,
    iat: now,
    exp: now + Math.max(args.ttlSeconds, 60),
  };
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadEncoded, args.secret);
  return `${TOKEN_PREFIX}.${payloadEncoded}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
    return null;
  }
  const payloadEncoded = parts[1];
  const signature = parts[2];
  const expected = sign(payloadEncoded, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(payloadEncoded)) as SessionPayload;
    if (!payload.sub || !payload.exp || !payload.iat) {
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'os1';

export type OidcStatePayload = {
  workspace_key: string;
  provider_id: string;
  code_verifier: string;
  nonce: string;
  redirect_uri: string;
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

export function issueOidcStateToken(args: {
  workspaceKey: string;
  providerId: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  secret: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(Math.floor(args.ttlSeconds ?? 600), 60);
  const payload: OidcStatePayload = {
    workspace_key: args.workspaceKey,
    provider_id: args.providerId,
    code_verifier: args.codeVerifier,
    nonce: args.nonce,
    redirect_uri: args.redirectUri,
    iat: now,
    exp: now + ttl,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded, args.secret);
  return `${TOKEN_PREFIX}.${encoded}.${signature}`;
}

export function verifyOidcStateToken(token: string, secret: string): OidcStatePayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
    return null;
  }
  const encoded = parts[1];
  const signature = parts[2];
  const expected = sign(encoded, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as OidcStatePayload;
    if (
      !payload.workspace_key ||
      !payload.provider_id ||
      !payload.code_verifier ||
      !payload.nonce ||
      !payload.redirect_uri ||
      !payload.iat ||
      !payload.exp
    ) {
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

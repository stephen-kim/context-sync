import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'gis1';

export type GithubInstallStatePayload = {
  workspace_key: string;
  actor_user_id: string;
  nonce: string;
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

export function issueGithubInstallStateToken(args: {
  workspaceKey: string;
  actorUserId: string;
  secret: string;
  nonce?: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(Math.floor(args.ttlSeconds ?? 600), 60);
  const payload: GithubInstallStatePayload = {
    workspace_key: args.workspaceKey,
    actor_user_id: args.actorUserId,
    nonce: args.nonce || randomBytes(16).toString('base64url'),
    iat: now,
    exp: now + ttl,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded, args.secret);
  return `${TOKEN_PREFIX}.${encoded}.${signature}`;
}

export function verifyGithubInstallStateToken(
  token: string,
  secret: string
): GithubInstallStatePayload | null {
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
    const payload = JSON.parse(base64UrlDecode(encoded)) as GithubInstallStatePayload;
    if (
      !payload.workspace_key ||
      !payload.actor_user_id ||
      !payload.nonce ||
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

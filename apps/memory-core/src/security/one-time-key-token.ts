import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

type Payload = {
  api_key_id: string;
  api_key: string;
  user_id: string;
  exp: number;
};

function getSecretKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function issueOneTimeKeyToken(args: {
  apiKeyId: string;
  apiKey: string;
  userId: string;
  expiresAtUnixMs: number;
  secret: string;
}): string {
  const payload: Payload = {
    api_key_id: args.apiKeyId,
    api_key: args.apiKey,
    user_id: args.userId,
    exp: args.expiresAtUnixMs,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getSecretKey(args.secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `otk1.${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
}

export function verifyOneTimeKeyToken(token: string, secret: string): Payload | null {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'otk1') {
    return null;
  }
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const ciphertext = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', getSecretKey(secret), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const payload = JSON.parse(decrypted) as Payload;
    if (!payload.api_key_id || !payload.api_key || !payload.user_id || !payload.exp) {
      return null;
    }
    if (Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

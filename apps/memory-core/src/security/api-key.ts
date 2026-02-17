import { randomBytes, createHash, createHmac } from 'node:crypto';

export function hashApiKey(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function legacyHashApiKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashOneTimeToken(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function generateApiKey(): string {
  return `clst_${randomBytes(36).toString('base64url')}`;
}

export function generateInvitationToken(): string {
  return `inv_${randomBytes(32).toString('base64url')}`;
}

export function maskApiKey(value: string): string {
  if (value.length <= 10) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

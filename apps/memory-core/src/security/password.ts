import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function generateBootstrapPassword(): string {
  // 36 chars base64url-equivalent entropy from 27 bytes.
  return randomBytes(27).toString('base64url');
}

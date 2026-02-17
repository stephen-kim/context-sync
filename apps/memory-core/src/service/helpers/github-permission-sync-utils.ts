import { ValidationError } from '../errors.js';

export type GithubPermissionLevel = 'admin' | 'maintain' | 'write' | 'triage' | 'read';
export type CanonicalProjectRole = 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER';
export type GithubRoleMapping = Record<string, 'owner' | 'maintainer' | 'writer' | 'reader'>;

const DEFAULT_GITHUB_ROLE_MAPPING: GithubRoleMapping = {
  admin: 'maintainer',
  maintain: 'maintainer',
  write: 'writer',
  triage: 'reader',
  read: 'reader',
};

export function normalizeGithubLogin(input: string): string {
  return String(input || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

export function normalizeGithubRoleMapping(input: unknown): GithubRoleMapping {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...DEFAULT_GITHUB_ROLE_MAPPING };
  }
  const out: GithubRoleMapping = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = String(rawKey || '').trim().toLowerCase();
    const value = String(rawValue || '').trim().toLowerCase();
    if (!key) {
      continue;
    }
    if (value === 'owner' || value === 'maintainer' || value === 'writer' || value === 'reader') {
      out[key] = value;
    }
  }
  if (Object.keys(out).length === 0) {
    return { ...DEFAULT_GITHUB_ROLE_MAPPING };
  }
  return out;
}

export function mapGithubPermissionToProjectRole(
  permission: GithubPermissionLevel,
  roleMapping: GithubRoleMapping
): CanonicalProjectRole {
  const mapped = roleMapping[permission] || DEFAULT_GITHUB_ROLE_MAPPING[permission] || 'reader';
  if (mapped === 'owner') {
    return 'OWNER';
  }
  if (mapped === 'maintainer') {
    return 'MAINTAINER';
  }
  if (mapped === 'writer') {
    return 'WRITER';
  }
  return 'READER';
}

export function compareRoleRank(left: CanonicalProjectRole, right: CanonicalProjectRole): number {
  const rank = (role: CanonicalProjectRole): number => {
    if (role === 'OWNER') {
      return 4;
    }
    if (role === 'MAINTAINER') {
      return 3;
    }
    if (role === 'WRITER') {
      return 2;
    }
    return 1;
  };
  return rank(left) - rank(right);
}

export function deriveCollaboratorPermission(collaborator: {
  role_name?: string;
  permission?: string;
  permissions?: Record<string, boolean>;
}): GithubPermissionLevel | null {
  const roleName = String(collaborator.role_name || '').trim().toLowerCase();
  if (isGithubPermissionLevel(roleName)) {
    return roleName;
  }
  const directPermission = String(collaborator.permission || '').trim().toLowerCase();
  if (isGithubPermissionLevel(directPermission)) {
    return directPermission;
  }
  const permissions = collaborator.permissions || {};
  if (permissions.admin) {
    return 'admin';
  }
  if (permissions.maintain) {
    return 'maintain';
  }
  if (permissions.push) {
    return 'write';
  }
  if (permissions.triage) {
    return 'triage';
  }
  if (permissions.pull) {
    return 'read';
  }
  return null;
}

export function normalizeGithubPermission(value: unknown): GithubPermissionLevel | null {
  const normalized = String(value || '').trim().toLowerCase();
  return isGithubPermissionLevel(normalized) ? normalized : null;
}

export function compareGithubPermission(
  left: GithubPermissionLevel,
  right: GithubPermissionLevel
): number {
  return permissionRank(left) - permissionRank(right);
}

export function maxGithubPermission(
  left: GithubPermissionLevel,
  right: GithubPermissionLevel
): GithubPermissionLevel {
  return compareGithubPermission(left, right) >= 0 ? left : right;
}

function isGithubPermissionLevel(value: string): value is GithubPermissionLevel {
  return (
    value === 'admin' ||
    value === 'maintain' ||
    value === 'write' ||
    value === 'triage' ||
    value === 'read'
  );
}

function permissionRank(value: GithubPermissionLevel): number {
  if (value === 'admin') {
    return 5;
  }
  if (value === 'maintain') {
    return 4;
  }
  if (value === 'write') {
    return 3;
  }
  if (value === 'triage') {
    return 2;
  }
  return 1;
}

export function parseOwnerRepo(fullName: string): { owner: string; repo: string } | null {
  const normalized = String(fullName || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const parts = normalized.split('/');
  if (parts.length !== 2) {
    return null;
  }
  const [owner, repo] = parts.map((item) => item.trim());
  if (!owner || !repo) {
    return null;
  }
  return { owner, repo };
}

export function isProtectedRoleChange(
  userId: string,
  currentRole: CanonicalProjectRole,
  protectedUsers: Set<string>
): boolean {
  if (protectedUsers.has(userId)) {
    return true;
  }
  if (currentRole === 'OWNER') {
    return true;
  }
  return false;
}

export function requireGithubAppConfig(config: {
  githubAppId?: string;
  githubAppPrivateKey?: string;
}): {
  appId: string;
  privateKey: string;
} {
  const appId = String(config.githubAppId || '').trim();
  const privateKey = String(config.githubAppPrivateKey || '').trim();
  if (!appId || !privateKey) {
    throw new ValidationError('GitHub App credentials are missing. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.');
  }
  return { appId, privateKey };
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

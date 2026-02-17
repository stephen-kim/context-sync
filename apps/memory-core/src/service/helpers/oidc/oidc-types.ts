import type {
  OidcClaimGroupsFormat,
  OidcGroupMappingRole,
  OidcGroupMappingTargetType,
  PrismaClient,
  ProjectRole,
  WorkspaceRole,
} from '@prisma/client';
import type { AuthContext } from '../../../auth.js';
import { ValidationError } from '../../errors.js';

export type OidcSecurityConfig = {
  oneTimeTokenSecret: string;
  publicBaseUrl?: string;
};

export type OidcBaseDeps = {
  prisma: PrismaClient;
  securityConfig: OidcSecurityConfig;
  getWorkspaceByKey: (workspaceKey: string) => Promise<{ id: string; key: string; name?: string }>;
  recordAudit: (args: {
    workspaceId: string;
    projectId?: string;
    workspaceKey?: string;
    actorUserId: string;
    actorUserEmail?: string;
    action: string;
    target: Record<string, unknown>;
  }) => Promise<void>;
};

export type OidcAdminDeps = OidcBaseDeps & {
  auth: AuthContext;
};

export type OidcDiscoveryDocument = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
};

export type OidcIdentityClaims = {
  issuer: string;
  subject: string;
  email?: string;
  name?: string;
  groups: string[];
};

export function chooseHigherWorkspaceRole(
  current: WorkspaceRole | null,
  candidate: WorkspaceRole
): WorkspaceRole {
  const rank: Record<WorkspaceRole, number> = {
    MEMBER: 1,
    ADMIN: 2,
    OWNER: 3,
  };
  if (!current) {
    return candidate;
  }
  return rank[candidate] > rank[current] ? candidate : current;
}

export function chooseHigherProjectRole(current: ProjectRole | null, candidate: ProjectRole): ProjectRole {
  const rank: Record<ProjectRole, number> = {
    READER: 1,
    WRITER: 2,
    MEMBER: 2,
    MAINTAINER: 3,
    ADMIN: 3,
    OWNER: 4,
  };
  if (!current) {
    return candidate;
  }
  return rank[candidate] > rank[current] ? candidate : current;
}

export function toWorkspaceRole(role: OidcGroupMappingRole): WorkspaceRole {
  if (role === 'OWNER') {
    return 'OWNER';
  }
  if (role === 'ADMIN') {
    return 'ADMIN';
  }
  if (role === 'MEMBER') {
    return 'MEMBER';
  }
  throw new ValidationError('workspace target only supports roles owner|admin|member');
}

export function toProjectRole(role: OidcGroupMappingRole): ProjectRole {
  if (role === 'OWNER') {
    return 'OWNER';
  }
  if (role === 'MAINTAINER') {
    return 'MAINTAINER';
  }
  if (role === 'WRITER') {
    return 'WRITER';
  }
  if (role === 'READER') {
    return 'READER';
  }
  throw new ValidationError('project target only supports roles owner|maintainer|writer|reader');
}

export function assertGroupMappingRole(
  targetType: OidcGroupMappingTargetType,
  role: OidcGroupMappingRole
) {
  if (targetType === 'workspace') {
    toWorkspaceRole(role);
    return;
  }
  toProjectRole(role);
}

export function extractStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return [raw.trim()];
  }
  return [];
}

export function extractGroupsFromPayload(
  payload: Record<string, unknown>,
  claimName: string,
  claimFormat: OidcClaimGroupsFormat
): string[] {
  const direct = extractStringArray(payload[claimName]);
  if (direct.length > 0) {
    return Array.from(new Set(direct));
  }

  const groups = payload.groups;
  if (!Array.isArray(groups)) {
    return [];
  }
  const values = groups
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (entry && typeof entry === 'object') {
        const key = claimFormat === 'id' ? 'id' : 'name';
        const value = (entry as Record<string, unknown>)[key];
        return typeof value === 'string' ? value : '';
      }
      return '';
    })
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

export function normalizeIssuer(input: string): string {
  return input.trim().replace(/\/+$/, '');
}

export function nowIso(): string {
  return new Date().toISOString();
}

import {
  WorkspaceRole,
  type GithubTeamMappingRole,
  type GithubTeamMappingTargetType,
  type PrismaClient,
} from '@prisma/client';
import type { AuthContext } from '../../auth.js';
import { ValidationError } from '../errors.js';
import {
  issueGithubAppJwt,
  issueInstallationAccessToken,
  listTeamMembers,
  type GithubTeamMember,
} from './github/github-api-client.js';
import type { CanonicalProjectRole } from './github-permission-sync-utils.js';

export type DbLike = PrismaClient;

export type RecordAuditFn = (args: {
  workspaceId: string;
  projectId?: string;
  workspaceKey?: string;
  actorUserId: string;
  actorUserEmail?: string;
  action: string;
  target: Record<string, unknown>;
}) => Promise<void>;

export type GithubTeamMappingDeps = {
  prisma: DbLike;
  securityConfig: {
    githubAppId?: string;
    githubAppPrivateKey?: string;
  };
  githubApiClient?: {
    issueGithubAppJwt?: typeof issueGithubAppJwt;
    issueInstallationAccessToken?: typeof issueInstallationAccessToken;
    listTeamMembers?: typeof listTeamMembers;
  };
  getWorkspaceByKey: (workspaceKey: string) => Promise<{ id: string; key: string }>;
  recordAudit: RecordAuditFn;
};

export type GithubTeamMappingInput = {
  providerInstallationId?: string | null;
  githubTeamId: string;
  githubTeamSlug: string;
  githubOrgLogin: string;
  targetType: 'workspace' | 'project';
  targetKey: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'MAINTAINER' | 'WRITER' | 'READER';
  enabled?: boolean;
  priority?: number;
};

export async function normalizeMappingInput(
  prisma: PrismaClient,
  workspaceId: string,
  input: GithubTeamMappingInput
): Promise<{
  providerInstallationId: bigint | null;
  githubTeamId: bigint;
  githubTeamSlug: string;
  githubOrgLogin: string;
  targetType: GithubTeamMappingTargetType;
  targetKey: string;
  role: GithubTeamMappingRole;
  enabled: boolean;
  priority: number;
}> {
  const githubTeamId = parseBigIntStrict(input.githubTeamId, 'github_team_id');
  const githubTeamSlug = normalizeSlug(input.githubTeamSlug, 'github_team_slug');
  const githubOrgLogin = normalizeSlug(input.githubOrgLogin, 'github_org_login');
  const targetType: GithubTeamMappingTargetType =
    input.targetType === 'project' ? 'project' : 'workspace';
  const targetKey = String(input.targetKey || '').trim();
  if (!targetKey) {
    throw new ValidationError('target_key is required.');
  }

  const role = input.role as GithubTeamMappingRole;
  if (targetType === 'workspace' && !isWorkspaceRoleForTeamMapping(role)) {
    throw new ValidationError('Workspace mappings require role OWNER/ADMIN/MEMBER.');
  }
  if (targetType === 'project' && !isProjectRoleForTeamMapping(role)) {
    throw new ValidationError('Project mappings require role OWNER/MAINTAINER/WRITER/READER.');
  }

  if (targetType === 'project') {
    const project = await prisma.project.findUnique({
      where: {
        workspaceId_key: {
          workspaceId,
          key: targetKey,
        },
      },
      select: { id: true },
    });
    if (!project) {
      throw new ValidationError('Project target_key does not exist in workspace.');
    }
  }

  const providerInstallationId =
    input.providerInstallationId === null ||
    input.providerInstallationId === undefined ||
    String(input.providerInstallationId).trim() === ''
      ? null
      : parseBigIntStrict(String(input.providerInstallationId), 'provider_installation_id');

  const priority = Math.min(Math.max(Math.trunc(input.priority ?? 100), 0), 100000);
  return {
    providerInstallationId,
    githubTeamId,
    githubTeamSlug,
    githubOrgLogin,
    targetType,
    targetKey,
    role,
    enabled: input.enabled ?? true,
    priority,
  };
}

export function parseBigIntStrict(value: string, fieldName: string): bigint {
  const normalized = String(value || '').trim();
  if (!/^\d+$/.test(normalized)) {
    throw new ValidationError(`${fieldName} must be a numeric string.`);
  }
  return BigInt(normalized);
}

export function normalizeSlug(value: string, fieldName: string): string {
  const normalized = String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  if (!normalized) {
    throw new ValidationError(`${fieldName} is required.`);
  }
  return normalized;
}

export function compareWorkspaceRoleRank(left: WorkspaceRole, right: WorkspaceRole): number {
  const rank = (role: WorkspaceRole): number => {
    if (role === 'OWNER') {
      return 3;
    }
    if (role === 'ADMIN') {
      return 2;
    }
    return 1;
  };
  return rank(left) - rank(right);
}

export function isWorkspaceRoleForTeamMapping(
  role: GithubTeamMappingRole
): role is 'OWNER' | 'ADMIN' | 'MEMBER' {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MEMBER';
}

export function isProjectRoleForTeamMapping(
  role: GithubTeamMappingRole
): role is 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER' {
  return role === 'OWNER' || role === 'MAINTAINER' || role === 'WRITER' || role === 'READER';
}

export function teamMappingRoleToWorkspaceRole(role: GithubTeamMappingRole): WorkspaceRole | null {
  if (!isWorkspaceRoleForTeamMapping(role)) {
    return null;
  }
  return role;
}

export function teamMappingRoleToProjectRole(role: GithubTeamMappingRole): CanonicalProjectRole | null {
  if (!isProjectRoleForTeamMapping(role)) {
    return null;
  }
  return role;
}

export async function callIssueGithubAppJwt(
  deps: GithubTeamMappingDeps,
  appId: string,
  privateKey: string
): Promise<string> {
  if (deps.githubApiClient?.issueGithubAppJwt) {
    return deps.githubApiClient.issueGithubAppJwt(appId, privateKey);
  }
  return issueGithubAppJwt(appId, privateKey);
}

export async function callIssueInstallationAccessToken(
  deps: GithubTeamMappingDeps,
  appJwt: string,
  installationId: bigint
): Promise<string> {
  if (deps.githubApiClient?.issueInstallationAccessToken) {
    return deps.githubApiClient.issueInstallationAccessToken(appJwt, installationId);
  }
  return issueInstallationAccessToken(appJwt, installationId);
}

export async function callListTeamMembers(
  deps: GithubTeamMappingDeps,
  installationToken: string,
  orgLogin: string,
  teamSlug: string
): Promise<GithubTeamMember[]> {
  if (deps.githubApiClient?.listTeamMembers) {
    return deps.githubApiClient.listTeamMembers(installationToken, orgLogin, teamSlug);
  }
  return listTeamMembers(installationToken, orgLogin, teamSlug);
}

export function systemWebhookAuthContext(): AuthContext {
  return {
    user: {
      id: 'system:github-webhook',
      email: 'github-webhook@local',
      source: 'env',
      envAdmin: true,
    },
    projectAccessBypass: true,
    authMethod: 'env_admin',
    mustChangePassword: false,
  };
}

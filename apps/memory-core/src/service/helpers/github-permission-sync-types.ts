import type { PrismaClient } from '@prisma/client';
import {
  getGithubUserByLogin,
  issueGithubAppJwt,
  issueInstallationAccessToken,
  listRepositoryCollaboratorsWithPermissions,
  listRepositoryTeams,
  listTeamMembers,
} from './github/github-api-client.js';

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

export type SyncRepo = {
  id: string;
  workspaceId: string;
  githubRepoId: bigint;
  fullName: string;
  isActive: boolean;
  linkedProjectId: string | null;
  linkedProject: { id: string; key: string; name: string } | null;
};

export type GithubPermissionSyncDeps = {
  prisma: DbLike;
  securityConfig: {
    githubAppId?: string;
    githubAppPrivateKey?: string;
  };
  githubApiClient?: {
    issueGithubAppJwt?: typeof issueGithubAppJwt;
    issueInstallationAccessToken?: typeof issueInstallationAccessToken;
    listRepositoryCollaboratorsWithPermissions?: typeof listRepositoryCollaboratorsWithPermissions;
    listRepositoryTeams?: typeof listRepositoryTeams;
    listTeamMembers?: typeof listTeamMembers;
    getGithubUserByLogin?: typeof getGithubUserByLogin;
  };
  getWorkspaceByKey: (workspaceKey: string) => Promise<{ id: string; key: string }>;
  recordAudit: RecordAuditFn;
};

export type ComputedRepoPermission = {
  github_user_id: string;
  github_login: string | null;
  permission: 'admin' | 'maintain' | 'write' | 'triage' | 'read';
};

import type { PrismaClient } from '@prisma/client';
import type { GithubIntegrationDeps } from './github-integration-helpers.js';

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

export type GithubWebhookDeps = {
  prisma: DbLike;
  securityConfig: {
    githubAppWebhookSecret?: string;
    githubAppId?: string;
    githubAppPrivateKey?: string;
    githubStateSecret: string;
  };
  githubApiClient?: GithubIntegrationDeps['githubApiClient'];
  getWorkspaceByKey: (workspaceKey: string) => Promise<{ id: string; key: string }>;
  recordAudit: RecordAuditFn;
  syncGithubRepos?: (workspaceKey: string, repos?: string[]) => Promise<void>;
  syncGithubPermissions?: (args: {
    workspaceKey: string;
    repos?: string[];
    mode?: 'add_only' | 'add_and_remove';
    correlationId?: string;
  }) => Promise<unknown>;
  applyGithubTeamMappings?: (args: {
    workspaceId: string;
    workspaceKey: string;
    installationId: bigint;
    eventType: string;
    correlationId?: string;
    actorUserId: string;
    actorUserEmail?: string;
  }) => Promise<unknown>;
};

export type ParsedQueuedWebhookRow = {
  id: string;
  workspaceId: string | null;
  installationId: bigint;
  eventType: string;
  deliveryId: string;
  payload: unknown;
};

export type WorkspaceRef = {
  id: string;
  key: string;
};

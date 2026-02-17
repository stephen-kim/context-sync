import { IntegrationProvider, Prisma, type PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../auth.js';
import { assertWorkspaceAccess, assertWorkspaceAdmin } from '../access-control.js';
import { AuthorizationError, ValidationError } from '../errors.js';
import { diffFields, normalizeReason } from '../audit-utils.js';
import {
  normalizeIntegrationConfig,
  toIntegrationProvider,
  toIntegrationSummary,
  toJsonObject,
} from '../integration-utils.js';
import { getEnvAuditReasonerConfigAsJson, hasEnvAuditReasonerPreference, type AuditReasonerEnvConfig } from '../audit-reasoner-config.js';

type Workspace = { id: string; key: string };

type IntegrationDeps = {
  prisma: PrismaClient;
  notionClient?: unknown;
  jiraClient?: unknown;
  confluenceClient?: unknown;
  linearClient?: unknown;
  notionWriteEnabled: boolean;
  auditSlackEnabled: boolean;
  auditReasonerEnvConfig: AuditReasonerEnvConfig;
  getWorkspaceByKey: (workspaceKey: string) => Promise<Workspace>;
  getNotionClientForWorkspace: (workspaceId: string) => Promise<{ client: any; writeEnabled: boolean }>;
  getJiraClientForWorkspace: (workspaceId: string) => Promise<any>;
  getConfluenceClientForWorkspace: (workspaceId: string) => Promise<any>;
  getLinearClientForWorkspace: (workspaceId: string) => Promise<any>;
  isIntegrationLocked: (provider: IntegrationProvider) => boolean;
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


export async function notionSearchHandler(
  deps: IntegrationDeps,
  args: { auth: AuthContext; workspaceKey: string; query: string; limit?: number }
) {
  const q = args.query.trim();
  if (!q) {
    throw new ValidationError('q is required');
  }
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);
  const notionConfig = await deps.getNotionClientForWorkspace(workspace.id);
  const limit = Math.min(Math.max(args.limit || 10, 1), 20);
  const pages = await notionConfig.client.searchPages(q, limit);

  await deps.recordAudit({
    workspaceId: workspace.id,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'notion.search',
    target: {
      query: q,
      limit,
      page_ids: pages.map((page: any) => page.id),
    },
  });

  return { pages };
}

export async function notionReadHandler(
  deps: IntegrationDeps,
  args: { auth: AuthContext; workspaceKey: string; pageId: string; maxChars?: number }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);
  const notionConfig = await deps.getNotionClientForWorkspace(workspace.id);
  const maxChars = Math.min(Math.max(args.maxChars || 4000, 200), 20000);
  const page = await notionConfig.client.readPage(args.pageId, maxChars);

  await deps.recordAudit({
    workspaceId: workspace.id,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'notion.read',
    target: {
      page_id: page.id,
      max_chars: maxChars,
    },
  });

  return page;
}

export async function jiraSearchHandler(
  deps: IntegrationDeps,
  args: { auth: AuthContext; workspaceKey: string; query: string; limit?: number }
) {
  const q = args.query.trim();
  if (!q) {
    throw new ValidationError('q is required');
  }
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);
  const jira = await deps.getJiraClientForWorkspace(workspace.id);
  const limit = Math.min(Math.max(args.limit || 10, 1), 20);
  const issues = await jira.searchIssues(q, limit);

  await deps.recordAudit({
    workspaceId: workspace.id,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'jira.search',
    target: {
      query: q,
      limit,
      issue_keys: issues.map((issue: any) => issue.key),
    },
  });

  return { issues };
}

export async function jiraReadHandler(
  deps: IntegrationDeps,
  args: { auth: AuthContext; workspaceKey: string; issueKey: string; maxChars?: number }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);
  const jira = await deps.getJiraClientForWorkspace(workspace.id);
  const maxChars = Math.min(Math.max(args.maxChars || 4000, 200), 20000);
  const issue = await jira.readIssue(args.issueKey, maxChars);

  await deps.recordAudit({
    workspaceId: workspace.id,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'jira.read',
    target: {
      issue_key: issue.key,
      max_chars: maxChars,
    },
  });

  return issue;
}

export async function confluenceSearchHandler(
  deps: IntegrationDeps,
  args: { auth: AuthContext; workspaceKey: string; query: string; limit?: number }
) {
  const q = args.query.trim();
  if (!q) {
    throw new ValidationError('q is required');
  }
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);
  const confluence = await deps.getConfluenceClientForWorkspace(workspace.id);
  const limit = Math.min(Math.max(args.limit || 10, 1), 20);
  const pages = await confluence.searchPages(q, limit);

  await deps.recordAudit({
    workspaceId: workspace.id,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'confluence.search',
    target: {
      query: q,
      limit,
      page_ids: pages.map((page: any) => page.id),
    },
  });

  return { pages };
}

export async function confluenceReadHandler(
  deps: IntegrationDeps,
  args: { auth: AuthContext; workspaceKey: string; pageId: string; maxChars?: number }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);
  const confluence = await deps.getConfluenceClientForWorkspace(workspace.id);
  const maxChars = Math.min(Math.max(args.maxChars || 4000, 200), 20000);
  const page = await confluence.readPage(args.pageId, maxChars);

  await deps.recordAudit({
    workspaceId: workspace.id,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'confluence.read',
    target: {
      page_id: page.id,
      max_chars: maxChars,
    },
  });

  return page;
}

export async function linearSearchHandler(
  deps: IntegrationDeps,
  args: { auth: AuthContext; workspaceKey: string; query: string; limit?: number }
) {
  const q = args.query.trim();
  if (!q) {
    throw new ValidationError('q is required');
  }
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);
  const linear = await deps.getLinearClientForWorkspace(workspace.id);
  const limit = Math.min(Math.max(args.limit || 10, 1), 20);
  const issues = await linear.searchIssues(q, limit);

  await deps.recordAudit({
    workspaceId: workspace.id,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'linear.search',
    target: {
      query: q,
      limit,
      issue_ids: issues.map((issue: any) => issue.id),
      issue_keys: issues.map((issue: any) => issue.identifier),
    },
  });

  return { issues };
}

export async function linearReadHandler(
  deps: IntegrationDeps,
  args: { auth: AuthContext; workspaceKey: string; issueKey: string; maxChars?: number }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);
  const linear = await deps.getLinearClientForWorkspace(workspace.id);
  const maxChars = Math.min(Math.max(args.maxChars || 4000, 200), 20000);
  const issue = await linear.readIssue(args.issueKey, maxChars);

  await deps.recordAudit({
    workspaceId: workspace.id,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'linear.read',
    target: {
      issue_id: issue.id,
      issue_key: issue.identifier,
      max_chars: maxChars,
    },
  });

  return issue;
}


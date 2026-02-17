import {
  IntegrationProvider,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';
import { NotionClientAdapter } from '../../integrations/notion-client.js';
import { JiraClientAdapter } from '../../integrations/jira-client.js';
import { ConfluenceClientAdapter } from '../../integrations/confluence-client.js';
import { LinearClientAdapter } from '../../integrations/linear-client.js';
import { ValidationError } from '../errors.js';
import {
  getConfigBoolean,
  getConfigString,
  toJsonObject,
} from '../integration-utils.js';
import {
  buildGitAutoWriteContent,
  buildGitAutoWriteTitle,
  shouldAutoWriteForGitEvent,
} from '../git-autowrite-utils.js';

type DbClient = PrismaClient | Prisma.TransactionClient;

type RecordAuditLike = (args: {
  workspaceId: string;
  workspaceKey?: string;
  actorUserId: string;
  actorUserEmail?: string;
  action: string;
  target: Record<string, unknown>;
}) => Promise<void>;

export function splitProjectKey(projectKey: string): {
  repoKey: string;
  subprojectKey: string | null;
} {
  const hashIndex = projectKey.indexOf('#');
  if (hashIndex > 0 && hashIndex < projectKey.length - 1) {
    return {
      repoKey: projectKey.slice(0, hashIndex),
      subprojectKey: projectKey.slice(hashIndex + 1),
    };
  }

  const schemeIndex = projectKey.indexOf(':');
  const secondColon = schemeIndex >= 0 ? projectKey.indexOf(':', schemeIndex + 1) : -1;
  if (secondColon > 0 && secondColon < projectKey.length - 1) {
    return {
      repoKey: projectKey.slice(0, secondColon),
      subprojectKey: projectKey.slice(secondColon + 1),
    };
  }

  return {
    repoKey: projectKey,
    subprojectKey: null,
  };
}

export async function getWorkspaceIntegrationRecord(args: {
  prisma: DbClient;
  workspaceId: string;
  provider: IntegrationProvider;
  integrationLockedProviders: ReadonlySet<IntegrationProvider>;
}) {
  if (args.integrationLockedProviders.has(args.provider)) {
    return null;
  }
  return args.prisma.workspaceIntegration.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId: args.workspaceId,
        provider: args.provider,
      },
    },
  });
}

export function getNotionClient(args: { notionClient?: NotionClientAdapter }): NotionClientAdapter {
  if (!args.notionClient) {
    throw new ValidationError(
      'Notion integration is not configured. Set MEMORY_CORE_NOTION_TOKEN to enable.'
    );
  }
  return args.notionClient;
}

export function getJiraClient(args: { jiraClient?: JiraClientAdapter }): JiraClientAdapter {
  if (!args.jiraClient) {
    throw new ValidationError(
      'Jira integration is not configured. Set MEMORY_CORE_JIRA_BASE_URL, MEMORY_CORE_JIRA_EMAIL, and MEMORY_CORE_JIRA_API_TOKEN.'
    );
  }
  return args.jiraClient;
}

export function getConfluenceClient(args: {
  confluenceClient?: ConfluenceClientAdapter;
}): ConfluenceClientAdapter {
  if (!args.confluenceClient) {
    throw new ValidationError(
      'Confluence integration is not configured. Set MEMORY_CORE_CONFLUENCE_BASE_URL, MEMORY_CORE_CONFLUENCE_EMAIL, and MEMORY_CORE_CONFLUENCE_API_TOKEN.'
    );
  }
  return args.confluenceClient;
}

export function getLinearClient(args: { linearClient?: LinearClientAdapter }): LinearClientAdapter {
  if (!args.linearClient) {
    throw new ValidationError(
      'Linear integration is not configured. Set MEMORY_CORE_LINEAR_API_KEY (and optionally MEMORY_CORE_LINEAR_API_URL).'
    );
  }
  return args.linearClient;
}

export async function getJiraClientForWorkspace(args: {
  prisma: DbClient;
  workspaceId: string;
  jiraClient?: JiraClientAdapter;
  integrationLockedProviders: ReadonlySet<IntegrationProvider>;
}): Promise<JiraClientAdapter> {
  const row = await getWorkspaceIntegrationRecord({
    prisma: args.prisma,
    workspaceId: args.workspaceId,
    provider: IntegrationProvider.jira,
    integrationLockedProviders: args.integrationLockedProviders,
  });
  if (row) {
    if (!row.isEnabled) {
      throw new ValidationError('Jira integration is disabled for this workspace.');
    }
    const config = toJsonObject(row.config);
    const baseUrl = getConfigString(config, 'base_url');
    const email = getConfigString(config, 'email');
    const token = getConfigString(config, 'api_token');
    if (baseUrl && email && token) {
      return new JiraClientAdapter(baseUrl, email, token);
    }
  }
  return getJiraClient({ jiraClient: args.jiraClient });
}

export async function getNotionClientForWorkspace(args: {
  prisma: DbClient;
  workspaceId: string;
  notionClient?: NotionClientAdapter;
  notionWriteEnabled: boolean;
  integrationLockedProviders: ReadonlySet<IntegrationProvider>;
}): Promise<{ client: NotionClientAdapter; writeEnabled: boolean }> {
  const row = await getWorkspaceIntegrationRecord({
    prisma: args.prisma,
    workspaceId: args.workspaceId,
    provider: IntegrationProvider.notion,
    integrationLockedProviders: args.integrationLockedProviders,
  });
  if (row) {
    if (!row.isEnabled) {
      throw new ValidationError('Notion integration is disabled for this workspace.');
    }
    const config = toJsonObject(row.config);
    const token = getConfigString(config, 'token');
    const parentPageId = getConfigString(config, 'default_parent_page_id');
    const writeEnabled = getConfigBoolean(config, 'write_enabled') ?? args.notionWriteEnabled;
    if (token) {
      return {
        client: new NotionClientAdapter(token, parentPageId),
        writeEnabled,
      };
    }
    if (args.notionClient) {
      return {
        client: args.notionClient,
        writeEnabled,
      };
    }
    throw new ValidationError(
      'Notion workspace integration is missing token. Set notion token in Admin UI or MEMORY_CORE_NOTION_TOKEN.'
    );
  }
  return {
    client: getNotionClient({ notionClient: args.notionClient }),
    writeEnabled: args.notionWriteEnabled,
  };
}

export async function getConfluenceClientForWorkspace(args: {
  prisma: DbClient;
  workspaceId: string;
  confluenceClient?: ConfluenceClientAdapter;
  integrationLockedProviders: ReadonlySet<IntegrationProvider>;
}): Promise<ConfluenceClientAdapter> {
  const row = await getWorkspaceIntegrationRecord({
    prisma: args.prisma,
    workspaceId: args.workspaceId,
    provider: IntegrationProvider.confluence,
    integrationLockedProviders: args.integrationLockedProviders,
  });
  if (row) {
    if (!row.isEnabled) {
      throw new ValidationError('Confluence integration is disabled for this workspace.');
    }
    const config = toJsonObject(row.config);
    const baseUrl = getConfigString(config, 'base_url');
    const email = getConfigString(config, 'email');
    const token = getConfigString(config, 'api_token');
    if (baseUrl && email && token) {
      return new ConfluenceClientAdapter(baseUrl, email, token);
    }
  }
  return getConfluenceClient({ confluenceClient: args.confluenceClient });
}

export async function getLinearClientForWorkspace(args: {
  prisma: DbClient;
  workspaceId: string;
  linearClient?: LinearClientAdapter;
  integrationLockedProviders: ReadonlySet<IntegrationProvider>;
}): Promise<LinearClientAdapter> {
  const row = await getWorkspaceIntegrationRecord({
    prisma: args.prisma,
    workspaceId: args.workspaceId,
    provider: IntegrationProvider.linear,
    integrationLockedProviders: args.integrationLockedProviders,
  });
  if (row) {
    if (!row.isEnabled) {
      throw new ValidationError('Linear integration is disabled for this workspace.');
    }
    const config = toJsonObject(row.config);
    const apiKey = getConfigString(config, 'api_key');
    const apiUrl = getConfigString(config, 'api_url');
    if (apiKey) {
      return new LinearClientAdapter(apiKey, apiUrl);
    }
  }
  return getLinearClient({ linearClient: args.linearClient });
}

export async function runIntegrationAutoWrites(args: {
  prisma: PrismaClient;
  integrationLockedProviders: ReadonlySet<IntegrationProvider>;
  notionClient?: NotionClientAdapter;
  notionWriteEnabled: boolean;
  auth: { user: { id: string; email: string } };
  workspaceId: string;
  workspaceKey: string;
  projectKey: string;
  event: 'commit' | 'merge' | 'checkout';
  branch?: string;
  commitHash?: string;
  message?: string;
  metadata: Record<string, unknown>;
  recordAudit: RecordAuditLike;
}) {
  if (args.event === 'checkout') {
    return [];
  }

  const rows = await args.prisma.workspaceIntegration.findMany({
    where: {
      workspaceId: args.workspaceId,
      isEnabled: true,
      provider: {
        in: [
          IntegrationProvider.notion,
          IntegrationProvider.jira,
          IntegrationProvider.confluence,
          IntegrationProvider.linear,
        ],
      },
    },
    orderBy: [{ provider: 'asc' }],
  });

  const results: Array<{ provider: string; status: 'success' | 'skipped' | 'failed'; detail: string }> = [];

  for (const row of rows) {
    if (args.integrationLockedProviders.has(row.provider)) {
      continue;
    }
    const config = toJsonObject(row.config);
    if (!shouldAutoWriteForGitEvent(config, args.event)) {
      continue;
    }

    if (row.provider !== IntegrationProvider.notion) {
      const detail = 'auto-write is not implemented for this provider yet';
      results.push({
        provider: row.provider,
        status: 'skipped',
        detail,
      });
      await args.recordAudit({
        workspaceId: args.workspaceId,
        workspaceKey: args.workspaceKey,
        actorUserId: args.auth.user.id,
        actorUserEmail: args.auth.user.email,
        action: 'integration.autowrite',
        target: {
          workspace_key: args.workspaceKey,
          project_key: args.projectKey,
          provider: row.provider,
          trigger: args.event,
          status: 'skipped',
          detail,
        },
      });
      continue;
    }

    try {
      const notion = await getNotionClientForWorkspace({
        prisma: args.prisma,
        workspaceId: args.workspaceId,
        notionClient: args.notionClient,
        notionWriteEnabled: args.notionWriteEnabled,
        integrationLockedProviders: args.integrationLockedProviders,
      });
      if (!notion.writeEnabled) {
        const detail = 'notion write is disabled';
        results.push({
          provider: row.provider,
          status: 'skipped',
          detail,
        });
        await args.recordAudit({
          workspaceId: args.workspaceId,
          workspaceKey: args.workspaceKey,
          actorUserId: args.auth.user.id,
          actorUserEmail: args.auth.user.email,
          action: 'integration.autowrite',
          target: {
            workspace_key: args.workspaceKey,
            project_key: args.projectKey,
            provider: row.provider,
            trigger: args.event,
            status: 'skipped',
            detail,
          },
        });
        continue;
      }

      const title = buildGitAutoWriteTitle(args);
      const content = buildGitAutoWriteContent(args);
      const result = await notion.client.upsertPage({
        title,
        content,
        parentPageId: getConfigString(config, 'default_parent_page_id'),
      });
      results.push({
        provider: row.provider,
        status: 'success',
        detail: `${result.mode}:${result.id}`,
      });
      await args.recordAudit({
        workspaceId: args.workspaceId,
        workspaceKey: args.workspaceKey,
        actorUserId: args.auth.user.id,
        actorUserEmail: args.auth.user.email,
        action: 'integration.autowrite',
        target: {
          workspace_key: args.workspaceKey,
          project_key: args.projectKey,
          provider: row.provider,
          trigger: args.event,
          status: 'success',
          mode: result.mode,
          page_id: result.id,
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({
        provider: row.provider,
        status: 'failed',
        detail,
      });
      await args.recordAudit({
        workspaceId: args.workspaceId,
        workspaceKey: args.workspaceKey,
        actorUserId: args.auth.user.id,
        actorUserEmail: args.auth.user.email,
        action: 'integration.autowrite',
        target: {
          workspace_key: args.workspaceKey,
          project_key: args.projectKey,
          provider: row.provider,
          trigger: args.event,
          status: 'failed',
          error: detail,
        },
      });
    }
  }
  return results;
}

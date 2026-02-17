import { getEffectiveWorkspaceSettings } from '../workspace-resolution.js';
import { NotFoundError } from '../errors.js';
import { syncGithubReposHandler } from './github-integration-helpers.js';
import { syncGithubPermissionsHandler } from './github-permission-sync-helpers.js';
import { applyGithubTeamMappingsHandler } from './github-team-mapping-helpers.js';
import { systemWebhookAuthContext } from './github-team-mapping-shared.js';
import {
  applyRepoDebounce,
  extractRepoChangesFromInstallationEvent,
  extractRepositoryAction,
  extractRepositoryFullName,
  extractRepositoryId,
  extractTeamId,
  findRepoIdsByTeamIdFromCache,
  invalidatePermissionCache,
  invalidateRepoTeamsCache,
  invalidateTeamMembersCache,
  normalizeRepoFullName,
  type WebhookRecomputeReason,
} from './github-webhook-partial-recompute.js';
import type {
  GithubWebhookDeps,
  ParsedQueuedWebhookRow,
  WorkspaceRef,
} from './github-webhook-types.js';

type EventProcessingOutcome = {
  affectedRepoIds: bigint[];
  reason: WebhookRecomputeReason | null;
};

export async function processSingleGithubWebhookEvent(
  deps: GithubWebhookDeps,
  eventId: string
): Promise<number> {
  const row = await deps.prisma.githubWebhookEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      workspaceId: true,
      installationId: true,
      eventType: true,
      deliveryId: true,
      payload: true,
    },
  });
  if (!row) {
    throw new NotFoundError('Webhook event not found.');
  }

  if (!row.workspaceId) {
    return 0;
  }

  const workspace = await deps.prisma.workspace.findUnique({
    where: { id: row.workspaceId },
    select: { id: true, key: true },
  });
  if (!workspace) {
    return 0;
  }

  const settings = await getEffectiveWorkspaceSettings(deps.prisma, workspace.id);
  if (!settings.githubWebhookEnabled) {
    return 0;
  }

  const outcome = await processWebhookEventByType(deps, {
    row,
    workspace,
    settings,
  });

  const recomputedCount = await recomputeAffectedRepoPermissions(deps, {
    workspace,
    event: row,
    settings,
    reason: outcome.reason,
    repoIds: outcome.affectedRepoIds,
  });

  return recomputedCount;
}

async function processWebhookEventByType(
  deps: GithubWebhookDeps,
  args: {
    row: ParsedQueuedWebhookRow;
    workspace: WorkspaceRef;
    settings: Awaited<ReturnType<typeof getEffectiveWorkspaceSettings>>;
  }
): Promise<EventProcessingOutcome> {
  if (args.row.eventType === 'installation_repositories') {
    return handleInstallationRepositoriesEvent(deps, args);
  }

  if (args.row.eventType === 'repository') {
    return handleRepositoryEvent(deps, args);
  }

  if (args.row.eventType === 'team' || args.row.eventType === 'membership') {
    return handleTeamOrMembershipEvent(deps, args);
  }

  if (args.row.eventType === 'team_add' || args.row.eventType === 'team_remove') {
    return handleTeamRepoChangeEvent(deps, args, 'team_repo_change');
  }

  return {
    affectedRepoIds: [],
    reason: null,
  };
}

async function handleInstallationRepositoriesEvent(
  deps: GithubWebhookDeps,
  args: {
    row: ParsedQueuedWebhookRow;
    workspace: WorkspaceRef;
  }
): Promise<EventProcessingOutcome> {
  const changes = extractRepoChangesFromInstallationEvent(args.row.payload);

  if (changes.repoFullNames.length > 0) {
    await runWebhookRepoSync(deps, args.workspace.key, changes.repoFullNames);
  }

  if (changes.repoIds.length > 0) {
    await invalidateRepoTeamsCache({
      prisma: deps.prisma,
      workspaceId: args.workspace.id,
      repoIds: changes.repoIds,
    });
  }

  await deps.recordAudit({
    workspaceId: args.workspace.id,
    workspaceKey: args.workspace.key,
    actorUserId: 'system:github-webhook',
    actorUserEmail: 'github-webhook@local',
    action: 'github.repos.synced.webhook',
    target: {
      workspace_key: args.workspace.key,
      installation_id: args.row.installationId.toString(),
      delivery_id: args.row.deliveryId,
      event_type: args.row.eventType,
      added_repo_count: changes.addedRepoCount,
      removed_repo_count: changes.removedRepoCount,
      repos: changes.repoFullNames,
    },
  });

  return {
    affectedRepoIds: changes.repoIds,
    reason: 'installation_update',
  };
}

async function handleTeamOrMembershipEvent(
  deps: GithubWebhookDeps,
  args: {
    row: ParsedQueuedWebhookRow;
    workspace: WorkspaceRef;
    settings: Awaited<ReturnType<typeof getEffectiveWorkspaceSettings>>;
  }
): Promise<EventProcessingOutcome> {
  const teamId = extractTeamId(args.row.payload);
  let affectedRepoIds: bigint[] = [];

  if (teamId) {
    await invalidateTeamMembersCache({
      prisma: deps.prisma,
      workspaceId: args.workspace.id,
      teamIds: [teamId],
    });
    affectedRepoIds = await findRepoIdsByTeamIdFromCache({
      prisma: deps.prisma,
      workspaceId: args.workspace.id,
      teamId,
    });
  }

  if (args.settings.githubTeamMappingEnabled) {
    if (deps.applyGithubTeamMappings) {
      await deps.applyGithubTeamMappings({
        workspaceId: args.workspace.id,
        workspaceKey: args.workspace.key,
        installationId: args.row.installationId,
        eventType: args.row.eventType,
        correlationId: args.row.deliveryId,
        actorUserId: 'system:github-webhook',
        actorUserEmail: 'github-webhook@local',
      });
    } else {
      await applyGithubTeamMappingsHandler(
        {
          prisma: deps.prisma,
          securityConfig: {
            githubAppId: deps.securityConfig.githubAppId,
            githubAppPrivateKey: deps.securityConfig.githubAppPrivateKey,
          },
          githubApiClient: deps.githubApiClient,
          getWorkspaceByKey: deps.getWorkspaceByKey,
          recordAudit: deps.recordAudit,
        },
        {
          workspaceId: args.workspace.id,
          workspaceKey: args.workspace.key,
          installationId: args.row.installationId,
          eventType: args.row.eventType,
          correlationId: args.row.deliveryId,
          actorUserId: 'system:github-webhook',
          actorUserEmail: 'github-webhook@local',
        }
      );
    }
  }

  return {
    affectedRepoIds,
    reason: args.row.eventType === 'membership' ? 'membership_change' : 'team_change',
  };
}

async function handleRepositoryEvent(
  deps: GithubWebhookDeps,
  args: {
    row: ParsedQueuedWebhookRow;
    workspace: WorkspaceRef;
  }
): Promise<EventProcessingOutcome> {
  const action = extractRepositoryAction(args.row.payload);
  if (!action || action === 'renamed') {
    await handleRepositoryRenameEvent(deps, {
      workspaceId: args.workspace.id,
      workspaceKey: args.workspace.key,
      payload: args.row.payload,
      installationId: args.row.installationId,
      deliveryId: args.row.deliveryId,
    });
    return {
      affectedRepoIds: [],
      reason: null,
    };
  }

  if (action === 'team_add' || action === 'team_removed' || action === 'team_remove') {
    return handleTeamRepoChangeEvent(deps, args, 'team_repo_change');
  }

  return {
    affectedRepoIds: [],
    reason: null,
  };
}

async function handleTeamRepoChangeEvent(
  deps: GithubWebhookDeps,
  args: {
    row: ParsedQueuedWebhookRow;
    workspace: WorkspaceRef;
  },
  reason: WebhookRecomputeReason
): Promise<EventProcessingOutcome> {
  const repoId = extractRepositoryId(args.row.payload);
  const teamId = extractTeamId(args.row.payload);

  if (repoId) {
    await invalidateRepoTeamsCache({
      prisma: deps.prisma,
      workspaceId: args.workspace.id,
      repoIds: [repoId],
    });
  }
  if (teamId) {
    await invalidateTeamMembersCache({
      prisma: deps.prisma,
      workspaceId: args.workspace.id,
      teamIds: [teamId],
    });
  }

  return {
    affectedRepoIds: repoId ? [repoId] : [],
    reason,
  };
}

async function recomputeAffectedRepoPermissions(
  deps: GithubWebhookDeps,
  args: {
    workspace: WorkspaceRef;
    event: ParsedQueuedWebhookRow;
    settings: Awaited<ReturnType<typeof getEffectiveWorkspaceSettings>>;
    reason: WebhookRecomputeReason | null;
    repoIds: bigint[];
  }
): Promise<number> {
  if (!args.reason || args.repoIds.length === 0) {
    return 0;
  }
  if (!args.settings.githubPermissionSyncEnabled) {
    return 0;
  }

  const debouncedRepoIds = applyRepoDebounce({
    workspaceId: args.workspace.id,
    repoIds: args.repoIds,
  });
  if (debouncedRepoIds.length === 0) {
    return 0;
  }

  await invalidatePermissionCache({
    prisma: deps.prisma,
    workspaceId: args.workspace.id,
    repoIds: debouncedRepoIds,
  });

  const links = await deps.prisma.githubRepoLink.findMany({
    where: {
      workspaceId: args.workspace.id,
      githubRepoId: {
        in: debouncedRepoIds,
      },
      linkedProjectId: {
        not: null,
      },
    },
    select: {
      fullName: true,
    },
  });

  const repos = Array.from(
    new Set(
      links
        .map((row) => normalizeRepoFullName(row.fullName))
        .filter((value): value is string => Boolean(value))
    )
  );
  if (repos.length === 0) {
    return 0;
  }

  await runWebhookPermissionSync(deps, {
    workspaceKey: args.workspace.key,
    repos,
    mode: args.settings.githubWebhookSyncMode,
    correlationId: args.event.deliveryId,
  });

  await deps.recordAudit({
    workspaceId: args.workspace.id,
    workspaceKey: args.workspace.key,
    actorUserId: 'system:github-webhook',
    actorUserEmail: 'github-webhook@local',
    action: 'github.permissions.recomputed',
    target: {
      workspace_key: args.workspace.key,
      installation_id: args.event.installationId.toString(),
      delivery_id: args.event.deliveryId,
      event_type: args.event.eventType,
      reason: args.reason,
      repo_count: repos.length,
      repos,
      mode: args.settings.githubWebhookSyncMode,
    },
  });

  return repos.length;
}

async function runWebhookRepoSync(
  deps: GithubWebhookDeps,
  workspaceKey: string,
  repos?: string[]
): Promise<void> {
  if (deps.syncGithubRepos) {
    await deps.syncGithubRepos(workspaceKey, repos);
    return;
  }
  const auth = systemWebhookAuthContext();
  await syncGithubReposHandler(
    {
      prisma: deps.prisma,
      securityConfig: {
        githubAppId: deps.securityConfig.githubAppId,
        githubAppPrivateKey: deps.securityConfig.githubAppPrivateKey,
        githubStateSecret: deps.securityConfig.githubStateSecret,
      },
      githubApiClient: deps.githubApiClient,
      getWorkspaceByKey: deps.getWorkspaceByKey,
      recordAudit: deps.recordAudit,
    },
    {
      auth,
      workspaceKey,
      repos,
    }
  );
}

async function runWebhookPermissionSync(
  deps: GithubWebhookDeps,
  args: {
    workspaceKey: string;
    repos: string[];
    mode: 'add_only' | 'add_and_remove';
    correlationId: string;
  }
): Promise<void> {
  if (deps.syncGithubPermissions) {
    await deps.syncGithubPermissions({
      workspaceKey: args.workspaceKey,
      repos: args.repos,
      mode: args.mode,
      correlationId: args.correlationId,
    });
    return;
  }

  const auth = systemWebhookAuthContext();
  await syncGithubPermissionsHandler(
    {
      prisma: deps.prisma,
      securityConfig: {
        githubAppId: deps.securityConfig.githubAppId,
        githubAppPrivateKey: deps.securityConfig.githubAppPrivateKey,
      },
      githubApiClient: deps.githubApiClient,
      getWorkspaceByKey: deps.getWorkspaceByKey,
      recordAudit: deps.recordAudit,
    },
    {
      auth,
      workspaceKey: args.workspaceKey,
      repos: args.repos,
      modeOverride: args.mode,
      correlationId: args.correlationId,
    }
  );
}

async function handleRepositoryRenameEvent(
  deps: GithubWebhookDeps,
  args: {
    workspaceId: string;
    workspaceKey: string;
    installationId: bigint;
    deliveryId: string;
    payload: unknown;
  }
): Promise<void> {
  const action = extractRepositoryAction(args.payload);
  if (action && action !== 'renamed') {
    return;
  }

  const repoId = extractRepositoryId(args.payload);
  const fullName = extractRepositoryFullName(args.payload);
  const payloadRecord = (args.payload || {}) as Record<string, unknown>;
  const repository =
    payloadRecord.repository && typeof payloadRecord.repository === 'object'
      ? (payloadRecord.repository as Record<string, unknown>)
      : null;
  const defaultBranch = String(repository?.default_branch || '').trim();
  const privateFlag = Boolean(repository?.private);

  if (!repoId || !fullName) {
    return;
  }

  await deps.prisma.githubRepoLink.updateMany({
    where: {
      workspaceId: args.workspaceId,
      githubRepoId: repoId,
    },
    data: {
      fullName,
      defaultBranch: defaultBranch || null,
      private: privateFlag,
      isActive: true,
    },
  });

  await deps.recordAudit({
    workspaceId: args.workspaceId,
    workspaceKey: args.workspaceKey,
    actorUserId: 'system:github-webhook',
    actorUserEmail: 'github-webhook@local',
    action: 'github.repo.updated.webhook',
    target: {
      workspace_key: args.workspaceKey,
      installation_id: args.installationId.toString(),
      delivery_id: args.deliveryId,
      github_repo_id: repoId.toString(),
      full_name: fullName,
      default_branch: defaultBranch || null,
      private: privateFlag,
    },
  });
}

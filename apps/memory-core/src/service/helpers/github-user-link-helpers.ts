import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../auth.js';
import { assertWorkspaceAdmin } from '../access-control.js';
import { NotFoundError, ValidationError } from '../errors.js';
import {
  getGithubUserByLogin,
  issueGithubAppJwt,
  issueInstallationAccessToken,
} from './github/github-api-client.js';
import {
  normalizeGithubLogin,
  requireGithubAppConfig,
} from './github-permission-sync-utils.js';

type RecordAuditFn = (args: {
  workspaceId: string;
  projectId?: string;
  workspaceKey?: string;
  actorUserId: string;
  actorUserEmail?: string;
  action: string;
  target: Record<string, unknown>;
}) => Promise<void>;

type GithubUserLinkDeps = {
  prisma: PrismaClient;
  securityConfig: {
    githubAppId?: string;
    githubAppPrivateKey?: string;
  };
  githubApiClient?: {
    issueGithubAppJwt?: typeof issueGithubAppJwt;
    issueInstallationAccessToken?: typeof issueInstallationAccessToken;
    getGithubUserByLogin?: typeof getGithubUserByLogin;
  };
  getWorkspaceByKey: (workspaceKey: string) => Promise<{ id: string; key: string }>;
  recordAudit: RecordAuditFn;
};

export async function listGithubUserLinksHandler(
  deps: GithubUserLinkDeps,
  args: { auth: AuthContext; workspaceKey: string }
): Promise<{
  workspace_key: string;
  links: Array<{
    user_id: string;
    user_email: string;
    user_name: string | null;
    github_login: string;
    github_user_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
}> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  const rows = await deps.prisma.githubUserLink.findMany({
    where: { workspaceId: workspace.id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    orderBy: [{ githubLogin: 'asc' }],
  });

  return {
    workspace_key: workspace.key,
    links: rows.map((row) => ({
      user_id: row.user.id,
      user_email: row.user.email,
      user_name: row.user.name || null,
      github_login: row.githubLogin,
      github_user_id: row.githubUserId ? row.githubUserId.toString() : null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    })),
  };
}

export async function createGithubUserLinkHandler(
  deps: GithubUserLinkDeps,
  args: { auth: AuthContext; workspaceKey: string; userId: string; githubLogin: string }
): Promise<{
  workspace_key: string;
  user_id: string;
  github_login: string;
  github_user_id: string | null;
}> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  const normalizedLogin = normalizeGithubLogin(args.githubLogin);
  if (!normalizedLogin) {
    throw new ValidationError('github_login is required.');
  }

  const workspaceMember = await deps.prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: args.userId,
      },
    },
  });
  if (!workspaceMember) {
    throw new NotFoundError('User is not a workspace member.');
  }

  const existingByLogin = await deps.prisma.githubUserLink.findUnique({
    where: {
      workspaceId_githubLogin: {
        workspaceId: workspace.id,
        githubLogin: normalizedLogin,
      },
    },
    select: {
      userId: true,
    },
  });
  if (existingByLogin && existingByLogin.userId !== args.userId) {
    throw new ValidationError('github_login is already linked to another user.');
  }

  const resolvedGithubUserId = await resolveGithubUserIdForLogin(deps, workspace.id, normalizedLogin);

  const link = await deps.prisma.githubUserLink.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: args.userId,
      },
    },
    update: {
      githubLogin: normalizedLogin,
      githubUserId: resolvedGithubUserId,
    },
    create: {
      workspaceId: workspace.id,
      userId: args.userId,
      githubLogin: normalizedLogin,
      githubUserId: resolvedGithubUserId,
    },
  });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'github.user_link.created',
    target: {
      workspace_key: workspace.key,
      user_id: args.userId,
      github_login: link.githubLogin,
      github_user_id: link.githubUserId ? link.githubUserId.toString() : null,
    },
  });

  return {
    workspace_key: workspace.key,
    user_id: args.userId,
    github_login: link.githubLogin,
    github_user_id: link.githubUserId ? link.githubUserId.toString() : null,
  };
}

export async function deleteGithubUserLinkHandler(
  deps: GithubUserLinkDeps,
  args: { auth: AuthContext; workspaceKey: string; userId: string }
): Promise<{ workspace_key: string; user_id: string; deleted: true }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  const existing = await deps.prisma.githubUserLink.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: args.userId,
      },
    },
  });
  if (!existing) {
    throw new NotFoundError('GitHub user link not found.');
  }

  await deps.prisma.githubUserLink.delete({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: args.userId,
      },
    },
  });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'github.user_link.deleted',
    target: {
      workspace_key: workspace.key,
      user_id: args.userId,
      github_login: existing.githubLogin,
      github_user_id: existing.githubUserId ? existing.githubUserId.toString() : null,
    },
  });

  return {
    workspace_key: workspace.key,
    user_id: args.userId,
    deleted: true,
  };
}

async function resolveGithubUserIdForLogin(
  deps: GithubUserLinkDeps,
  workspaceId: string,
  githubLogin: string
): Promise<bigint | null> {
  const installation = await deps.prisma.githubInstallation.findUnique({
    where: {
      workspaceId,
    },
    select: {
      installationId: true,
    },
  });
  if (!installation) {
    return null;
  }
  const appConfig = requireGithubAppConfig(deps.securityConfig);
  try {
    const appJwt = await callIssueGithubAppJwt(deps, appConfig.appId, appConfig.privateKey);
    const installationToken = await callIssueInstallationAccessToken(
      deps,
      appJwt,
      installation.installationId
    );
    const user = await callGetGithubUserByLogin(deps, installationToken, githubLogin);
    if (!user) {
      return null;
    }
    return BigInt(user.id);
  } catch {
    return null;
  }
}

async function callIssueGithubAppJwt(
  deps: GithubUserLinkDeps,
  appId: string,
  privateKey: string
): Promise<string> {
  if (deps.githubApiClient?.issueGithubAppJwt) {
    return deps.githubApiClient.issueGithubAppJwt(appId, privateKey);
  }
  return issueGithubAppJwt(appId, privateKey);
}

async function callIssueInstallationAccessToken(
  deps: GithubUserLinkDeps,
  appJwt: string,
  installationId: bigint
): Promise<string> {
  if (deps.githubApiClient?.issueInstallationAccessToken) {
    return deps.githubApiClient.issueInstallationAccessToken(appJwt, installationId);
  }
  return issueInstallationAccessToken(appJwt, installationId);
}

async function callGetGithubUserByLogin(
  deps: GithubUserLinkDeps,
  installationToken: string,
  login: string
) {
  if (deps.githubApiClient?.getGithubUserByLogin) {
    return deps.githubApiClient.getGithubUserByLogin(installationToken, login);
  }
  return getGithubUserByLogin(installationToken, login);
}

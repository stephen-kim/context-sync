import {
  Prisma,
  type ProjectRole,
  type WorkspaceRole,
  type AuthContext,
  assertProjectAccess,
  assertWorkspaceAdmin,
  assertWorkspaceAccess,
  AuthenticationError,
  AuthorizationError,
  GoneError,
  NotFoundError,
  ValidationError,
  hashPassword,
  verifyPassword,
  issueSessionToken,
  generateApiKey,
  generateInvitationToken,
  hashApiKey,
  hashOneTimeToken,
  issueOneTimeKeyToken,
  verifyOneTimeKeyToken,
  type AuthInviteApiKeyDeps,
} from './auth-invite-api-key-shared.js';
import { contextPersonaSchema, type ContextPersona } from '@claustrum/shared';

export async function loginDomain(
  deps: AuthInviteApiKeyDeps,
  args: {
    email: string;
    password: string;
    sessionSecret: string;
    sessionTtlSeconds: number;
  }
): Promise<{
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    must_change_password: boolean;
    email_verified: boolean;
  };
}> {
  const email = args.email.trim().toLowerCase();
  const password = args.password.trim();
  if (!email || !password) {
    throw new AuthenticationError('email and password are required');
  }
  const user = await deps.prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      mustChangePassword: true,
      emailVerified: true,
    },
  });
  if (!user?.passwordHash) {
    throw new AuthenticationError('Invalid email or password');
  }
  const isMatch = await verifyPassword(password, user.passwordHash);
  if (!isMatch) {
    throw new AuthenticationError('Invalid email or password');
  }
  const token = issueSessionToken({
    userId: user.id,
    secret: args.sessionSecret,
    ttlSeconds: args.sessionTtlSeconds,
  });
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      must_change_password: user.mustChangePassword,
      email_verified: user.emailVerified,
    },
  };
}

export async function getAuthMeDomain(
  deps: AuthInviteApiKeyDeps,
  args: { auth: AuthContext }
): Promise<{
  user: {
    id: string;
    email: string;
    name: string | null;
    must_change_password: boolean;
    email_verified: boolean;
    context_persona: ContextPersona;
    auth_method: 'session' | 'api_key' | 'env_admin';
    active_api_key_count: number;
    needs_welcome_setup: boolean;
  };
}> {
  if (args.auth.authMethod === 'env_admin') {
    return {
      user: {
        id: args.auth.user.id,
        email: args.auth.user.email,
        name: args.auth.user.displayName ?? null,
        must_change_password: false,
        email_verified: true,
        context_persona: 'neutral',
        auth_method: 'env_admin',
        active_api_key_count: 0,
        needs_welcome_setup: false,
      },
    };
  }
  const [user, activeApiKeyCount, userSetting] = await Promise.all([
    deps.prisma.user.findUnique({
      where: { id: args.auth.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        mustChangePassword: true,
        emailVerified: true,
      },
    }),
    deps.prisma.apiKey.count({
      where: {
        userId: args.auth.user.id,
        revokedAt: null,
      },
    }),
    deps.prisma.userSetting.findUnique({
      where: { userId: args.auth.user.id },
      select: { contextPersona: true },
    }),
  ]);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      must_change_password: user.mustChangePassword,
      email_verified: user.emailVerified,
      context_persona: mapContextPersona(userSetting?.contextPersona),
      auth_method: args.auth.authMethod,
      active_api_key_count: activeApiKeyCount,
      needs_welcome_setup: !user.mustChangePassword && activeApiKeyCount < 1,
    },
  };
}

export async function getContextPersonaDomain(
  deps: AuthInviteApiKeyDeps,
  args: { auth: AuthContext }
): Promise<{ context_persona: ContextPersona }> {
  if (args.auth.authMethod === 'env_admin') {
    return { context_persona: 'neutral' };
  }
  const setting = await deps.prisma.userSetting.findUnique({
    where: { userId: args.auth.user.id },
    select: { contextPersona: true },
  });
  return { context_persona: mapContextPersona(setting?.contextPersona) };
}

export async function updateContextPersonaDomain(
  deps: AuthInviteApiKeyDeps,
  args: {
    auth: AuthContext;
    contextPersona: unknown;
  }
): Promise<{ context_persona: ContextPersona }> {
  if (args.auth.authMethod === 'env_admin') {
    throw new AuthorizationError('context persona cannot be updated with env admin credentials.');
  }

  const parsed = contextPersonaSchema.safeParse(args.contextPersona);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(', '));
  }

  const updated = await deps.prisma.userSetting.upsert({
    where: { userId: args.auth.user.id },
    update: {
      contextPersona: parsed.data,
    },
    create: {
      userId: args.auth.user.id,
      contextPersona: parsed.data,
    },
    select: { contextPersona: true },
  });

  const auditWorkspace = await deps.resolveAuditWorkspaceForUser(args.auth.user.id);
  if (auditWorkspace) {
    await deps.recordAudit({
      workspaceId: auditWorkspace.id,
      workspaceKey: auditWorkspace.key,
      actorUserId: args.auth.user.id,
      actorUserEmail: args.auth.user.email,
      action: 'user.persona.changed',
      target: {
        actor_user_id: args.auth.user.id,
        context_persona: updated.contextPersona,
      },
    });
  }

  return { context_persona: mapContextPersona(updated.contextPersona) };
}

export async function logoutDomain(): Promise<{ ok: true }> {
  return { ok: true };
}

export async function completeSetupDomain(
  deps: AuthInviteApiKeyDeps,
  args: {
    auth: AuthContext;
    newEmail: string;
    newPassword: string;
    name?: string;
  }
): Promise<{
  ok: true;
  user: {
    id: string;
    email: string;
    name: string | null;
    must_change_password: false;
    email_verified: true;
  };
}> {
  if (args.auth.authMethod !== 'session') {
    throw new AuthorizationError('complete-setup is only available for session login.');
  }
  const newEmail = args.newEmail.trim().toLowerCase();
  const newPassword = args.newPassword.trim();
  if (!newEmail) {
    throw new ValidationError('new_email is required');
  }
  if (newEmail === 'admin@example.com') {
    throw new ValidationError('new_email must be changed from admin@example.com');
  }
  if (newPassword.length < 12) {
    throw new ValidationError('new_password must be at least 12 characters');
  }
  const user = await deps.prisma.user.findUnique({
    where: { id: args.auth.user.id },
    select: {
      id: true,
      email: true,
      mustChangePassword: true,
    },
  });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  if (!user.mustChangePassword) {
    throw new ValidationError('Setup already completed');
  }
  const passwordHash = await hashPassword(newPassword);
  let updated: { id: string; email: string; name: string | null };
  try {
    updated = await deps.prisma.user.update({
      where: { id: user.id },
      data: {
        email: newEmail,
        passwordHash,
        name: args.name?.trim() || null,
        mustChangePassword: false,
        emailVerified: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ValidationError('Email is already in use');
    }
    throw error;
  }

  const workspaceMemberships = await deps.prisma.workspaceMember.findMany({
    where: { userId: updated.id },
    select: {
      workspaceId: true,
      workspace: {
        select: {
          key: true,
        },
      },
    },
  });
  let auditTargets = workspaceMemberships.map((membership) => ({
    workspaceId: membership.workspaceId,
    workspaceKey: membership.workspace.key,
  }));
  if (auditTargets.length === 0) {
    const fallbackWorkspace = await deps.prisma.workspace.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true, key: true },
    });
    if (fallbackWorkspace) {
      auditTargets = [
        {
          workspaceId: fallbackWorkspace.id,
          workspaceKey: fallbackWorkspace.key,
        },
      ];
    }
  }
  if (auditTargets.length > 0) {
    await Promise.all(
      auditTargets.map((target) =>
        deps.recordAudit({
          workspaceId: target.workspaceId,
          workspaceKey: target.workspaceKey,
          actorUserId: updated.id,
          actorUserEmail: updated.email,
          action: 'setup.completed',
          target: {
            user_id: updated.id,
            previous_email: user.email,
            new_email: updated.email,
          },
        })
      )
    );
  }

  return {
    ok: true,
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      must_change_password: false,
      email_verified: true,
    },
  };
}

export async function reportGitCaptureInstalledDomain(
  deps: AuthInviteApiKeyDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    projectKey?: string;
    metadata?: Record<string, unknown>;
    getProjectByKeys: (
      workspaceKey: string,
      projectKey: string
    ) => Promise<{ id: string; workspaceId: string }>;
  }
): Promise<{ ok: true }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id, 'MEMBER');

  let projectId: string | undefined;
  if (args.projectKey) {
    const project = await args.getProjectByKeys(args.workspaceKey, args.projectKey);
    await assertProjectAccess(deps.prisma, args.auth, workspace.id, project.id, 'READER');
    projectId = project.id;
  }

  await deps.recordAudit({
    workspaceId: workspace.id,
    projectId,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'git_capture.installed',
    target: {
      workspace_key: workspace.key,
      project_key: args.projectKey || null,
      actor_user_id: args.auth.user.id,
      metadata: args.metadata || {},
    },
  });

  return { ok: true };
}

function mapContextPersona(input: unknown): ContextPersona {
  const parsed = contextPersonaSchema.safeParse(input);
  if (!parsed.success) {
    return 'neutral';
  }
  return parsed.data;
}

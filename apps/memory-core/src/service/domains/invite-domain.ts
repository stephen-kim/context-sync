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

export async function getInviteDomain(
  deps: AuthInviteApiKeyDeps,
  args: { token: string }
): Promise<{
  workspace_key: string;
  workspace_name: string;
  email: string;
  role: WorkspaceRole;
  project_roles: Record<string, ProjectRole>;
  expires_at: string;
  used_at: string | null;
}> {
  const tokenHash = hashOneTimeToken(args.token, deps.securityConfig.oneTimeTokenSecret);
  const invite = await deps.prisma.invitationToken.findUnique({
    where: {
      tokenHash,
    },
    select: {
      id: true,
      email: true,
      role: true,
      projectRoles: true,
      expiresAt: true,
      usedAt: true,
      workspace: {
        select: {
          key: true,
          name: true,
        },
      },
    },
  });
  if (!invite) {
    throw new NotFoundError('Invite not found');
  }
  if (invite.usedAt) {
    throw new GoneError('Invite has already been used');
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    throw new GoneError('Invite has expired');
  }
  return {
    workspace_key: invite.workspace.key,
    workspace_name: invite.workspace.name,
    email: invite.email,
    role: invite.role,
    project_roles: deps.normalizeInviteProjectRoles(invite.projectRoles),
    expires_at: invite.expiresAt.toISOString(),
    used_at: null,
  };
}

export async function acceptInviteDomain(
  deps: AuthInviteApiKeyDeps,
  args: {
    token: string;
    password: string;
    name?: string;
    ip?: string;
  }
): Promise<{
  ok: true;
  workspace_key: string;
  email: string;
  role: WorkspaceRole;
}> {
  const password = args.password.trim();
  if (password.length < 12) {
    throw new ValidationError('password must be at least 12 characters');
  }

  const tokenHash = hashOneTimeToken(args.token, deps.securityConfig.oneTimeTokenSecret);
  const result = await deps.prisma.$transaction(async (tx) => {
    const invite = await tx.invitationToken.findUnique({
      where: {
        tokenHash,
      },
      select: {
        id: true,
        email: true,
        role: true,
        projectRoles: true,
        expiresAt: true,
        usedAt: true,
        workspaceId: true,
        workspace: {
          select: {
            key: true,
          },
        },
      },
    });
    if (!invite) {
      throw new NotFoundError('Invite not found');
    }
    if (invite.usedAt) {
      throw new GoneError('Invite has already been used');
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new GoneError('Invite has expired');
    }

    const email = invite.email.trim().toLowerCase();
    const existingUser = await tx.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });
    const passwordHash = await hashPassword(password);
    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            passwordHash: existingUser.passwordHash ? undefined : passwordHash,
            name: args.name?.trim() ? args.name.trim() : undefined,
            mustChangePassword: false,
            emailVerified: true,
          },
          select: {
            id: true,
            email: true,
          },
        })
      : await tx.user.create({
          data: {
            email,
            name: args.name?.trim() ? args.name.trim() : null,
            passwordHash,
            mustChangePassword: false,
            emailVerified: true,
          },
          select: {
            id: true,
            email: true,
          },
        });

    await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invite.workspaceId,
          userId: user.id,
        },
      },
      update: {
        role: invite.role,
      },
      create: {
        workspaceId: invite.workspaceId,
        userId: user.id,
        role: invite.role,
      },
    });

    const projectRoles = deps.normalizeInviteProjectRoles(invite.projectRoles);
    const projectKeys = Object.keys(projectRoles);
    if (projectKeys.length > 0) {
      const projects = await tx.project.findMany({
        where: {
          workspaceId: invite.workspaceId,
          key: {
            in: projectKeys,
          },
        },
        select: {
          id: true,
          key: true,
        },
      });
      for (const project of projects) {
        const role = projectRoles[project.key];
        if (!role) {
          continue;
        }
        await tx.projectMember.upsert({
          where: {
            projectId_userId: {
              projectId: project.id,
              userId: user.id,
            },
          },
          update: {
            role,
          },
          create: {
            projectId: project.id,
            userId: user.id,
            role,
          },
        });
      }
    }

    await tx.invitationToken.update({
      where: { id: invite.id },
      data: {
        usedAt: new Date(),
      },
    });

    return {
      userId: user.id,
      userEmail: user.email,
      workspaceId: invite.workspaceId,
      workspaceKey: invite.workspace.key,
      role: invite.role,
    };
  });

  await deps.recordAudit({
    workspaceId: result.workspaceId,
    workspaceKey: result.workspaceKey,
    actorUserId: result.userId,
    actorUserEmail: result.userEmail,
    action: 'invite.accepted',
    target: {
      actor_user_id: result.userId,
      target_user_id: result.userId,
      workspace_key: result.workspaceKey,
      role: result.role,
      ip: args.ip || null,
    },
  });

  return {
    ok: true,
    workspace_key: result.workspaceKey,
    email: result.userEmail,
    role: result.role,
  };
}

export async function createWorkspaceInviteDomain(
  deps: AuthInviteApiKeyDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    email: string;
    role: WorkspaceRole;
    projectRoles?: Record<string, ProjectRole>;
    requestBaseUrl?: string;
    ip?: string;
  }
): Promise<{ invite_url: string; expires_at: string }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  const token = generateInvitationToken();
  const tokenHash = hashOneTimeToken(token, deps.securityConfig.oneTimeTokenSecret);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const email = args.email.trim().toLowerCase();

  const invite = await deps.prisma.invitationToken.create({
    data: {
      workspaceId: workspace.id,
      email,
      role: args.role,
      projectRoles: (args.projectRoles as Prisma.InputJsonValue | undefined) ?? undefined,
      tokenHash,
      expiresAt,
      createdByUserId: args.auth.user.id,
    },
    select: {
      id: true,
    },
  });

  const baseUrl = (
    deps.securityConfig.inviteBaseUrl ||
    deps.securityConfig.publicBaseUrl ||
    args.requestBaseUrl ||
    ''
  ).replace(/\/$/, '');
  const inviteUrl = `${baseUrl}/invite/${encodeURIComponent(token)}`;

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'invite.created',
    target: {
      invite_id: invite.id,
      email,
      role: args.role,
      project_roles: args.projectRoles || {},
      actor_user_id: args.auth.user.id,
      ip: args.ip || null,
    },
  });

  return {
    invite_url: inviteUrl,
    expires_at: expiresAt.toISOString(),
  };
}


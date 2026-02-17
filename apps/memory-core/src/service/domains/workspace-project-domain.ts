import { ProjectRole, WorkspaceRole, type PrismaClient } from '@prisma/client';
import { createProjectSchema } from '@claustrum/shared';
import type { AuthContext } from '../../auth.js';
import { assertWorkspaceAccess, assertWorkspaceAdmin, isWorkspaceAdminRole } from '../access-control.js';
import { AuthorizationError, ValidationError } from '../errors.js';

type WorkspaceProjectDeps = {
  prisma: PrismaClient;
  getWorkspaceByKey: (workspaceKey: string) => Promise<{ id: string; key: string }>;
  hasGlobalAdminAccess: (auth: AuthContext) => Promise<boolean>;
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

export async function listProjectsDomain(
  deps: WorkspaceProjectDeps,
  args: { auth: AuthContext; workspaceKey: string }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  const membership = await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);
  const projectScope =
    args.auth.projectAccessBypass ||
    args.auth.user.envAdmin ||
    isWorkspaceAdminRole(membership.role)
      ? {
          workspaceId: workspace.id,
        }
      : {
          workspaceId: workspace.id,
          members: {
            some: {
              userId: args.auth.user.id,
            },
          },
        };

  const projects = await deps.prisma.project.findMany({
    where: projectScope,
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      key: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return { workspace_key: workspace.key, projects };
}

export async function createProjectDomain(
  deps: WorkspaceProjectDeps,
  args: { auth: AuthContext; input: unknown }
) {
  const parsed = createProjectSchema.safeParse(args.input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(', '));
  }

  const workspace = await deps.getWorkspaceByKey(parsed.data.workspace_key);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id, 'MEMBER');

  const project = await deps.prisma.project.upsert({
    where: {
      workspaceId_key: {
        workspaceId: workspace.id,
        key: parsed.data.key,
      },
    },
    update: {
      name: parsed.data.name,
    },
    create: {
      workspaceId: workspace.id,
      key: parsed.data.key,
      name: parsed.data.name,
    },
  });

  if (!args.auth.projectAccessBypass && !args.auth.user.envAdmin) {
    await deps.prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId: args.auth.user.id,
        },
      },
      update: { role: ProjectRole.OWNER },
      create: {
        projectId: project.id,
        userId: args.auth.user.id,
        role: ProjectRole.OWNER,
      },
    });
  }

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'project.create',
    target: {
      workspace_key: workspace.key,
      project_id: project.id,
      project_key: project.key,
      project_name: project.name,
    },
  });

  return project;
}

export async function listWorkspacesDomain(
  deps: WorkspaceProjectDeps,
  args: { auth: AuthContext }
) {
  if (await deps.hasGlobalAdminAccess(args.auth)) {
    return deps.prisma.workspace.findMany({
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  return deps.prisma.workspace.findMany({
    where: {
      members: {
        some: {
          userId: args.auth.user.id,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }],
  });
}

export async function createWorkspaceDomain(
  deps: WorkspaceProjectDeps,
  args: { auth: AuthContext; key: string; name: string }
) {
  const hasGlobalAdminAccess = await deps.hasGlobalAdminAccess(args.auth);
  if (!hasGlobalAdminAccess) {
    throw new AuthorizationError('Only platform admin can create workspaces.');
  }
  const workspace = await deps.prisma.workspace.upsert({
    where: { key: args.key },
    update: { name: args.name },
    create: { key: args.key, name: args.name },
  });
  if (!args.auth.projectAccessBypass && !args.auth.user.envAdmin) {
    await deps.prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: args.auth.user.id,
        },
      },
      update: {
        role: WorkspaceRole.OWNER,
      },
      create: {
        workspaceId: workspace.id,
        userId: args.auth.user.id,
        role: WorkspaceRole.OWNER,
      },
    });
  }
  return workspace;
}

export async function updateWorkspaceDomain(
  deps: WorkspaceProjectDeps,
  args: { auth: AuthContext; workspaceKey: string; name: string }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);
  const updated = await deps.prisma.workspace.update({
    where: { id: workspace.id },
    data: { name: args.name },
  });
  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'workspace.update',
    target: {
      workspace_key: workspace.key,
      workspace_id: workspace.id,
      name: args.name,
    },
  });
  return updated;
}

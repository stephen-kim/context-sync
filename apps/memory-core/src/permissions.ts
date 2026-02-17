import type { PrismaClient, ProjectRole, WorkspaceRole } from '@prisma/client';
import type { AuthContext } from './auth.js';

export async function requireWorkspaceMembership(args: {
  prisma: PrismaClient;
  auth: AuthContext;
  workspaceId: string;
}): Promise<{ role: WorkspaceRole } | null> {
  if (args.auth.projectAccessBypass || args.auth.user.envAdmin) {
    return { role: 'OWNER' };
  }

  const membership = await args.prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: args.workspaceId,
        userId: args.auth.user.id,
      },
    },
    select: { role: true },
  });

  return membership;
}

export function workspaceRoleAtLeast(
  current: WorkspaceRole,
  minimum: WorkspaceRole
): boolean {
  return workspaceRoleRank(current) >= workspaceRoleRank(minimum);
}

export function projectRoleAtLeast(
  current: ProjectRole,
  minimum: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER'
): boolean {
  return projectRoleRank(current) >= projectRoleRank(minimum);
}

export async function requireProjectMembership(args: {
  prisma: PrismaClient;
  auth: AuthContext;
  workspaceId: string;
  projectId: string;
}): Promise<{ role: ProjectRole; viaWorkspaceOverride: boolean } | null> {
  const workspaceMembership = await requireWorkspaceMembership({
    prisma: args.prisma,
    auth: args.auth,
    workspaceId: args.workspaceId,
  });
  if (!workspaceMembership) {
    return null;
  }
  if (
    workspaceMembership.role === 'OWNER' ||
    workspaceMembership.role === 'ADMIN'
  ) {
    return {
      role: 'OWNER',
      viaWorkspaceOverride: true,
    };
  }
  const projectMembership = await args.prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId: args.projectId,
        userId: args.auth.user.id,
      },
    },
    select: {
      role: true,
    },
  });
  if (!projectMembership) {
    return null;
  }
  return {
    role: normalizeLegacyProjectRole(projectMembership.role),
    viaWorkspaceOverride: false,
  };
}

export async function hasProjectAccess(args: {
  prisma: PrismaClient;
  auth: AuthContext;
  workspaceId: string;
  projectId: string;
}): Promise<boolean> {
  const membership = await requireProjectMembership({
    prisma: args.prisma,
    auth: args.auth,
    workspaceId: args.workspaceId,
    projectId: args.projectId,
  });
  return Boolean(membership);
}

function workspaceRoleRank(role: WorkspaceRole): number {
  if (role === 'OWNER') {
    return 3;
  }
  if (role === 'ADMIN') {
    return 2;
  }
  return 1;
}

function projectRoleRank(role: ProjectRole | 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER'): number {
  const normalized = normalizeLegacyProjectRole(role as ProjectRole);
  if (normalized === 'OWNER') {
    return 4;
  }
  if (normalized === 'MAINTAINER') {
    return 3;
  }
  if (normalized === 'WRITER') {
    return 2;
  }
  return 1;
}

export function normalizeLegacyProjectRole(role: ProjectRole): 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER' {
  if (role === 'ADMIN') {
    return 'OWNER';
  }
  if (role === 'MEMBER') {
    return 'WRITER';
  }
  if (role === 'OWNER' || role === 'MAINTAINER' || role === 'WRITER' || role === 'READER') {
    return role;
  }
  return 'READER';
}

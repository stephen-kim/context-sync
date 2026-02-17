import type { Prisma, ResolutionKind, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function getNextMappingPriority(args: {
  prisma: DbClient;
  workspaceId: string;
  kind: ResolutionKind;
}): Promise<number> {
  const row = await args.prisma.projectMapping.findFirst({
    where: {
      workspaceId: args.workspaceId,
      kind: args.kind,
    },
    orderBy: {
      priority: 'desc',
    },
    select: {
      priority: true,
    },
  });
  return row ? row.priority + 1 : 0;
}

export async function ensureProjectMapping(args: {
  prisma: DbClient;
  workspaceId: string;
  projectId: string;
  kind: ResolutionKind;
  externalId: string;
}): Promise<{ id: string }> {
  const existing = await args.prisma.projectMapping.findUnique({
    where: {
      workspaceId_kind_externalId: {
        workspaceId: args.workspaceId,
        kind: args.kind,
        externalId: args.externalId,
      },
    },
    select: {
      id: true,
    },
  });
  if (existing) {
    await args.prisma.projectMapping.update({
      where: { id: existing.id },
      data: {
        projectId: args.projectId,
        isEnabled: true,
      },
    });
    return existing;
  }

  const priority = await getNextMappingPriority({
    prisma: args.prisma,
    workspaceId: args.workspaceId,
    kind: args.kind,
  });

  const created = await args.prisma.projectMapping.create({
    data: {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      kind: args.kind,
      externalId: args.externalId,
      priority,
      isEnabled: true,
    },
    select: {
      id: true,
    },
  });
  return created;
}

export async function createProjectAndMapping(args: {
  prisma: PrismaClient;
  workspaceId: string;
  kind: ResolutionKind;
  externalId: string;
  projectKey: string;
  projectName: string;
}): Promise<{
  project: { id: string; key: string; name: string };
  mapping: { id: string };
  created: boolean;
}> {
  return args.prisma.$transaction(async (tx) => {
    const existing = await tx.project.findUnique({
      where: {
        workspaceId_key: {
          workspaceId: args.workspaceId,
          key: args.projectKey,
        },
      },
    });

    const project = await tx.project.upsert({
      where: {
        workspaceId_key: {
          workspaceId: args.workspaceId,
          key: args.projectKey,
        },
      },
      update: {
        name: args.projectName,
      },
      create: {
        workspaceId: args.workspaceId,
        key: args.projectKey,
        name: args.projectName,
      },
      select: {
        id: true,
        key: true,
        name: true,
      },
    });

    const mapping = await ensureProjectMapping({
      prisma: tx,
      workspaceId: args.workspaceId,
      projectId: project.id,
      kind: args.kind,
      externalId: args.externalId,
    });

    return {
      project,
      mapping: { id: mapping.id },
      created: !existing,
    };
  });
}

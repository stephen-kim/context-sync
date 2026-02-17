import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  ImportSource,
  ImportStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import type { AuthContext } from '../../auth.js';
import { assertProjectAccess, assertRawAccess, assertWorkspaceAccess } from '../access-control.js';
import { NotFoundError, ValidationError } from '../errors.js';
import {
  buildStagedCandidate,
  createMemorySnippet,
  getStringFromJson,
  parseSourceFile,
} from '../import-utils.js';
import { getEffectiveWorkspaceSettings } from '../workspace-resolution.js';
import { toJsonObject } from '../integration-utils.js';

type Workspace = { id: string; key: string };
type Project = { id: string; key: string; workspaceId: string };
type ImportRecord = {
  id: string;
  workspaceId: string;
  createdBy: string;
  source: ImportSource;
  status: ImportStatus;
  fileName: string;
  filePath: string | null;
  stats: Prisma.JsonValue | null;
  error: string | null;
};

export type SharedDeps = {
  prisma: PrismaClient;
  getWorkspaceByKey: (workspaceKey: string) => Promise<Workspace>;
  getProjectByKeys: (workspaceKey: string, projectKey: string) => Promise<Project>;
  getImportRecordById: (importId: string) => Promise<ImportRecord>;
  recordAudit: (args: {
    workspaceId: string;
    projectId?: string;
    workspaceKey?: string;
    actorUserId: string;
    actorUserEmail?: string;
    action: string;
    target: Record<string, unknown>;
  }) => Promise<void>;
  updateMemoryEmbedding: (memoryId: string, content: string) => Promise<void>;
};


export async function listStagedMemoriesHandler(
  deps: SharedDeps,
  args: {
    auth: AuthContext;
    importId: string;
  }
) {
  const record = await deps.getImportRecordById(args.importId);
  await assertWorkspaceAccess(deps.prisma, args.auth, record.workspaceId);
  return deps.prisma.stagedMemory.findMany({
    where: { importId: record.id },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      type: true,
      content: true,
      metadata: true,
      isSelected: true,
      project: {
        select: {
          key: true,
          name: true,
        },
      },
    },
  });
}

export async function commitImportHandler(
  deps: SharedDeps,
  args: {
    auth: AuthContext;
    importId: string;
    stagedIds?: string[];
    projectKey?: string;
  }
) {
  const record = await deps.getImportRecordById(args.importId);
  await assertWorkspaceAccess(deps.prisma, args.auth, record.workspaceId);

  let overrideProjectId: string | undefined;
  if (args.projectKey) {
    const workspace = await deps.prisma.workspace.findUnique({
      where: { id: record.workspaceId },
    });
    if (!workspace) {
      throw new NotFoundError('Workspace not found for import.');
    }
    const project = await deps.getProjectByKeys(workspace.key, args.projectKey);
    await assertProjectAccess(deps.prisma, args.auth, record.workspaceId, project.id);
    overrideProjectId = project.id;
  }

  const where: Prisma.StagedMemoryWhereInput = {
    importId: record.id,
    ...(args.stagedIds && args.stagedIds.length > 0
      ? { id: { in: args.stagedIds } }
      : { isSelected: true }),
  };
  const staged = await deps.prisma.stagedMemory.findMany({ where });
  if (staged.length === 0) {
    throw new ValidationError('No staged memories selected for commit.');
  }

  let committed = 0;
  const createdForEmbedding: Array<{ id: string; content: string }> = [];
  await deps.prisma.$transaction(async (tx) => {
    for (const candidate of staged) {
      const targetProjectId =
        overrideProjectId || candidate.projectId || getStringFromJson(record.stats, 'project_id');
      if (!targetProjectId) {
        continue;
      }
      const created = await tx.memory.create({
        data: {
          workspaceId: record.workspaceId,
          projectId: targetProjectId,
          type: candidate.type,
          content: candidate.content,
          source: 'import',
          status: 'confirmed',
          confidence: 1.0,
          evidence: {
            import_id: record.id,
            staged_memory_id: candidate.id,
          } as Prisma.InputJsonValue,
          metadata: candidate.metadata ?? undefined,
          createdBy: args.auth.user.id,
        },
        select: {
          id: true,
          content: true,
        },
      });
      createdForEmbedding.push(created);
      committed += 1;
    }

    await tx.importRecord.update({
      where: { id: record.id },
      data: {
        status: ImportStatus.committed,
        error: null,
        stats: {
          ...(record.stats as Record<string, unknown> | null),
          committed_count: committed,
        },
      },
    });
  });
  for (const item of createdForEmbedding) {
    await deps.updateMemoryEmbedding(item.id, item.content);
  }

  return {
    import_id: record.id,
    status: ImportStatus.committed,
    committed_count: committed,
  };
}

export { rawSearchHandler, viewRawMessageHandler, cleanupImportFile } from './import-raw-query-helpers.js';


import { Prisma, type PrismaClient } from '@prisma/client';
import {
  createMemorySchema,
  memorySourceSchema,
  memoryStatusSchema,
  memoryTypeSchema,
  type ListMemoriesQuery,
} from '@claustrum/shared';
import type { AuthContext } from '../../auth.js';
import { assertProjectAccess, assertWorkspaceAccess, isWorkspaceAdminRole } from '../access-control.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { getEffectiveWorkspaceSettings } from '../workspace-resolution.js';
import {
  applySubpathBoost,
  normalizeSubpathValue,
  prioritizeRowsBySubpath,
} from '../helpers/monorepo-subpath-helper.js';

type MemorySearchDeps = {
  prisma: PrismaClient;
  getWorkspaceByKey: (workspaceKey: string) => Promise<{ id: string; key: string }>;
  getProjectByKeys: (
    workspaceKey: string,
    projectKey: string
  ) => Promise<{ id: string; workspaceId: string }>;
  updateMemoryEmbedding: (memoryId: string, content: string) => Promise<void>;
  searchMemoryCandidateScores: (args: {
    workspaceId: string;
    q: string;
    projectIds: string[] | null;
    type?: string;
    status?: 'draft' | 'confirmed' | 'rejected';
    source?: 'auto' | 'human' | 'import';
    since?: string;
    confidenceMin?: number;
    confidenceMax?: number;
    limit: number;
    mode: 'keyword' | 'semantic';
  }) => Promise<Array<{ id: string; score: number }>>;
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


export async function updateMemoryDomain(
  deps: MemorySearchDeps,
  args: {
    auth: AuthContext;
    memoryId: string;
    input: {
      content?: string;
      status?: 'draft' | 'confirmed' | 'rejected';
      source?: 'auto' | 'human' | 'import';
      confidence?: number;
      metadata?: Record<string, unknown> | null;
      evidence?: Record<string, unknown> | null;
    };
  }
) {
  const existing = await deps.prisma.memory.findUnique({
    where: { id: args.memoryId },
    include: {
      project: true,
    },
  });
  if (!existing) {
    throw new NotFoundError(`Memory not found: ${args.memoryId}`);
  }
  await assertProjectAccess(deps.prisma, args.auth, existing.workspaceId, existing.projectId, 'WRITER');

  const nextContent = typeof args.input.content === 'string' ? args.input.content.trim() : existing.content;
  if (!nextContent) {
    throw new ValidationError('content cannot be empty');
  }
  const updated = await deps.prisma.memory.update({
    where: { id: existing.id },
    data: {
      content: nextContent,
      status: args.input.status ? memoryStatusSchema.parse(args.input.status) : undefined,
      source: args.input.source ? memorySourceSchema.parse(args.input.source) : undefined,
      confidence:
        typeof args.input.confidence === 'number'
          ? Math.min(Math.max(args.input.confidence, 0), 1)
          : undefined,
      metadata:
        args.input.metadata === null
          ? Prisma.DbNull
          : (args.input.metadata as Prisma.InputJsonValue | undefined),
      evidence:
        args.input.evidence === null
          ? Prisma.DbNull
          : (args.input.evidence as Prisma.InputJsonValue | undefined),
    },
    select: {
      id: true,
      type: true,
      content: true,
      status: true,
      source: true,
      confidence: true,
      evidence: true,
      metadata: true,
      createdBy: true,
      createdAt: true,
      project: {
        select: {
          key: true,
          name: true,
          workspace: {
            select: {
              key: true,
              name: true,
            },
          },
        },
      },
    },
  });
  if (updated.content !== existing.content) {
    await deps.updateMemoryEmbedding(updated.id, updated.content);
  }
  await deps.recordAudit({
    workspaceId: existing.workspaceId,
    projectId: existing.projectId,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'memory.update',
    target: {
      project_id: existing.projectId,
      memory_id: existing.id,
      updated_fields: Object.keys(args.input).filter(
        (key) => (args.input as Record<string, unknown>)[key] !== undefined
      ),
    },
  });
  return updated;
}

export async function deleteMemoryDomain(
  deps: MemorySearchDeps,
  args: { auth: AuthContext; memoryId: string }
) {
  const existing = await deps.prisma.memory.findUnique({
    where: { id: args.memoryId },
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
    },
  });
  if (!existing) {
    throw new NotFoundError(`Memory not found: ${args.memoryId}`);
  }
  await assertProjectAccess(
    deps.prisma,
    args.auth,
    existing.workspaceId,
    existing.projectId,
    'MAINTAINER'
  );
  await deps.prisma.memory.delete({
    where: { id: existing.id },
  });
  await deps.recordAudit({
    workspaceId: existing.workspaceId,
    projectId: existing.projectId,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'memory.delete',
    target: {
      memory_id: existing.id,
      project_id: existing.projectId,
    },
  });
  return { deleted: true as const, id: existing.id };
}


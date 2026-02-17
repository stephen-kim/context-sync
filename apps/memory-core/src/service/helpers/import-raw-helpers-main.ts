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


export async function createImportUploadHandler(
  deps: SharedDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    source: ImportSource;
    fileName: string;
    fileBuffer: Buffer;
    projectKey?: string;
  }
): Promise<{ import_id: string }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);

  let projectId: string | undefined;
  if (args.projectKey) {
    const project = await deps.getProjectByKeys(args.workspaceKey, args.projectKey);
    await assertProjectAccess(deps.prisma, args.auth, workspace.id, project.id);
    projectId = project.id;
  }

  const importId = randomUUID();
  const importDir = path.join(tmpdir(), 'claustrum-imports');
  await mkdir(importDir, { recursive: true });
  const safeName = args.fileName.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const filePath = path.join(importDir, `${importId}-${safeName}`);
  await writeFile(filePath, args.fileBuffer);

  const record = await deps.prisma.importRecord.create({
    data: {
      id: importId,
      workspaceId: workspace.id,
      createdBy: args.auth.user.id,
      source: args.source,
      status: ImportStatus.uploaded,
      fileName: args.fileName,
      filePath,
      stats: {
        bytes: args.fileBuffer.length,
        project_key: args.projectKey ?? null,
        project_id: projectId ?? null,
      },
    },
    select: { id: true },
  });

  return { import_id: record.id };
}

export async function listImportsHandler(
  deps: SharedDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    limit?: number;
  }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id);
  const limit = Math.min(Math.max(args.limit || 30, 1), 100);
  return deps.prisma.importRecord.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      source: true,
      status: true,
      fileName: true,
      stats: true,
      error: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function parseImportHandler(
  deps: SharedDeps,
  args: {
    auth: AuthContext;
    importId: string;
  }
) {
  const record = await deps.getImportRecordById(args.importId);
  await assertWorkspaceAccess(deps.prisma, args.auth, record.workspaceId);

  if (!record.filePath) {
    throw new ValidationError('Import file path is missing.');
  }

  let fileText = '';
  try {
    fileText = await readFile(record.filePath, 'utf8');
  } catch (error) {
    await deps.prisma.importRecord.update({
      where: { id: record.id },
      data: {
        status: ImportStatus.failed,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }

  const parsed = parseSourceFile({
    source: record.source,
    text: fileText,
    fallbackSessionId: record.id,
    fallbackTitle: record.fileName,
  });

  const projectFromStats = getStringFromJson(record.stats, 'project_id');
  const session = await deps.prisma.$transaction(async (tx) => {
    const rawSession = await tx.rawSession.upsert({
      where: {
        workspaceId_source_sourceSessionId: {
          workspaceId: record.workspaceId,
          source: record.source,
          sourceSessionId: parsed.session.sourceSessionId,
        },
      },
      update: {
        projectId: projectFromStats || null,
        title: parsed.session.title,
        startedAt: parsed.session.startedAt,
        endedAt: parsed.session.endedAt,
        metadata: parsed.session.metadata as Prisma.InputJsonValue,
        createdBy: record.createdBy,
        importId: record.id,
      },
      create: {
        workspaceId: record.workspaceId,
        projectId: projectFromStats || null,
        source: record.source,
        sourceSessionId: parsed.session.sourceSessionId,
        title: parsed.session.title,
        startedAt: parsed.session.startedAt,
        endedAt: parsed.session.endedAt,
        metadata: parsed.session.metadata as Prisma.InputJsonValue,
        createdBy: record.createdBy,
        importId: record.id,
      },
    });

    await tx.rawMessage.deleteMany({
      where: { rawSessionId: rawSession.id },
    });

    if (parsed.messages.length > 0) {
      await tx.rawMessage.createMany({
        data: parsed.messages.map((message) => ({
          rawSessionId: rawSession.id,
          role: message.role,
          content: message.content,
          metadata: (message.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
          createdAt: message.createdAt ?? undefined,
        })),
      });
    }

    await tx.importRecord.update({
      where: { id: record.id },
      data: {
        status: ImportStatus.parsed,
        error: null,
        stats: {
          ...(record.stats as Record<string, unknown> | null),
          message_count: parsed.messages.length,
          session_source_id: parsed.session.sourceSessionId,
          source: record.source,
        },
      },
    });

    return rawSession;
  });

  return {
    import_id: record.id,
    status: ImportStatus.parsed,
    raw_session_id: session.id,
    message_count: parsed.messages.length,
  };
}

export async function extractImportHandler(
  deps: SharedDeps,
  args: {
    auth: AuthContext;
    importId: string;
  }
) {
  const record = await deps.getImportRecordById(args.importId);
  await assertWorkspaceAccess(deps.prisma, args.auth, record.workspaceId);

  const sessions = await deps.prisma.rawSession.findMany({
    where: { importId: record.id },
    include: {
      messages: {
        orderBy: [{ createdAt: 'asc' }],
      },
    },
  });

  const candidates = sessions.flatMap((session) =>
    session.messages
      .map((message) => buildStagedCandidate(session.projectId, message.content, message.role))
      .filter((item): item is NonNullable<typeof item> => item !== null)
  );

  await deps.prisma.$transaction(async (tx) => {
    await tx.stagedMemory.deleteMany({
      where: { importId: record.id },
    });

    if (candidates.length > 0) {
      await tx.stagedMemory.createMany({
        data: candidates.map((candidate) => ({
          importId: record.id,
          workspaceId: record.workspaceId,
          projectId: candidate.projectId ?? null,
          type: candidate.type,
          content: candidate.content,
          metadata: candidate.metadata as Prisma.InputJsonValue,
          isSelected: true,
        })),
      });
    }

    await tx.importRecord.update({
      where: { id: record.id },
      data: {
        status: ImportStatus.extracted,
        error: null,
        stats: {
          ...(record.stats as Record<string, unknown> | null),
          staged_count: candidates.length,
        },
      },
    });
  });

  const refreshedImport = await deps.prisma.importRecord.findUnique({
    where: { id: record.id },
    select: {
      id: true,
      stats: true,
      workspaceId: true,
    },
  });
  const statsObject = toJsonObject(refreshedImport?.stats);
  if (statsObject.auto_decision_extracted !== true) {
    const settings = await getEffectiveWorkspaceSettings(deps.prisma, record.workspaceId);
    if (settings.enableAutoExtraction) {
      const decisionCandidates = candidates
        .filter((candidate) => candidate.type === 'decision')
        .slice(0, settings.autoExtractionBatchSize);
      const created: Array<{ id: string; content: string }> = [];
      for (const candidate of decisionCandidates) {
        const text = candidate.content.toLowerCase();
        const allowHit = settings.autoConfirmKeywordAllowlist.some((keyword) =>
          text.includes(keyword.toLowerCase())
        );
        const denyHit = settings.autoConfirmKeywordDenylist.some((keyword) =>
          text.includes(keyword.toLowerCase())
        );
        let confidence = 0.55 + (allowHit ? 0.2 : 0) - (denyHit ? 0.25 : 0);
        confidence = Math.min(Math.max(confidence, 0), 1);
        const status =
          settings.autoExtractionMode === 'auto_confirm' &&
          allowHit &&
          !denyHit &&
          confidence >= settings.autoConfirmMinConfidence
            ? 'confirmed'
            : 'draft';
        const projectId = candidate.projectId ?? getStringFromJson(record.stats, 'project_id');
        if (!projectId) {
          continue;
        }
        const memory = await deps.prisma.memory.create({
          data: {
            workspaceId: record.workspaceId,
            projectId,
            type: 'decision',
            content: candidate.content,
            source: 'import',
            status,
            confidence,
            evidence: {
              import_id: record.id,
              raw_session_ids: sessions.map((session) => session.id),
            } as Prisma.InputJsonValue,
            metadata: {
              extraction: {
                version: 'import-rule-v1',
              },
            } as Prisma.InputJsonValue,
            createdBy: args.auth.user.id,
          },
          select: {
            id: true,
            content: true,
          },
        });
        created.push(memory);
      }
      for (const item of created) {
        await deps.updateMemoryEmbedding(item.id, item.content);
      }
      await deps.prisma.importRecord.update({
        where: { id: record.id },
        data: {
          stats: {
            ...(record.stats as Record<string, unknown> | null),
            auto_decision_extracted: true,
            auto_decision_count: created.length,
          },
        },
      });
    }
  }

  return {
    import_id: record.id,
    status: ImportStatus.extracted,
    staged_count: candidates.length,
  };
}


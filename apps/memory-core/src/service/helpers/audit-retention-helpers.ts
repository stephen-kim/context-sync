import { type PrismaClient, type RetentionMode } from '@prisma/client';

type AuditRetentionDeps = {
  prisma: PrismaClient;
  recordAudit: (args: {
    workspaceId: string;
    projectId?: string;
    workspaceKey?: string;
    actorUserId: string;
    actorUserEmail?: string;
    action: string;
    target: Record<string, unknown>;
    correlationId?: string;
  }) => Promise<void>;
};

export async function runAuditRetentionSweepHandler(
  deps: AuditRetentionDeps,
  args?: { now?: Date }
): Promise<{
  workspaces_processed: number;
  archived_count: number;
  deleted_count: number;
  raw_deleted_count: number;
}> {
  const now = args?.now || new Date();
  const rows = await deps.prisma.workspaceSettings.findMany({
    where: {
      retentionPolicyEnabled: true,
    },
    select: {
      workspaceId: true,
      auditRetentionDays: true,
      rawRetentionDays: true,
      retentionMode: true,
      workspace: {
        select: {
          key: true,
        },
      },
    },
  });

  let totalArchivedCount = 0;
  let totalDeletedCount = 0;
  let totalRawDeletedCount = 0;

  for (const row of rows) {
    const auditRetentionDays = normalizePositiveInt(row.auditRetentionDays, 365);
    const rawRetentionDays = normalizePositiveInt(row.rawRetentionDays, 90);
    const retentionMode: RetentionMode = row.retentionMode || 'archive';
    const workspaceKey = row.workspace.key;

    const auditCutoff = new Date(now.getTime() - auditRetentionDays * 24 * 60 * 60 * 1000);
    const rawCutoff = new Date(now.getTime() - rawRetentionDays * 24 * 60 * 60 * 1000);

    let archivedCount = 0;
    let deletedCount = 0;

    await deps.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('claustrum.audit_maintenance', 'on', true)`;

      if (retentionMode === 'archive') {
        const archived = await tx.$executeRaw`
          INSERT INTO "audit_logs_archive" (
            "id",
            "workspace_id",
            "project_id",
            "actor_user_id",
            "correlation_id",
            "action",
            "target",
            "created_at"
          )
          SELECT
            "id",
            "workspace_id",
            "project_id",
            "actor_user_id",
            "correlation_id",
            "action",
            "target",
            "created_at"
          FROM "audit_logs"
          WHERE "workspace_id" = ${row.workspaceId}
            AND "created_at" < ${auditCutoff}
          ON CONFLICT ("id") DO NOTHING
        `;
        archivedCount = toCount(archived);
      }

      const deleted = await tx.$executeRaw`
        DELETE FROM "audit_logs"
        WHERE "workspace_id" = ${row.workspaceId}
          AND "created_at" < ${auditCutoff}
      `;
      deletedCount = toCount(deleted);
    });

    const rawDeleted = await deps.prisma.rawEvent.deleteMany({
      where: {
        workspaceId: row.workspaceId,
        createdAt: {
          lt: rawCutoff,
        },
      },
    });

    totalArchivedCount += archivedCount;
    totalDeletedCount += deletedCount;
    totalRawDeletedCount += rawDeleted.count;

    await deps.recordAudit({
      workspaceId: row.workspaceId,
      workspaceKey,
      actorUserId: 'system:retention',
      action: 'audit.retention.run',
      target: {
        source: 'system',
        system_actor: 'system:retention',
        workspace_key: workspaceKey,
        retention_mode: retentionMode,
        audit_retention_days: auditRetentionDays,
        raw_retention_days: rawRetentionDays,
        archived_count: archivedCount,
        deleted_count: deletedCount,
        raw_deleted_count: rawDeleted.count,
        run_at: now.toISOString(),
      },
    });
  }

  return {
    workspaces_processed: rows.length,
    archived_count: totalArchivedCount,
    deleted_count: totalDeletedCount,
    raw_deleted_count: totalRawDeletedCount,
  };
}

function normalizePositiveInt(value: number | null | undefined, fallback: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || Number(value) <= 0) {
    return fallback;
  }
  return Number(value);
}

function toCount(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return 0;
}

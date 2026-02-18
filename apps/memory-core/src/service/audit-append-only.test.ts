import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());

test('audit_logs rejects update and delete when append-only trigger is active', async (t) => {
  if (!hasDatabaseUrl) {
    t.skip('DATABASE_URL is not configured.');
    return;
  }

  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspaceKey = `audit-append-${suffix}`;

  try {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      t.skip('DATABASE_URL is configured but unreachable in this environment.');
      return;
    }

    const workspace = await prisma.workspace.create({
      data: {
        key: workspaceKey,
        name: workspaceKey,
      },
    });

    const created = await prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: 'system:test',
        action: 'test.audit.append_only',
        target: {
          source: 'system',
          message: 'append-only test',
        },
      },
    });

    await assert.rejects(
      async () => {
        await prisma.auditLog.update({
          where: { id: created.id },
          data: {
            action: 'test.audit.updated',
          },
        });
      },
      (error: unknown) => /append-only/i.test(String(error))
    );

    await assert.rejects(
      async () => {
        await prisma.auditLog.delete({
          where: { id: created.id },
        });
      },
      (error: unknown) => /append-only/i.test(String(error))
    );

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('claustrum.audit_maintenance', 'on', true)`;
      await tx.auditLog.deleteMany({ where: { workspaceId: workspace.id } });
    });
    await prisma.workspace.delete({ where: { id: workspace.id } });
  } finally {
    await prisma.$disconnect();
  }
});

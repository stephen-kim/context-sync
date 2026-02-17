import { Prisma, type PrismaClient } from '@prisma/client';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AuthContext } from '../../auth.js';
import { assertProjectAccess } from '../access-control.js';
import { NotFoundError } from '../errors.js';

type BootstrapContextDeps = {
  prisma: PrismaClient;
  getWorkspaceByKey: (workspaceKey: string) => Promise<{ id: string; key: string; name: string }>;
  getProjectByKeys: (
    workspaceKey: string,
    projectKey: string
  ) => Promise<{ id: string; workspaceId: string; key: string; name: string }>;
  updateMemoryEmbedding: (memoryId: string, content: string) => Promise<void>;
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

export async function bootstrapProjectContextHandler(
  deps: BootstrapContextDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    projectKey: string;
    source?: 'project_create' | 'manual';
  }
): Promise<{
  workspace_key: string;
  project_key: string;
  created: boolean;
  memory_id: string;
  memory_type: 'summary';
}> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  const project = await deps.getProjectByKeys(args.workspaceKey, args.projectKey);
  if (project.workspaceId !== workspace.id) {
    throw new NotFoundError(`Project not found: ${args.workspaceKey}/${args.projectKey}`);
  }
  await assertProjectAccess(deps.prisma, args.auth, workspace.id, project.id, 'WRITER');

  const [existing, recentEvents, typeCounts] = await Promise.all([
    deps.prisma.memory.findFirst({
      where: {
        workspaceId: workspace.id,
        projectId: project.id,
        type: 'summary',
        metadata: {
          path: ['source'],
          equals: 'bootstrap',
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      select: { id: true },
    }),
    deps.prisma.rawEvent.findMany({
      where: {
        workspaceId: workspace.id,
        projectId: project.id,
        eventType: {
          in: ['post_commit', 'post_merge', 'post_checkout'],
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 12,
      select: {
        id: true,
        eventType: true,
        commitSha: true,
        commitMessage: true,
        branch: true,
        changedFiles: true,
        createdAt: true,
      },
    }),
    deps.prisma.memory.groupBy({
      by: ['type'],
      where: {
        workspaceId: workspace.id,
        projectId: project.id,
      },
      _count: {
        type: true,
      },
    }),
  ]);
  const localSignals = await collectLocalBootstrapSignals(project.key);

  const fileSignals = extractFileSignals(recentEvents.map((event) => event.changedFiles));
  const repoKey = extractRepoKey(project.key);
  const content = buildBootstrapSummary({
    workspaceKey: workspace.key,
    projectKey: project.key,
    projectName: project.name,
    repoKey,
    fileSignals,
    localSignals,
    recentEvents: recentEvents.map((event) => ({
      id: event.id,
      type: event.eventType,
      commitSha: event.commitSha,
      commitMessage: event.commitMessage,
      branch: event.branch,
      createdAt: event.createdAt,
    })),
    typeCounts: typeCounts.map((row) => ({
      type: row.type,
      count: row._count.type,
    })),
  });
  const metadata = {
    source: 'bootstrap',
    files: [...new Set([...fileSignals, ...localSignals.map((item) => item.path)])],
    repo_key: repoKey || null,
    created_at: new Date().toISOString(),
    source_mode: args.source || 'manual',
  } satisfies Record<string, unknown>;
  const evidence = {
    raw_event_ids: recentEvents.map((event) => event.id),
    commit_sha: recentEvents
      .map((event) => event.commitSha)
      .find((sha): sha is string => typeof sha === 'string' && sha.length > 0) || null,
  } satisfies Record<string, unknown>;

  const saved = existing
    ? await deps.prisma.memory.update({
        where: { id: existing.id },
        data: {
          content,
          status: 'confirmed',
          source: 'auto',
          confidence: 1,
          metadata: metadata as Prisma.InputJsonValue,
          evidence: evidence as Prisma.InputJsonValue,
          createdBy: args.auth.user.id,
        },
        select: { id: true, content: true },
      })
    : await deps.prisma.memory.create({
        data: {
          workspaceId: workspace.id,
          projectId: project.id,
          type: 'summary',
          content,
          status: 'confirmed',
          source: 'auto',
          confidence: 1,
          metadata: metadata as Prisma.InputJsonValue,
          evidence: evidence as Prisma.InputJsonValue,
          createdBy: args.auth.user.id,
        },
        select: { id: true, content: true },
      });

  await deps.updateMemoryEmbedding(saved.id, saved.content);
  await deps.recordAudit({
    workspaceId: workspace.id,
    projectId: project.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'project.bootstrap_context',
    target: {
      workspace_key: workspace.key,
      project_key: project.key,
      memory_id: saved.id,
      source: args.source || 'manual',
      files: fileSignals,
      local_signals: localSignals,
      raw_event_count: recentEvents.length,
    },
  });

  return {
    workspace_key: workspace.key,
    project_key: project.key,
    created: !existing,
    memory_id: saved.id,
    memory_type: 'summary',
  };
}

function buildBootstrapSummary(args: {
  workspaceKey: string;
  projectKey: string;
  projectName: string;
  repoKey: string | null;
  fileSignals: string[];
  localSignals: Array<{ path: string; summary: string }>;
  recentEvents: Array<{
    id: string;
    type: string;
    commitSha: string | null;
    commitMessage: string | null;
    branch: string | null;
    createdAt: Date;
  }>;
  typeCounts: Array<{ type: string; count: number }>;
}): string {
  const memoryStats = args.typeCounts
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((row) => `${row.type}:${row.count}`)
    .join(', ');
  const recentActivity = args.recentEvents
    .slice(0, 5)
    .map((event) => {
      const subject = firstLine(event.commitMessage || `${event.type} event`);
      return `- ${event.createdAt.toISOString()} [${event.type}] ${subject}${
        event.commitSha ? ` (${event.commitSha.slice(0, 10)})` : ''
      }`;
    });

  return [
    'Summary:',
    `${args.projectName} (${args.projectKey}) bootstrap context for workspace ${args.workspaceKey}.`,
    'Why:',
    '- Project-level memory starts empty; bootstrap adds minimum durable context immediately.',
    '- Signals are derived from project metadata and recent git activity.',
    'Alternatives:',
    '- Start with no seed memories and rely only on future remember/recall traffic.',
    'Impact:',
    '- Context bundle and recall get a stable starting summary before enough decisions accumulate.',
    `- Existing memory mix: ${memoryStats || 'none yet'}.`,
    'Evidence:',
    `- repo_key: ${args.repoKey || 'n/a'}`,
    `- file_signals: ${args.fileSignals.join(', ') || 'n/a'}`,
    ...args.localSignals.map((item) => `- local_file_signal: ${item.path} -> ${item.summary}`),
    `- recent_events: ${args.recentEvents.length}`,
    ...recentActivity,
  ].join('\n');
}

function extractFileSignals(rawValues: unknown[]): string[] {
  const files = new Set<string>();
  for (const value of rawValues) {
    if (!Array.isArray(value)) {
      continue;
    }
    for (const item of value) {
      const file = String(item || '')
        .trim()
        .replace(/\\/g, '/');
      if (!file) {
        continue;
      }
      if (
        /(^|\/)readme(\.[a-z0-9]+)?$/i.test(file) ||
        /(^|\/)package\.json$/i.test(file) ||
        /(^|\/)docker-compose(\.[a-z0-9._-]+)?\.ya?ml$/i.test(file) ||
        /(^|\/)infra\//i.test(file)
      ) {
        files.add(file);
      }
      if (files.size >= 20) {
        break;
      }
    }
    if (files.size >= 20) {
      break;
    }
  }
  return [...files];
}

function extractRepoKey(projectKey: string): string | null {
  const normalized = String(projectKey || '').trim();
  if (!normalized) {
    return null;
  }
  const hashIndex = normalized.indexOf('#');
  return hashIndex >= 0 ? normalized.slice(0, hashIndex) : normalized;
}

function firstLine(input: string): string {
  const line = input
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) {
    return '';
  }
  if (line.length <= 180) {
    return line;
  }
  return `${line.slice(0, 177)}...`;
}

async function collectLocalBootstrapSignals(
  projectKey: string
): Promise<Array<{ path: string; summary: string }>> {
  const subpath = extractSubpath(projectKey);
  const candidates = [
    subpath ? path.join(subpath, 'README.md') : null,
    'README.md',
    subpath ? path.join(subpath, 'package.json') : null,
    'package.json',
    'docker-compose.yml',
    'docker-compose.yaml',
    subpath ? path.join(subpath, 'docker-compose.yml') : null,
    subpath ? path.join(subpath, 'docker-compose.yaml') : null,
    'infra/docker-compose.yml',
    'infra/docker-compose.yaml',
  ].filter((value): value is string => Boolean(value));

  const results: Array<{ path: string; summary: string }> = [];
  for (const relPath of candidates) {
    if (!(await exists(relPath))) {
      continue;
    }
    try {
      const text = await readFile(relPath, 'utf8');
      const summary = summarizeFile(relPath, text);
      if (summary) {
        results.push({ path: relPath.replace(/\\/g, '/'), summary });
      }
      if (results.length >= 8) {
        break;
      }
    } catch {
      // Best-effort only.
    }
  }
  return results;
}

async function exists(relPath: string): Promise<boolean> {
  try {
    await access(relPath);
    return true;
  } catch {
    return false;
  }
}

function summarizeFile(relPath: string, content: string): string {
  const normalized = relPath.replace(/\\/g, '/').toLowerCase();
  if (normalized.endsWith('readme.md')) {
    const title = content
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('#') || line.length > 20);
    return trimLine(title || 'README detected.');
  }
  if (normalized.endsWith('package.json')) {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const name = typeof parsed.name === 'string' ? parsed.name : 'unknown';
      const scripts =
        parsed.scripts && typeof parsed.scripts === 'object' && !Array.isArray(parsed.scripts)
          ? Object.keys(parsed.scripts as Record<string, unknown>).slice(0, 5).join(', ')
          : 'none';
      return trimLine(`package: ${name}; scripts: ${scripts}`);
    } catch {
      return 'package.json detected (unparsed).';
    }
  }
  if (normalized.includes('docker-compose')) {
    const servicesLine = content
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('services:'));
    return trimLine(servicesLine || 'docker-compose file detected.');
  }
  return '';
}

function extractSubpath(projectKey: string): string | null {
  const hashIndex = projectKey.indexOf('#');
  if (hashIndex < 0) {
    return null;
  }
  const raw = projectKey.slice(hashIndex + 1).trim();
  if (!raw) {
    return null;
  }
  return raw.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function trimLine(input: string, max = 180): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(max - 3, 1)).trimEnd()}...`;
}

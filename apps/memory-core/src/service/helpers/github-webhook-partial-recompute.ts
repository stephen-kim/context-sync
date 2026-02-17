import type { PrismaClient } from '@prisma/client';

type DbLike = PrismaClient;

export type WebhookRecomputeReason =
  | 'installation_update'
  | 'team_change'
  | 'membership_change'
  | 'team_repo_change';

const RECOMPUTE_DEBOUNCE_MS = 8000;
const recentRepoRecomputeByWorkspaceRepo = new Map<string, number>();

export function normalizeRepoFullName(input: unknown): string | null {
  const raw = String(input || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!raw || !raw.includes('/')) {
    return null;
  }
  const [owner, repo] = raw.split('/', 2);
  if (!owner || !repo) {
    return null;
  }
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export function parseGithubBigInt(value: unknown): bigint | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (/^\d+$/.test(normalized)) {
      return BigInt(normalized);
    }
  }
  return null;
}

export function extractRepoChangesFromInstallationEvent(payload: unknown): {
  repoIds: bigint[];
  repoFullNames: string[];
  addedRepoCount: number;
  removedRepoCount: number;
} {
  const root = asRecord(payload);
  const added = extractRepositoryRows(root.repositories_added);
  const removed = extractRepositoryRows(root.repositories_removed);
  const ids = uniqueBigInts([...added.map((item) => item.repoId), ...removed.map((item) => item.repoId)]);
  const names = uniqueStrings([...added.map((item) => item.fullName), ...removed.map((item) => item.fullName)]);
  return {
    repoIds: ids,
    repoFullNames: names,
    addedRepoCount: added.length,
    removedRepoCount: removed.length,
  };
}

export function extractTeamId(payload: unknown): bigint | null {
  const root = asRecord(payload);
  const team = asRecord(root.team);
  return parseGithubBigInt(team.id);
}

export function extractRepositoryId(payload: unknown): bigint | null {
  const root = asRecord(payload);
  const repository = asRecord(root.repository);
  return parseGithubBigInt(repository.id);
}

export function extractRepositoryFullName(payload: unknown): string | null {
  const root = asRecord(payload);
  const repository = asRecord(root.repository);
  return normalizeRepoFullName(repository.full_name);
}

export function extractRepositoryAction(payload: unknown): string {
  const root = asRecord(payload);
  return String(root.action || '')
    .trim()
    .toLowerCase();
}

export function applyRepoDebounce(args: {
  workspaceId: string;
  repoIds: bigint[];
  debounceMs?: number;
}): bigint[] {
  const now = Date.now();
  const windowMs = Math.max(1000, args.debounceMs || RECOMPUTE_DEBOUNCE_MS);
  const accepted: bigint[] = [];

  for (const repoId of args.repoIds) {
    const key = `${args.workspaceId}:${repoId.toString()}`;
    const last = recentRepoRecomputeByWorkspaceRepo.get(key) || 0;
    if (now - last < windowMs) {
      continue;
    }
    recentRepoRecomputeByWorkspaceRepo.set(key, now);
    accepted.push(repoId);
  }

  if (recentRepoRecomputeByWorkspaceRepo.size > 5000) {
    const cutoff = now - windowMs * 4;
    for (const [key, ts] of recentRepoRecomputeByWorkspaceRepo.entries()) {
      if (ts < cutoff) {
        recentRepoRecomputeByWorkspaceRepo.delete(key);
      }
    }
  }

  return accepted;
}

export async function findRepoIdsByTeamIdFromCache(args: {
  prisma: DbLike;
  workspaceId: string;
  teamId: bigint;
}): Promise<bigint[]> {
  const rows = await args.prisma.githubRepoTeamsCache.findMany({
    where: {
      workspaceId: args.workspaceId,
    },
    select: {
      githubRepoId: true,
      teamsJson: true,
    },
  });

  const wantedTeamId = args.teamId.toString();
  const repoIds: bigint[] = [];
  for (const row of rows) {
    const teams = Array.isArray(row.teamsJson) ? row.teamsJson : [];
    let matched = false;
    for (const item of teams) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const record = item as Record<string, unknown>;
      if (String(record.team_id || '').trim() === wantedTeamId) {
        matched = true;
        break;
      }
    }
    if (matched) {
      repoIds.push(row.githubRepoId);
    }
  }

  return uniqueBigInts(repoIds);
}

export async function invalidateRepoTeamsCache(args: {
  prisma: DbLike;
  workspaceId: string;
  repoIds: bigint[];
}): Promise<void> {
  if (args.repoIds.length === 0) {
    return;
  }
  await args.prisma.githubRepoTeamsCache.deleteMany({
    where: {
      workspaceId: args.workspaceId,
      githubRepoId: {
        in: args.repoIds,
      },
    },
  });
}

export async function invalidateTeamMembersCache(args: {
  prisma: DbLike;
  workspaceId: string;
  teamIds: bigint[];
}): Promise<void> {
  if (args.teamIds.length === 0) {
    return;
  }
  await args.prisma.githubTeamMembersCache.deleteMany({
    where: {
      workspaceId: args.workspaceId,
      githubTeamId: {
        in: args.teamIds,
      },
    },
  });
}

export async function invalidatePermissionCache(args: {
  prisma: DbLike;
  workspaceId: string;
  repoIds: bigint[];
}): Promise<void> {
  if (args.repoIds.length === 0) {
    return;
  }
  await args.prisma.githubPermissionCache.deleteMany({
    where: {
      workspaceId: args.workspaceId,
      githubRepoId: {
        in: args.repoIds,
      },
    },
  });
}

function extractRepositoryRows(value: unknown): Array<{ repoId: bigint; fullName: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: Array<{ repoId: bigint; fullName: string }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const repoId = parseGithubBigInt(record.id);
    const fullName = normalizeRepoFullName(record.full_name);
    if (!repoId || !fullName) {
      continue;
    }
    rows.push({ repoId, fullName });
  }
  return rows;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

function uniqueBigInts(input: bigint[]): bigint[] {
  const seen = new Set<string>();
  const out: bigint[] = [];
  for (const item of input) {
    const key = item.toString();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

function uniqueStrings(input: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    const value = String(item || '').trim().toLowerCase();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

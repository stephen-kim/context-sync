import path from 'node:path';
import { MonorepoMode } from '@prisma/client';
import { type ResolveProjectInput } from '@claustrum/shared';
import type { EffectiveWorkspaceSettings } from './workspace-resolution-settings.js';
import { DEFAULT_MONOREPO_MAX_DEPTH, DEFAULT_MONOREPO_GLOBS } from './workspace-resolution-settings.js';

export function normalizeGithubSelector(
  input: ResolveProjectInput
): { normalized: string; withHost?: string } | null {
  const github = input.github_remote;
  if (!github) {
    return null;
  }
  const normalized = normalizeGithubRepoId(github.normalized || '');
  if (normalized) {
    const host = (github.host || '').trim().toLowerCase();
    return host ? { normalized, withHost: `${host}/${normalized}` } : { normalized };
  }
  const owner = (github.owner || '').trim().toLowerCase();
  const repo = (github.repo || '').trim().toLowerCase();
  if (!owner || !repo) {
    return null;
  }
  const parsed = normalizeGithubRepoId(`${owner}/${repo}`);
  if (!parsed) {
    return null;
  }
  const host = (github.host || '').trim().toLowerCase();
  return host ? { normalized: parsed, withHost: `${host}/${parsed}` } : { normalized: parsed };
}

function normalizeGithubRepoId(value: string): string | null {
  const raw = String(value || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const segments = raw.split('/').filter(Boolean);
  if (segments.length !== 2) {
    return null;
  }
  const [owner, repo] = segments;
  if (!owner || !repo) {
    return null;
  }
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function toPosixPath(input: string): string {
  return input.replace(/\\/g, '/');
}

function normalizePath(input: string): string {
  return toPosixPath(input).replace(/\/{2,}/g, '/').trim();
}

function normalizeRelativePath(input: string): string | null {
  const raw = normalizePath(input)
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!raw || raw === '.') {
    return null;
  }
  const segments = raw.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return null;
  }
  return segments.join('/');
}

export function normalizeMonorepoSubpath(input: string): string | null {
  const normalized = normalizeRelativePath(input);
  if (!normalized) {
    return null;
  }
  const sanitizedSegments = normalized
    .split('/')
    .map((segment) =>
      segment
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_.]+/, '')
        .replace(/[-_.]+$/, '')
        .toLowerCase()
    )
    .filter(Boolean);
  if (sanitizedSegments.length === 0) {
    return null;
  }
  return sanitizedSegments.join('/');
}

function normalizeGlobPattern(glob: string): string | null {
  const normalized = normalizeRelativePath(glob);
  if (!normalized) {
    return null;
  }
  return normalized;
}

function toSegmentRegex(patternSegment: string): RegExp {
  const escaped = patternSegment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+');
  return new RegExp(`^${escaped}$`, 'i');
}

function deriveSubpathFromRelativePath(relativePath: string, globs: string[]): string | null {
  const normalizedRelative = normalizeMonorepoSubpath(relativePath);
  if (!normalizedRelative) {
    return null;
  }
  const relativeSegments = normalizedRelative.split('/');
  for (const glob of globs) {
    const normalizedGlob = normalizeGlobPattern(glob);
    if (!normalizedGlob) {
      continue;
    }
    const globSegments = normalizedGlob.split('/');
    if (relativeSegments.length < globSegments.length) {
      continue;
    }
    let matches = true;
    for (let index = 0; index < globSegments.length; index += 1) {
      if (!toSegmentRegex(globSegments[index]).test(relativeSegments[index])) {
        matches = false;
        break;
      }
    }
    if (!matches) {
      continue;
    }
    return normalizeMonorepoSubpath(relativeSegments.slice(0, globSegments.length).join('/'));
  }
  return null;
}

function deriveRelativePathFromRepoRoot(input: ResolveProjectInput): string | null {
  const direct = normalizeRelativePath(input.relative_path || '');
  if (direct) {
    return direct;
  }
  if (!input.repo_root || !input.cwd) {
    return null;
  }
  const from = normalizePath(input.repo_root);
  const to = normalizePath(input.cwd);
  if (!from || !to) {
    return null;
  }
  const relative = toPosixPath(path.relative(from, to));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return normalizeRelativePath(relative);
}

function globMatch(candidate: string, pattern: string): boolean {
  const candidateNormalized = normalizeMonorepoSubpath(candidate);
  const patternNormalized = normalizeGlobPattern(pattern);
  if (!candidateNormalized || !patternNormalized) {
    return false;
  }
  const tokenized = patternNormalized
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*');
  const regex = new RegExp(`^${tokenized}$`, 'i');
  return regex.test(candidateNormalized);
}

function matchesAnyGlob(relativePath: string, globs: string[]): boolean {
  const normalizedPath = normalizeMonorepoSubpath(relativePath);
  if (!normalizedPath) {
    return false;
  }
  return globs.some((globPattern) => {
    const normalizedGlob = normalizeGlobPattern(globPattern);
    if (!normalizedGlob || normalizedGlob.startsWith('!')) {
      return false;
    }
    if (normalizedGlob.startsWith('**/') && normalizedGlob.endsWith('/**')) {
      const middle = normalizedGlob.slice(3, -3).replace(/^\/+|\/+$/g, '');
      if (
        middle &&
        (normalizedPath === middle ||
          normalizedPath.startsWith(`${middle}/`) ||
          normalizedPath.endsWith(`/${middle}`) ||
          normalizedPath.includes(`/${middle}/`))
      ) {
        return true;
      }
    }
    if (globMatch(normalizedPath, normalizedGlob)) {
      return true;
    }
    if (normalizedGlob.endsWith('/**')) {
      const plainPrefix = normalizedGlob.slice(0, -3).replace(/\/+$/, '');
      return normalizedPath === plainPrefix || normalizedPath.startsWith(`${plainPrefix}/`);
    }
    return false;
  });
}

export function resolveMonorepoSubpath(
  input: ResolveProjectInput,
  settings: Pick<
    EffectiveWorkspaceSettings,
    'monorepoWorkspaceGlobs' | 'monorepoExcludeGlobs' | 'monorepoMaxDepth' | 'monorepoMode'
  >
): string | null {
  if (settings.monorepoMode === MonorepoMode.repo_only) {
    return null;
  }

  const globs = settings.monorepoWorkspaceGlobs.length
    ? settings.monorepoWorkspaceGlobs
    : DEFAULT_MONOREPO_GLOBS;
  const maxDepth = settings.monorepoMaxDepth > 0 ? settings.monorepoMaxDepth : DEFAULT_MONOREPO_MAX_DEPTH;
  const orderedCandidates: string[] = [];

  if (input.monorepo?.candidate_subpaths) {
    orderedCandidates.push(...input.monorepo.candidate_subpaths);
  }
  const derivedRelative = deriveRelativePathFromRepoRoot(input);
  if (derivedRelative) {
    orderedCandidates.push(derivedRelative);
  }

  for (const candidate of orderedCandidates) {
    if (matchesAnyGlob(candidate, settings.monorepoExcludeGlobs)) {
      continue;
    }
    const derived = deriveSubpathFromRelativePath(candidate, globs);
    if (!derived) {
      continue;
    }
    if (matchesAnyGlob(derived, settings.monorepoExcludeGlobs)) {
      continue;
    }
    const depth = derived.split('/').length;
    if (depth > maxDepth) {
      continue;
    }
    return derived;
  }

  return null;
}

export function normalizeSubpathForSplitPolicy(
  subpath: string | null | undefined,
  maxDepthInput: number,
  excludeGlobs: string[]
): string | null {
  const normalized = normalizeMonorepoSubpath(subpath || '');
  if (!normalized) {
    return null;
  }
  const depth = normalized.split('/').filter(Boolean).length;
  const maxDepth = Math.min(Math.max(Math.trunc(maxDepthInput || 3), 2), 3);
  if (depth < 2 || depth > maxDepth) {
    return null;
  }
  if (matchesAnyGlob(normalized, excludeGlobs)) {
    return null;
  }
  return normalized;
}

export function composeMonorepoProjectKey(
  baseProjectKey: string,
  subpath: string | null,
  mode: MonorepoMode
): string {
  if (!subpath || mode === MonorepoMode.repo_only) {
    return baseProjectKey;
  }
  return mode === MonorepoMode.repo_colon_subpath
    ? `${baseProjectKey}:${subpath}`
    : `${baseProjectKey}#${subpath}`;
}

export function buildGithubExternalIdCandidates(
  selector: { normalized: string; withHost?: string },
  subpath?: string | null,
  options?: { includeBase?: boolean }
): string[] {
  const includeBase = options?.includeBase ?? true;
  const values = new Set<string>();
  const bases = selector.withHost
    ? [selector.normalized, selector.withHost]
    : [selector.normalized];
  for (const base of bases) {
    if (includeBase) {
      values.add(base);
    }
    if (subpath) {
      values.add(`${base}#${subpath}`);
      values.add(`${base}:${subpath}`);
    }
  }
  return [...values];
}

export function toGithubMappingExternalId(normalizedRepo: string, subpath?: string | null): string {
  if (!subpath) {
    return normalizedRepo;
  }
  return `${normalizedRepo}#${subpath}`;
}

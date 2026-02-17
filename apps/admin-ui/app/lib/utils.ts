import type { MonorepoMode, ResolutionKind } from './types';

export function toISOString(localDateTime: string): string | null {
  const date = new Date(localDateTime);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function reorderKinds(
  order: ResolutionKind[],
  from: ResolutionKind,
  to: ResolutionKind
): ResolutionKind[] {
  const list = [...order];
  const fromIndex = list.indexOf(from);
  const toIndex = list.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) {
    return order;
  }
  list.splice(fromIndex, 1);
  list.splice(toIndex, 0, from);
  return list;
}

export function kindDescription(kind: ResolutionKind): string {
  if (kind === 'github_remote') {
    return 'Resolve by extracting owner/repo from git remote origin.';
  }
  if (kind === 'repo_root_slug') {
    return 'Resolve by repository root basename slug.';
  }
  return 'Resolve by manually selected project key.';
}

export function monorepoModeDescription(mode: MonorepoMode): string {
  if (mode === 'repo_only') {
    return 'Always use repository-level key only.';
  }
  if (mode === 'repo_colon_subpath') {
    return 'Split subprojects using repo_key:subpath.';
  }
  return 'Split subprojects using repo_key#subpath.';
}

export function isSubprojectKey(projectKey: string): boolean {
  if (projectKey.includes('#')) {
    return true;
  }
  return /^github:[^:]+\/[^:]+:.+/.test(projectKey);
}

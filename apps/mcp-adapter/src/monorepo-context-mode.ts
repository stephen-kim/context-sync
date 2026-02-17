export type MonorepoContextMode = 'shared_repo' | 'split_on_demand' | 'split_auto';

export function resolveProjectKeyByContextMode(args: {
  mode: MonorepoContextMode;
  repoProjectKey: string;
  splitProjectKey: string | null;
}): string {
  if (args.mode !== 'shared_repo' && args.splitProjectKey) {
    return args.splitProjectKey;
  }
  return args.repoProjectKey;
}

export function attachSubpathMetadata(args: {
  mode: MonorepoContextMode;
  metadata: Record<string, unknown> | undefined;
  subpath: string | null;
  enabled: boolean;
}): Record<string, unknown> | undefined {
  if (args.mode !== 'shared_repo' || !args.enabled || !args.subpath) {
    return args.metadata;
  }
  const next = { ...(args.metadata || {}) };
  if (typeof next.subpath !== 'string' || !next.subpath.trim()) {
    next.subpath = args.subpath;
  }
  return next;
}

export function shouldUseCurrentSubpathBoost(args: {
  mode: MonorepoContextMode;
  enabled: boolean;
  currentSubpath: string | null;
}): boolean {
  return args.mode === 'shared_repo' && args.enabled && Boolean(args.currentSubpath);
}

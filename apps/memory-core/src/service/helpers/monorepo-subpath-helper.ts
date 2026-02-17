export function normalizeSubpathValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/\/{2,}/g, '/')
    .trim()
    .toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function extractSubpathFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const subpath = (metadata as Record<string, unknown>).subpath;
  return normalizeSubpathValue(subpath);
}

export function applySubpathBoost(params: {
  baseScore: number;
  metadata: unknown;
  currentSubpath: string | null;
  enabled: boolean;
  weight: number;
}): number {
  const safeBase = Number.isFinite(params.baseScore) ? params.baseScore : 0;
  if (!params.enabled) {
    return safeBase;
  }
  const current = normalizeSubpathValue(params.currentSubpath);
  if (!current) {
    return safeBase;
  }
  const metadataSubpath = extractSubpathFromMetadata(params.metadata);
  if (!metadataSubpath) {
    return safeBase;
  }
  if (metadataSubpath !== current) {
    return safeBase;
  }
  const safeWeight = Number.isFinite(params.weight) ? Math.min(Math.max(params.weight, 1), 10) : 1.5;
  return safeBase * safeWeight;
}

export function prioritizeRowsBySubpath<T extends { metadata?: unknown; createdAt: Date }>(
  rows: T[],
  currentSubpath: string | null,
  enabled: boolean
): T[] {
  if (!enabled) {
    return rows;
  }
  const current = normalizeSubpathValue(currentSubpath);
  if (!current) {
    return rows;
  }
  return [...rows].sort((a, b) => {
    const aMatch = extractSubpathFromMetadata(a.metadata) === current ? 1 : 0;
    const bMatch = extractSubpathFromMetadata(b.metadata) === current ? 1 : 0;
    if (aMatch !== bMatch) {
      return bMatch - aMatch;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

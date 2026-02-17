import path from 'node:path';
import {
  AutoExtractionMode,
  MonorepoContextMode,
  MonorepoMode,
  OidcSyncMode,
  Prisma,
  ResolutionKind,
  SearchDefaultMode,
  type PrismaClient,
} from '@prisma/client';
import {
  defaultAutoConfirmAllowedEventTypes,
  defaultAutoConfirmKeywordAllowlist,
  defaultAutoConfirmKeywordDenylist,
  defaultCheckoutDailyLimit,
  defaultCheckoutDebounceSeconds,
  defaultOutboundLocales,
  defaultMonorepoExcludeGlobs,
  defaultMonorepoRootMarkers,
  defaultMonorepoSubpathBoostWeight,
  defaultSearchTypeWeights,
  defaultMonorepoWorkspaceGlobs,
  monorepoContextModeSchema,
  monorepoModeSchema,
  resolutionOrderSchema,
  type ResolveProjectInput,
} from '@claustrum/shared';

export const DEFAULT_RESOLUTION_ORDER: ResolutionKind[] = [
  ResolutionKind.github_remote,
  ResolutionKind.repo_root_slug,
  ResolutionKind.manual,
];

const DEFAULT_GITHUB_PREFIX = 'github:';
const DEFAULT_LOCAL_PREFIX = 'local:';
const DEFAULT_GITHUB_PERMISSION_SYNC_MODE: 'add_only' | 'add_and_remove' = 'add_only';
const DEFAULT_GITHUB_WEBHOOK_SYNC_MODE: 'add_only' | 'add_and_remove' = 'add_only';
const DEFAULT_GITHUB_ROLE_MAPPING: Record<string, 'owner' | 'maintainer' | 'writer' | 'reader'> = {
  admin: 'maintainer',
  maintain: 'maintainer',
  write: 'writer',
  triage: 'reader',
  read: 'reader',
};
const DEFAULT_MONOREPO_MODE = MonorepoMode.repo_hash_subpath;
const DEFAULT_MONOREPO_CONTEXT_MODE = MonorepoContextMode.shared_repo;
const DEFAULT_MONOREPO_DETECTION_LEVEL = 2;
export const DEFAULT_MONOREPO_MAX_DEPTH = 3;
const DEFAULT_MONOREPO_ROOT_MARKERS = [...defaultMonorepoRootMarkers];
export const DEFAULT_MONOREPO_GLOBS = [...defaultMonorepoWorkspaceGlobs];
const DEFAULT_MONOREPO_EXCLUDE_GLOBS = [...defaultMonorepoExcludeGlobs];
const DEFAULT_AUTO_EXTRACT_MODE = AutoExtractionMode.draft_only;
const DEFAULT_SEARCH_MODE = SearchDefaultMode.hybrid;
const DEFAULT_OUTBOUND_LOCALE = 'en';
const DEFAULT_SUPPORTED_OUTBOUND_LOCALES = [...defaultOutboundLocales];
const DEFAULT_RETENTION_MODE: 'archive' | 'hard_delete' = 'archive';

export type EffectiveWorkspaceSettings = {
  resolutionOrder: ResolutionKind[];
  autoCreateProject: boolean;
  autoCreateProjectSubprojects: boolean;
  githubAutoCreateProjects: boolean;
  githubAutoCreateSubprojects: boolean;
  githubPermissionSyncEnabled: boolean;
  githubPermissionSyncMode: 'add_only' | 'add_and_remove';
  githubCacheTtlSeconds: number;
  githubRoleMapping: Record<string, 'owner' | 'maintainer' | 'writer' | 'reader'>;
  githubWebhookEnabled: boolean;
  githubWebhookSyncMode: 'add_only' | 'add_and_remove';
  githubTeamMappingEnabled: boolean;
  autoSwitchRepo: boolean;
  autoSwitchSubproject: boolean;
  allowManualPin: boolean;
  enableGitEvents: boolean;
  enableCommitEvents: boolean;
  enableMergeEvents: boolean;
  enableCheckoutEvents: boolean;
  checkoutDebounceSeconds: number;
  checkoutDailyLimit: number;
  enableAutoExtraction: boolean;
  autoExtractionMode: AutoExtractionMode;
  autoConfirmMinConfidence: number;
  autoConfirmAllowedEventTypes: string[];
  autoConfirmKeywordAllowlist: string[];
  autoConfirmKeywordDenylist: string[];
  autoExtractionBatchSize: number;
  searchDefaultMode: SearchDefaultMode;
  searchHybridAlpha: number;
  searchHybridBeta: number;
  searchDefaultLimit: number;
  searchTypeWeights: Record<string, number>;
  searchRecencyHalfLifeDays: number;
  searchSubpathBoostWeight: number;
  githubProjectKeyPrefix: string;
  githubKeyPrefix: string;
  localKeyPrefix: string;
  enableMonorepoResolution: boolean;
  monorepoDetectionLevel: number;
  monorepoMode: MonorepoMode;
  monorepoContextMode: MonorepoContextMode;
  monorepoSubpathMetadataEnabled: boolean;
  monorepoSubpathBoostEnabled: boolean;
  monorepoSubpathBoostWeight: number;
  monorepoRootMarkers: string[];
  monorepoWorkspaceGlobs: string[];
  monorepoExcludeGlobs: string[];
  monorepoMaxDepth: number;
  defaultOutboundLocale: string;
  supportedOutboundLocales: string[];
  enableActivityAutoLog: boolean;
  enableDecisionExtraction: boolean;
  decisionExtractionMode: 'llm_only' | 'hybrid_priority';
  decisionDefaultStatus: 'draft' | 'confirmed';
  decisionAutoConfirmEnabled: boolean;
  decisionAutoConfirmMinConfidence: number;
  decisionBatchSize: number;
  decisionBackfillDays: number;
  rawAccessMinRole: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER';
  retentionPolicyEnabled: boolean;
  auditRetentionDays: number;
  rawRetentionDays: number;
  retentionMode: 'archive' | 'hard_delete';
  securityStreamEnabled: boolean;
  securityStreamSinkId: string | null;
  securityStreamMinSeverity: 'low' | 'medium' | 'high';
  oidcSyncMode: OidcSyncMode;
  oidcAllowAutoProvision: boolean;
};

export function parseResolutionOrder(input: unknown): ResolutionKind[] {
  const parsed = resolutionOrderSchema.safeParse(input);
  if (!parsed.success) {
    return DEFAULT_RESOLUTION_ORDER;
  }
  return parsed.data as ResolutionKind[];
}

export function parseMonorepoMode(input: unknown): MonorepoMode {
  const parsed = monorepoModeSchema.safeParse(input);
  if (!parsed.success) {
    return DEFAULT_MONOREPO_MODE;
  }
  return parsed.data as MonorepoMode;
}

export function parseMonorepoContextMode(input: unknown): MonorepoContextMode {
  const parsed = monorepoContextModeSchema.safeParse(input);
  if (!parsed.success) {
    return DEFAULT_MONOREPO_CONTEXT_MODE;
  }
  return parsed.data as MonorepoContextMode;
}

function parseStringArray(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) {
    return fallback;
  }
  const values = input
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0);
  return values.length > 0 ? values : fallback;
}

function parsePositiveInt(input: unknown, fallback: number): number {
  const value =
    typeof input === 'number'
      ? input
      : typeof input === 'string' && input.trim()
        ? Number(input)
        : Number.NaN;
  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function parseNonNegativeInt(input: unknown, fallback: number): number {
  const value =
    typeof input === 'number'
      ? input
      : typeof input === 'string' && input.trim()
        ? Number(input)
        : Number.NaN;
  if (!Number.isInteger(value) || value < 0) {
    return fallback;
  }
  return value;
}

function parseDetectionLevel(input: unknown, fallback: number): number {
  const value =
    typeof input === 'number'
      ? input
      : typeof input === 'string' && input.trim()
        ? Number(input)
        : Number.NaN;
  if (!Number.isInteger(value)) {
    return fallback;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 3) {
    return 3;
  }
  return value;
}

function parseGithubCacheTtlSeconds(input: unknown, fallback: number): number {
  const value = parsePositiveInt(input, fallback);
  if (value < 30) {
    return 30;
  }
  if (value > 86400) {
    return 86400;
  }
  return value;
}

function parseOutboundLocale(input: unknown, fallback: string): string {
  const value = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!value) {
    return fallback;
  }
  return DEFAULT_SUPPORTED_OUTBOUND_LOCALES.includes(value as (typeof defaultOutboundLocales)[number])
    ? value
    : fallback;
}

function parseOutboundLocaleArray(input: unknown, fallback: string[]): string[] {
  const values = parseStringArray(input, fallback)
    .map((value) => value.trim().toLowerCase())
    .filter((value) =>
      DEFAULT_SUPPORTED_OUTBOUND_LOCALES.includes(value as (typeof defaultOutboundLocales)[number])
    );
  if (values.length === 0) {
    return fallback;
  }
  return Array.from(new Set(values));
}

function parseGithubPermissionSyncMode(input: unknown): 'add_only' | 'add_and_remove' {
  if (input === 'add_and_remove') {
    return 'add_and_remove';
  }
  return 'add_only';
}

function parseRetentionMode(input: unknown): 'archive' | 'hard_delete' {
  if (input === 'hard_delete') {
    return 'hard_delete';
  }
  return 'archive';
}

function parseSecuritySeverity(input: unknown): 'low' | 'medium' | 'high' {
  if (input === 'low' || input === 'high') {
    return input;
  }
  return 'medium';
}

function parseGithubRoleMapping(
  input: unknown
): Record<string, 'owner' | 'maintainer' | 'writer' | 'reader'> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...DEFAULT_GITHUB_ROLE_MAPPING };
  }
  const out: Record<string, 'owner' | 'maintainer' | 'writer' | 'reader'> = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = String(rawKey || '').trim().toLowerCase();
    if (!key) {
      continue;
    }
    const value = String(rawValue || '').trim().toLowerCase();
    if (value === 'owner' || value === 'maintainer' || value === 'writer' || value === 'reader') {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : { ...DEFAULT_GITHUB_ROLE_MAPPING };
}

function parseSearchTypeWeights(input: unknown): Record<string, number> {
  const base = { ...defaultSearchTypeWeights } as Record<string, number>;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return base;
  }
  const parsed: Record<string, number> = { ...base };
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = String(key || '').trim().toLowerCase();
    const numeric = Number(value);
    if (!normalizedKey || !Number.isFinite(numeric) || numeric <= 0) {
      continue;
    }
    parsed[normalizedKey] = Math.min(numeric, 100);
  }
  return parsed;
}

export async function getEffectiveWorkspaceSettings(
  prisma: PrismaClient | Prisma.TransactionClient,
  workspaceId: string
): Promise<EffectiveWorkspaceSettings> {
  const settings = await prisma.workspaceSettings.findUnique({
    where: { workspaceId },
  });
  if (!settings) {
    return {
      resolutionOrder: DEFAULT_RESOLUTION_ORDER,
      autoCreateProject: true,
      githubAutoCreateProjects: true,
      githubAutoCreateSubprojects: false,
      githubPermissionSyncEnabled: false,
      githubPermissionSyncMode: DEFAULT_GITHUB_PERMISSION_SYNC_MODE,
      githubCacheTtlSeconds: 900,
      githubRoleMapping: { ...DEFAULT_GITHUB_ROLE_MAPPING },
      githubWebhookEnabled: false,
      githubWebhookSyncMode: DEFAULT_GITHUB_WEBHOOK_SYNC_MODE,
      githubTeamMappingEnabled: true,
      autoSwitchRepo: true,
      autoSwitchSubproject: false,
      allowManualPin: true,
      enableGitEvents: true,
      enableCommitEvents: true,
      enableMergeEvents: true,
      enableCheckoutEvents: false,
      checkoutDebounceSeconds: defaultCheckoutDebounceSeconds,
      checkoutDailyLimit: defaultCheckoutDailyLimit,
      enableAutoExtraction: true,
      autoExtractionMode: DEFAULT_AUTO_EXTRACT_MODE,
      autoConfirmMinConfidence: 0.85,
      autoConfirmAllowedEventTypes: [...defaultAutoConfirmAllowedEventTypes],
      autoConfirmKeywordAllowlist: [...defaultAutoConfirmKeywordAllowlist],
      autoConfirmKeywordDenylist: [...defaultAutoConfirmKeywordDenylist],
      autoExtractionBatchSize: 20,
      searchDefaultMode: DEFAULT_SEARCH_MODE,
      searchHybridAlpha: 0.6,
      searchHybridBeta: 0.4,
      searchDefaultLimit: 20,
      searchTypeWeights: { ...defaultSearchTypeWeights },
      searchRecencyHalfLifeDays: 14,
      searchSubpathBoostWeight: defaultMonorepoSubpathBoostWeight,
      githubProjectKeyPrefix: DEFAULT_GITHUB_PREFIX,
      githubKeyPrefix: DEFAULT_GITHUB_PREFIX,
      localKeyPrefix: DEFAULT_LOCAL_PREFIX,
      autoCreateProjectSubprojects: true,
      enableMonorepoResolution: false,
      monorepoDetectionLevel: DEFAULT_MONOREPO_DETECTION_LEVEL,
      monorepoMode: DEFAULT_MONOREPO_MODE,
      monorepoContextMode: DEFAULT_MONOREPO_CONTEXT_MODE,
      monorepoSubpathMetadataEnabled: true,
      monorepoSubpathBoostEnabled: true,
      monorepoSubpathBoostWeight: defaultMonorepoSubpathBoostWeight,
      monorepoRootMarkers: DEFAULT_MONOREPO_ROOT_MARKERS,
      monorepoWorkspaceGlobs: DEFAULT_MONOREPO_GLOBS,
      monorepoExcludeGlobs: DEFAULT_MONOREPO_EXCLUDE_GLOBS,
      monorepoMaxDepth: DEFAULT_MONOREPO_MAX_DEPTH,
      defaultOutboundLocale: DEFAULT_OUTBOUND_LOCALE,
      supportedOutboundLocales: DEFAULT_SUPPORTED_OUTBOUND_LOCALES,
      enableActivityAutoLog: true,
      enableDecisionExtraction: true,
      decisionExtractionMode: 'llm_only',
      decisionDefaultStatus: 'draft',
      decisionAutoConfirmEnabled: false,
      decisionAutoConfirmMinConfidence: 0.9,
      decisionBatchSize: 25,
      decisionBackfillDays: 30,
      rawAccessMinRole: 'WRITER',
      retentionPolicyEnabled: false,
      auditRetentionDays: 365,
      rawRetentionDays: 90,
      retentionMode: 'archive',
      securityStreamEnabled: true,
      securityStreamSinkId: null,
      securityStreamMinSeverity: 'medium',
      oidcSyncMode: OidcSyncMode.add_only,
      oidcAllowAutoProvision: true,
    };
  }
  return {
    resolutionOrder: parseResolutionOrder(settings.resolutionOrder),
    autoCreateProject: settings.autoCreateProject,
    autoCreateProjectSubprojects: settings.autoCreateProjectSubprojects,
    githubAutoCreateProjects: settings.githubAutoCreateProjects ?? settings.autoCreateProject ?? true,
    githubAutoCreateSubprojects:
      settings.githubAutoCreateSubprojects ?? settings.autoCreateProjectSubprojects ?? false,
    githubPermissionSyncEnabled: settings.githubPermissionSyncEnabled ?? false,
    githubPermissionSyncMode: parseGithubPermissionSyncMode(settings.githubPermissionSyncMode),
    githubCacheTtlSeconds: parseGithubCacheTtlSeconds(settings.githubCacheTtlSeconds, 900),
    githubRoleMapping: parseGithubRoleMapping(settings.githubRoleMapping),
    githubWebhookEnabled: settings.githubWebhookEnabled ?? false,
    githubWebhookSyncMode: parseGithubPermissionSyncMode(
      settings.githubWebhookSyncMode ?? DEFAULT_GITHUB_WEBHOOK_SYNC_MODE
    ),
    githubTeamMappingEnabled: settings.githubTeamMappingEnabled ?? true,
    autoSwitchRepo: settings.autoSwitchRepo,
    autoSwitchSubproject: settings.autoSwitchSubproject,
    allowManualPin: settings.allowManualPin,
    enableGitEvents: settings.enableGitEvents,
    enableCommitEvents: settings.enableCommitEvents,
    enableMergeEvents: settings.enableMergeEvents,
    enableCheckoutEvents: settings.enableCheckoutEvents,
    checkoutDebounceSeconds: parseNonNegativeInt(
      settings.checkoutDebounceSeconds,
      defaultCheckoutDebounceSeconds
    ),
    checkoutDailyLimit: parsePositiveInt(settings.checkoutDailyLimit, defaultCheckoutDailyLimit),
    enableAutoExtraction: settings.enableAutoExtraction,
    autoExtractionMode: settings.autoExtractionMode || DEFAULT_AUTO_EXTRACT_MODE,
    autoConfirmMinConfidence: Math.min(
      Math.max(Number(settings.autoConfirmMinConfidence ?? 0.85), 0),
      1
    ),
    autoConfirmAllowedEventTypes: parseStringArray(
      settings.autoConfirmAllowedEventTypes,
      [...defaultAutoConfirmAllowedEventTypes]
    ),
    autoConfirmKeywordAllowlist: parseStringArray(
      settings.autoConfirmKeywordAllowlist,
      [...defaultAutoConfirmKeywordAllowlist]
    ),
    autoConfirmKeywordDenylist: parseStringArray(
      settings.autoConfirmKeywordDenylist,
      [...defaultAutoConfirmKeywordDenylist]
    ),
    autoExtractionBatchSize: parsePositiveInt(settings.autoExtractionBatchSize, 20),
    searchDefaultMode: settings.searchDefaultMode || DEFAULT_SEARCH_MODE,
    searchHybridAlpha: Math.min(Math.max(Number(settings.searchHybridAlpha ?? 0.6), 0), 1),
    searchHybridBeta: Math.min(Math.max(Number(settings.searchHybridBeta ?? 0.4), 0), 1),
    searchDefaultLimit: parsePositiveInt(settings.searchDefaultLimit, 20),
    searchTypeWeights: parseSearchTypeWeights(settings.searchTypeWeights),
    searchRecencyHalfLifeDays: Math.min(
      Math.max(Number(settings.searchRecencyHalfLifeDays ?? 14), 1),
      3650
    ),
    searchSubpathBoostWeight: Math.min(
      Math.max(Number(settings.searchSubpathBoostWeight ?? defaultMonorepoSubpathBoostWeight), 1),
      10
    ),
    githubProjectKeyPrefix:
      settings.githubProjectKeyPrefix ||
      settings.githubKeyPrefix ||
      DEFAULT_GITHUB_PREFIX,
    githubKeyPrefix: settings.githubKeyPrefix || settings.githubProjectKeyPrefix || DEFAULT_GITHUB_PREFIX,
    localKeyPrefix: settings.localKeyPrefix || DEFAULT_LOCAL_PREFIX,
    enableMonorepoResolution: settings.enableMonorepoResolution,
    monorepoDetectionLevel: parseDetectionLevel(
      settings.monorepoDetectionLevel,
      DEFAULT_MONOREPO_DETECTION_LEVEL
    ),
    monorepoMode: parseMonorepoMode(settings.monorepoMode),
    monorepoContextMode: parseMonorepoContextMode(settings.monorepoContextMode),
    monorepoSubpathMetadataEnabled: settings.monorepoSubpathMetadataEnabled ?? true,
    monorepoSubpathBoostEnabled: settings.monorepoSubpathBoostEnabled ?? true,
    monorepoSubpathBoostWeight: Math.min(
      Math.max(Number(settings.monorepoSubpathBoostWeight ?? defaultMonorepoSubpathBoostWeight), 1),
      10
    ),
    monorepoRootMarkers: parseStringArray(
      settings.monorepoRootMarkers,
      DEFAULT_MONOREPO_ROOT_MARKERS
    ),
    monorepoWorkspaceGlobs: parseStringArray(
      settings.monorepoWorkspaceGlobs,
      DEFAULT_MONOREPO_GLOBS
    ),
    monorepoExcludeGlobs: parseStringArray(
      settings.monorepoExcludeGlobs,
      DEFAULT_MONOREPO_EXCLUDE_GLOBS
    ),
    monorepoMaxDepth: parsePositiveInt(settings.monorepoMaxDepth, DEFAULT_MONOREPO_MAX_DEPTH),
    defaultOutboundLocale: parseOutboundLocale(
      settings.defaultOutboundLocale,
      DEFAULT_OUTBOUND_LOCALE
    ),
    supportedOutboundLocales: parseOutboundLocaleArray(
      settings.supportedOutboundLocales,
      DEFAULT_SUPPORTED_OUTBOUND_LOCALES
    ),
    enableActivityAutoLog: settings.enableActivityAutoLog ?? true,
    enableDecisionExtraction: settings.enableDecisionExtraction ?? true,
    decisionExtractionMode: settings.decisionExtractionMode ?? 'llm_only',
    decisionDefaultStatus: settings.decisionDefaultStatus ?? 'draft',
    decisionAutoConfirmEnabled: settings.decisionAutoConfirmEnabled ?? false,
    decisionAutoConfirmMinConfidence: Math.min(
      Math.max(Number(settings.decisionAutoConfirmMinConfidence ?? 0.9), 0),
      1
    ),
    decisionBatchSize: parsePositiveInt(settings.decisionBatchSize, 25),
    decisionBackfillDays: parsePositiveInt(settings.decisionBackfillDays, 30),
    rawAccessMinRole: parseProjectRole(settings.rawAccessMinRole, 'WRITER'),
    retentionPolicyEnabled: settings.retentionPolicyEnabled ?? false,
    auditRetentionDays: parsePositiveInt(settings.auditRetentionDays, 365),
    rawRetentionDays: parsePositiveInt(settings.rawRetentionDays, 90),
    retentionMode: parseRetentionMode(settings.retentionMode ?? DEFAULT_RETENTION_MODE),
    securityStreamEnabled: settings.securityStreamEnabled ?? true,
    securityStreamSinkId: settings.securityStreamSinkId || null,
    securityStreamMinSeverity: parseSecuritySeverity(settings.securityStreamMinSeverity),
    oidcSyncMode: settings.oidcSyncMode ?? OidcSyncMode.add_only,
    oidcAllowAutoProvision: settings.oidcAllowAutoProvision ?? true,
  };
}

function parseProjectRole(
  input: unknown,
  fallback: 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER'
): 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER' {
  if (input === 'OWNER' || input === 'MAINTAINER' || input === 'WRITER' || input === 'READER') {
    return input;
  }
  return fallback;
}

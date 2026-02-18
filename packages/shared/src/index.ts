import { z } from 'zod';

export const memoryTypeSchema = z.enum([
  'summary',
  'activity',
  'active_work',
  'constraint',
  'problem',
  'goal',
  'decision',
  'note',
  'caveat',
]);

export type MemoryType = z.infer<typeof memoryTypeSchema>;
export const memoryStatusSchema = z.enum(['draft', 'confirmed', 'rejected']);
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;
export const memorySourceSchema = z.enum(['auto', 'human', 'import']);
export type MemorySource = z.infer<typeof memorySourceSchema>;

export const createProjectSchema = z.object({
  workspace_key: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
});

export const createMemorySchema = z.object({
  workspace_key: z.string().min(1),
  project_key: z.string().min(1),
  type: memoryTypeSchema,
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: memoryStatusSchema.optional(),
  source: memorySourceSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateMemoryInput = z.infer<typeof createMemorySchema>;

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName?: string | null;
  source: 'database' | 'env';
  envAdmin?: boolean;
};

export type ListMemoriesQuery = {
  workspace_key: string;
  project_key?: string;
  current_subpath?: string;
  debug?: boolean;
  type?: MemoryType;
  q?: string;
  mode?: 'hybrid' | 'keyword' | 'semantic';
  status?: MemoryStatus;
  source?: MemorySource;
  confidence_min?: number;
  confidence_max?: number;
  limit?: number;
  since?: string;
};

export const resolutionKindSchema = z.enum([
  'github_remote',
  'repo_root_slug',
  'manual',
]);

export type ResolutionKind = z.infer<typeof resolutionKindSchema>;

export const monorepoModeSchema = z.enum([
  'repo_only',
  'repo_hash_subpath',
  'repo_colon_subpath',
]);

export type MonorepoMode = z.infer<typeof monorepoModeSchema>;

export const monorepoContextModeSchema = z.enum(['shared_repo', 'split_on_demand', 'split_auto']);
export type MonorepoContextMode = z.infer<typeof monorepoContextModeSchema>;
export const githubPermissionSyncModeSchema = z.enum(['add_only', 'add_and_remove']);
export type GithubPermissionSyncMode = z.infer<typeof githubPermissionSyncModeSchema>;
export const githubWebhookSyncModeSchema = z.enum(['add_only', 'add_and_remove']);
export type GithubWebhookSyncMode = z.infer<typeof githubWebhookSyncModeSchema>;
export const retentionModeSchema = z.enum(['archive', 'hard_delete']);
export type RetentionMode = z.infer<typeof retentionModeSchema>;
export const securitySeveritySchema = z.enum(['low', 'medium', 'high']);
export type SecuritySeverity = z.infer<typeof securitySeveritySchema>;

export const oidcSyncModeSchema = z.enum(['add_only', 'add_and_remove']);
export type OidcSyncMode = z.infer<typeof oidcSyncModeSchema>;

export const oidcClaimGroupsFormatSchema = z.enum(['id', 'name']);
export type OidcClaimGroupsFormat = z.infer<typeof oidcClaimGroupsFormatSchema>;

export const defaultMonorepoRootMarkers = [
  'pnpm-workspace.yaml',
  'turbo.json',
  'nx.json',
  'lerna.json',
] as const;

export const defaultMonorepoWorkspaceGlobs = ['apps/*', 'packages/*'] as const;
export const defaultMonorepoExcludeGlobs = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '.next/**',
] as const;
export const defaultMonorepoSubpathBoostWeight = 1.5;
export const defaultSearchTypeWeights = {
  decision: 1.5,
  constraint: 1.35,
  goal: 1.2,
  activity: 1.05,
  active_work: 1.1,
  summary: 1.2,
  note: 1.0,
  problem: 1.0,
  caveat: 0.95,
} as const;
export const defaultGithubRoleMapping = {
  admin: 'maintainer',
  maintain: 'maintainer',
  write: 'writer',
  triage: 'reader',
  read: 'reader',
} as const;

export const defaultCheckoutDebounceSeconds = 30;
export const defaultCheckoutDailyLimit = 200;
export const defaultGithubCacheTtlSeconds = 900;
export const defaultOutboundLocales = ['en', 'ko', 'ja', 'es', 'zh'] as const;
export const defaultBundleTokenBudgetTotal = 3000;
export const defaultBundleBudgetGlobalWorkspacePct = 0.15;
export const defaultBundleBudgetGlobalUserPct = 0.1;
export const defaultBundleBudgetProjectPct = 0.45;
export const defaultBundleBudgetRetrievalPct = 0.3;
export const defaultGlobalRulesRecommendMax = 5;
export const defaultGlobalRulesWarnThreshold = 10;
export const defaultGlobalRulesSummaryMinCount = 8;
export const defaultGlobalRulesRoutingTopK = 5;
export const defaultGlobalRulesRoutingMinScore = 0.2;
export const defaultPersonaWeights = {
  neutral: {
    decision: 1.0,
    constraint: 1.0,
    active_work: 1.1,
    recent_activity: 1.0,
  },
  author: {
    active_work: 2.0,
    recent_activity: 1.5,
    decision: 0.8,
    constraint: 0.8,
  },
  reviewer: {
    constraint: 2.0,
    decision: 1.5,
    recent_activity: 1.0,
    active_work: 0.9,
  },
  architect: {
    decision: 2.0,
    constraint: 1.5,
    active_work: 1.0,
    recent_activity: 0.9,
  },
} as const;
export type OutboundLocale = (typeof defaultOutboundLocales)[number];
export const defaultAutoConfirmAllowedEventTypes = ['post_commit', 'post_merge'] as const;
export const defaultAutoConfirmKeywordAllowlist = [
  'migrate',
  'switch',
  'remove',
  'deprecate',
  'rename',
  'refactor',
] as const;
export const defaultAutoConfirmKeywordDenylist = ['wip', 'tmp', 'debug', 'test', 'try'] as const;

export const resolutionOrderSchema = z
  .array(resolutionKindSchema)
  .length(3)
  .refine((value) => new Set(value).size === 3, 'resolution_order must contain unique kinds');

export const resolveProjectSchema = z.object({
  workspace_key: z.string().min(1),
  github_remote: z
    .object({
      host: z.string().optional(),
      owner: z.string().optional(),
      repo: z.string().optional(),
      normalized: z.string().optional(),
    })
    .optional(),
  repo_root_slug: z.string().min(1).optional(),
  repo_root: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  relative_path: z.string().min(1).optional(),
  monorepo: z
    .object({
      enabled: z.boolean().optional(),
      candidate_subpaths: z.array(z.string().min(1)).max(20).optional(),
    })
    .optional(),
  manual_project_key: z.string().min(1).optional(),
});

export type ResolveProjectInput = z.infer<typeof resolveProjectSchema>;

export const workspaceSettingsSchema = z.object({
  workspace_key: z.string().min(1),
  resolution_order: resolutionOrderSchema.default([
    'github_remote',
    'repo_root_slug',
    'manual',
  ]),
  auto_create_project: z.boolean().default(true),
  auto_create_project_subprojects: z.boolean().default(true),
  auto_switch_repo: z.boolean().default(true),
  auto_switch_subproject: z.boolean().default(false),
  allow_manual_pin: z.boolean().default(true),
  enable_git_events: z.boolean().default(true),
  enable_commit_events: z.boolean().default(true),
  enable_merge_events: z.boolean().default(true),
  enable_checkout_events: z.boolean().default(false),
  checkout_debounce_seconds: z.number().int().min(0).max(3600).default(defaultCheckoutDebounceSeconds),
  checkout_daily_limit: z.number().int().positive().max(50000).default(defaultCheckoutDailyLimit),
  enable_auto_extraction: z.boolean().default(true),
  auto_extraction_mode: z.enum(['draft_only', 'auto_confirm']).default('draft_only'),
  auto_confirm_min_confidence: z.number().min(0).max(1).default(0.85),
  auto_confirm_allowed_event_types: z
    .array(z.enum(['post_commit', 'post_merge', 'post_checkout']))
    .max(20)
    .default([...defaultAutoConfirmAllowedEventTypes]),
  auto_confirm_keyword_allowlist: z
    .array(z.string().min(1))
    .max(200)
    .default([...defaultAutoConfirmKeywordAllowlist]),
  auto_confirm_keyword_denylist: z
    .array(z.string().min(1))
    .max(200)
    .default([...defaultAutoConfirmKeywordDenylist]),
  auto_extraction_batch_size: z.number().int().positive().max(2000).default(20),
  search_default_mode: z.enum(['hybrid', 'keyword', 'semantic']).default('hybrid'),
  search_hybrid_alpha: z.number().min(0).max(1).default(0.6),
  search_hybrid_beta: z.number().min(0).max(1).default(0.4),
  search_default_limit: z.number().int().positive().max(500).default(20),
  search_type_weights: z.record(z.string(), z.number().min(0).max(100)).default({
    ...defaultSearchTypeWeights,
  }),
  search_recency_half_life_days: z.number().positive().max(3650).default(14),
  search_subpath_boost_weight: z.number().min(1).max(10).default(defaultMonorepoSubpathBoostWeight),
  bundle_token_budget_total: z.number().int().positive().max(50000).default(defaultBundleTokenBudgetTotal),
  bundle_budget_global_workspace_pct: z
    .number()
    .positive()
    .max(1)
    .default(defaultBundleBudgetGlobalWorkspacePct),
  bundle_budget_global_user_pct: z
    .number()
    .min(0)
    .max(1)
    .default(defaultBundleBudgetGlobalUserPct),
  bundle_budget_project_pct: z.number().positive().max(1).default(defaultBundleBudgetProjectPct),
  bundle_budget_retrieval_pct: z.number().positive().max(1).default(defaultBundleBudgetRetrievalPct),
  global_rules_recommend_max: z.number().int().positive().max(1000).default(defaultGlobalRulesRecommendMax),
  global_rules_warn_threshold: z
    .number()
    .int()
    .positive()
    .max(1000)
    .default(defaultGlobalRulesWarnThreshold),
  global_rules_summary_enabled: z.boolean().default(true),
  global_rules_summary_min_count: z
    .number()
    .int()
    .positive()
    .max(1000)
    .default(defaultGlobalRulesSummaryMinCount),
  global_rules_selection_mode: z.enum(['score', 'recent', 'priority_only']).default('score'),
  global_rules_routing_enabled: z.boolean().default(true),
  global_rules_routing_mode: z.enum(['semantic', 'keyword', 'hybrid']).default('hybrid'),
  global_rules_routing_top_k: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(defaultGlobalRulesRoutingTopK),
  global_rules_routing_min_score: z
    .number()
    .min(0)
    .max(1)
    .default(defaultGlobalRulesRoutingMinScore),
  persona_weights: z
    .record(z.string(), z.record(z.string(), z.number().positive().max(100)))
    .default({
      ...defaultPersonaWeights,
    }),
  github_auto_create_projects: z.boolean().default(true),
  github_auto_create_subprojects: z.boolean().default(false),
  github_project_key_prefix: z.string().min(1).default('github:'),
  github_permission_sync_enabled: z.boolean().default(false),
  github_permission_sync_mode: githubPermissionSyncModeSchema.default('add_only'),
  github_cache_ttl_seconds: z.number().int().min(30).max(86400).default(defaultGithubCacheTtlSeconds),
  github_role_mapping: z
    .record(z.string(), z.enum(['owner', 'maintainer', 'writer', 'reader']))
    .default({ ...defaultGithubRoleMapping }),
  github_webhook_enabled: z.boolean().default(false),
  github_webhook_sync_mode: githubWebhookSyncModeSchema.default('add_only'),
  github_team_mapping_enabled: z.boolean().default(true),
  github_key_prefix: z.string().min(1).default('github:'),
  local_key_prefix: z.string().min(1).default('local:'),
  enable_monorepo_resolution: z.boolean().default(false),
  monorepo_detection_level: z.number().int().min(0).max(3).default(2),
  monorepo_mode: monorepoModeSchema.default('repo_hash_subpath'),
  monorepo_context_mode: monorepoContextModeSchema.default('shared_repo'),
  monorepo_subpath_metadata_enabled: z.boolean().default(true),
  monorepo_subpath_boost_enabled: z.boolean().default(true),
  monorepo_subpath_boost_weight: z.number().min(1).max(10).default(defaultMonorepoSubpathBoostWeight),
  monorepo_root_markers: z
    .array(z.string().min(1))
    .max(30)
    .default([...defaultMonorepoRootMarkers]),
  monorepo_workspace_globs: z
    .array(z.string().min(1))
    .max(30)
    .default([...defaultMonorepoWorkspaceGlobs]),
  monorepo_exclude_globs: z
    .array(z.string().min(1))
    .max(50)
    .default([...defaultMonorepoExcludeGlobs]),
  monorepo_max_depth: z.number().int().positive().max(12).default(3),
  default_outbound_locale: z.enum(defaultOutboundLocales).default('en'),
  supported_outbound_locales: z
    .array(z.enum(defaultOutboundLocales))
    .min(1)
    .max(10)
    .default([...defaultOutboundLocales]),
  enable_activity_auto_log: z.boolean().default(true),
  enable_decision_extraction: z.boolean().default(true),
  decision_extraction_mode: z.enum(['llm_only', 'hybrid_priority']).default('llm_only'),
  decision_default_status: z.enum(['draft', 'confirmed']).default('draft'),
  decision_auto_confirm_enabled: z.boolean().default(false),
  decision_auto_confirm_min_confidence: z.number().min(0).max(1).default(0.9),
  decision_batch_size: z.number().int().positive().max(2000).default(25),
  decision_backfill_days: z.number().int().positive().max(3650).default(30),
  active_work_stale_days: z.number().int().positive().max(3650).default(14),
  active_work_auto_close_enabled: z.boolean().default(false),
  active_work_auto_close_days: z.number().int().positive().max(3650).default(45),
  raw_access_min_role: z.enum(['OWNER', 'MAINTAINER', 'WRITER', 'READER']).default('WRITER'),
  retention_policy_enabled: z.boolean().default(false),
  audit_retention_days: z.number().int().positive().max(3650).default(365),
  raw_retention_days: z.number().int().positive().max(3650).default(90),
  retention_mode: retentionModeSchema.default('archive'),
  security_stream_enabled: z.boolean().default(true),
  security_stream_sink_id: z.string().uuid().nullable().optional(),
  security_stream_min_severity: securitySeveritySchema.default('medium'),
  oidc_sync_mode: oidcSyncModeSchema.default('add_only'),
  oidc_allow_auto_provision: z.boolean().default(true),
});

export type WorkspaceSettingsInput = z.infer<typeof workspaceSettingsSchema>;

export const globalRuleScopeSchema = z.enum(['workspace', 'user']);
export type GlobalRuleScope = z.infer<typeof globalRuleScopeSchema>;

export const globalRuleCategorySchema = z.enum(['policy', 'security', 'style', 'process', 'other']);
export type GlobalRuleCategory = z.infer<typeof globalRuleCategorySchema>;

export const globalRuleSeveritySchema = z.enum(['low', 'medium', 'high']);
export type GlobalRuleSeverity = z.infer<typeof globalRuleSeveritySchema>;

export const contextPersonaSchema = z.enum(['neutral', 'author', 'reviewer', 'architect']);
export type ContextPersona = z.infer<typeof contextPersonaSchema>;

export const contextPersonaInputSchema = z.object({
  context_persona: contextPersonaSchema.default('neutral'),
});

export type ContextPersonaInput = z.infer<typeof contextPersonaInputSchema>;

export const globalRuleSchema = z.object({
  workspace_key: z.string().min(1),
  scope: globalRuleScopeSchema,
  user_id: z.string().min(1).optional(),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  category: globalRuleCategorySchema.default('policy'),
  priority: z.coerce.number().int().min(1).max(5).default(3),
  severity: globalRuleSeveritySchema.default('medium'),
  pinned: z.boolean().default(false),
  enabled: z.boolean().default(true),
  tags: z.array(z.string().min(1).max(64)).max(100).default([]),
});

export type GlobalRuleInput = z.infer<typeof globalRuleSchema>;

export const decisionKeywordPolicySchema = z.object({
  id: z.string().uuid().optional(),
  workspace_key: z.string().min(1),
  name: z.string().min(1),
  positive_keywords: z.array(z.string().min(1)).max(300).default([]),
  negative_keywords: z.array(z.string().min(1)).max(300).default([]),
  file_path_positive_patterns: z.array(z.string().min(1)).max(300).default([]),
  file_path_negative_patterns: z.array(z.string().min(1)).max(300).default([]),
  weight_positive: z.number().min(0).max(100).default(1),
  weight_negative: z.number().min(0).max(100).default(1),
  enabled: z.boolean().default(true),
});

export type DecisionKeywordPolicyInput = z.infer<typeof decisionKeywordPolicySchema>;

export const createProjectMappingSchema = z.object({
  workspace_key: z.string().min(1),
  project_key: z.string().min(1),
  kind: resolutionKindSchema,
  external_id: z.string().min(1),
  priority: z.number().int().nonnegative().optional(),
  is_enabled: z.boolean().optional(),
});

export const updateProjectMappingSchema = z.object({
  id: z.string().min(1),
  priority: z.number().int().nonnegative().optional(),
  is_enabled: z.boolean().optional(),
  external_id: z.string().min(1).optional(),
  project_key: z.string().min(1).optional(),
});

export const outboundIntegrationTypeSchema = z.enum([
  'slack',
  'jira',
  'confluence',
  'notion',
  'webhook',
  'email',
]);
export type OutboundIntegrationType = z.infer<typeof outboundIntegrationTypeSchema>;

export const outboundModeSchema = z.enum(['template', 'llm']);
export type OutboundMode = z.infer<typeof outboundModeSchema>;

export const outboundStyleSchema = z.enum(['short', 'normal', 'verbose']);
export type OutboundStyle = z.infer<typeof outboundStyleSchema>;

export type OutboundTemplateCatalog = Record<string, Record<string, string>>;

export const defaultOutboundTemplates: Record<OutboundLocale, OutboundTemplateCatalog> = {
  en: {
    slack: {
      'raw.search': 'Searched raw logs for "{q}" ({count} results).',
      'raw.view': 'Viewed raw message {message_id}.',
      'decision.draft.created': 'Draft decision created: {summary}',
      'git.commit': 'Captured commit event on {branch}.',
      'git.merge': 'Captured merge event on {branch}.',
      'git.checkout': 'Captured checkout event on {branch}.',
      'ci.success': 'CI succeeded for {repository} on {branch}.',
      'ci.failure': 'CI failed for {repository} on {branch}.',
      'integration.autowrite': 'Integration auto-write {status} for {provider}.',
      'workspace_settings.update': 'Workspace settings were updated.',
      'project_mapping.update': 'Project mapping was updated.',
      'integration.update': 'Integration settings were updated.',
      'outbound.render.preview': 'Outbound preview generated.',
      'outbound.settings.update': 'Outbound workspace locale settings were updated.',
      'outbound.policy.update': 'Outbound messaging policy was updated for {integration_type}.',
    },
  },
  ko: {
    slack: {
      'raw.search': '원문 로그에서 "{q}"를 검색했습니다. (결과 {count}개)',
      'raw.view': '원문 메시지 {message_id}를 조회했습니다.',
      'decision.draft.created': '결정 초안이 생성되었습니다: {summary}',
      'git.commit': '{branch} 브랜치의 커밋 이벤트를 저장했습니다.',
      'git.merge': '{branch} 브랜치의 머지 이벤트를 저장했습니다.',
      'git.checkout': '{branch} 브랜치의 체크아웃 이벤트를 저장했습니다.',
      'ci.success': '{repository} / {branch} CI가 성공했습니다.',
      'ci.failure': '{repository} / {branch} CI가 실패했습니다.',
      'integration.autowrite': '{provider} 자동 쓰기 작업이 {status} 상태입니다.',
      'workspace_settings.update': '워크스페이스 설정이 변경되었습니다.',
      'project_mapping.update': '프로젝트 매핑이 변경되었습니다.',
      'integration.update': '통합 설정이 변경되었습니다.',
      'outbound.settings.update': '아웃바운드 로케일 설정이 변경되었습니다.',
      'outbound.policy.update': '{integration_type} 아웃바운드 정책이 변경되었습니다.',
    },
  },
  ja: {
    slack: {
      'raw.search': '「{q}」で raw ログを検索しました（{count} 件）。',
      'raw.view': 'raw メッセージ {message_id} を表示しました。',
      'decision.draft.created': 'ドラフト決定を作成しました: {summary}',
      'git.commit': '{branch} ブランチで commit イベントを記録しました。',
      'git.merge': '{branch} ブランチで merge イベントを記録しました。',
      'git.checkout': '{branch} ブランチで checkout イベントを記録しました。',
      'ci.success': '{repository} の {branch} で CI が成功しました。',
      'ci.failure': '{repository} の {branch} で CI が失敗しました。',
      'integration.autowrite': '{provider} の自動書き込みは {status} です。',
      'workspace_settings.update': 'ワークスペース設定が更新されました。',
      'project_mapping.update': 'プロジェクトマッピングが更新されました。',
      'integration.update': '連携設定が更新されました。',
      'outbound.settings.update': 'アウトバウンドロケール設定が更新されました。',
      'outbound.policy.update': '{integration_type} のアウトバウンドポリシーが更新されました。',
    },
  },
  es: {
    slack: {
      'raw.search': 'Se buscaron logs raw con "{q}" ({count} resultados).',
      'raw.view': 'Se abrió el mensaje raw {message_id}.',
      'decision.draft.created': 'Se creó un borrador de decisión: {summary}',
      'git.commit': 'Se registró un evento commit en {branch}.',
      'git.merge': 'Se registró un evento merge en {branch}.',
      'git.checkout': 'Se registró un evento checkout en {branch}.',
      'ci.success': 'CI exitoso para {repository} en {branch}.',
      'ci.failure': 'CI falló para {repository} en {branch}.',
      'integration.autowrite': 'La escritura automática de {provider} quedó en {status}.',
      'workspace_settings.update': 'Se actualizaron los ajustes del workspace.',
      'project_mapping.update': 'Se actualizó el mapeo de proyecto.',
      'integration.update': 'Se actualizaron los ajustes de integración.',
      'outbound.settings.update': 'Se actualizaron los locales outbound del workspace.',
      'outbound.policy.update': 'Se actualizó la política outbound para {integration_type}.',
    },
  },
  zh: {
    slack: {
      'raw.search': '已按“{q}”搜索原始日志（{count} 条结果）。',
      'raw.view': '已查看原始消息 {message_id}。',
      'decision.draft.created': '已创建决策草稿：{summary}',
      'git.commit': '已记录 {branch} 分支的 commit 事件。',
      'git.merge': '已记录 {branch} 分支的 merge 事件。',
      'git.checkout': '已记录 {branch} 分支的 checkout 事件。',
      'ci.success': '{repository} 的 {branch} CI 成功。',
      'ci.failure': '{repository} 的 {branch} CI 失败。',
      'integration.autowrite': '{provider} 自动写入状态：{status}。',
      'workspace_settings.update': '工作区设置已更新。',
      'project_mapping.update': '项目映射已更新。',
      'integration.update': '集成设置已更新。',
      'outbound.settings.update': '工作区 outbound 语言设置已更新。',
      'outbound.policy.update': '{integration_type} 的 outbound 策略已更新。',
    },
  },
};

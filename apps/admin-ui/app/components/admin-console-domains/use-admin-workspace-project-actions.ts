'use client';

import type { FormEvent } from 'react';
import type {
  MonorepoSubprojectPolicy,
  OidcGroupMapping,
  OidcProvider,
  Project,
  ProjectMapping,
  ProjectMember,
  ProjectRole,
  Workspace,
  WorkspaceSettings,
} from '../../lib/types';
import { isSubprojectKey } from '../../lib/utils';
import type { AdminMemorySearchState } from './use-admin-memory-search-state';
import type { AdminWorkspaceProjectState } from './use-admin-workspace-project-state';
import type { AdminCallApi } from './types';
import { parseLineSeparatedValues } from './types';

type WorkspaceProjectDeps = {
  callApi: AdminCallApi;
  workspaceState: AdminWorkspaceProjectState;
  memoryState: AdminMemorySearchState;
};

export function useAdminWorkspaceProjectActions(deps: WorkspaceProjectDeps) {
  const { callApi, workspaceState, memoryState } = deps;

  async function loadWorkspaces() {
    const data = await callApi<{ workspaces: Workspace[] }>('/v1/workspaces');
    workspaceState.setWorkspaces(data.workspaces);
    if (!workspaceState.selectedWorkspace && data.workspaces.length > 0) {
      workspaceState.setSelectedWorkspace(data.workspaces[0].key);
    }
  }

  async function loadProjects(workspaceKey: string) {
    const query = new URLSearchParams({ workspace_key: workspaceKey });
    const data = await callApi<{ projects: Project[] }>(`/v1/projects?${query.toString()}`);
    workspaceState.setProjects(data.projects);
    if (!data.projects.some((project) => project.key === workspaceState.selectedProject)) {
      workspaceState.setSelectedProject(data.projects[0]?.key || '');
    }
    if (!workspaceState.newMappingProjectKey && data.projects.length > 0) {
      workspaceState.setNewMappingProjectKey(data.projects[0].key);
    }
    if (!workspaceState.newMonorepoPolicyRepoKey) {
      const repoProject = data.projects.find((project) => !isSubprojectKey(project.key));
      if (repoProject) {
        workspaceState.setNewMonorepoPolicyRepoKey(repoProject.key);
      }
    }
  }

  async function loadMembers(workspaceKey: string, projectKey: string) {
    const query = new URLSearchParams({ workspace_key: workspaceKey });
    const data = await callApi<{ members: ProjectMember[] }>(
      `/v1/projects/${encodeURIComponent(projectKey)}/members?${query.toString()}`
    );
    workspaceState.setMembers(data.members);
  }

  async function loadWorkspaceSettings(workspaceKey: string) {
    const query = new URLSearchParams({ workspace_key: workspaceKey });
    const settings = await callApi<WorkspaceSettings>(`/v1/workspace-settings?${query.toString()}`);
    workspaceState.setResolutionOrder(settings.resolution_order);
    workspaceState.setAutoCreateProject(settings.auto_create_project);
    workspaceState.setAutoCreateProjectSubprojects(settings.auto_create_project_subprojects);
    workspaceState.setAutoSwitchRepo(settings.auto_switch_repo ?? true);
    workspaceState.setAutoSwitchSubproject(settings.auto_switch_subproject ?? false);
    workspaceState.setAllowManualPin(settings.allow_manual_pin ?? true);
    workspaceState.setEnableGitEvents(settings.enable_git_events ?? true);
    workspaceState.setEnableCommitEvents(settings.enable_commit_events ?? true);
    workspaceState.setEnableMergeEvents(settings.enable_merge_events ?? true);
    workspaceState.setEnableCheckoutEvents(settings.enable_checkout_events ?? false);
    workspaceState.setCheckoutDebounceSeconds(settings.checkout_debounce_seconds ?? 30);
    workspaceState.setCheckoutDailyLimit(settings.checkout_daily_limit ?? 200);
    memoryState.setEnableActivityAutoLog(settings.enable_activity_auto_log ?? true);
    memoryState.setEnableDecisionExtraction(settings.enable_decision_extraction ?? true);
    memoryState.setDecisionExtractionMode(settings.decision_extraction_mode ?? 'llm_only');
    memoryState.setDecisionDefaultStatus(settings.decision_default_status ?? 'draft');
    memoryState.setDecisionAutoConfirmEnabled(settings.decision_auto_confirm_enabled ?? false);
    memoryState.setDecisionAutoConfirmMinConfidence(settings.decision_auto_confirm_min_confidence ?? 0.9);
    memoryState.setDecisionBatchSize(settings.decision_batch_size ?? 25);
    memoryState.setDecisionBackfillDays(settings.decision_backfill_days ?? 30);
    memoryState.setActiveWorkStaleDays(settings.active_work_stale_days ?? 14);
    memoryState.setActiveWorkAutoCloseEnabled(settings.active_work_auto_close_enabled ?? false);
    memoryState.setActiveWorkAutoCloseDays(settings.active_work_auto_close_days ?? 45);
    memoryState.setRawAccessMinRole(settings.raw_access_min_role ?? 'WRITER');
    workspaceState.setOidcSyncMode(settings.oidc_sync_mode ?? 'add_only');
    workspaceState.setOidcAllowAutoProvision(settings.oidc_allow_auto_provision ?? true);
    workspaceState.setSearchDefaultMode(settings.search_default_mode ?? 'hybrid');
    memoryState.setQueryMode(settings.search_default_mode ?? 'hybrid');
    workspaceState.setSearchHybridAlpha(settings.search_hybrid_alpha ?? 0.6);
    workspaceState.setSearchHybridBeta(settings.search_hybrid_beta ?? 0.4);
    workspaceState.setSearchDefaultLimit(settings.search_default_limit ?? 20);
    workspaceState.setSearchTypeWeightsJson(
      JSON.stringify(
        settings.search_type_weights || {
          decision: 1.5,
          constraint: 1.35,
          goal: 1.2,
          activity: 1.05,
          active_work: 1.1,
          summary: 1.2,
          note: 1.0,
          problem: 1.0,
          caveat: 0.95,
        },
        null,
        2
      )
    );
    workspaceState.setSearchRecencyHalfLifeDays(settings.search_recency_half_life_days ?? 14);
    workspaceState.setSearchSubpathBoostWeight(settings.search_subpath_boost_weight ?? 1.5);
    workspaceState.setBundleTokenBudgetTotal(settings.bundle_token_budget_total ?? 3000);
    workspaceState.setBundleBudgetGlobalWorkspacePct(settings.bundle_budget_global_workspace_pct ?? 0.15);
    workspaceState.setBundleBudgetGlobalUserPct(settings.bundle_budget_global_user_pct ?? 0.1);
    workspaceState.setBundleBudgetProjectPct(settings.bundle_budget_project_pct ?? 0.45);
    workspaceState.setBundleBudgetRetrievalPct(settings.bundle_budget_retrieval_pct ?? 0.3);
    workspaceState.setGlobalRulesRecommendMax(settings.global_rules_recommend_max ?? 5);
    workspaceState.setGlobalRulesWarnThreshold(settings.global_rules_warn_threshold ?? 10);
    workspaceState.setGlobalRulesSummaryEnabled(settings.global_rules_summary_enabled ?? true);
    workspaceState.setGlobalRulesSummaryMinCount(settings.global_rules_summary_min_count ?? 8);
    workspaceState.setGlobalRulesSelectionMode(settings.global_rules_selection_mode ?? 'score');
    workspaceState.setGlobalRulesRoutingEnabled(settings.global_rules_routing_enabled ?? true);
    workspaceState.setGlobalRulesRoutingMode(settings.global_rules_routing_mode ?? 'hybrid');
    workspaceState.setGlobalRulesRoutingTopK(settings.global_rules_routing_top_k ?? 5);
    workspaceState.setGlobalRulesRoutingMinScore(settings.global_rules_routing_min_score ?? 0.2);
    workspaceState.setRetentionPolicyEnabled(settings.retention_policy_enabled ?? false);
    workspaceState.setAuditRetentionDays(settings.audit_retention_days ?? 365);
    workspaceState.setRawRetentionDays(settings.raw_retention_days ?? 90);
    workspaceState.setRetentionMode(settings.retention_mode ?? 'archive');
    workspaceState.setSecurityStreamEnabled(settings.security_stream_enabled ?? true);
    workspaceState.setSecurityStreamSinkId(settings.security_stream_sink_id || '');
    workspaceState.setSecurityStreamMinSeverity(settings.security_stream_min_severity ?? 'medium');
    workspaceState.setGithubAutoCreateProjects(settings.github_auto_create_projects ?? true);
    workspaceState.setGithubAutoCreateSubprojects(settings.github_auto_create_subprojects ?? false);
    workspaceState.setGithubPermissionSyncEnabled(settings.github_permission_sync_enabled ?? false);
    workspaceState.setGithubPermissionSyncMode(settings.github_permission_sync_mode ?? 'add_only');
    workspaceState.setGithubCacheTtlSeconds(settings.github_cache_ttl_seconds ?? 900);
    workspaceState.setGithubWebhookEnabled(settings.github_webhook_enabled ?? false);
    workspaceState.setGithubWebhookSyncMode(settings.github_webhook_sync_mode ?? 'add_only');
    workspaceState.setGithubTeamMappingEnabled(settings.github_team_mapping_enabled ?? true);
    workspaceState.setGithubRoleMappingJson(
      JSON.stringify(
        settings.github_role_mapping || {
          admin: 'maintainer',
          maintain: 'maintainer',
          write: 'writer',
          triage: 'reader',
          read: 'reader',
        },
        null,
        2
      )
    );
    workspaceState.setGithubProjectKeyPrefix(
      settings.github_project_key_prefix ?? settings.github_key_prefix ?? 'github:'
    );
    workspaceState.setGithubPrefix(settings.github_project_key_prefix ?? settings.github_key_prefix ?? 'github:');
    workspaceState.setLocalPrefix(settings.local_key_prefix);
    workspaceState.setEnableMonorepoResolution(settings.enable_monorepo_resolution);
    workspaceState.setMonorepoDetectionLevel(settings.monorepo_detection_level ?? 2);
    workspaceState.setMonorepoMode(settings.monorepo_mode);
    workspaceState.setMonorepoContextMode(settings.monorepo_context_mode ?? 'shared_repo');
    workspaceState.setMonorepoSubpathMetadataEnabled(settings.monorepo_subpath_metadata_enabled ?? true);
    workspaceState.setMonorepoSubpathBoostEnabled(settings.monorepo_subpath_boost_enabled ?? true);
    workspaceState.setMonorepoSubpathBoostWeight(settings.monorepo_subpath_boost_weight ?? 1.5);
    workspaceState.setMonorepoWorkspaceGlobsText((settings.monorepo_workspace_globs || []).join('\n'));
    workspaceState.setMonorepoExcludeGlobsText((settings.monorepo_exclude_globs || []).join('\n'));
    workspaceState.setMonorepoRootMarkersText((settings.monorepo_root_markers || []).join('\n'));
    workspaceState.setMonorepoMaxDepth(settings.monorepo_max_depth || 3);
  }

  async function saveWorkspaceSettings() {
    if (!workspaceState.selectedWorkspace) {
      return;
    }
    const reason = workspaceState.workspaceSettingsReason.trim();
    const githubProjectKeyPrefix =
      (workspaceState.githubProjectKeyPrefix || workspaceState.githubPrefix || 'github:').trim() ||
      'github:';
    let githubRoleMapping: Record<string, unknown> = {
      admin: 'maintainer',
      maintain: 'maintainer',
      write: 'writer',
      triage: 'reader',
      read: 'reader',
    };
    let searchTypeWeights: Record<string, unknown> = {
      decision: 1.5,
      constraint: 1.35,
      goal: 1.2,
      activity: 1.05,
      active_work: 1.1,
      summary: 1.2,
      note: 1.0,
      problem: 1.0,
      caveat: 0.95,
    };
    if (workspaceState.githubRoleMappingJson.trim()) {
      try {
        githubRoleMapping = JSON.parse(workspaceState.githubRoleMappingJson) as Record<string, unknown>;
      } catch {
        githubRoleMapping = {
          admin: 'maintainer',
          maintain: 'maintainer',
          write: 'writer',
          triage: 'reader',
          read: 'reader',
        };
      }
    }
    if (workspaceState.searchTypeWeightsJson.trim()) {
      try {
        searchTypeWeights = JSON.parse(workspaceState.searchTypeWeightsJson) as Record<string, unknown>;
      } catch {
        searchTypeWeights = {
          decision: 1.5,
          constraint: 1.35,
          goal: 1.2,
          activity: 1.05,
          active_work: 1.1,
          summary: 1.2,
          note: 1.0,
          problem: 1.0,
          caveat: 0.95,
        };
      }
    }
    await callApi('/v1/workspace-settings', {
      method: 'PUT',
      body: JSON.stringify({
        workspace_key: workspaceState.selectedWorkspace,
        resolution_order: workspaceState.resolutionOrder,
        auto_create_project: workspaceState.autoCreateProject,
        auto_create_project_subprojects: workspaceState.autoCreateProjectSubprojects,
        auto_switch_repo: workspaceState.autoSwitchRepo,
        auto_switch_subproject: workspaceState.autoSwitchSubproject,
        allow_manual_pin: workspaceState.allowManualPin,
        enable_git_events: workspaceState.enableGitEvents,
        enable_commit_events: workspaceState.enableCommitEvents,
        enable_merge_events: workspaceState.enableMergeEvents,
        enable_checkout_events: workspaceState.enableCheckoutEvents,
        checkout_debounce_seconds: Math.min(Math.max(workspaceState.checkoutDebounceSeconds || 0, 0), 3600),
        checkout_daily_limit: Math.min(Math.max(workspaceState.checkoutDailyLimit || 1, 1), 50000),
        enable_activity_auto_log: memoryState.enableActivityAutoLog,
        enable_decision_extraction: memoryState.enableDecisionExtraction,
        decision_extraction_mode: memoryState.decisionExtractionMode,
        decision_default_status: memoryState.decisionDefaultStatus,
        decision_auto_confirm_enabled: memoryState.decisionAutoConfirmEnabled,
        decision_auto_confirm_min_confidence: Math.min(
          Math.max(memoryState.decisionAutoConfirmMinConfidence || 0, 0),
          1
        ),
        decision_batch_size: Math.min(Math.max(memoryState.decisionBatchSize || 1, 1), 2000),
        decision_backfill_days: Math.min(Math.max(memoryState.decisionBackfillDays || 1, 1), 3650),
        active_work_stale_days: Math.min(Math.max(memoryState.activeWorkStaleDays || 1, 1), 3650),
        active_work_auto_close_enabled: memoryState.activeWorkAutoCloseEnabled,
        active_work_auto_close_days: Math.min(Math.max(memoryState.activeWorkAutoCloseDays || 1, 1), 3650),
        raw_access_min_role: memoryState.rawAccessMinRole,
        oidc_sync_mode: workspaceState.oidcSyncMode,
        oidc_allow_auto_provision: workspaceState.oidcAllowAutoProvision,
        search_default_mode: workspaceState.searchDefaultMode,
        search_hybrid_alpha: Math.min(Math.max(workspaceState.searchHybridAlpha || 0, 0), 1),
        search_hybrid_beta: Math.min(Math.max(workspaceState.searchHybridBeta || 0, 0), 1),
        search_default_limit: Math.min(Math.max(workspaceState.searchDefaultLimit || 1, 1), 500),
        search_type_weights: searchTypeWeights,
        search_recency_half_life_days: Math.min(
          Math.max(workspaceState.searchRecencyHalfLifeDays || 1, 1),
          3650
        ),
        search_subpath_boost_weight: Math.min(
          Math.max(workspaceState.searchSubpathBoostWeight || 1.5, 1),
          10
        ),
        bundle_token_budget_total: Math.min(
          Math.max(workspaceState.bundleTokenBudgetTotal || 300, 300),
          50000
        ),
        bundle_budget_global_workspace_pct: Math.min(
          Math.max(workspaceState.bundleBudgetGlobalWorkspacePct || 0, 0),
          1
        ),
        bundle_budget_global_user_pct: Math.min(
          Math.max(workspaceState.bundleBudgetGlobalUserPct || 0, 0),
          1
        ),
        bundle_budget_project_pct: Math.min(
          Math.max(workspaceState.bundleBudgetProjectPct || 0, 0),
          1
        ),
        bundle_budget_retrieval_pct: Math.min(
          Math.max(workspaceState.bundleBudgetRetrievalPct || 0, 0),
          1
        ),
        global_rules_recommend_max: Math.min(
          Math.max(workspaceState.globalRulesRecommendMax || 1, 1),
          1000
        ),
        global_rules_warn_threshold: Math.min(
          Math.max(workspaceState.globalRulesWarnThreshold || 1, 1),
          1000
        ),
        global_rules_summary_enabled: workspaceState.globalRulesSummaryEnabled,
        global_rules_summary_min_count: Math.min(
          Math.max(workspaceState.globalRulesSummaryMinCount || 1, 1),
          1000
        ),
        global_rules_selection_mode: workspaceState.globalRulesSelectionMode,
        global_rules_routing_enabled: workspaceState.globalRulesRoutingEnabled,
        global_rules_routing_mode: workspaceState.globalRulesRoutingMode,
        global_rules_routing_top_k: Math.min(Math.max(workspaceState.globalRulesRoutingTopK || 1, 1), 100),
        global_rules_routing_min_score: Math.min(
          Math.max(workspaceState.globalRulesRoutingMinScore || 0, 0),
          1
        ),
        retention_policy_enabled: workspaceState.retentionPolicyEnabled,
        audit_retention_days: Math.min(Math.max(workspaceState.auditRetentionDays || 1, 1), 3650),
        raw_retention_days: Math.min(Math.max(workspaceState.rawRetentionDays || 1, 1), 3650),
        retention_mode: workspaceState.retentionMode,
        security_stream_enabled: workspaceState.securityStreamEnabled,
        security_stream_sink_id: workspaceState.securityStreamSinkId || null,
        security_stream_min_severity: workspaceState.securityStreamMinSeverity,
        github_auto_create_projects: workspaceState.githubAutoCreateProjects,
        github_auto_create_subprojects: workspaceState.githubAutoCreateSubprojects,
        github_permission_sync_enabled: workspaceState.githubPermissionSyncEnabled,
        github_permission_sync_mode: workspaceState.githubPermissionSyncMode,
        github_cache_ttl_seconds: Math.min(Math.max(workspaceState.githubCacheTtlSeconds || 30, 30), 86400),
        github_webhook_enabled: workspaceState.githubWebhookEnabled,
        github_webhook_sync_mode: workspaceState.githubWebhookSyncMode,
        github_team_mapping_enabled: workspaceState.githubTeamMappingEnabled,
        github_role_mapping: githubRoleMapping,
        github_project_key_prefix: githubProjectKeyPrefix,
        github_key_prefix: githubProjectKeyPrefix,
        local_key_prefix: workspaceState.localPrefix,
        enable_monorepo_resolution: workspaceState.enableMonorepoResolution,
        monorepo_detection_level: Math.min(Math.max(workspaceState.monorepoDetectionLevel || 2, 0), 3),
        monorepo_mode: workspaceState.monorepoMode,
        monorepo_context_mode: workspaceState.monorepoContextMode,
        monorepo_subpath_metadata_enabled: workspaceState.monorepoSubpathMetadataEnabled,
        monorepo_subpath_boost_enabled: workspaceState.monorepoSubpathBoostEnabled,
        monorepo_subpath_boost_weight: Math.min(Math.max(workspaceState.monorepoSubpathBoostWeight || 1.5, 1), 10),
        monorepo_workspace_globs: parseLineSeparatedValues(workspaceState.monorepoWorkspaceGlobsText),
        monorepo_exclude_globs: parseLineSeparatedValues(workspaceState.monorepoExcludeGlobsText),
        monorepo_root_markers: parseLineSeparatedValues(workspaceState.monorepoRootMarkersText),
        monorepo_max_depth: Math.min(Math.max(workspaceState.monorepoMaxDepth || 3, 1), 12),
        reason: reason || undefined,
      }),
    });
    await loadWorkspaceSettings(workspaceState.selectedWorkspace);
  }

  async function loadProjectMappings(workspaceKey: string) {
    const query = new URLSearchParams({ workspace_key: workspaceKey });
    const data = await callApi<{ mappings: ProjectMapping[] }>(`/v1/project-mappings?${query.toString()}`);
    workspaceState.setMappings(data.mappings);
  }

  async function loadMonorepoSubprojectPolicies(workspaceKey: string) {
    const query = new URLSearchParams({ workspace_key: workspaceKey });
    const data = await callApi<{ policies: MonorepoSubprojectPolicy[] }>(
      `/v1/monorepo-subproject-policies?${query.toString()}`
    );
    workspaceState.setMonorepoSubprojectPolicies(data.policies || []);
  }

  async function createMonorepoSubprojectPolicy(event?: FormEvent) {
    event?.preventDefault();
    if (!workspaceState.selectedWorkspace) {
      return;
    }
    const repoKey = workspaceState.newMonorepoPolicyRepoKey.trim();
    const subpath = workspaceState.newMonorepoPolicySubpath.trim();
    if (!repoKey || !subpath) {
      return;
    }
    await callApi('/v1/monorepo-subproject-policies', {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: workspaceState.selectedWorkspace,
        repo_key: repoKey,
        subpath,
        enabled: workspaceState.newMonorepoPolicyEnabled,
        reason: workspaceState.monorepoPolicyReason.trim() || undefined,
      }),
    });
    workspaceState.setNewMonorepoPolicySubpath('');
    await loadMonorepoSubprojectPolicies(workspaceState.selectedWorkspace);
  }

  async function patchMonorepoSubprojectPolicy(id: string, enabled: boolean) {
    if (!workspaceState.selectedWorkspace) {
      return;
    }
    await callApi(`/v1/monorepo-subproject-policies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        workspace_key: workspaceState.selectedWorkspace,
        enabled,
        reason: workspaceState.monorepoPolicyReason.trim() || undefined,
      }),
    });
    await loadMonorepoSubprojectPolicies(workspaceState.selectedWorkspace);
  }

  async function removeMonorepoSubprojectPolicy(id: string) {
    if (!workspaceState.selectedWorkspace) {
      return;
    }
    const query = new URLSearchParams({
      workspace_key: workspaceState.selectedWorkspace,
    });
    const reason = workspaceState.monorepoPolicyReason.trim();
    if (reason) {
      query.set('reason', reason);
    }
    await callApi(
      `/v1/monorepo-subproject-policies/${encodeURIComponent(id)}?${query.toString()}`,
      {
        method: 'DELETE',
      }
    );
    await loadMonorepoSubprojectPolicies(workspaceState.selectedWorkspace);
  }

  async function createProjectMapping(event: FormEvent) {
    event.preventDefault();
    if (
      !workspaceState.selectedWorkspace ||
      !workspaceState.newMappingProjectKey ||
      !workspaceState.newMappingExternalId.trim()
    ) {
      return;
    }
    const reason = workspaceState.mappingReason.trim();
    await callApi('/v1/project-mappings', {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: workspaceState.selectedWorkspace,
        project_key: workspaceState.newMappingProjectKey,
        kind: workspaceState.newMappingKind,
        external_id: workspaceState.newMappingExternalId.trim(),
        priority: workspaceState.newMappingPriority ? Number(workspaceState.newMappingPriority) : undefined,
        is_enabled: workspaceState.newMappingEnabled,
        reason: reason || undefined,
      }),
    });
    workspaceState.setNewMappingExternalId('');
    workspaceState.setNewMappingPriority('');
    await loadProjectMappings(workspaceState.selectedWorkspace);
  }

  async function patchMapping(id: string, patch: Record<string, unknown>) {
    const reason = workspaceState.mappingReason.trim();
    await callApi('/v1/project-mappings', {
      method: 'PATCH',
      body: JSON.stringify({
        id,
        ...patch,
        reason: reason || undefined,
      }),
    });
    if (workspaceState.selectedWorkspace) {
      await loadProjectMappings(workspaceState.selectedWorkspace);
    }
  }

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    await callApi('/v1/workspaces', {
      method: 'POST',
      body: JSON.stringify({
        key: workspaceState.newWorkspaceKey.trim(),
        name: workspaceState.newWorkspaceName.trim(),
      }),
    });
    workspaceState.setNewWorkspaceKey('');
    workspaceState.setNewWorkspaceName('');
    await loadWorkspaces();
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!workspaceState.selectedWorkspace) {
      return;
    }
    await callApi('/v1/projects', {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: workspaceState.selectedWorkspace,
        key: workspaceState.newProjectKey.trim(),
        name: workspaceState.newProjectName.trim(),
      }),
    });
    workspaceState.setNewProjectKey('');
    workspaceState.setNewProjectName('');
    await loadProjects(workspaceState.selectedWorkspace);
  }

  async function bootstrapProjectContext(projectKey: string) {
    if (!workspaceState.selectedWorkspace || !projectKey) {
      return;
    }
    await callApi(`/v1/projects/${encodeURIComponent(projectKey)}/bootstrap`, {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: workspaceState.selectedWorkspace,
      }),
    });
  }

  async function recomputeProjectActiveWork(projectKey: string) {
    if (!workspaceState.selectedWorkspace || !projectKey) {
      return;
    }
    await callApi(`/v1/projects/${encodeURIComponent(projectKey)}/recompute-active-work`, {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: workspaceState.selectedWorkspace,
      }),
    });
  }

  async function addProjectMember(event: FormEvent) {
    event.preventDefault();
    if (!workspaceState.selectedWorkspace || !workspaceState.selectedProject) {
      return;
    }
    await callApi(`/v1/projects/${encodeURIComponent(workspaceState.selectedProject)}/members`, {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: workspaceState.selectedWorkspace,
        email: workspaceState.inviteEmail.trim(),
        role: workspaceState.inviteRole,
      }),
    });
    workspaceState.setInviteEmail('');
    await loadMembers(workspaceState.selectedWorkspace, workspaceState.selectedProject);
  }

  async function updateProjectMemberRole(userId: string, role: ProjectRole) {
    if (!workspaceState.selectedWorkspace || !workspaceState.selectedProject) {
      return;
    }
    await callApi(
      `/v1/projects/${encodeURIComponent(workspaceState.selectedProject)}/members/${encodeURIComponent(userId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          workspace_key: workspaceState.selectedWorkspace,
          role,
        }),
      }
    );
    await loadMembers(workspaceState.selectedWorkspace, workspaceState.selectedProject);
  }

  async function removeProjectMember(userId: string) {
    if (!workspaceState.selectedWorkspace || !workspaceState.selectedProject) {
      return;
    }
    const query = new URLSearchParams({ workspace_key: workspaceState.selectedWorkspace });
    await callApi(
      `/v1/projects/${encodeURIComponent(workspaceState.selectedProject)}/members/${encodeURIComponent(userId)}?${query.toString()}`,
      {
        method: 'DELETE',
      }
    );
    await loadMembers(workspaceState.selectedWorkspace, workspaceState.selectedProject);
  }

  async function loadWorkspaceSsoSettings(workspaceKey: string) {
    const result = await callApi<{
      workspace_key: string;
      oidc_sync_mode: 'add_only' | 'add_and_remove';
      oidc_allow_auto_provision: boolean;
    }>(`/v1/workspaces/${encodeURIComponent(workspaceKey)}/sso-settings`);
    workspaceState.setOidcSyncMode(result.oidc_sync_mode);
    workspaceState.setOidcAllowAutoProvision(result.oidc_allow_auto_provision);
  }

  async function saveWorkspaceSsoSettings() {
    if (!workspaceState.selectedWorkspace) {
      return;
    }
    await callApi(`/v1/workspaces/${encodeURIComponent(workspaceState.selectedWorkspace)}/sso-settings`, {
      method: 'PUT',
      body: JSON.stringify({
        oidc_sync_mode: workspaceState.oidcSyncMode,
        oidc_allow_auto_provision: workspaceState.oidcAllowAutoProvision,
        reason: workspaceState.oidcSettingsReason.trim() || undefined,
      }),
    });
    await loadWorkspaceSsoSettings(workspaceState.selectedWorkspace);
  }

  async function loadOidcProviders(workspaceKey: string) {
    const query = new URLSearchParams({ workspace_key: workspaceKey });
    const result = await callApi<{ providers: OidcProvider[] }>(`/v1/oidc/providers?${query.toString()}`);
    workspaceState.setOidcProviders(result.providers);
    if (!workspaceState.selectedOidcProviderId && result.providers.length > 0) {
      workspaceState.setSelectedOidcProviderId(result.providers[0].id);
    }
  }

  async function saveOidcProvider(event: FormEvent) {
    event.preventDefault();
    if (!workspaceState.selectedWorkspace) {
      return;
    }

    const body = {
      workspace_key: workspaceState.selectedWorkspace,
      name: workspaceState.oidcProviderName.trim(),
      issuer_url: workspaceState.oidcProviderIssuerUrl.trim(),
      client_id: workspaceState.oidcProviderClientId.trim(),
      client_secret: workspaceState.oidcProviderClientSecret.trim(),
      discovery_enabled: workspaceState.oidcProviderDiscoveryEnabled,
      scopes: workspaceState.oidcProviderScopes.trim() || 'openid profile email',
      claim_groups_name: workspaceState.oidcClaimGroupsName.trim() || 'groups',
      claim_groups_format: workspaceState.oidcClaimGroupsFormat,
      enabled: workspaceState.oidcProviderEnabled,
      reason: workspaceState.oidcSettingsReason.trim() || undefined,
    };

    if (workspaceState.selectedOidcProviderId) {
      await callApi(`/v1/oidc/providers/${encodeURIComponent(workspaceState.selectedOidcProviderId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    } else {
      await callApi('/v1/oidc/providers', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }
    workspaceState.setOidcProviderClientSecret('');
    await loadOidcProviders(workspaceState.selectedWorkspace);
  }

  async function loadOidcMappings(workspaceKey: string) {
    const query = new URLSearchParams({ workspace_key: workspaceKey });
    if (workspaceState.selectedOidcProviderId) {
      query.set('provider_id', workspaceState.selectedOidcProviderId);
    }
    const result = await callApi<{ mappings: OidcGroupMapping[] }>(
      `/v1/oidc/group-mappings?${query.toString()}`
    );
    workspaceState.setOidcMappings(result.mappings);
  }

  async function createOidcMapping(event: FormEvent) {
    event.preventDefault();
    if (!workspaceState.selectedWorkspace || !workspaceState.selectedOidcProviderId) {
      return;
    }
    await callApi('/v1/oidc/group-mappings', {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: workspaceState.selectedWorkspace,
        provider_id: workspaceState.selectedOidcProviderId,
        claim_name: workspaceState.oidcMappingClaimName.trim() || undefined,
        group_id: workspaceState.oidcMappingGroupId.trim(),
        group_display_name: workspaceState.oidcMappingDisplayName.trim(),
        target_type: workspaceState.oidcMappingTargetType,
        target_key: workspaceState.oidcMappingTargetKey.trim(),
        role: workspaceState.oidcMappingRole,
        priority: Number(workspaceState.oidcMappingPriority || '100'),
        enabled: workspaceState.oidcMappingEnabled,
        reason: workspaceState.oidcSettingsReason.trim() || undefined,
      }),
    });
    workspaceState.setOidcMappingGroupId('');
    workspaceState.setOidcMappingDisplayName('');
    workspaceState.setOidcMappingTargetKey('');
    await loadOidcMappings(workspaceState.selectedWorkspace);
  }

  async function patchOidcMapping(id: string, patch: Record<string, unknown>) {
    if (!workspaceState.selectedWorkspace || !workspaceState.selectedOidcProviderId) {
      return;
    }
    await callApi(`/v1/oidc/group-mappings/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        workspace_key: workspaceState.selectedWorkspace,
        provider_id: workspaceState.selectedOidcProviderId,
        ...patch,
        reason: workspaceState.oidcSettingsReason.trim() || undefined,
      }),
    });
    await loadOidcMappings(workspaceState.selectedWorkspace);
  }

  async function deleteOidcMapping(id: string) {
    if (!workspaceState.selectedWorkspace) {
      return;
    }
    const query = new URLSearchParams({ workspace_key: workspaceState.selectedWorkspace });
    const reason = workspaceState.oidcSettingsReason.trim();
    if (reason) {
      query.set('reason', reason);
    }
    await callApi(`/v1/oidc/group-mappings/${encodeURIComponent(id)}?${query.toString()}`, {
      method: 'DELETE',
    });
    await loadOidcMappings(workspaceState.selectedWorkspace);
  }

  return {
    loadWorkspaces,
    loadProjects,
    loadMembers,
    loadWorkspaceSettings,
    saveWorkspaceSettings,
    loadProjectMappings,
    loadMonorepoSubprojectPolicies,
    createMonorepoSubprojectPolicy,
    patchMonorepoSubprojectPolicy,
    removeMonorepoSubprojectPolicy,
    createProjectMapping,
    patchMapping,
    createWorkspace,
    createProject,
    bootstrapProjectContext,
    recomputeProjectActiveWork,
    addProjectMember,
    updateProjectMemberRole,
    removeProjectMember,
    loadWorkspaceSsoSettings,
    saveWorkspaceSsoSettings,
    loadOidcProviders,
    saveOidcProvider,
    loadOidcMappings,
    createOidcMapping,
    patchOidcMapping,
    deleteOidcMapping,
  };
}

export type AdminWorkspaceProjectActions = ReturnType<typeof useAdminWorkspaceProjectActions>;

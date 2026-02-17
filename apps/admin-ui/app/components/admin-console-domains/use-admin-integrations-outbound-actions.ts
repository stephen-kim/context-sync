'use client';

import type { FormEvent } from 'react';
import type {
  AuditDeliveryQueueResponse,
  AuditSinksResponse,
  DetectionsResponse,
  DetectionRulesResponse,
  GithubInstallationStatus,
  GithubTeamMappingsResponse,
  GithubWebhookEventsResponse,
  GithubPermissionStatusResponse,
  GithubPermissionSyncResponse,
  GithubPermissionPreviewResponse,
  GithubPermissionCacheStatusResponse,
  GithubRepoLinksResponse,
  GithubUserLinksResponse,
  IntegrationProvider,
  IntegrationSettingsResponse,
  OutboundIntegrationType,
  OutboundPolicy,
  WorkspaceOutboundSettings,
} from '../../lib/types';
import type { AdminCallApi } from './types';
import type { AdminIntegrationsOutboundState } from './use-admin-integrations-outbound-state';

type IntegrationsOutboundDeps = {
  callApi: AdminCallApi;
  selectedWorkspace: string;
  state: AdminIntegrationsOutboundState;
  setError: (message: string | null) => void;
};

export function useAdminIntegrationsOutboundActions(deps: IntegrationsOutboundDeps) {
  const { callApi, selectedWorkspace, state, setError } = deps;

  async function loadWorkspaceOutboundSettings(workspaceKey: string) {
    const settings = await callApi<WorkspaceOutboundSettings>(
      `/v1/workspaces/${encodeURIComponent(workspaceKey)}/outbound-settings`
    );
    state.setWorkspaceOutboundDefaultLocale(settings.default_outbound_locale);
    state.setWorkspaceOutboundSupportedLocales(settings.supported_outbound_locales);
  }

  async function saveWorkspaceOutboundSettings() {
    if (!selectedWorkspace) {
      return;
    }
    await callApi(`/v1/workspaces/${encodeURIComponent(selectedWorkspace)}/outbound-settings`, {
      method: 'PUT',
      body: JSON.stringify({
        default_outbound_locale: state.workspaceOutboundDefaultLocale,
        supported_outbound_locales: state.workspaceOutboundSupportedLocales,
        reason: state.outboundSettingsReason.trim() || undefined,
      }),
    });
    await loadWorkspaceOutboundSettings(selectedWorkspace);
  }

  async function loadOutboundPolicy(workspaceKey: string, integrationType: OutboundIntegrationType) {
    const query = new URLSearchParams({ workspace_key: workspaceKey });
    const data = await callApi<OutboundPolicy>(
      `/v1/outbound-policies/${integrationType}?${query.toString()}`
    );
    state.setOutboundPolicyEnabled(data.enabled);
    state.setOutboundPolicyMode(data.mode);
    state.setOutboundPolicyStyle(data.style);
    state.setOutboundPolicyLocaleDefault(data.locale_default);
    state.setOutboundPolicySupportedLocales(data.supported_locales);
    state.setOutboundTemplateOverridesJson(JSON.stringify(data.template_overrides || {}, null, 2));
    state.setOutboundLlmPromptSystem(data.llm_prompt_system || '');
    state.setOutboundLlmPromptUser(data.llm_prompt_user || '');
  }

  async function saveOutboundPolicy() {
    if (!selectedWorkspace) {
      return;
    }

    let templateOverrides: Record<string, unknown> = {};
    try {
      templateOverrides = state.outboundTemplateOverridesJson.trim()
        ? (JSON.parse(state.outboundTemplateOverridesJson) as Record<string, unknown>)
        : {};
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? `template overrides JSON parse error: ${parseError.message}`
          : 'template overrides JSON parse error'
      );
      return;
    }

    await callApi(`/v1/outbound-policies/${state.selectedOutboundIntegration}`, {
      method: 'PUT',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
        enabled: state.outboundPolicyEnabled,
        locale_default: state.outboundPolicyLocaleDefault,
        supported_locales: state.outboundPolicySupportedLocales,
        mode: state.outboundPolicyMode,
        style: state.outboundPolicyStyle,
        template_overrides: templateOverrides,
        llm_prompt_system: state.outboundLlmPromptSystem.trim() || null,
        llm_prompt_user: state.outboundLlmPromptUser.trim() || null,
        reason: state.outboundPolicyReason.trim() || undefined,
      }),
    });

    await loadOutboundPolicy(selectedWorkspace, state.selectedOutboundIntegration);
  }

  async function loadIntegrations(workspaceKey: string) {
    const query = new URLSearchParams({ workspace_key: workspaceKey });
    const data = await callApi<IntegrationSettingsResponse>(`/v1/integrations?${query.toString()}`);
    const normalizedIntegrations: IntegrationSettingsResponse['integrations'] = {
      ...data.integrations,
      audit_reasoner: data.integrations.audit_reasoner || {
        enabled: false,
        configured: false,
        source: 'none',
        has_api_key: false,
        provider_order: ['openai', 'claude', 'gemini'],
        has_openai_api_key: false,
        has_claude_api_key: false,
        has_gemini_api_key: false,
      },
    };

    state.setIntegrationStates(normalizedIntegrations);

    const notion = normalizedIntegrations.notion;
    state.setNotionEnabled(notion.enabled);
    state.setNotionParentPageId(notion.default_parent_page_id || '');
    state.setNotionWriteEnabled(Boolean(notion.write_enabled));
    state.setNotionWriteOnCommit(Boolean(notion.write_on_commit));
    state.setNotionWriteOnMerge(Boolean(notion.write_on_merge));
    state.setNotionToken('');

    const jira = normalizedIntegrations.jira;
    state.setJiraEnabled(jira.enabled);
    state.setJiraBaseUrl(jira.base_url || '');
    state.setJiraEmail(jira.email || '');
    state.setJiraWriteOnCommit(Boolean(jira.write_on_commit));
    state.setJiraWriteOnMerge(Boolean(jira.write_on_merge));
    state.setJiraToken('');

    const confluence = normalizedIntegrations.confluence;
    state.setConfluenceEnabled(confluence.enabled);
    state.setConfluenceBaseUrl(confluence.base_url || '');
    state.setConfluenceEmail(confluence.email || '');
    state.setConfluenceWriteOnCommit(Boolean(confluence.write_on_commit));
    state.setConfluenceWriteOnMerge(Boolean(confluence.write_on_merge));
    state.setConfluenceToken('');

    const linear = normalizedIntegrations.linear;
    state.setLinearEnabled(linear.enabled);
    state.setLinearApiUrl(linear.api_url || '');
    state.setLinearWriteOnCommit(Boolean(linear.write_on_commit));
    state.setLinearWriteOnMerge(Boolean(linear.write_on_merge));
    state.setLinearApiKey('');

    const slack = normalizedIntegrations.slack;
    state.setSlackEnabled(slack.enabled);
    state.setSlackDefaultChannel(slack.default_channel || '');
    state.setSlackActionPrefixes(
      (slack.action_prefixes || []).join(',') ||
        'workspace_settings.,project_mapping.,integration.,git.,ci.'
    );
    state.setSlackFormat(slack.format === 'compact' ? 'compact' : 'detailed');
    state.setSlackIncludeTargetJson(slack.include_target_json !== false);
    state.setSlackMaskSecrets(slack.mask_secrets !== false);
    state.setSlackRoutesJson(JSON.stringify(slack.routes || [], null, 2));
    state.setSlackSeverityRulesJson(JSON.stringify(slack.severity_rules || [], null, 2));
    state.setSlackWebhookUrl('');

    const reasoner = normalizedIntegrations.audit_reasoner || {
      enabled: false,
      configured: false,
      source: 'none' as const,
      has_api_key: false,
      provider_order: ['openai', 'claude', 'gemini'] as Array<'openai' | 'claude' | 'gemini'>,
      has_openai_api_key: false,
      has_claude_api_key: false,
      has_gemini_api_key: false,
    };
    const providerOrder =
      reasoner.provider_order && reasoner.provider_order.length > 0
        ? reasoner.provider_order
        : (['openai', 'claude', 'gemini'] as Array<'openai' | 'claude' | 'gemini'>);

    state.setAuditReasonerEnabled(reasoner.enabled);
    state.setAuditReasonerOrderCsv(providerOrder.join(','));
    state.setAuditReasonerOpenAiModel(reasoner.openai_model || '');
    state.setAuditReasonerOpenAiBaseUrl(reasoner.openai_base_url || '');
    state.setAuditReasonerOpenAiApiKey('');
    state.setAuditReasonerClaudeModel(reasoner.claude_model || '');
    state.setAuditReasonerClaudeBaseUrl(reasoner.claude_base_url || '');
    state.setAuditReasonerClaudeApiKey('');
    state.setAuditReasonerGeminiModel(reasoner.gemini_model || '');
    state.setAuditReasonerGeminiBaseUrl(reasoner.gemini_base_url || '');
    state.setAuditReasonerGeminiApiKey('');
  }

  async function loadGithubInstallation(workspaceKey: string) {
    const data = await callApi<GithubInstallationStatus>(
      `/v1/workspaces/${encodeURIComponent(workspaceKey)}/github/installation`
    );
    state.setGithubInstallation(data.installation);
  }

  async function loadGithubRepos(workspaceKey: string) {
    const data = await callApi<GithubRepoLinksResponse>(
      `/v1/workspaces/${encodeURIComponent(workspaceKey)}/github/repos`
    );
    state.setGithubRepos(data.repos || []);
  }

  async function loadGithubUserLinks(workspaceKey: string) {
    const data = await callApi<GithubUserLinksResponse>(
      `/v1/workspaces/${encodeURIComponent(workspaceKey)}/github/user-links`
    );
    state.setGithubUserLinks(data.links || []);
  }

  async function createGithubUserLink(workspaceKey: string, userId: string, githubLogin: string) {
    await callApi(`/v1/workspaces/${encodeURIComponent(workspaceKey)}/github/user-links`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        github_login: githubLogin,
      }),
    });
    await loadGithubUserLinks(workspaceKey);
  }

  async function deleteGithubUserLink(workspaceKey: string, userId: string) {
    await callApi(
      `/v1/workspaces/${encodeURIComponent(workspaceKey)}/github/user-links/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
      }
    );
    await loadGithubUserLinks(workspaceKey);
  }

  async function loadGithubPermissionStatus(workspaceKey: string) {
    const data = await callApi<GithubPermissionStatusResponse>(
      `/v1/workspaces/${encodeURIComponent(workspaceKey)}/github/permission-status`
    );
    state.setGithubPermissionStatus(data);
    return data;
  }

  async function loadGithubCacheStatus(workspaceKey: string) {
    const data = await callApi<GithubPermissionCacheStatusResponse>(
      `/v1/workspaces/${encodeURIComponent(workspaceKey)}/github/cache-status`
    );
    state.setGithubPermissionCacheStatus(data);
    return data;
  }

  async function previewGithubPermissions(workspaceKey: string, repo: string) {
    const query = new URLSearchParams({ repo });
    const data = await callApi<GithubPermissionPreviewResponse>(
      `/v1/workspaces/${encodeURIComponent(workspaceKey)}/github/permission-preview?${query.toString()}`
    );
    state.setGithubPermissionPreview(data);
    return data;
  }

  async function loadGithubWebhookDeliveries(workspaceKey: string) {
    const data = await callApi<GithubWebhookEventsResponse>(
      `/v1/workspaces/${encodeURIComponent(workspaceKey)}/github/webhook-events`
    );
    state.setGithubWebhookDeliveries(data.deliveries || []);
  }

  async function loadGithubTeamMappings(workspaceKey: string) {
    const data = await callApi<GithubTeamMappingsResponse>(
      `/v1/workspaces/${encodeURIComponent(workspaceKey)}/github/team-mappings`
    );
    state.setGithubTeamMappings(data.mappings || []);
  }

  async function loadAuditSinks(workspaceKey: string) {
    const query = new URLSearchParams({ workspace_key: workspaceKey });
    const data = await callApi<AuditSinksResponse>(`/v1/audit-sinks?${query.toString()}`);
    state.setAuditSinks(data.sinks || []);
    if (!state.newAuditSinkName.trim()) {
      state.setNewAuditSinkName('Primary SIEM Sink');
    }
  }

  async function loadAuditDeliveries(workspaceKey: string) {
    const query = new URLSearchParams({
      workspace_key: workspaceKey,
      limit: '200',
    });
    if (state.auditDeliveryStatusFilter) {
      query.set('status', state.auditDeliveryStatusFilter);
    }
    const data = await callApi<AuditDeliveryQueueResponse>(`/v1/audit-deliveries?${query.toString()}`);
    state.setAuditDeliveries(data.deliveries || []);
  }

  async function createAuditSink() {
    if (!selectedWorkspace) {
      return;
    }
    let eventFilter: Record<string, unknown> = {};
    let retryPolicy: Record<string, unknown> = {};
    try {
      eventFilter = state.newAuditSinkEventFilterJson.trim()
        ? (JSON.parse(state.newAuditSinkEventFilterJson) as Record<string, unknown>)
        : {};
      retryPolicy = state.newAuditSinkRetryPolicyJson.trim()
        ? (JSON.parse(state.newAuditSinkRetryPolicyJson) as Record<string, unknown>)
        : {};
    } catch (error) {
      setError(error instanceof Error ? `SIEM JSON parse error: ${error.message}` : 'SIEM JSON parse error');
      return;
    }

    await callApi('/v1/audit-sinks', {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
        type: state.newAuditSinkType,
        name: state.newAuditSinkName.trim(),
        enabled: state.newAuditSinkEnabled,
        endpoint_url: state.newAuditSinkEndpointUrl.trim(),
        secret: state.newAuditSinkSecret.trim(),
        event_filter: eventFilter,
        retry_policy: retryPolicy,
        reason: state.auditSinkReason.trim() || undefined,
      }),
    });
    state.setNewAuditSinkSecret('');
    await Promise.all([loadAuditSinks(selectedWorkspace), loadAuditDeliveries(selectedWorkspace)]);
  }

  async function patchAuditSink(args: {
    sinkId: string;
    input: {
      name?: string;
      enabled?: boolean;
      endpoint_url?: string;
      secret?: string;
      event_filter?: Record<string, unknown>;
      retry_policy?: Record<string, unknown>;
      reason?: string;
    };
  }) {
    if (!selectedWorkspace) {
      return;
    }
    await callApi(`/v1/audit-sinks/${encodeURIComponent(args.sinkId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
        ...args.input,
      }),
    });
    await Promise.all([loadAuditSinks(selectedWorkspace), loadAuditDeliveries(selectedWorkspace)]);
  }

  async function deleteAuditSink(sinkId: string) {
    if (!selectedWorkspace) {
      return;
    }
    const query = new URLSearchParams({ workspace_key: selectedWorkspace });
    const reason = state.auditSinkReason.trim();
    if (reason) {
      query.set('reason', reason);
    }
    await callApi(`/v1/audit-sinks/${encodeURIComponent(sinkId)}?${query.toString()}`, {
      method: 'DELETE',
    });
    await Promise.all([loadAuditSinks(selectedWorkspace), loadAuditDeliveries(selectedWorkspace)]);
  }

  async function testAuditSink(sinkId: string) {
    if (!selectedWorkspace) {
      return;
    }
    await callApi(`/v1/audit-sinks/${encodeURIComponent(sinkId)}/test-delivery`, {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
      }),
    });
    await loadAuditDeliveries(selectedWorkspace);
  }

  async function loadDetectionRules(workspaceKey: string) {
    const query = new URLSearchParams({ workspace_key: workspaceKey });
    const data = await callApi<DetectionRulesResponse>(`/v1/detection-rules?${query.toString()}`);
    state.setDetectionRules(data.rules || []);
  }

  async function createDetectionRule() {
    if (!selectedWorkspace) {
      return;
    }
    let condition: Record<string, unknown> = {};
    let notify: Record<string, unknown> = {};
    try {
      condition = state.newDetectionRuleConditionJson.trim()
        ? (JSON.parse(state.newDetectionRuleConditionJson) as Record<string, unknown>)
        : {};
      notify = state.newDetectionRuleNotifyJson.trim()
        ? (JSON.parse(state.newDetectionRuleNotifyJson) as Record<string, unknown>)
        : {};
    } catch (error) {
      setError(
        error instanceof Error
          ? `Detection rule JSON parse error: ${error.message}`
          : 'Detection rule JSON parse error'
      );
      return;
    }
    await callApi('/v1/detection-rules', {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
        name: state.newDetectionRuleName.trim(),
        enabled: state.newDetectionRuleEnabled,
        severity: state.newDetectionRuleSeverity,
        condition,
        notify,
        reason: state.detectionRuleReason.trim() || undefined,
      }),
    });
    await Promise.all([loadDetectionRules(selectedWorkspace), loadDetections(selectedWorkspace)]);
  }

  async function patchDetectionRule(args: {
    ruleId: string;
    input: {
      name?: string;
      enabled?: boolean;
      severity?: 'low' | 'medium' | 'high';
      condition?: Record<string, unknown>;
      notify?: Record<string, unknown>;
      reason?: string;
    };
  }) {
    if (!selectedWorkspace) {
      return;
    }
    await callApi(`/v1/detection-rules/${encodeURIComponent(args.ruleId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
        ...args.input,
      }),
    });
    await Promise.all([loadDetectionRules(selectedWorkspace), loadDetections(selectedWorkspace)]);
  }

  async function deleteDetectionRule(ruleId: string) {
    if (!selectedWorkspace) {
      return;
    }
    const query = new URLSearchParams({
      workspace_key: selectedWorkspace,
    });
    const reason = state.detectionRuleReason.trim();
    if (reason) {
      query.set('reason', reason);
    }
    await callApi(`/v1/detection-rules/${encodeURIComponent(ruleId)}?${query.toString()}`, {
      method: 'DELETE',
    });
    await Promise.all([loadDetectionRules(selectedWorkspace), loadDetections(selectedWorkspace)]);
  }

  async function loadDetections(workspaceKey: string) {
    const query = new URLSearchParams({ workspace_key: workspaceKey, limit: '200' });
    if (state.detectionStatusFilter) {
      query.set('status', state.detectionStatusFilter);
    }
    const data = await callApi<DetectionsResponse>(`/v1/detections?${query.toString()}`);
    state.setDetections(data.detections || []);
  }

  async function updateDetectionStatus(detectionId: string, status: 'open' | 'ack' | 'closed') {
    if (!selectedWorkspace) {
      return;
    }
    await callApi(`/v1/detections/${encodeURIComponent(detectionId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
        status,
        reason: state.detectionRuleReason.trim() || undefined,
      }),
    });
    await loadDetections(selectedWorkspace);
  }

  async function createGithubTeamMapping(args: {
    workspaceKey: string;
    input: {
      providerInstallationId?: string | null;
      githubTeamId: string;
      githubTeamSlug: string;
      githubOrgLogin: string;
      targetType: 'workspace' | 'project';
      targetKey: string;
      role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'MAINTAINER' | 'WRITER' | 'READER';
      enabled?: boolean;
      priority?: number;
    };
  }) {
    await callApi(`/v1/workspaces/${encodeURIComponent(args.workspaceKey)}/github/team-mappings`, {
      method: 'POST',
      body: JSON.stringify({
        provider_installation_id: args.input.providerInstallationId || null,
        github_team_id: args.input.githubTeamId,
        github_team_slug: args.input.githubTeamSlug,
        github_org_login: args.input.githubOrgLogin,
        target_type: args.input.targetType,
        target_key: args.input.targetKey,
        role: args.input.role,
        enabled: args.input.enabled ?? true,
        priority: args.input.priority ?? 100,
      }),
    });
    await loadGithubTeamMappings(args.workspaceKey);
  }

  async function patchGithubTeamMapping(args: {
    workspaceKey: string;
    mappingId: string;
    input: {
      providerInstallationId?: string | null;
      githubTeamId?: string;
      githubTeamSlug?: string;
      githubOrgLogin?: string;
      targetType?: 'workspace' | 'project';
      targetKey?: string;
      role?: 'OWNER' | 'ADMIN' | 'MEMBER' | 'MAINTAINER' | 'WRITER' | 'READER';
      enabled?: boolean;
      priority?: number;
    };
  }) {
    await callApi(
      `/v1/workspaces/${encodeURIComponent(args.workspaceKey)}/github/team-mappings/${encodeURIComponent(args.mappingId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          provider_installation_id: args.input.providerInstallationId,
          github_team_id: args.input.githubTeamId,
          github_team_slug: args.input.githubTeamSlug,
          github_org_login: args.input.githubOrgLogin,
          target_type: args.input.targetType,
          target_key: args.input.targetKey,
          role: args.input.role,
          enabled: args.input.enabled,
          priority: args.input.priority,
        }),
      }
    );
    await loadGithubTeamMappings(args.workspaceKey);
  }

  async function deleteGithubTeamMapping(workspaceKey: string, mappingId: string) {
    await callApi(
      `/v1/workspaces/${encodeURIComponent(workspaceKey)}/github/team-mappings/${encodeURIComponent(mappingId)}`,
      { method: 'DELETE' }
    );
    await loadGithubTeamMappings(workspaceKey);
  }

  async function syncGithubPermissions(args: {
    workspaceKey: string;
    dryRun?: boolean;
    projectKeyPrefix?: string;
    repos?: string[];
  }) {
    const data = await callApi<GithubPermissionSyncResponse>(
      `/v1/workspaces/${encodeURIComponent(args.workspaceKey)}/github/sync-permissions`,
      {
        method: 'POST',
        body: JSON.stringify({
          dry_run: args.dryRun === true,
          project_key_prefix: args.projectKeyPrefix?.trim() || undefined,
          repos: args.repos?.map((item) => item.trim()).filter((item) => item.length > 0),
        }),
      }
    );
    state.setGithubLastPermissionSyncResult(data);
    await Promise.all([
      loadGithubPermissionStatus(args.workspaceKey),
      loadGithubCacheStatus(args.workspaceKey),
      loadGithubUserLinks(args.workspaceKey),
      loadGithubRepos(args.workspaceKey),
    ]);
    return data;
  }

  async function generateGithubInstallUrl(workspaceKey: string): Promise<string> {
    const data = await callApi<{ url: string }>(
      `/v1/workspaces/${encodeURIComponent(workspaceKey)}/github/install-url`
    );
    state.setGithubInstallUrl(data.url);
    return data.url;
  }

  async function syncGithubRepos(workspaceKey: string): Promise<{
    count: number;
    projects_auto_created: number;
    projects_auto_linked: number;
  }> {
    const data = await callApi<{
      count: number;
      projects_auto_created: number;
      projects_auto_linked: number;
    }>(
      `/v1/workspaces/${encodeURIComponent(workspaceKey)}/github/sync-repos`,
      { method: 'POST' }
    );
    state.setGithubLastSyncSummary({
      count: data.count,
      projects_auto_created: data.projects_auto_created ?? 0,
      projects_auto_linked: data.projects_auto_linked ?? 0,
    });
    await Promise.all([loadGithubInstallation(workspaceKey), loadGithubRepos(workspaceKey)]);
    return data;
  }

  async function saveIntegration(
    provider: IntegrationProvider,
    payload: {
      enabled: boolean;
      config: Record<string, unknown>;
      reason?: string;
    }
  ) {
    if (!selectedWorkspace) {
      return;
    }
    if (state.integrationStates[provider].locked) {
      setError(
        `${provider} integration is locked by server policy (MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS).`
      );
      return;
    }
    await callApi('/v1/integrations', {
      method: 'PUT',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
        provider,
        enabled: payload.enabled,
        config: payload.config,
        reason: payload.reason?.trim() || undefined,
      }),
    });
    await loadIntegrations(selectedWorkspace);
  }

  async function saveNotionIntegration(event: FormEvent) {
    event.preventDefault();
    const config: Record<string, unknown> = {
      default_parent_page_id: state.notionParentPageId.trim(),
      write_enabled: state.notionWriteEnabled,
      write_on_commit: state.notionWriteOnCommit,
      write_on_merge: state.notionWriteOnMerge,
    };
    if (state.notionToken.trim()) {
      config.token = state.notionToken.trim();
    }
    await saveIntegration('notion', {
      enabled: state.notionEnabled,
      config,
      reason: state.integrationReason,
    });
  }

  async function saveJiraIntegration(event: FormEvent) {
    event.preventDefault();
    const config: Record<string, unknown> = {
      base_url: state.jiraBaseUrl.trim(),
      email: state.jiraEmail.trim(),
      write_on_commit: state.jiraWriteOnCommit,
      write_on_merge: state.jiraWriteOnMerge,
    };
    if (state.jiraToken.trim()) {
      config.api_token = state.jiraToken.trim();
    }
    await saveIntegration('jira', {
      enabled: state.jiraEnabled,
      config,
      reason: state.integrationReason,
    });
  }

  async function saveConfluenceIntegration(event: FormEvent) {
    event.preventDefault();
    const config: Record<string, unknown> = {
      base_url: state.confluenceBaseUrl.trim(),
      email: state.confluenceEmail.trim(),
      write_on_commit: state.confluenceWriteOnCommit,
      write_on_merge: state.confluenceWriteOnMerge,
    };
    if (state.confluenceToken.trim()) {
      config.api_token = state.confluenceToken.trim();
    }
    await saveIntegration('confluence', {
      enabled: state.confluenceEnabled,
      config,
      reason: state.integrationReason,
    });
  }

  async function saveLinearIntegration(event: FormEvent) {
    event.preventDefault();
    const config: Record<string, unknown> = {
      api_url: state.linearApiUrl.trim(),
      write_on_commit: state.linearWriteOnCommit,
      write_on_merge: state.linearWriteOnMerge,
    };
    if (state.linearApiKey.trim()) {
      config.api_key = state.linearApiKey.trim();
    }
    await saveIntegration('linear', {
      enabled: state.linearEnabled,
      config,
      reason: state.integrationReason,
    });
  }

  async function saveSlackIntegration(event: FormEvent) {
    event.preventDefault();
    let routes: unknown = [];
    let severityRules: unknown = [];
    try {
      routes = state.slackRoutesJson.trim() ? JSON.parse(state.slackRoutesJson) : [];
      severityRules = state.slackSeverityRulesJson.trim() ? JSON.parse(state.slackSeverityRulesJson) : [];
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? `slack JSON parse error: ${parseError.message}`
          : 'slack JSON parse error'
      );
      return;
    }

    const config: Record<string, unknown> = {
      default_channel: state.slackDefaultChannel.trim(),
      action_prefixes: state.slackActionPrefixes
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      format: state.slackFormat,
      include_target_json: state.slackIncludeTargetJson,
      mask_secrets: state.slackMaskSecrets,
      routes,
      severity_rules: severityRules,
    };
    if (state.slackWebhookUrl.trim()) {
      config.webhook_url = state.slackWebhookUrl.trim();
    }

    await saveIntegration('slack', {
      enabled: state.slackEnabled,
      config,
      reason: state.integrationReason,
    });
  }

  async function saveAuditReasonerIntegration(event: FormEvent) {
    event.preventDefault();
    const providerOrder = state.auditReasonerOrderCsv
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is 'openai' | 'claude' | 'gemini' => {
        return item === 'openai' || item === 'claude' || item === 'gemini';
      })
      .filter((item, index, array) => array.indexOf(item) === index);

    if (providerOrder.length === 0) {
      setError('audit_reasoner provider order is required (openai/claude/gemini).');
      return;
    }

    const config: Record<string, unknown> = {
      provider_order: providerOrder,
      openai_model: state.auditReasonerOpenAiModel.trim() || null,
      openai_base_url: state.auditReasonerOpenAiBaseUrl.trim() || null,
      claude_model: state.auditReasonerClaudeModel.trim() || null,
      claude_base_url: state.auditReasonerClaudeBaseUrl.trim() || null,
      gemini_model: state.auditReasonerGeminiModel.trim() || null,
      gemini_base_url: state.auditReasonerGeminiBaseUrl.trim() || null,
    };
    if (state.auditReasonerOpenAiApiKey.trim()) {
      config.openai_api_key = state.auditReasonerOpenAiApiKey.trim();
    }
    if (state.auditReasonerClaudeApiKey.trim()) {
      config.claude_api_key = state.auditReasonerClaudeApiKey.trim();
    }
    if (state.auditReasonerGeminiApiKey.trim()) {
      config.gemini_api_key = state.auditReasonerGeminiApiKey.trim();
    }

    await saveIntegration('audit_reasoner', {
      enabled: state.auditReasonerEnabled,
      config,
      reason: state.integrationReason,
    });
  }

  return {
    loadWorkspaceOutboundSettings,
    saveWorkspaceOutboundSettings,
    loadOutboundPolicy,
    saveOutboundPolicy,
    loadIntegrations,
    loadGithubInstallation,
    loadGithubRepos,
    loadGithubUserLinks,
    createGithubUserLink,
    deleteGithubUserLink,
    loadGithubPermissionStatus,
    loadGithubCacheStatus,
    previewGithubPermissions,
    loadGithubWebhookDeliveries,
    loadGithubTeamMappings,
    loadAuditSinks,
    loadAuditDeliveries,
    createAuditSink,
    patchAuditSink,
    deleteAuditSink,
    testAuditSink,
    loadDetectionRules,
    createDetectionRule,
    patchDetectionRule,
    deleteDetectionRule,
    loadDetections,
    updateDetectionStatus,
    createGithubTeamMapping,
    patchGithubTeamMapping,
    deleteGithubTeamMapping,
    syncGithubPermissions,
    generateGithubInstallUrl,
    syncGithubRepos,
    saveNotionIntegration,
    saveJiraIntegration,
    saveConfluenceIntegration,
    saveLinearIntegration,
    saveSlackIntegration,
    saveAuditReasonerIntegration,
  };
}

export type AdminIntegrationsOutboundActions = ReturnType<typeof useAdminIntegrationsOutboundActions>;

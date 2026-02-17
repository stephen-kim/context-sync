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
  GithubPermissionSyncMode,
  GithubPermissionSyncResponse,
  GithubPermissionPreviewResponse,
  GithubPermissionCacheStatusResponse,
  GithubRepoLinksResponse,
  GithubUserLinksResponse,
  IntegrationSettingsResponse,
  WorkspaceMember,
} from '../lib/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Textarea } from './ui';

type Props = {
  selectedWorkspace: string;
  monorepoContextMode: 'shared_repo' | 'split_on_demand' | 'split_auto';
  githubAutoCreateProjects: boolean;
  setGithubAutoCreateProjects: (value: boolean) => void;
  githubAutoCreateSubprojects: boolean;
  setGithubAutoCreateSubprojects: (value: boolean) => void;
  githubPermissionSyncEnabled: boolean;
  setGithubPermissionSyncEnabled: (value: boolean) => void;
  githubPermissionSyncMode: GithubPermissionSyncMode;
  setGithubPermissionSyncMode: (value: GithubPermissionSyncMode) => void;
  githubCacheTtlSeconds: number;
  setGithubCacheTtlSeconds: (value: number) => void;
  githubWebhookEnabled: boolean;
  setGithubWebhookEnabled: (value: boolean) => void;
  githubWebhookSyncMode: GithubPermissionSyncMode;
  setGithubWebhookSyncMode: (value: GithubPermissionSyncMode) => void;
  githubTeamMappingEnabled: boolean;
  setGithubTeamMappingEnabled: (value: boolean) => void;
  githubRoleMappingJson: string;
  setGithubRoleMappingJson: (value: string) => void;
  githubProjectKeyPrefix: string;
  setGithubProjectKeyPrefix: (value: string) => void;
  setGithubPrefix: (value: string) => void;
  saveGithubProjectSettings: () => void | Promise<void>;
  securityStreamEnabled: boolean;
  setSecurityStreamEnabled: (value: boolean) => void;
  securityStreamSinkId: string;
  setSecurityStreamSinkId: (value: string) => void;
  securityStreamMinSeverity: 'low' | 'medium' | 'high';
  setSecurityStreamMinSeverity: (value: 'low' | 'medium' | 'high') => void;
  workspaceMembers: WorkspaceMember[];
  integrationStates: IntegrationSettingsResponse['integrations'];
  integrationReason: string;
  setIntegrationReason: (value: string) => void;
  githubInstallation: GithubInstallationStatus['installation'];
  githubRepos: GithubRepoLinksResponse['repos'];
  githubLastSyncSummary: {
    count: number;
    projects_auto_created: number;
    projects_auto_linked: number;
  } | null;
  githubInstallUrl: string;
  githubUserLinks: GithubUserLinksResponse['links'];
  githubPermissionStatus: GithubPermissionStatusResponse | null;
  githubLastPermissionSyncResult: GithubPermissionSyncResponse | null;
  githubPermissionPreview: GithubPermissionPreviewResponse | null;
  githubPermissionCacheStatus: GithubPermissionCacheStatusResponse | null;
  githubWebhookDeliveries: GithubWebhookEventsResponse['deliveries'];
  githubTeamMappings: GithubTeamMappingsResponse['mappings'];
  auditSinks: AuditSinksResponse['sinks'];
  auditDeliveries: AuditDeliveryQueueResponse['deliveries'];
  auditDeliveryStatusFilter: 'queued' | 'sending' | 'delivered' | 'failed' | '';
  setAuditDeliveryStatusFilter: (value: 'queued' | 'sending' | 'delivered' | 'failed' | '') => void;
  newAuditSinkType: 'webhook' | 'http';
  setNewAuditSinkType: (value: 'webhook' | 'http') => void;
  newAuditSinkName: string;
  setNewAuditSinkName: (value: string) => void;
  newAuditSinkEnabled: boolean;
  setNewAuditSinkEnabled: (value: boolean) => void;
  newAuditSinkEndpointUrl: string;
  setNewAuditSinkEndpointUrl: (value: string) => void;
  newAuditSinkSecret: string;
  setNewAuditSinkSecret: (value: string) => void;
  newAuditSinkEventFilterJson: string;
  setNewAuditSinkEventFilterJson: (value: string) => void;
  newAuditSinkRetryPolicyJson: string;
  setNewAuditSinkRetryPolicyJson: (value: string) => void;
  auditSinkReason: string;
  setAuditSinkReason: (value: string) => void;
  detectionRules: DetectionRulesResponse['rules'];
  detections: DetectionsResponse['detections'];
  detectionStatusFilter: 'open' | 'ack' | 'closed' | '';
  setDetectionStatusFilter: (value: 'open' | 'ack' | 'closed' | '') => void;
  newDetectionRuleName: string;
  setNewDetectionRuleName: (value: string) => void;
  newDetectionRuleEnabled: boolean;
  setNewDetectionRuleEnabled: (value: boolean) => void;
  newDetectionRuleSeverity: 'low' | 'medium' | 'high';
  setNewDetectionRuleSeverity: (value: 'low' | 'medium' | 'high') => void;
  newDetectionRuleConditionJson: string;
  setNewDetectionRuleConditionJson: (value: string) => void;
  newDetectionRuleNotifyJson: string;
  setNewDetectionRuleNotifyJson: (value: string) => void;
  detectionRuleReason: string;
  setDetectionRuleReason: (value: string) => void;
  githubLinkUserId: string;
  setGithubLinkUserId: (value: string) => void;
  githubLinkLogin: string;
  setGithubLinkLogin: (value: string) => void;
  githubTeamMappingProviderInstallationId: string;
  setGithubTeamMappingProviderInstallationId: (value: string) => void;
  githubTeamMappingTeamId: string;
  setGithubTeamMappingTeamId: (value: string) => void;
  githubTeamMappingTeamSlug: string;
  setGithubTeamMappingTeamSlug: (value: string) => void;
  githubTeamMappingOrgLogin: string;
  setGithubTeamMappingOrgLogin: (value: string) => void;
  githubTeamMappingTargetType: 'workspace' | 'project';
  setGithubTeamMappingTargetType: (value: 'workspace' | 'project') => void;
  githubTeamMappingTargetKey: string;
  setGithubTeamMappingTargetKey: (value: string) => void;
  githubTeamMappingRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'MAINTAINER' | 'WRITER' | 'READER';
  setGithubTeamMappingRole: (
    value: 'OWNER' | 'ADMIN' | 'MEMBER' | 'MAINTAINER' | 'WRITER' | 'READER'
  ) => void;
  githubTeamMappingPriority: string;
  setGithubTeamMappingPriority: (value: string) => void;
  githubTeamMappingEnabledState: boolean;
  setGithubTeamMappingEnabledState: (value: boolean) => void;
  generateGithubInstallUrl: (workspaceKey: string) => Promise<string>;
  syncGithubRepos: (workspaceKey: string) => Promise<{
    count: number;
    projects_auto_created: number;
    projects_auto_linked: number;
  }>;
  syncGithubPermissions: (args: {
    workspaceKey: string;
    dryRun?: boolean;
    projectKeyPrefix?: string;
    repos?: string[];
  }) => Promise<GithubPermissionSyncResponse>;
  previewGithubPermissions: (
    workspaceKey: string,
    repo: string
  ) => Promise<GithubPermissionPreviewResponse>;
  loadGithubCacheStatus: (workspaceKey: string) => Promise<GithubPermissionCacheStatusResponse>;
  loadAuditDeliveries: (workspaceKey: string) => Promise<void>;
  createAuditSink: () => Promise<void>;
  patchAuditSink: (args: {
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
  }) => Promise<void>;
  deleteAuditSink: (sinkId: string) => Promise<void>;
  testAuditSink: (sinkId: string) => Promise<void>;
  createDetectionRule: () => Promise<void>;
  patchDetectionRule: (args: {
    ruleId: string;
    input: {
      name?: string;
      enabled?: boolean;
      severity?: 'low' | 'medium' | 'high';
      condition?: Record<string, unknown>;
      notify?: Record<string, unknown>;
      reason?: string;
    };
  }) => Promise<void>;
  deleteDetectionRule: (ruleId: string) => Promise<void>;
  loadDetections: (workspaceKey: string) => Promise<void>;
  updateDetectionStatus: (detectionId: string, status: 'open' | 'ack' | 'closed') => Promise<void>;
  createGithubUserLink: (workspaceKey: string, userId: string, githubLogin: string) => Promise<void>;
  deleteGithubUserLink: (workspaceKey: string, userId: string) => Promise<void>;
  createGithubTeamMapping: (args: {
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
  }) => Promise<void>;
  patchGithubTeamMapping: (args: {
    workspaceKey: string;
    mappingId: string;
    input: {
      enabled?: boolean;
      priority?: number;
    };
  }) => Promise<void>;
  deleteGithubTeamMapping: (workspaceKey: string, mappingId: string) => Promise<void>;

  notionLocked: boolean;
  notionEnabled: boolean;
  setNotionEnabled: (value: boolean) => void;
  notionWriteEnabled: boolean;
  setNotionWriteEnabled: (value: boolean) => void;
  notionWriteOnCommit: boolean;
  setNotionWriteOnCommit: (value: boolean) => void;
  notionWriteOnMerge: boolean;
  setNotionWriteOnMerge: (value: boolean) => void;
  notionParentPageId: string;
  setNotionParentPageId: (value: string) => void;
  notionToken: string;
  setNotionToken: (value: string) => void;
  saveNotionIntegration: (event: FormEvent) => void | Promise<void>;

  jiraLocked: boolean;
  jiraEnabled: boolean;
  setJiraEnabled: (value: boolean) => void;
  jiraWriteOnCommit: boolean;
  setJiraWriteOnCommit: (value: boolean) => void;
  jiraWriteOnMerge: boolean;
  setJiraWriteOnMerge: (value: boolean) => void;
  jiraBaseUrl: string;
  setJiraBaseUrl: (value: string) => void;
  jiraEmail: string;
  setJiraEmail: (value: string) => void;
  jiraToken: string;
  setJiraToken: (value: string) => void;
  saveJiraIntegration: (event: FormEvent) => void | Promise<void>;

  confluenceLocked: boolean;
  confluenceEnabled: boolean;
  setConfluenceEnabled: (value: boolean) => void;
  confluenceWriteOnCommit: boolean;
  setConfluenceWriteOnCommit: (value: boolean) => void;
  confluenceWriteOnMerge: boolean;
  setConfluenceWriteOnMerge: (value: boolean) => void;
  confluenceBaseUrl: string;
  setConfluenceBaseUrl: (value: string) => void;
  confluenceEmail: string;
  setConfluenceEmail: (value: string) => void;
  confluenceToken: string;
  setConfluenceToken: (value: string) => void;
  saveConfluenceIntegration: (event: FormEvent) => void | Promise<void>;

  linearLocked: boolean;
  linearEnabled: boolean;
  setLinearEnabled: (value: boolean) => void;
  linearWriteOnCommit: boolean;
  setLinearWriteOnCommit: (value: boolean) => void;
  linearWriteOnMerge: boolean;
  setLinearWriteOnMerge: (value: boolean) => void;
  linearApiUrl: string;
  setLinearApiUrl: (value: string) => void;
  linearApiKey: string;
  setLinearApiKey: (value: string) => void;
  saveLinearIntegration: (event: FormEvent) => void | Promise<void>;

  slackLocked: boolean;
  slackEnabled: boolean;
  setSlackEnabled: (value: boolean) => void;
  slackWebhookUrl: string;
  setSlackWebhookUrl: (value: string) => void;
  slackDefaultChannel: string;
  setSlackDefaultChannel: (value: string) => void;
  slackActionPrefixes: string;
  setSlackActionPrefixes: (value: string) => void;
  slackFormat: 'compact' | 'detailed';
  setSlackFormat: (value: 'compact' | 'detailed') => void;
  slackIncludeTargetJson: boolean;
  setSlackIncludeTargetJson: (value: boolean) => void;
  slackMaskSecrets: boolean;
  setSlackMaskSecrets: (value: boolean) => void;
  slackRoutesJson: string;
  setSlackRoutesJson: (value: string) => void;
  slackSeverityRulesJson: string;
  setSlackSeverityRulesJson: (value: string) => void;
  saveSlackIntegration: (event: FormEvent) => void | Promise<void>;

  auditReasonerLocked: boolean;
  auditReasonerEnabled: boolean;
  setAuditReasonerEnabled: (value: boolean) => void;
  auditReasonerOrderCsv: string;
  setAuditReasonerOrderCsv: (value: string) => void;
  auditReasonerOpenAiModel: string;
  setAuditReasonerOpenAiModel: (value: string) => void;
  auditReasonerOpenAiBaseUrl: string;
  setAuditReasonerOpenAiBaseUrl: (value: string) => void;
  auditReasonerOpenAiApiKey: string;
  setAuditReasonerOpenAiApiKey: (value: string) => void;
  auditReasonerClaudeModel: string;
  setAuditReasonerClaudeModel: (value: string) => void;
  auditReasonerClaudeBaseUrl: string;
  setAuditReasonerClaudeBaseUrl: (value: string) => void;
  auditReasonerClaudeApiKey: string;
  setAuditReasonerClaudeApiKey: (value: string) => void;
  auditReasonerGeminiModel: string;
  setAuditReasonerGeminiModel: (value: string) => void;
  auditReasonerGeminiBaseUrl: string;
  setAuditReasonerGeminiBaseUrl: (value: string) => void;
  auditReasonerGeminiApiKey: string;
  setAuditReasonerGeminiApiKey: (value: string) => void;
  saveAuditReasonerIntegration: (event: FormEvent) => void | Promise<void>;
};

export function IntegrationsPanel(props: Props) {
  async function handleConnectGithub() {
    if (!props.selectedWorkspace) {
      return;
    }
    const url = await props.generateGithubInstallUrl(props.selectedWorkspace);
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async function handleSyncGithubRepos() {
    if (!props.selectedWorkspace) {
      return;
    }
    await props.syncGithubRepos(props.selectedWorkspace);
  }

  async function handleSyncGithubPermissions(dryRun: boolean) {
    if (!props.selectedWorkspace) {
      return;
    }
    await props.syncGithubPermissions({
      workspaceKey: props.selectedWorkspace,
      dryRun,
      projectKeyPrefix: props.githubProjectKeyPrefix,
    });
  }

  async function handleRecomputeGithubRepo(repoFullName: string) {
    if (!props.selectedWorkspace) {
      return;
    }
    await props.syncGithubPermissions({
      workspaceKey: props.selectedWorkspace,
      dryRun: false,
      projectKeyPrefix: props.githubProjectKeyPrefix,
      repos: [repoFullName],
    });
  }

  async function handlePreviewGithubPermissions(repoFullName: string) {
    if (!props.selectedWorkspace) {
      return;
    }
    await props.previewGithubPermissions(props.selectedWorkspace, repoFullName);
  }

  async function handleRefreshGithubCacheStatus() {
    if (!props.selectedWorkspace) {
      return;
    }
    await props.loadGithubCacheStatus(props.selectedWorkspace);
  }

  async function handleRefreshAuditDeliveries() {
    if (!props.selectedWorkspace) {
      return;
    }
    await props.loadAuditDeliveries(props.selectedWorkspace);
  }

  async function handleCreateAuditSink() {
    if (!props.selectedWorkspace) {
      return;
    }
    await props.createAuditSink();
  }

  async function handleCreateDetectionRule() {
    if (!props.selectedWorkspace) {
      return;
    }
    await props.createDetectionRule();
  }

  async function handleCreateGithubUserLink() {
    if (!props.selectedWorkspace || !props.githubLinkUserId.trim() || !props.githubLinkLogin.trim()) {
      return;
    }
    await props.createGithubUserLink(
      props.selectedWorkspace,
      props.githubLinkUserId,
      props.githubLinkLogin
    );
    props.setGithubLinkLogin('');
  }

  async function handleCreateGithubTeamMapping() {
    if (
      !props.selectedWorkspace ||
      !props.githubTeamMappingTeamId.trim() ||
      !props.githubTeamMappingTeamSlug.trim() ||
      !props.githubTeamMappingOrgLogin.trim() ||
      !props.githubTeamMappingTargetKey.trim()
    ) {
      return;
    }

    await props.createGithubTeamMapping({
      workspaceKey: props.selectedWorkspace,
      input: {
        providerInstallationId: props.githubTeamMappingProviderInstallationId.trim() || null,
        githubTeamId: props.githubTeamMappingTeamId.trim(),
        githubTeamSlug: props.githubTeamMappingTeamSlug.trim(),
        githubOrgLogin: props.githubTeamMappingOrgLogin.trim(),
        targetType: props.githubTeamMappingTargetType,
        targetKey: props.githubTeamMappingTargetKey.trim(),
        role: props.githubTeamMappingRole,
        enabled: props.githubTeamMappingEnabledState,
        priority: Number(props.githubTeamMappingPriority || '100'),
      },
    });
    props.setGithubTeamMappingTeamId('');
    props.setGithubTeamMappingTeamSlug('');
    props.setGithubTeamMappingTargetKey('');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Integrations (Notion / Jira / Confluence / Linear / Slack / Audit Reasoner)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="stack">
          <strong>GitHub App (Workspace Connection)</strong>
          <div className="muted">
            status: {props.githubInstallation ? 'connected' : 'not connected'} · account:{' '}
            {props.githubInstallation?.account_login || '-'} · selection:{' '}
            {props.githubInstallation?.repository_selection || '-'}
          </div>
          <div className="toolbar">
            <Button
              className="primary"
              type="button"
              disabled={!props.selectedWorkspace}
              onClick={() => {
                void handleConnectGithub();
              }}
            >
              Connect GitHub App
            </Button>
            <Button
              type="button"
              disabled={!props.selectedWorkspace || !props.githubInstallation}
              onClick={() => {
                void handleSyncGithubRepos();
              }}
            >
              Sync repos
            </Button>
            <Button
              type="button"
              disabled={!props.selectedWorkspace}
              onClick={() => {
                void props.saveGithubProjectSettings();
              }}
            >
              Save GitHub settings
            </Button>
          </div>
          <div className="stack">
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.githubAutoCreateProjects}
                onChange={(event) => props.setGithubAutoCreateProjects(event.target.checked)}
              />{' '}
              Auto-create repo projects during sync
            </label>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.githubAutoCreateSubprojects}
                disabled={props.monorepoContextMode !== 'split_auto'}
                onChange={(event) => props.setGithubAutoCreateSubprojects(event.target.checked)}
              />{' '}
              Auto-create subprojects in split mode only
            </label>
            <label className="stack gap-1">
              <Label className="muted">Project key prefix</Label>
              <Input
                value={props.githubProjectKeyPrefix}
                onChange={(event) => {
                  props.setGithubProjectKeyPrefix(event.target.value);
                  props.setGithubPrefix(event.target.value);
                }}
                placeholder="github:"
              />
            </label>
            <div className="muted">
              {props.monorepoContextMode === 'shared_repo'
                ? 'Shared: All subpaths share a single repo-level project.'
                : 'Split: Subprojects can be isolated as repo#subpath projects.'}
            </div>
            <hr className="border-border/60" />
            <strong>Permission Sync</strong>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.githubPermissionSyncEnabled}
                onChange={(event) => props.setGithubPermissionSyncEnabled(event.target.checked)}
              />{' '}
              Enable GitHub permission sync
            </label>
            <label className="stack gap-1">
              <Label className="muted">Sync mode</Label>
              <Select
                value={props.githubPermissionSyncMode}
                onChange={(event) =>
                  props.setGithubPermissionSyncMode(event.target.value as GithubPermissionSyncMode)
                }
              >
                <option value="add_only">add_only</option>
                <option value="add_and_remove">add_and_remove</option>
              </Select>
            </label>
            <label className="stack gap-1">
              <Label className="muted">Cache TTL (seconds)</Label>
              <Input
                type="number"
                min={30}
                max={86400}
                value={props.githubCacheTtlSeconds}
                onChange={(event) => props.setGithubCacheTtlSeconds(Number(event.target.value || '900'))}
              />
            </label>
            <label className="stack gap-1">
              <Label className="muted">Role mapping (JSON)</Label>
              <Textarea
                value={props.githubRoleMappingJson}
                onChange={(event) => props.setGithubRoleMappingJson(event.target.value)}
                rows={6}
              />
            </label>
            <div className="toolbar">
              <Button
                type="button"
                disabled={!props.selectedWorkspace || !props.githubInstallation}
                onClick={() => {
                  void handleSyncGithubPermissions(true);
                }}
              >
                Dry-run permissions
              </Button>
              <Button
                type="button"
                disabled={!props.selectedWorkspace || !props.githubInstallation}
                onClick={() => {
                  void handleSyncGithubPermissions(false);
                }}
              >
                Recompute all
              </Button>
            </div>
            {props.githubPermissionStatus?.last_sync ? (
              <div className="muted">
                Last permission sync: {new Date(props.githubPermissionStatus.last_sync.created_at).toLocaleString()}
                {' · '}repos {props.githubPermissionStatus.last_sync.repos_processed}
                {' · '}matched {props.githubPermissionStatus.last_sync.users_matched}
                {' · '}added {props.githubPermissionStatus.last_sync.added}
                {' · '}updated {props.githubPermissionStatus.last_sync.updated}
                {' · '}removed {props.githubPermissionStatus.last_sync.removed}
              </div>
            ) : (
              <div className="muted">Last permission sync: no runs yet.</div>
            )}
            {props.githubLastPermissionSyncResult ? (
              <div className="muted">
                Latest run ({props.githubLastPermissionSyncResult.dry_run ? 'dry-run' : 'apply'}):
                {' '}added {props.githubLastPermissionSyncResult.added}, updated{' '}
                {props.githubLastPermissionSyncResult.updated}, removed{' '}
                {props.githubLastPermissionSyncResult.removed}, unmatched{' '}
                {props.githubLastPermissionSyncResult.skipped_unmatched}
              </div>
            ) : null}
            <div className="toolbar">
              <Button
                type="button"
                disabled={!props.selectedWorkspace}
                onClick={() => {
                  void handleRefreshGithubCacheStatus();
                }}
              >
                Refresh cache status
              </Button>
            </div>
            {props.githubPermissionCacheStatus ? (
              <div className="muted">
                Cache status: ttl {props.githubPermissionCacheStatus.ttl_seconds}s · repo teams{' '}
                {props.githubPermissionCacheStatus.repo_teams_cache_count} · team members{' '}
                {props.githubPermissionCacheStatus.team_members_cache_count} · permission rows{' '}
                {props.githubPermissionCacheStatus.permission_cache_count}
              </div>
            ) : null}

            <hr className="border-border/60" />
            <strong>Webhook + Team Mapping</strong>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.githubWebhookEnabled}
                onChange={(event) => props.setGithubWebhookEnabled(event.target.checked)}
              />{' '}
              Enable webhook-driven sync
            </label>
            <label className="stack gap-1">
              <Label className="muted">Webhook sync mode</Label>
              <Select
                value={props.githubWebhookSyncMode}
                onChange={(event) =>
                  props.setGithubWebhookSyncMode(event.target.value as GithubPermissionSyncMode)
                }
              >
                <option value="add_only">add_only</option>
                <option value="add_and_remove">add_and_remove</option>
              </Select>
            </label>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.githubTeamMappingEnabled}
                onChange={(event) => props.setGithubTeamMappingEnabled(event.target.checked)}
              />{' '}
              Enable team mapping
            </label>
            <div className="muted">
              Webhook endpoint: <code>/v1/webhooks/github</code> (set secret via <code>GITHUB_APP_WEBHOOK_SECRET</code>)
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Delivery</th>
                    <th>Event</th>
                    <th>Status</th>
                    <th>Affected Repos</th>
                    <th>Updated</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {props.githubWebhookDeliveries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        no webhook deliveries
                      </td>
                    </tr>
                  ) : (
                    props.githubWebhookDeliveries.slice(0, 20).map((delivery) => (
                      <tr key={delivery.id}>
                        <td>{delivery.delivery_id}</td>
                        <td>{delivery.event_type}</td>
                        <td>{delivery.status}</td>
                        <td>{delivery.affected_repos_count}</td>
                        <td>{new Date(delivery.updated_at).toLocaleString()}</td>
                        <td>{delivery.error || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="stack">
              <strong>GitHub Team Mappings</strong>
              <div className="row">
                <Input
                  value={props.githubTeamMappingProviderInstallationId}
                  onChange={(event) =>
                    props.setGithubTeamMappingProviderInstallationId(event.target.value)
                  }
                  placeholder="installation id (optional)"
                />
                <Input
                  value={props.githubTeamMappingOrgLogin}
                  onChange={(event) => props.setGithubTeamMappingOrgLogin(event.target.value)}
                  placeholder="org login"
                />
                <Input
                  value={props.githubTeamMappingTeamSlug}
                  onChange={(event) => props.setGithubTeamMappingTeamSlug(event.target.value)}
                  placeholder="team slug"
                />
                <Input
                  value={props.githubTeamMappingTeamId}
                  onChange={(event) => props.setGithubTeamMappingTeamId(event.target.value)}
                  placeholder="team id"
                />
              </div>
              <div className="row">
                <Select
                  value={props.githubTeamMappingTargetType}
                  onChange={(event) =>
                    props.setGithubTeamMappingTargetType(
                      event.target.value as 'workspace' | 'project'
                    )
                  }
                >
                  <option value="workspace">workspace</option>
                  <option value="project">project</option>
                </Select>
                <Input
                  value={props.githubTeamMappingTargetKey}
                  onChange={(event) => props.setGithubTeamMappingTargetKey(event.target.value)}
                  placeholder="target key (workspace or project key)"
                />
                <Select
                  value={props.githubTeamMappingRole}
                  onChange={(event) =>
                    props.setGithubTeamMappingRole(
                      event.target.value as
                        | 'OWNER'
                        | 'ADMIN'
                        | 'MEMBER'
                        | 'MAINTAINER'
                        | 'WRITER'
                        | 'READER'
                    )
                  }
                >
                  {props.githubTeamMappingTargetType === 'workspace' ? (
                    <>
                      <option value="OWNER">OWNER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="MEMBER">MEMBER</option>
                    </>
                  ) : (
                    <>
                      <option value="OWNER">OWNER</option>
                      <option value="MAINTAINER">MAINTAINER</option>
                      <option value="WRITER">WRITER</option>
                      <option value="READER">READER</option>
                    </>
                  )}
                </Select>
                <Input
                  value={props.githubTeamMappingPriority}
                  onChange={(event) => props.setGithubTeamMappingPriority(event.target.value)}
                  placeholder="priority"
                />
                <label className="muted">
                  <Input
                    type="checkbox"
                    checked={props.githubTeamMappingEnabledState}
                    onChange={(event) => props.setGithubTeamMappingEnabledState(event.target.checked)}
                  />{' '}
                  enabled
                </label>
                <Button
                  type="button"
                  onClick={() => {
                    void handleCreateGithubTeamMapping();
                  }}
                >
                  Add mapping
                </Button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Org/Team</th>
                      <th>Team ID</th>
                      <th>Target</th>
                      <th>Role</th>
                      <th>Priority</th>
                      <th>Enabled</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.githubTeamMappings.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="muted">
                          no team mappings
                        </td>
                      </tr>
                    ) : (
                      props.githubTeamMappings.map((mapping) => (
                        <tr key={mapping.id}>
                          <td>{mapping.github_org_login}/{mapping.github_team_slug}</td>
                          <td>{mapping.github_team_id}</td>
                          <td>{mapping.target_type}:{mapping.target_key}</td>
                          <td>{mapping.role}</td>
                          <td>{mapping.priority}</td>
                          <td>{mapping.enabled ? 'yes' : 'no'}</td>
                          <td>
                            <div className="toolbar">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  void props.patchGithubTeamMapping({
                                    workspaceKey: props.selectedWorkspace,
                                    mappingId: mapping.id,
                                    input: { enabled: !mapping.enabled },
                                  });
                                }}
                              >
                                Toggle
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  void props.deleteGithubTeamMapping(props.selectedWorkspace, mapping.id);
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <hr className="border-border/60" />
            <strong>SIEM: Audit Sinks + Security Stream</strong>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.securityStreamEnabled}
                onChange={(event) => props.setSecurityStreamEnabled(event.target.checked)}
              />{' '}
              Enable security stream
            </label>
            <div className="row">
              <label className="stack gap-1">
                <Label className="muted">Security stream sink</Label>
                <Select
                  value={props.securityStreamSinkId}
                  onChange={(event) => props.setSecurityStreamSinkId(event.target.value)}
                >
                  <option value="">Auto (all security-capable sinks)</option>
                  {props.auditSinks.map((sink) => (
                    <option key={sink.id} value={sink.id}>
                      {sink.name} ({sink.type})
                    </option>
                  ))}
                </Select>
              </label>
              <label className="stack gap-1">
                <Label className="muted">Min severity</Label>
                <Select
                  value={props.securityStreamMinSeverity}
                  onChange={(event) =>
                    props.setSecurityStreamMinSeverity(
                      event.target.value as 'low' | 'medium' | 'high'
                    )
                  }
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </Select>
              </label>
              <Button
                type="button"
                onClick={() => {
                  void props.saveGithubProjectSettings();
                }}
              >
                Save security stream settings
              </Button>
            </div>
            <div className="muted">
              Security taxonomy: auth.*, access.*, api_key.*, raw.search/raw.view, audit.export, oidc.*
            </div>

            <div className="stack">
              <strong>Create audit sink</strong>
              <div className="row">
                <Select
                  value={props.newAuditSinkType}
                  onChange={(event) => props.setNewAuditSinkType(event.target.value as 'webhook' | 'http')}
                >
                  <option value="webhook">webhook</option>
                  <option value="http">http</option>
                </Select>
                <Input
                  value={props.newAuditSinkName}
                  onChange={(event) => props.setNewAuditSinkName(event.target.value)}
                  placeholder="sink name"
                />
                <Input
                  value={props.newAuditSinkEndpointUrl}
                  onChange={(event) => props.setNewAuditSinkEndpointUrl(event.target.value)}
                  placeholder="https://siem.example.com/ingest"
                />
                <Input
                  value={props.newAuditSinkSecret}
                  onChange={(event) => props.setNewAuditSinkSecret(event.target.value)}
                  placeholder="HMAC secret"
                  type="password"
                />
                <label className="muted">
                  <Input
                    type="checkbox"
                    checked={props.newAuditSinkEnabled}
                    onChange={(event) => props.setNewAuditSinkEnabled(event.target.checked)}
                  />{' '}
                  enabled
                </label>
              </div>
              <div className="row">
                <label className="stack gap-1" style={{ flex: 1 }}>
                  <Label className="muted">event_filter JSON</Label>
                  <Textarea
                    value={props.newAuditSinkEventFilterJson}
                    onChange={(event) => props.setNewAuditSinkEventFilterJson(event.target.value)}
                    rows={5}
                  />
                </label>
                <label className="stack gap-1" style={{ flex: 1 }}>
                  <Label className="muted">retry_policy JSON</Label>
                  <Textarea
                    value={props.newAuditSinkRetryPolicyJson}
                    onChange={(event) => props.setNewAuditSinkRetryPolicyJson(event.target.value)}
                    rows={5}
                  />
                </label>
              </div>
              <label className="stack gap-1">
                <Label className="muted">Reason (for audit log)</Label>
                <Input
                  value={props.auditSinkReason}
                  onChange={(event) => props.setAuditSinkReason(event.target.value)}
                  placeholder="optional"
                />
              </label>
              <div className="toolbar">
                <Button
                  type="button"
                  onClick={() => {
                    void handleCreateAuditSink();
                  }}
                >
                  Create sink
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void handleRefreshAuditDeliveries();
                  }}
                >
                  Refresh deliveries
                </Button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Endpoint</th>
                      <th>Enabled</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.auditSinks.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="muted">
                          no audit sinks
                        </td>
                      </tr>
                    ) : (
                      props.auditSinks.map((sink) => (
                        <tr key={sink.id}>
                          <td>{sink.name}</td>
                          <td>{sink.type}</td>
                          <td>{sink.endpoint_url}</td>
                          <td>{sink.enabled ? 'yes' : 'no'}</td>
                          <td>
                            <div className="toolbar">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  void props.patchAuditSink({
                                    sinkId: sink.id,
                                    input: { enabled: !sink.enabled, reason: props.auditSinkReason || undefined },
                                  });
                                }}
                              >
                                Toggle
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  void props.testAuditSink(sink.id);
                                }}
                              >
                                Test
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  void props.deleteAuditSink(sink.id);
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="row">
                <label className="stack gap-1">
                  <Label className="muted">Delivery status filter</Label>
                  <Select
                    value={props.auditDeliveryStatusFilter}
                    onChange={(event) =>
                      props.setAuditDeliveryStatusFilter(
                        event.target.value as 'queued' | 'sending' | 'delivered' | 'failed' | ''
                      )
                    }
                  >
                    <option value="">all</option>
                    <option value="queued">queued</option>
                    <option value="sending">sending</option>
                    <option value="delivered">delivered</option>
                    <option value="failed">failed</option>
                  </Select>
                </label>
                <Button
                  type="button"
                  onClick={() => {
                    void handleRefreshAuditDeliveries();
                  }}
                >
                  Apply filter
                </Button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Updated</th>
                      <th>Sink</th>
                      <th>Action</th>
                      <th>Status</th>
                      <th>Attempt</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.auditDeliveries.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted">
                          no delivery rows
                        </td>
                      </tr>
                    ) : (
                      props.auditDeliveries.slice(0, 30).map((row) => (
                        <tr key={row.id}>
                          <td>{new Date(row.updated_at).toLocaleString()}</td>
                          <td>{row.sink_name}</td>
                          <td>{row.action_key}</td>
                          <td>{row.status}</td>
                          <td>{row.attempt_count}</td>
                          <td>{row.last_error || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <hr className="border-border/60" />
            <strong>Detections</strong>
            <div className="muted">
              Keywords and thresholds prioritize/trigger monitoring. Decisions are still determined by LLM pipeline.
            </div>
            <div className="stack">
              <div className="row">
                <Input
                  value={props.newDetectionRuleName}
                  onChange={(event) => props.setNewDetectionRuleName(event.target.value)}
                  placeholder="rule name"
                />
                <Select
                  value={props.newDetectionRuleSeverity}
                  onChange={(event) =>
                    props.setNewDetectionRuleSeverity(event.target.value as 'low' | 'medium' | 'high')
                  }
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </Select>
                <label className="muted">
                  <Input
                    type="checkbox"
                    checked={props.newDetectionRuleEnabled}
                    onChange={(event) => props.setNewDetectionRuleEnabled(event.target.checked)}
                  />{' '}
                  enabled
                </label>
              </div>
              <div className="row">
                <label className="stack gap-1" style={{ flex: 1 }}>
                  <Label className="muted">condition JSON</Label>
                  <Textarea
                    value={props.newDetectionRuleConditionJson}
                    onChange={(event) => props.setNewDetectionRuleConditionJson(event.target.value)}
                    rows={5}
                  />
                </label>
                <label className="stack gap-1" style={{ flex: 1 }}>
                  <Label className="muted">notify JSON</Label>
                  <Textarea
                    value={props.newDetectionRuleNotifyJson}
                    onChange={(event) => props.setNewDetectionRuleNotifyJson(event.target.value)}
                    rows={5}
                  />
                </label>
              </div>
              <label className="stack gap-1">
                <Label className="muted">Reason (for audit log)</Label>
                <Input
                  value={props.detectionRuleReason}
                  onChange={(event) => props.setDetectionRuleReason(event.target.value)}
                  placeholder="optional"
                />
              </label>
              <div className="toolbar">
                <Button
                  type="button"
                  onClick={() => {
                    void handleCreateDetectionRule();
                  }}
                >
                  Create rule
                </Button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Severity</th>
                      <th>Enabled</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.detectionRules.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="muted">
                          no detection rules
                        </td>
                      </tr>
                    ) : (
                      props.detectionRules.map((rule) => (
                        <tr key={rule.id}>
                          <td>{rule.name}</td>
                          <td>{rule.severity}</td>
                          <td>{rule.enabled ? 'yes' : 'no'}</td>
                          <td>
                            <div className="toolbar">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  void props.patchDetectionRule({
                                    ruleId: rule.id,
                                    input: { enabled: !rule.enabled, reason: props.detectionRuleReason || undefined },
                                  });
                                }}
                              >
                                Toggle
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  void props.deleteDetectionRule(rule.id);
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="row">
                <label className="stack gap-1">
                  <Label className="muted">Detection status filter</Label>
                  <Select
                    value={props.detectionStatusFilter}
                    onChange={(event) =>
                      props.setDetectionStatusFilter(
                        event.target.value as 'open' | 'ack' | 'closed' | ''
                      )
                    }
                  >
                    <option value="">all</option>
                    <option value="open">open</option>
                    <option value="ack">ack</option>
                    <option value="closed">closed</option>
                  </Select>
                </label>
                <Button
                  type="button"
                  onClick={() => {
                    if (props.selectedWorkspace) {
                      void props.loadDetections(props.selectedWorkspace);
                    }
                  }}
                >
                  Refresh detections
                </Button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Triggered</th>
                      <th>Rule</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th>Actor</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.detections.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted">
                          no detections
                        </td>
                      </tr>
                    ) : (
                      props.detections.slice(0, 30).map((detection) => (
                        <tr key={detection.id}>
                          <td>{new Date(detection.triggered_at).toLocaleString()}</td>
                          <td>{detection.rule_name}</td>
                          <td>{detection.severity}</td>
                          <td>{detection.status}</td>
                          <td>{detection.actor_user_id || '-'}</td>
                          <td>
                            <div className="toolbar">
                              {detection.status !== 'ack' ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    void props.updateDetectionStatus(detection.id, 'ack');
                                  }}
                                >
                                  Ack
                                </Button>
                              ) : null}
                              {detection.status !== 'closed' ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    void props.updateDetectionStatus(detection.id, 'closed');
                                  }}
                                >
                                  Close
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <hr className="border-border/60" />
            <strong>User Links</strong>
            <div className="row">
              <label className="stack gap-1">
                <Label className="muted">Workspace user</Label>
                <Select
                  value={props.githubLinkUserId}
                  onChange={(event) => props.setGithubLinkUserId(event.target.value)}
                >
                  <option value="">Select member</option>
                  {props.workspaceMembers.map((member) => (
                    <option key={member.user.id} value={member.user.id}>
                      {member.user.email}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="stack gap-1">
                <Label className="muted">GitHub login</Label>
                <Input
                  value={props.githubLinkLogin}
                  onChange={(event) => props.setGithubLinkLogin(event.target.value)}
                  placeholder="octocat"
                />
              </label>
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={() => {
                    void handleCreateGithubUserLink();
                  }}
                >
                  Link user
                </Button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>GitHub login</th>
                    <th>GitHub user id</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {props.githubUserLinks.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        no linked users
                      </td>
                    </tr>
                  ) : (
                    props.githubUserLinks.map((link) => (
                      <tr key={link.user_id}>
                        <td>{link.user_email}</td>
                        <td>{link.github_login}</td>
                        <td>{link.github_user_id || '-'}</td>
                        <td>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              void props.deleteGithubUserLink(props.selectedWorkspace, link.user_id);
                            }}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {(props.githubLastPermissionSyncResult?.unmatched_users || props.githubPermissionStatus?.unmatched_users)
              ?.length ? (
              <div style={{ overflowX: 'auto' }}>
                <div className="muted">Unmatched GitHub users</div>
                <table>
                  <thead>
                    <tr>
                      <th>Repo</th>
                      <th>Login</th>
                      <th>User ID</th>
                      <th>Permission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(props.githubLastPermissionSyncResult?.unmatched_users ||
                      props.githubPermissionStatus?.unmatched_users ||
                      []
                    ).slice(0, 50).map((row, index) => (
                      <tr key={`${row.repo_full_name}-${row.github_login}-${index}`}>
                        <td>{row.repo_full_name}</td>
                        <td>{row.github_login || '-'}</td>
                        <td>{row.github_user_id || '-'}</td>
                        <td>{row.permission}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
          {props.githubLastSyncSummary ? (
            <div className="muted">
              Last sync: {props.githubLastSyncSummary.count} repos, auto-created{' '}
              {props.githubLastSyncSummary.projects_auto_created} projects, auto-linked{' '}
              {props.githubLastSyncSummary.projects_auto_linked} repos.
            </div>
          ) : null}
          {props.githubInstallUrl ? (
            <div className="muted">
              last install URL:{' '}
              <a href={props.githubInstallUrl} target="_blank" rel="noreferrer">
                {props.githubInstallUrl}
              </a>
            </div>
          ) : null}
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Visibility</th>
                  <th>Default Branch</th>
                  <th>Linked Project</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {props.githubRepos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      no synced repos
                    </td>
                  </tr>
                ) : (
                  props.githubRepos.map((repo) => (
                    <tr key={repo.github_repo_id}>
                      <td>{repo.full_name}</td>
                      <td>{repo.private ? 'private' : 'public'}</td>
                      <td>{repo.default_branch || '-'}</td>
                      <td>{repo.linked_project_key || '-'}</td>
                      <td>
                        <div className="toolbar">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              void handlePreviewGithubPermissions(repo.full_name);
                            }}
                          >
                            Preview permissions
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              void handleRecomputeGithubRepo(repo.full_name);
                            }}
                          >
                            Recompute repo
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {props.githubPermissionPreview ? (
            <div className="stack">
              <div className="muted">
                Permission preview: {props.githubPermissionPreview.repo_full_name} {'->'}{' '}
                {props.githubPermissionPreview.project_key || '-'}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>GitHub User ID</th>
                      <th>GitHub Login</th>
                      <th>Permission</th>
                      <th>Matched User</th>
                      <th>Mapped Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.githubPermissionPreview.computed_permissions.slice(0, 200).map((row) => (
                      <tr key={`${row.github_user_id}-${row.permission}`}>
                        <td>{row.github_user_id}</td>
                        <td>{row.github_login || '-'}</td>
                        <td>{row.permission}</td>
                        <td>{row.matched_user_email || row.matched_user_id || '-'}</td>
                        <td>{row.mapped_project_role || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="muted">
          You can save integration keys in workspace settings even when environment variables are not set.
        </div>
        <div className="muted">
          When commit/merge auto-write triggers are enabled, git events generate audit logs and Notion write attempts.
        </div>
        <div className="muted">
          Jira/Confluence/Linear currently support audit-triggered auto-write hooks; full write coverage can be extended later.
        </div>
        <label className="stack gap-1">
          <Label className="muted">Reason (for audit + Slack)</Label>
          <Input
            value={props.integrationReason}
            onChange={(event) => props.setIntegrationReason(event.target.value)}
            placeholder="why this integration config changed"
          />
        </label>

        <form className="stack" onSubmit={props.saveNotionIntegration}>
          <strong>Notion</strong>
          <div className="muted">
            source: {props.integrationStates.notion.source} · configured:{' '}
            {props.integrationStates.notion.configured ? 'yes' : 'no'} · token:{' '}
            {props.integrationStates.notion.has_token ? 'saved' : 'missing'} · write:{' '}
            {props.integrationStates.notion.write_enabled ? 'enabled' : 'disabled'} · hook(commit/merge):{' '}
            {props.integrationStates.notion.write_on_commit ? 'on' : 'off'}/
            {props.integrationStates.notion.write_on_merge ? 'on' : 'off'}
          </div>
          {props.notionLocked ? (
            <div className="muted">locked by env policy (MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS)</div>
          ) : null}
          <fieldset disabled={props.notionLocked} style={{ border: 0, margin: 0, padding: 0 }}>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.notionEnabled}
                onChange={(event) => props.setNotionEnabled(event.target.checked)}
              />{' '}
              enabled
            </label>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.notionWriteEnabled}
                onChange={(event) => props.setNotionWriteEnabled(event.target.checked)}
              />{' '}
              write enabled
            </label>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.notionWriteOnCommit}
                onChange={(event) => props.setNotionWriteOnCommit(event.target.checked)}
              />{' '}
              auto write on commit hook
            </label>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.notionWriteOnMerge}
                onChange={(event) => props.setNotionWriteOnMerge(event.target.checked)}
              />{' '}
              auto write on merge hook
            </label>
            <div className="row">
              <Input
                value={props.notionParentPageId}
                onChange={(event) => props.setNotionParentPageId(event.target.value)}
                placeholder="default parent page id (optional)"
              />
              <Input
                value={props.notionToken}
                onChange={(event) => props.setNotionToken(event.target.value)}
                placeholder="notion token (blank = keep existing)"
              />
            </div>
            <div className="toolbar">
              <Button className="primary" type="submit">
                Save Notion
              </Button>
            </div>
          </fieldset>
        </form>

        <form className="stack" onSubmit={props.saveJiraIntegration}>
          <strong>Jira</strong>
          <div className="muted">
            source: {props.integrationStates.jira.source} · configured:{' '}
            {props.integrationStates.jira.configured ? 'yes' : 'no'} · token:{' '}
            {props.integrationStates.jira.has_api_token ? 'saved' : 'missing'} · hook(commit/merge):{' '}
            {props.integrationStates.jira.write_on_commit ? 'on' : 'off'}/
            {props.integrationStates.jira.write_on_merge ? 'on' : 'off'}
          </div>
          {props.jiraLocked ? (
            <div className="muted">locked by env policy (MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS)</div>
          ) : null}
          <fieldset disabled={props.jiraLocked} style={{ border: 0, margin: 0, padding: 0 }}>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.jiraEnabled}
                onChange={(event) => props.setJiraEnabled(event.target.checked)}
              />{' '}
              enabled
            </label>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.jiraWriteOnCommit}
                onChange={(event) => props.setJiraWriteOnCommit(event.target.checked)}
              />{' '}
              auto write on commit hook
            </label>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.jiraWriteOnMerge}
                onChange={(event) => props.setJiraWriteOnMerge(event.target.checked)}
              />{' '}
              auto write on merge hook
            </label>
            <div className="row">
              <Input
                value={props.jiraBaseUrl}
                onChange={(event) => props.setJiraBaseUrl(event.target.value)}
                placeholder="https://your-org.atlassian.net"
              />
              <Input
                value={props.jiraEmail}
                onChange={(event) => props.setJiraEmail(event.target.value)}
                placeholder="jira-email"
              />
            </div>
            <Input
              value={props.jiraToken}
              onChange={(event) => props.setJiraToken(event.target.value)}
              placeholder="jira api token (blank = keep existing)"
            />
            <div className="toolbar">
              <Button className="primary" type="submit">
                Save Jira
              </Button>
            </div>
          </fieldset>
        </form>

        <form className="stack" onSubmit={props.saveConfluenceIntegration}>
          <strong>Confluence</strong>
          <div className="muted">
            source: {props.integrationStates.confluence.source} · configured:{' '}
            {props.integrationStates.confluence.configured ? 'yes' : 'no'} · token:{' '}
            {props.integrationStates.confluence.has_api_token ? 'saved' : 'missing'} · hook(commit/merge):{' '}
            {props.integrationStates.confluence.write_on_commit ? 'on' : 'off'}/
            {props.integrationStates.confluence.write_on_merge ? 'on' : 'off'}
          </div>
          {props.confluenceLocked ? (
            <div className="muted">locked by env policy (MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS)</div>
          ) : null}
          <fieldset disabled={props.confluenceLocked} style={{ border: 0, margin: 0, padding: 0 }}>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.confluenceEnabled}
                onChange={(event) => props.setConfluenceEnabled(event.target.checked)}
              />{' '}
              enabled
            </label>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.confluenceWriteOnCommit}
                onChange={(event) => props.setConfluenceWriteOnCommit(event.target.checked)}
              />{' '}
              auto write on commit hook
            </label>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.confluenceWriteOnMerge}
                onChange={(event) => props.setConfluenceWriteOnMerge(event.target.checked)}
              />{' '}
              auto write on merge hook
            </label>
            <div className="row">
              <Input
                value={props.confluenceBaseUrl}
                onChange={(event) => props.setConfluenceBaseUrl(event.target.value)}
                placeholder="https://your-org.atlassian.net/wiki"
              />
              <Input
                value={props.confluenceEmail}
                onChange={(event) => props.setConfluenceEmail(event.target.value)}
                placeholder="confluence-email"
              />
            </div>
            <Input
              value={props.confluenceToken}
              onChange={(event) => props.setConfluenceToken(event.target.value)}
              placeholder="confluence api token (blank = keep existing)"
            />
            <div className="toolbar">
              <Button className="primary" type="submit">
                Save Confluence
              </Button>
            </div>
          </fieldset>
        </form>

        <form className="stack" onSubmit={props.saveLinearIntegration}>
          <strong>Linear</strong>
          <div className="muted">
            source: {props.integrationStates.linear.source} · configured:{' '}
            {props.integrationStates.linear.configured ? 'yes' : 'no'} · key:{' '}
            {props.integrationStates.linear.has_api_key ? 'saved' : 'missing'} · hook(commit/merge):{' '}
            {props.integrationStates.linear.write_on_commit ? 'on' : 'off'}/
            {props.integrationStates.linear.write_on_merge ? 'on' : 'off'}
          </div>
          {props.linearLocked ? (
            <div className="muted">locked by env policy (MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS)</div>
          ) : null}
          <fieldset disabled={props.linearLocked} style={{ border: 0, margin: 0, padding: 0 }}>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.linearEnabled}
                onChange={(event) => props.setLinearEnabled(event.target.checked)}
              />{' '}
              enabled
            </label>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.linearWriteOnCommit}
                onChange={(event) => props.setLinearWriteOnCommit(event.target.checked)}
              />{' '}
              auto write on commit hook
            </label>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.linearWriteOnMerge}
                onChange={(event) => props.setLinearWriteOnMerge(event.target.checked)}
              />{' '}
              auto write on merge hook
            </label>
            <div className="row">
              <Input
                value={props.linearApiUrl}
                onChange={(event) => props.setLinearApiUrl(event.target.value)}
                placeholder="https://api.linear.app/graphql"
              />
              <Input
                value={props.linearApiKey}
                onChange={(event) => props.setLinearApiKey(event.target.value)}
                placeholder="linear api key (blank = keep existing)"
              />
            </div>
            <div className="toolbar">
              <Button className="primary" type="submit">
                Save Linear
              </Button>
            </div>
          </fieldset>
        </form>

        <form className="stack" onSubmit={props.saveSlackIntegration}>
          <strong>Slack Audit</strong>
          <div className="muted">
            source: {props.integrationStates.slack.source} · configured:{' '}
            {props.integrationStates.slack.configured ? 'yes' : 'no'} · webhook:{' '}
            {props.integrationStates.slack.has_webhook ? 'saved' : 'missing'} · format:{' '}
            {props.integrationStates.slack.format || 'detailed'}
          </div>
          {props.slackLocked ? (
            <div className="muted">locked by env policy (MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS)</div>
          ) : null}
          <div className="muted">
            Route example: git./ci. to #audit-devflow, integration.* high+ to #audit-security
          </div>
          <fieldset disabled={props.slackLocked} style={{ border: 0, margin: 0, padding: 0 }}>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.slackEnabled}
                onChange={(event) => props.setSlackEnabled(event.target.checked)}
              />{' '}
              enabled
            </label>
            <div className="row">
              <Input
                value={props.slackWebhookUrl}
                onChange={(event) => props.setSlackWebhookUrl(event.target.value)}
                placeholder="slack webhook url (blank = keep existing)"
              />
              <Input
                value={props.slackDefaultChannel}
                onChange={(event) => props.setSlackDefaultChannel(event.target.value)}
                placeholder="#channel (optional)"
              />
            </div>
            <Input
              value={props.slackActionPrefixes}
              onChange={(event) => props.setSlackActionPrefixes(event.target.value)}
              placeholder="action prefixes CSV (e.g. git.,ci.,integration.,raw.)"
            />
            <div className="row">
              <Select
                value={props.slackFormat}
                onChange={(event) => props.setSlackFormat(event.target.value as 'compact' | 'detailed')}
              >
                <option value="detailed">detailed</option>
                <option value="compact">compact</option>
              </Select>
              <label className="muted">
                <Input
                  type="checkbox"
                  checked={props.slackIncludeTargetJson}
                  onChange={(event) => props.setSlackIncludeTargetJson(event.target.checked)}
                />{' '}
                include target json
              </label>
              <label className="muted">
                <Input
                  type="checkbox"
                  checked={props.slackMaskSecrets}
                  onChange={(event) => props.setSlackMaskSecrets(event.target.checked)}
                />{' '}
                mask secrets
              </label>
            </div>
            <label>
              <div className="muted">Routes JSON (action_prefix/channel/min_severity)</div>
              <Textarea
                value={props.slackRoutesJson}
                onChange={(event) => props.setSlackRoutesJson(event.target.value)}
                placeholder='[{"action_prefix":"ci.","channel":"#audit-devflow","min_severity":"medium"}]'
              />
            </label>
            <label>
              <div className="muted">Severity Rules JSON (action_prefix/severity)</div>
              <Textarea
                value={props.slackSeverityRulesJson}
                onChange={(event) => props.setSlackSeverityRulesJson(event.target.value)}
                placeholder='[{"action_prefix":"integration.","severity":"high"}]'
              />
            </label>
            <div className="toolbar">
              <Button className="primary" type="submit">
                Save Slack Audit
              </Button>
            </div>
          </fieldset>
        </form>

        <form className="stack" onSubmit={props.saveAuditReasonerIntegration}>
          <strong>Audit Reasoner (AI)</strong>
          <div className="muted">
            source: {props.integrationStates.audit_reasoner.source} · configured:{' '}
            {props.integrationStates.audit_reasoner.configured ? 'yes' : 'no'} · order:{' '}
            {(props.integrationStates.audit_reasoner.provider_order || []).join(',') || '-'}
          </div>
          <div className="muted">
            keys(openai/claude/gemini):{' '}
            {props.integrationStates.audit_reasoner.has_openai_api_key ? 'o' : 'x'}/
            {props.integrationStates.audit_reasoner.has_claude_api_key ? 'o' : 'x'}/
            {props.integrationStates.audit_reasoner.has_gemini_api_key ? 'o' : 'x'}
          </div>
          <div className="muted">
            Environment precedence: when env values are set, provider order and fallback use env first.
          </div>
          {props.auditReasonerLocked ? (
            <div className="muted">locked by env policy (MEMORY_CORE_INTEGRATION_LOCKED_PROVIDERS)</div>
          ) : null}
          <fieldset disabled={props.auditReasonerLocked} style={{ border: 0, margin: 0, padding: 0 }}>
            <label className="muted">
              <Input
                type="checkbox"
                checked={props.auditReasonerEnabled}
                onChange={(event) => props.setAuditReasonerEnabled(event.target.checked)}
              />{' '}
              enabled
            </label>
            <Input
              value={props.auditReasonerOrderCsv}
              onChange={(event) => props.setAuditReasonerOrderCsv(event.target.value)}
              placeholder="provider order csv (e.g. openai,claude,gemini)"
            />
            <div className="muted">If first provider fails, next provider is used automatically.</div>

            <strong>OpenAI</strong>
            <div className="row">
              <Input
                value={props.auditReasonerOpenAiModel}
                onChange={(event) => props.setAuditReasonerOpenAiModel(event.target.value)}
                placeholder="openai model"
              />
              <Input
                value={props.auditReasonerOpenAiBaseUrl}
                onChange={(event) => props.setAuditReasonerOpenAiBaseUrl(event.target.value)}
                placeholder="openai base url (optional)"
              />
            </div>
            <Input
              value={props.auditReasonerOpenAiApiKey}
              onChange={(event) => props.setAuditReasonerOpenAiApiKey(event.target.value)}
              placeholder="openai api key (blank = keep existing)"
            />

            <strong>Claude</strong>
            <div className="row">
              <Input
                value={props.auditReasonerClaudeModel}
                onChange={(event) => props.setAuditReasonerClaudeModel(event.target.value)}
                placeholder="claude model"
              />
              <Input
                value={props.auditReasonerClaudeBaseUrl}
                onChange={(event) => props.setAuditReasonerClaudeBaseUrl(event.target.value)}
                placeholder="claude base url (optional)"
              />
            </div>
            <Input
              value={props.auditReasonerClaudeApiKey}
              onChange={(event) => props.setAuditReasonerClaudeApiKey(event.target.value)}
              placeholder="claude api key (blank = keep existing)"
            />

            <strong>Gemini</strong>
            <div className="row">
              <Input
                value={props.auditReasonerGeminiModel}
                onChange={(event) => props.setAuditReasonerGeminiModel(event.target.value)}
                placeholder="gemini model"
              />
              <Input
                value={props.auditReasonerGeminiBaseUrl}
                onChange={(event) => props.setAuditReasonerGeminiBaseUrl(event.target.value)}
                placeholder="gemini base url (optional)"
              />
            </div>
            <Input
              value={props.auditReasonerGeminiApiKey}
              onChange={(event) => props.setAuditReasonerGeminiApiKey(event.target.value)}
              placeholder="gemini api key (blank = keep existing)"
            />
            <div className="toolbar">
              <Button className="primary" type="submit">
                Save Audit Reasoner
              </Button>
            </div>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}

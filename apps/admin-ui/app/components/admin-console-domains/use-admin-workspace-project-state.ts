'use client';

import { useState } from 'react';
import {
  RESOLUTION_KINDS,
  type MonorepoContextMode,
  type MonorepoMode,
  type MonorepoSubprojectPolicy,
  type OidcClaimGroupsFormat,
  type OidcGroupMapping,
  type OidcProvider,
  type OidcSyncMode,
  type Project,
  type ProjectMapping,
  type ProjectMember,
  type ProjectRole,
  type SecuritySeverity,
  type RetentionMode,
  type ResolutionKind,
  type Workspace,
} from '../../lib/types';

export function useAdminWorkspaceProjectState() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [newWorkspaceKey, setNewWorkspaceKey] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [projectViewFilter, setProjectViewFilter] = useState<'all' | 'repo_only' | 'subprojects_only'>('all');
  const [newProjectKey, setNewProjectKey] = useState('');
  const [newProjectName, setNewProjectName] = useState('');

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('READER');

  const [resolutionOrder, setResolutionOrder] = useState<ResolutionKind[]>(RESOLUTION_KINDS);
  const [autoCreateProject, setAutoCreateProject] = useState(true);
  const [autoCreateProjectSubprojects, setAutoCreateProjectSubprojects] = useState(true);
  const [autoSwitchRepo, setAutoSwitchRepo] = useState(true);
  const [autoSwitchSubproject, setAutoSwitchSubproject] = useState(false);
  const [allowManualPin, setAllowManualPin] = useState(true);
  const [enableGitEvents, setEnableGitEvents] = useState(true);
  const [enableCommitEvents, setEnableCommitEvents] = useState(true);
  const [enableMergeEvents, setEnableMergeEvents] = useState(true);
  const [enableCheckoutEvents, setEnableCheckoutEvents] = useState(false);
  const [checkoutDebounceSeconds, setCheckoutDebounceSeconds] = useState(30);
  const [checkoutDailyLimit, setCheckoutDailyLimit] = useState(200);
  const [searchDefaultMode, setSearchDefaultMode] = useState<'hybrid' | 'keyword' | 'semantic'>(
    'hybrid'
  );
  const [searchHybridAlpha, setSearchHybridAlpha] = useState(0.6);
  const [searchHybridBeta, setSearchHybridBeta] = useState(0.4);
  const [searchDefaultLimit, setSearchDefaultLimit] = useState(20);
  const [searchTypeWeightsJson, setSearchTypeWeightsJson] = useState(
    '{\n  "decision": 1.5,\n  "constraint": 1.35,\n  "goal": 1.2,\n  "activity": 1.05,\n  "active_work": 1.1,\n  "summary": 1.2,\n  "note": 1.0,\n  "problem": 1.0,\n  "caveat": 0.95\n}'
  );
  const [searchRecencyHalfLifeDays, setSearchRecencyHalfLifeDays] = useState(14);
  const [searchSubpathBoostWeight, setSearchSubpathBoostWeight] = useState(1.5);
  const [retentionPolicyEnabled, setRetentionPolicyEnabled] = useState(false);
  const [auditRetentionDays, setAuditRetentionDays] = useState(365);
  const [rawRetentionDays, setRawRetentionDays] = useState(90);
  const [retentionMode, setRetentionMode] = useState<RetentionMode>('archive');
  const [securityStreamEnabled, setSecurityStreamEnabled] = useState(true);
  const [securityStreamSinkId, setSecurityStreamSinkId] = useState('');
  const [securityStreamMinSeverity, setSecurityStreamMinSeverity] =
    useState<SecuritySeverity>('medium');
  const [githubAutoCreateProjects, setGithubAutoCreateProjects] = useState(true);
  const [githubAutoCreateSubprojects, setGithubAutoCreateSubprojects] = useState(false);
  const [githubPermissionSyncEnabled, setGithubPermissionSyncEnabled] = useState(false);
  const [githubPermissionSyncMode, setGithubPermissionSyncMode] = useState<'add_only' | 'add_and_remove'>('add_only');
  const [githubCacheTtlSeconds, setGithubCacheTtlSeconds] = useState(900);
  const [githubWebhookEnabled, setGithubWebhookEnabled] = useState(false);
  const [githubWebhookSyncMode, setGithubWebhookSyncMode] = useState<'add_only' | 'add_and_remove'>('add_only');
  const [githubTeamMappingEnabled, setGithubTeamMappingEnabled] = useState(true);
  const [githubRoleMappingJson, setGithubRoleMappingJson] = useState(
    '{\n  "admin": "maintainer",\n  "maintain": "maintainer",\n  "write": "writer",\n  "triage": "reader",\n  "read": "reader"\n}'
  );
  const [githubProjectKeyPrefix, setGithubProjectKeyPrefix] = useState('github:');
  const [githubPrefix, setGithubPrefix] = useState('github:');
  const [localPrefix, setLocalPrefix] = useState('local:');
  const [enableMonorepoResolution, setEnableMonorepoResolution] = useState(false);
  const [monorepoDetectionLevel, setMonorepoDetectionLevel] = useState(2);
  const [monorepoMode, setMonorepoMode] = useState<MonorepoMode>('repo_hash_subpath');
  const [monorepoContextMode, setMonorepoContextMode] = useState<MonorepoContextMode>('shared_repo');
  const [monorepoSubpathMetadataEnabled, setMonorepoSubpathMetadataEnabled] = useState(true);
  const [monorepoSubpathBoostEnabled, setMonorepoSubpathBoostEnabled] = useState(true);
  const [monorepoSubpathBoostWeight, setMonorepoSubpathBoostWeight] = useState(1.5);
  const [monorepoSubprojectPolicies, setMonorepoSubprojectPolicies] = useState<
    MonorepoSubprojectPolicy[]
  >([]);
  const [newMonorepoPolicyRepoKey, setNewMonorepoPolicyRepoKey] = useState('');
  const [newMonorepoPolicySubpath, setNewMonorepoPolicySubpath] = useState('');
  const [newMonorepoPolicyEnabled, setNewMonorepoPolicyEnabled] = useState(true);
  const [monorepoPolicyReason, setMonorepoPolicyReason] = useState('');
  const [monorepoWorkspaceGlobsText, setMonorepoWorkspaceGlobsText] = useState('apps/*\npackages/*');
  const [monorepoExcludeGlobsText, setMonorepoExcludeGlobsText] = useState(
    '**/node_modules/**\n**/.git/**\n**/dist/**\n**/build/**\n.next/**'
  );
  const [monorepoRootMarkersText, setMonorepoRootMarkersText] = useState(
    'pnpm-workspace.yaml\nturbo.json\nnx.json\nlerna.json'
  );
  const [monorepoMaxDepth, setMonorepoMaxDepth] = useState(3);
  const [workspaceSettingsReason, setWorkspaceSettingsReason] = useState('');
  const [oidcSyncMode, setOidcSyncMode] = useState<OidcSyncMode>('add_only');
  const [oidcAllowAutoProvision, setOidcAllowAutoProvision] = useState(true);
  const [oidcProviders, setOidcProviders] = useState<OidcProvider[]>([]);
  const [selectedOidcProviderId, setSelectedOidcProviderId] = useState('');
  const [oidcProviderName, setOidcProviderName] = useState('');
  const [oidcProviderIssuerUrl, setOidcProviderIssuerUrl] = useState('');
  const [oidcProviderClientId, setOidcProviderClientId] = useState('');
  const [oidcProviderClientSecret, setOidcProviderClientSecret] = useState('');
  const [oidcProviderDiscoveryEnabled, setOidcProviderDiscoveryEnabled] = useState(true);
  const [oidcProviderScopes, setOidcProviderScopes] = useState('openid profile email');
  const [oidcClaimGroupsName, setOidcClaimGroupsName] = useState('groups');
  const [oidcClaimGroupsFormat, setOidcClaimGroupsFormat] = useState<OidcClaimGroupsFormat>('id');
  const [oidcProviderEnabled, setOidcProviderEnabled] = useState(true);
  const [oidcMappings, setOidcMappings] = useState<OidcGroupMapping[]>([]);
  const [oidcMappingClaimName, setOidcMappingClaimName] = useState('groups');
  const [oidcMappingGroupId, setOidcMappingGroupId] = useState('');
  const [oidcMappingDisplayName, setOidcMappingDisplayName] = useState('');
  const [oidcMappingTargetType, setOidcMappingTargetType] = useState<'workspace' | 'project'>('workspace');
  const [oidcMappingTargetKey, setOidcMappingTargetKey] = useState('');
  const [oidcMappingRole, setOidcMappingRole] = useState<
    'OWNER' | 'ADMIN' | 'MEMBER' | 'MAINTAINER' | 'WRITER' | 'READER'
  >('MEMBER');
  const [oidcMappingPriority, setOidcMappingPriority] = useState('100');
  const [oidcMappingEnabled, setOidcMappingEnabled] = useState(true);
  const [oidcSettingsReason, setOidcSettingsReason] = useState('');

  const [mappings, setMappings] = useState<ProjectMapping[]>([]);
  const [newMappingKind, setNewMappingKind] = useState<ResolutionKind>('github_remote');
  const [newMappingExternalId, setNewMappingExternalId] = useState('');
  const [newMappingProjectKey, setNewMappingProjectKey] = useState('');
  const [newMappingPriority, setNewMappingPriority] = useState('');
  const [newMappingEnabled, setNewMappingEnabled] = useState(true);
  const [mappingReason, setMappingReason] = useState('');
  const [draggingKind, setDraggingKind] = useState<ResolutionKind | null>(null);

  function resetWorkspaceScopedState() {
    setProjects([]);
    setSelectedProject('');
    setProjectViewFilter('all');
    setNewProjectKey('');
    setNewProjectName('');
    setMembers([]);
    setInviteEmail('');
    setInviteRole('READER');
    setResolutionOrder(RESOLUTION_KINDS);
    setAutoCreateProject(true);
    setAutoCreateProjectSubprojects(true);
    setAutoSwitchRepo(true);
    setAutoSwitchSubproject(false);
    setAllowManualPin(true);
    setEnableGitEvents(true);
    setEnableCommitEvents(true);
    setEnableMergeEvents(true);
    setEnableCheckoutEvents(false);
    setCheckoutDebounceSeconds(30);
    setCheckoutDailyLimit(200);
    setSearchDefaultMode('hybrid');
    setSearchHybridAlpha(0.6);
    setSearchHybridBeta(0.4);
    setSearchDefaultLimit(20);
    setSearchTypeWeightsJson(
      '{\n  "decision": 1.5,\n  "constraint": 1.35,\n  "goal": 1.2,\n  "activity": 1.05,\n  "active_work": 1.1,\n  "summary": 1.2,\n  "note": 1.0,\n  "problem": 1.0,\n  "caveat": 0.95\n}'
    );
    setSearchRecencyHalfLifeDays(14);
    setSearchSubpathBoostWeight(1.5);
    setRetentionPolicyEnabled(false);
    setAuditRetentionDays(365);
    setRawRetentionDays(90);
    setRetentionMode('archive');
    setSecurityStreamEnabled(true);
    setSecurityStreamSinkId('');
    setSecurityStreamMinSeverity('medium');
    setGithubAutoCreateProjects(true);
    setGithubAutoCreateSubprojects(false);
    setGithubPermissionSyncEnabled(false);
    setGithubPermissionSyncMode('add_only');
    setGithubCacheTtlSeconds(900);
    setGithubWebhookEnabled(false);
    setGithubWebhookSyncMode('add_only');
    setGithubTeamMappingEnabled(true);
    setGithubRoleMappingJson(
      '{\n  "admin": "maintainer",\n  "maintain": "maintainer",\n  "write": "writer",\n  "triage": "reader",\n  "read": "reader"\n}'
    );
    setGithubProjectKeyPrefix('github:');
    setGithubPrefix('github:');
    setLocalPrefix('local:');
    setEnableMonorepoResolution(false);
    setMonorepoDetectionLevel(2);
    setMonorepoMode('repo_hash_subpath');
    setMonorepoContextMode('shared_repo');
    setMonorepoSubpathMetadataEnabled(true);
    setMonorepoSubpathBoostEnabled(true);
    setMonorepoSubpathBoostWeight(1.5);
    setMonorepoSubprojectPolicies([]);
    setNewMonorepoPolicyRepoKey('');
    setNewMonorepoPolicySubpath('');
    setNewMonorepoPolicyEnabled(true);
    setMonorepoPolicyReason('');
    setMonorepoWorkspaceGlobsText('apps/*\npackages/*');
    setMonorepoExcludeGlobsText(
      '**/node_modules/**\n**/.git/**\n**/dist/**\n**/build/**\n.next/**'
    );
    setMonorepoRootMarkersText('pnpm-workspace.yaml\nturbo.json\nnx.json\nlerna.json');
    setMonorepoMaxDepth(3);
    setWorkspaceSettingsReason('');
    setOidcSyncMode('add_only');
    setOidcAllowAutoProvision(true);
    setOidcProviders([]);
    setSelectedOidcProviderId('');
    setOidcProviderName('');
    setOidcProviderIssuerUrl('');
    setOidcProviderClientId('');
    setOidcProviderClientSecret('');
    setOidcProviderDiscoveryEnabled(true);
    setOidcProviderScopes('openid profile email');
    setOidcClaimGroupsName('groups');
    setOidcClaimGroupsFormat('id');
    setOidcProviderEnabled(true);
    setOidcMappings([]);
    setOidcMappingClaimName('groups');
    setOidcMappingGroupId('');
    setOidcMappingDisplayName('');
    setOidcMappingTargetType('workspace');
    setOidcMappingTargetKey('');
    setOidcMappingRole('MEMBER');
    setOidcMappingPriority('100');
    setOidcMappingEnabled(true);
    setOidcSettingsReason('');
    setMappings([]);
    setNewMappingKind('github_remote');
    setNewMappingExternalId('');
    setNewMappingProjectKey('');
    setNewMappingPriority('');
    setNewMappingEnabled(true);
    setMappingReason('');
    setDraggingKind(null);
  }

  return {
    workspaces,
    setWorkspaces,
    selectedWorkspace,
    setSelectedWorkspace,
    newWorkspaceKey,
    setNewWorkspaceKey,
    newWorkspaceName,
    setNewWorkspaceName,
    projects,
    setProjects,
    selectedProject,
    setSelectedProject,
    projectViewFilter,
    setProjectViewFilter,
    newProjectKey,
    setNewProjectKey,
    newProjectName,
    setNewProjectName,
    members,
    setMembers,
    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    resolutionOrder,
    setResolutionOrder,
    autoCreateProject,
    setAutoCreateProject,
    autoCreateProjectSubprojects,
    setAutoCreateProjectSubprojects,
    autoSwitchRepo,
    setAutoSwitchRepo,
    autoSwitchSubproject,
    setAutoSwitchSubproject,
    allowManualPin,
    setAllowManualPin,
    enableGitEvents,
    setEnableGitEvents,
    enableCommitEvents,
    setEnableCommitEvents,
    enableMergeEvents,
    setEnableMergeEvents,
    enableCheckoutEvents,
    setEnableCheckoutEvents,
    checkoutDebounceSeconds,
    setCheckoutDebounceSeconds,
    checkoutDailyLimit,
    setCheckoutDailyLimit,
    searchDefaultMode,
    setSearchDefaultMode,
    searchHybridAlpha,
    setSearchHybridAlpha,
    searchHybridBeta,
    setSearchHybridBeta,
    searchDefaultLimit,
    setSearchDefaultLimit,
    searchTypeWeightsJson,
    setSearchTypeWeightsJson,
    searchRecencyHalfLifeDays,
    setSearchRecencyHalfLifeDays,
    searchSubpathBoostWeight,
    setSearchSubpathBoostWeight,
    retentionPolicyEnabled,
    setRetentionPolicyEnabled,
    auditRetentionDays,
    setAuditRetentionDays,
    rawRetentionDays,
    setRawRetentionDays,
    retentionMode,
    setRetentionMode,
    securityStreamEnabled,
    setSecurityStreamEnabled,
    securityStreamSinkId,
    setSecurityStreamSinkId,
    securityStreamMinSeverity,
    setSecurityStreamMinSeverity,
    githubAutoCreateProjects,
    setGithubAutoCreateProjects,
    githubAutoCreateSubprojects,
    setGithubAutoCreateSubprojects,
    githubPermissionSyncEnabled,
    setGithubPermissionSyncEnabled,
    githubPermissionSyncMode,
    setGithubPermissionSyncMode,
    githubCacheTtlSeconds,
    setGithubCacheTtlSeconds,
    githubWebhookEnabled,
    setGithubWebhookEnabled,
    githubWebhookSyncMode,
    setGithubWebhookSyncMode,
    githubTeamMappingEnabled,
    setGithubTeamMappingEnabled,
    githubRoleMappingJson,
    setGithubRoleMappingJson,
    githubProjectKeyPrefix,
    setGithubProjectKeyPrefix,
    githubPrefix,
    setGithubPrefix,
    localPrefix,
    setLocalPrefix,
    enableMonorepoResolution,
    setEnableMonorepoResolution,
    monorepoDetectionLevel,
    setMonorepoDetectionLevel,
    monorepoMode,
    setMonorepoMode,
    monorepoContextMode,
    setMonorepoContextMode,
    monorepoSubpathMetadataEnabled,
    setMonorepoSubpathMetadataEnabled,
    monorepoSubpathBoostEnabled,
    setMonorepoSubpathBoostEnabled,
    monorepoSubpathBoostWeight,
    setMonorepoSubpathBoostWeight,
    monorepoSubprojectPolicies,
    setMonorepoSubprojectPolicies,
    newMonorepoPolicyRepoKey,
    setNewMonorepoPolicyRepoKey,
    newMonorepoPolicySubpath,
    setNewMonorepoPolicySubpath,
    newMonorepoPolicyEnabled,
    setNewMonorepoPolicyEnabled,
    monorepoPolicyReason,
    setMonorepoPolicyReason,
    monorepoWorkspaceGlobsText,
    setMonorepoWorkspaceGlobsText,
    monorepoExcludeGlobsText,
    setMonorepoExcludeGlobsText,
    monorepoRootMarkersText,
    setMonorepoRootMarkersText,
    monorepoMaxDepth,
    setMonorepoMaxDepth,
    workspaceSettingsReason,
    setWorkspaceSettingsReason,
    oidcSyncMode,
    setOidcSyncMode,
    oidcAllowAutoProvision,
    setOidcAllowAutoProvision,
    oidcProviders,
    setOidcProviders,
    selectedOidcProviderId,
    setSelectedOidcProviderId,
    oidcProviderName,
    setOidcProviderName,
    oidcProviderIssuerUrl,
    setOidcProviderIssuerUrl,
    oidcProviderClientId,
    setOidcProviderClientId,
    oidcProviderClientSecret,
    setOidcProviderClientSecret,
    oidcProviderDiscoveryEnabled,
    setOidcProviderDiscoveryEnabled,
    oidcProviderScopes,
    setOidcProviderScopes,
    oidcClaimGroupsName,
    setOidcClaimGroupsName,
    oidcClaimGroupsFormat,
    setOidcClaimGroupsFormat,
    oidcProviderEnabled,
    setOidcProviderEnabled,
    oidcMappings,
    setOidcMappings,
    oidcMappingClaimName,
    setOidcMappingClaimName,
    oidcMappingGroupId,
    setOidcMappingGroupId,
    oidcMappingDisplayName,
    setOidcMappingDisplayName,
    oidcMappingTargetType,
    setOidcMappingTargetType,
    oidcMappingTargetKey,
    setOidcMappingTargetKey,
    oidcMappingRole,
    setOidcMappingRole,
    oidcMappingPriority,
    setOidcMappingPriority,
    oidcMappingEnabled,
    setOidcMappingEnabled,
    oidcSettingsReason,
    setOidcSettingsReason,
    mappings,
    setMappings,
    newMappingKind,
    setNewMappingKind,
    newMappingExternalId,
    setNewMappingExternalId,
    newMappingProjectKey,
    setNewMappingProjectKey,
    newMappingPriority,
    setNewMappingPriority,
    newMappingEnabled,
    setNewMappingEnabled,
    mappingReason,
    setMappingReason,
    draggingKind,
    setDraggingKind,
    resetWorkspaceScopedState,
  };
}

export type AdminWorkspaceProjectState = ReturnType<typeof useAdminWorkspaceProjectState>;

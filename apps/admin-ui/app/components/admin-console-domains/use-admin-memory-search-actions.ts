'use client';

import type { FormEvent } from 'react';
import type {
  AccessTimelineItem,
  ActiveWorkEventItem,
  ActiveWorkItem,
  AuditLogItem,
  ContextBundleResponse,
  DecisionKeywordPolicy,
  ImportItem,
  MemoryItem,
  PersonaRecommendationResponse,
  RawEventItem,
  RawMessageDetail,
  RawSearchMatch,
  StagedMemoryItem,
} from '../../lib/types';
import { toISOString } from '../../lib/utils';
import type { AdminMemorySearchState } from './use-admin-memory-search-state';
import type { AdminCallApi, AdminCallApiRaw } from './types';
import { parseLineSeparatedValues } from './types';

type MemorySearchDeps = {
  callApi: AdminCallApi;
  callApiRaw: AdminCallApiRaw;
  selectedWorkspace: string;
  selectedProject: string;
  state: AdminMemorySearchState;
  setError: (message: string | null) => void;
};

export function useAdminMemorySearchActions(deps: MemorySearchDeps) {
  const { callApi, callApiRaw, selectedWorkspace, selectedProject, state, setError } = deps;

  async function loadDecisionKeywordPolicies(workspaceKey: string) {
    const query = new URLSearchParams({ workspace_key: workspaceKey });
    const data = await callApi<{ workspace_key: string; policies: DecisionKeywordPolicy[] }>(
      `/v1/decision-keyword-policies?${query.toString()}`
    );
    state.setKeywordPolicies(data.policies);
  }

  async function createDecisionKeywordPolicy(event: FormEvent) {
    event.preventDefault();
    if (!selectedWorkspace || !state.keywordPolicyName.trim()) {
      return;
    }
    await callApi('/v1/decision-keyword-policies', {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
        name: state.keywordPolicyName.trim(),
        positive_keywords: parseLineSeparatedValues(state.keywordPositiveText),
        negative_keywords: parseLineSeparatedValues(state.keywordNegativeText),
        file_path_positive_patterns: parseLineSeparatedValues(state.keywordPathPositiveText),
        file_path_negative_patterns: parseLineSeparatedValues(state.keywordPathNegativeText),
        weight_positive: Math.max(state.keywordWeightPositive || 0, 0),
        weight_negative: Math.max(state.keywordWeightNegative || 0, 0),
        enabled: state.keywordPolicyEnabled,
        reason: state.keywordPolicyReason.trim() || undefined,
      }),
    });
    await loadDecisionKeywordPolicies(selectedWorkspace);
  }

  async function patchDecisionKeywordPolicy(
    policyId: string,
    patch: Partial<{
      name: string;
      positive_keywords: string[];
      negative_keywords: string[];
      file_path_positive_patterns: string[];
      file_path_negative_patterns: string[];
      weight_positive: number;
      weight_negative: number;
      enabled: boolean;
    }>
  ) {
    if (!selectedWorkspace) {
      return;
    }
    await callApi(`/v1/decision-keyword-policies/${encodeURIComponent(policyId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
        ...patch,
        reason: state.keywordPolicyReason.trim() || undefined,
      }),
    });
    await loadDecisionKeywordPolicies(selectedWorkspace);
  }

  async function deleteDecisionKeywordPolicy(policyId: string) {
    if (!selectedWorkspace) {
      return;
    }
    const query = new URLSearchParams({
      workspace_key: selectedWorkspace,
    });
    const reason = state.keywordPolicyReason.trim();
    if (reason) {
      query.set('reason', reason);
    }
    await callApi(`/v1/decision-keyword-policies/${encodeURIComponent(policyId)}?${query.toString()}`, {
      method: 'DELETE',
    });
    await loadDecisionKeywordPolicies(selectedWorkspace);
  }

  async function loadDecisions(workspaceKey: string, event?: FormEvent) {
    event?.preventDefault();
    const query = new URLSearchParams({
      workspace_key: workspaceKey,
      limit: String(Math.min(Math.max(state.decisionLimit, 1), 500)),
      mode: 'hybrid',
    });
    if (state.decisionProjectFilter.trim()) {
      query.set('project_key', state.decisionProjectFilter.trim());
    }
    if (state.decisionStatusFilter) {
      query.set('status', state.decisionStatusFilter);
    }
    if (state.decisionConfidenceMinFilter.trim()) {
      query.set('confidence_min', state.decisionConfidenceMinFilter.trim());
    }
    if (state.decisionConfidenceMaxFilter.trim()) {
      query.set('confidence_max', state.decisionConfidenceMaxFilter.trim());
    }
    const data = await callApi<{ decisions: MemoryItem[] }>(`/v1/decisions?${query.toString()}`);
    state.setDecisions(data.decisions);
  }

  async function setDecisionStatus(decisionId: string, status: 'confirmed' | 'rejected') {
    if (!selectedWorkspace) {
      return;
    }
    await callApi(`/v1/decisions/${encodeURIComponent(decisionId)}/${status === 'confirmed' ? 'confirm' : 'reject'}`, {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
      }),
    });
    await loadDecisions(selectedWorkspace);
  }

  async function loadImports(workspaceKey: string) {
    const query = new URLSearchParams({
      workspace_key: workspaceKey,
      limit: '40',
    });
    const data = await callApi<{ imports: ImportItem[] }>(`/v1/imports?${query.toString()}`);
    state.setImports(data.imports);
    if (!data.imports.some((item) => item.id === state.selectedImportId)) {
      state.setSelectedImportId(data.imports[0]?.id || '');
    }
  }

  async function uploadImport(event: FormEvent) {
    event.preventDefault();
    if (!selectedWorkspace || !state.importFile) {
      return;
    }
    const form = new FormData();
    form.set('workspace_key', selectedWorkspace);
    form.set('source', state.importSource);
    if (state.importUseSelectedProject && selectedProject) {
      form.set('project_key', selectedProject);
    }
    form.set('file', state.importFile);

    await callApi<{ import_id: string }>('/v1/imports', {
      method: 'POST',
      body: form,
    });
    state.setImportFile(null);
    await loadImports(selectedWorkspace);
  }

  async function parseImport(importId: string) {
    await callApi(`/v1/imports/${encodeURIComponent(importId)}/parse`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (selectedWorkspace) {
      await loadImports(selectedWorkspace);
    }
  }

  async function extractImport(importId: string) {
    await callApi(`/v1/imports/${encodeURIComponent(importId)}/extract`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await loadStagedMemories(importId);
    if (selectedWorkspace) {
      await loadImports(selectedWorkspace);
    }
  }

  async function loadStagedMemories(importId: string) {
    const data = await callApi<{ staged_memories: StagedMemoryItem[] }>(
      `/v1/imports/${encodeURIComponent(importId)}/staged`
    );
    state.setStagedMemories(data.staged_memories);
    state.setSelectedStagedIds(data.staged_memories.map((item) => item.id));
  }

  async function commitImport(importId: string) {
    await callApi(`/v1/imports/${encodeURIComponent(importId)}/commit`, {
      method: 'POST',
      body: JSON.stringify({
        staged_ids: state.selectedStagedIds,
        project_key: selectedProject || undefined,
      }),
    });
    if (selectedWorkspace) {
      await Promise.all([loadImports(selectedWorkspace), runMemorySearch()]);
    }
  }

  function toggleStagedMemory(id: string, checked: boolean) {
    state.setSelectedStagedIds((current) => {
      if (checked) {
        if (current.includes(id)) {
          return current;
        }
        return [...current, id];
      }
      return current.filter((item) => item !== id);
    });
  }

  async function runRawSearch(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedWorkspace || !state.rawQuery.trim()) {
      return;
    }
    const query = new URLSearchParams({
      workspace_key: selectedWorkspace,
      q: state.rawQuery.trim(),
      limit: String(Math.min(Math.max(state.rawLimit, 1), 20)),
      max_chars: '500',
    });
    if (state.rawUseSelectedProject && selectedProject) {
      query.set('project_key', selectedProject);
    }
    const data = await callApi<{ matches: RawSearchMatch[] }>(`/v1/raw/search?${query.toString()}`);
    state.setRawMatches(data.matches);
    if (!data.matches.some((item) => item.message_id === state.selectedRawMessageId)) {
      state.setSelectedRawMessageId('');
      state.setRawMessageDetail(null);
    }
  }

  async function viewRawMessage(messageId: string) {
    const query = new URLSearchParams({ max_chars: '700' });
    const result = await callApi<RawMessageDetail>(
      `/v1/raw/messages/${encodeURIComponent(messageId)}?${query.toString()}`
    );
    state.setSelectedRawMessageId(messageId);
    state.setRawMessageDetail(result);
  }

  async function loadRawEvents(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedWorkspace) {
      return;
    }
    const query = new URLSearchParams({
      workspace_key: selectedWorkspace,
      limit: String(Math.min(Math.max(state.rawEventLimit, 1), 500)),
    });
    if (state.rawEventProjectFilter.trim()) {
      query.set('project_key', state.rawEventProjectFilter.trim());
    }
    if (state.rawEventTypeFilter) {
      query.set('event_type', state.rawEventTypeFilter);
    }
    if (state.rawEventCommitShaFilter.trim()) {
      query.set('commit_sha', state.rawEventCommitShaFilter.trim());
    }
    const fromIso = state.rawEventFrom ? toISOString(state.rawEventFrom) : null;
    const toIso = state.rawEventTo ? toISOString(state.rawEventTo) : null;
    if (fromIso) {
      query.set('from', fromIso);
    }
    if (toIso) {
      query.set('to', toIso);
    }
    const data = await callApi<{ events: RawEventItem[] }>(`/v1/raw-events?${query.toString()}`);
    state.setRawEvents(data.events);
  }

  async function submitCiEvent(event: FormEvent) {
    event.preventDefault();
    if (!selectedWorkspace) {
      return;
    }

    let metadata: Record<string, unknown> | undefined;
    if (state.ciMetadata.trim()) {
      try {
        metadata = JSON.parse(state.ciMetadata) as Record<string, unknown>;
      } catch (parseError) {
        setError(
          parseError instanceof Error
            ? `ci metadata JSON parse error: ${parseError.message}`
            : 'ci metadata JSON parse error'
        );
        return;
      }
    }

    await callApi('/v1/ci-events', {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
        status: state.ciStatus,
        provider: state.ciProvider,
        project_key: state.ciUseSelectedProject && selectedProject ? selectedProject : undefined,
        workflow_name: state.ciWorkflowName.trim() || undefined,
        workflow_run_id: state.ciWorkflowRunId.trim() || undefined,
        workflow_run_url: state.ciWorkflowRunUrl.trim() || undefined,
        repository: state.ciRepository.trim() || undefined,
        branch: state.ciBranch.trim() || undefined,
        sha: state.ciSha.trim() || undefined,
        event_name: state.ciEventName.trim() || undefined,
        job_name: state.ciJobName.trim() || undefined,
        message: state.ciMessage.trim() || undefined,
        metadata,
      }),
    });

    state.setAuditActionPrefix('ci.');
    await loadAuditLogs(selectedWorkspace);
  }

  async function loadAuditLogs(workspaceKey: string) {
    const query = new URLSearchParams({
      workspace_key: workspaceKey,
      limit: String(Math.min(Math.max(state.auditLimit, 1), 200)),
    });
    if (state.auditProjectKey.trim()) {
      query.set('project_key', state.auditProjectKey.trim());
    }
    if (state.auditActionKey.trim()) {
      query.set('action_key', state.auditActionKey.trim());
    }
    if (state.auditActionPrefix.trim()) {
      query.set('action_prefix', state.auditActionPrefix.trim());
    }
    if (state.auditActorUserId.trim()) {
      query.set('actor_user_id', state.auditActorUserId.trim());
    }
    const data = await callApi<{ logs: AuditLogItem[] }>(`/v1/audit-logs?${query.toString()}`);
    state.setAuditLogs(data.logs);
  }

  async function loadAccessTimeline(workspaceKey: string, event?: FormEvent) {
    event?.preventDefault();
    if (!workspaceKey) {
      return;
    }
    state.setAccessTimelineLoading(true);
    try {
      const data = await fetchAccessTimelinePage(workspaceKey, null);
      state.setAccessTimelineItems(data.items);
      state.setAccessTimelineCursor(data.next_cursor);
      state.setAccessTimelineHasMore(Boolean(data.next_cursor));
    } finally {
      state.setAccessTimelineLoading(false);
    }
  }

  async function exportAccessTimeline(workspaceKey: string) {
    if (!workspaceKey) {
      return;
    }
    const query = new URLSearchParams({
      workspace_key: workspaceKey,
      format: state.accessTimelineExportFormat,
    });
    if (state.accessTimelineProjectKey.trim()) {
      query.set('project_key', state.accessTimelineProjectKey.trim());
    }
    if (state.accessTimelineSource) {
      query.set('source', state.accessTimelineSource);
    }
    if (state.accessTimelineAction) {
      query.set('action', state.accessTimelineAction);
    }
    const fromIso = state.accessTimelineFrom ? toISOString(state.accessTimelineFrom) : null;
    const toIso = state.accessTimelineTo ? toISOString(state.accessTimelineTo) : null;
    if (fromIso) {
      query.set('from', fromIso);
    }
    if (toIso) {
      query.set('to', toIso);
    }

    const response = await callApiRaw(`/v1/audit/export?${query.toString()}`, {
      method: 'GET',
    });
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const filenameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
    const filename =
      filenameMatch?.[1] ||
      `audit-export.${state.accessTimelineExportFormat === 'json' ? 'json' : 'csv'}`;
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  async function loadMoreAccessTimeline(workspaceKey: string) {
    if (!workspaceKey || !state.accessTimelineCursor || state.accessTimelineLoading) {
      return;
    }
    state.setAccessTimelineLoading(true);
    try {
      const data = await fetchAccessTimelinePage(workspaceKey, state.accessTimelineCursor);
      state.setAccessTimelineItems((current) => [...current, ...data.items]);
      state.setAccessTimelineCursor(data.next_cursor);
      state.setAccessTimelineHasMore(Boolean(data.next_cursor));
    } finally {
      state.setAccessTimelineLoading(false);
    }
  }

  async function fetchAccessTimelinePage(workspaceKey: string, cursor: string | null): Promise<{
    items: AccessTimelineItem[];
    next_cursor: string | null;
  }> {
    const query = new URLSearchParams({
      workspace_key: workspaceKey,
      limit: String(Math.min(Math.max(state.accessTimelineLimit, 1), 200)),
    });
    if (state.accessTimelineProjectKey.trim()) {
      query.set('project_key', state.accessTimelineProjectKey.trim());
    }
    if (state.accessTimelineUserId.trim()) {
      query.set('user_id', state.accessTimelineUserId.trim());
    }
    if (state.accessTimelineSource) {
      query.set('source', state.accessTimelineSource);
    }
    if (state.accessTimelineAction) {
      query.set('action', state.accessTimelineAction);
    }
    const fromIso = state.accessTimelineFrom ? toISOString(state.accessTimelineFrom) : null;
    const toIso = state.accessTimelineTo ? toISOString(state.accessTimelineTo) : null;
    if (fromIso) {
      query.set('from', fromIso);
    }
    if (toIso) {
      query.set('to', toIso);
    }
    if (cursor) {
      query.set('cursor', cursor);
    }
    return callApi<{ items: AccessTimelineItem[]; next_cursor: string | null }>(
      `/v1/audit/access-timeline?${query.toString()}`
    );
  }

  async function runMemorySearch(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedWorkspace) {
      return;
    }

    const query = new URLSearchParams({
      workspace_key: selectedWorkspace,
      limit: String(state.queryLimit),
      mode: state.queryMode,
    });
    if (state.scopeSelectedProject && selectedProject) {
      query.set('project_key', selectedProject);
    }
    if (state.queryType) {
      query.set('type', state.queryType);
    }
    if (state.queryText.trim()) {
      query.set('q', state.queryText.trim());
    }
    if (state.queryStatus) {
      query.set('status', state.queryStatus);
    }
    if (state.querySource) {
      query.set('source', state.querySource);
    }
    if (state.queryConfidenceMin.trim()) {
      query.set('confidence_min', state.queryConfidenceMin.trim());
    }
    if (state.queryConfidenceMax.trim()) {
      query.set('confidence_max', state.queryConfidenceMax.trim());
    }
    if (state.querySince) {
      const iso = toISOString(state.querySince);
      if (iso) {
        query.set('since', iso);
      }
    }

    const data = await callApi<{ memories: MemoryItem[] }>(`/v1/memories?${query.toString()}`);
    state.setMemories(data.memories);
    if (!data.memories.some((memory) => memory.id === state.selectedMemoryId)) {
      state.setSelectedMemoryId(data.memories[0]?.id || '');
    }
  }

  async function loadContextBundle(mode: 'default' | 'debug', event?: FormEvent) {
    event?.preventDefault();
    if (!selectedWorkspace || !selectedProject) {
      return;
    }
    const query = new URLSearchParams({
      workspace_key: selectedWorkspace,
      project_key: selectedProject,
      mode,
      budget: String(Math.min(Math.max(state.contextBundleBudget || 300, 300), 8000)),
    });
    if (state.contextBundleQuery.trim()) {
      query.set('q', state.contextBundleQuery.trim());
    }
    if (state.contextBundleCurrentSubpath.trim()) {
      query.set('current_subpath', state.contextBundleCurrentSubpath.trim());
    }
    const bundle = await callApi<ContextBundleResponse>(`/v1/context/bundle?${query.toString()}`);
    if (mode === 'debug') {
      state.setContextBundleDebug(bundle);
      if (bundle.debug?.persona_recommended) {
        state.setPersonaRecommendation(bundle.debug.persona_recommended);
      }
      return;
    }
    state.setContextBundleDefault(bundle);
  }

  async function loadPersonaRecommendation(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedWorkspace || !selectedProject) {
      return;
    }
    const query = new URLSearchParams({
      workspace_key: selectedWorkspace,
      project_key: selectedProject,
    });
    if (state.contextBundleQuery.trim()) {
      query.set('q', state.contextBundleQuery.trim());
    }
    const recommendation = await callApi<PersonaRecommendationResponse>(
      `/v1/context/persona-recommendation?${query.toString()}`
    );
    state.setPersonaRecommendation(recommendation);
  }

  async function loadProjectActiveWork(projectKey?: string) {
    if (!selectedWorkspace) {
      return;
    }
    const effectiveProjectKey = (projectKey || selectedProject || '').trim();
    if (!effectiveProjectKey) {
      state.setActiveWorkItems([]);
      state.setActiveWorkEvents([]);
      state.setSelectedActiveWorkId('');
      return;
    }
    const query = new URLSearchParams({
      workspace_key: selectedWorkspace,
      include_closed: String(state.activeWorkIncludeClosed),
      limit: '120',
    });
    const data = await callApi<{
      workspace_key: string;
      project_key: string;
      active_work: ActiveWorkItem[];
    }>(`/v1/projects/${encodeURIComponent(effectiveProjectKey)}/active-work?${query.toString()}`);
    state.setActiveWorkItems(data.active_work);
    if (!data.active_work.some((item) => item.id === state.selectedActiveWorkId)) {
      state.setSelectedActiveWorkId(data.active_work[0]?.id || '');
    }
  }

  async function loadProjectActiveWorkEvents(projectKey?: string) {
    if (!selectedWorkspace) {
      return;
    }
    const effectiveProjectKey = (projectKey || selectedProject || '').trim();
    if (!effectiveProjectKey) {
      state.setActiveWorkEvents([]);
      return;
    }
    const query = new URLSearchParams({
      workspace_key: selectedWorkspace,
      limit: '200',
    });
    if (state.selectedActiveWorkId) {
      query.set('active_work_id', state.selectedActiveWorkId);
    }
    const data = await callApi<{
      workspace_key: string;
      project_key: string;
      events: ActiveWorkEventItem[];
    }>(`/v1/projects/${encodeURIComponent(effectiveProjectKey)}/active-work/events?${query.toString()}`);
    state.setActiveWorkEvents(data.events);
  }

  async function updateProjectActiveWorkStatus(
    action: 'confirm' | 'close' | 'reopen',
    activeWorkId: string
  ) {
    if (!selectedWorkspace || !selectedProject || !activeWorkId) {
      return;
    }
    await callApi(`/v1/active-work/${encodeURIComponent(activeWorkId)}/${action}`, {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
        project_key: selectedProject,
      }),
    });
    await Promise.all([loadProjectActiveWork(selectedProject), loadProjectActiveWorkEvents(selectedProject)]);
  }

  async function updateSelectedMemoryStatus(status: 'draft' | 'confirmed' | 'rejected') {
    if (!state.selectedMemoryId) {
      return;
    }
    await callApi(`/v1/memories/${encodeURIComponent(state.selectedMemoryId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
      }),
    });
    await runMemorySearch();
  }

  async function saveSelectedMemoryContent() {
    if (!state.selectedMemoryId) {
      return;
    }
    await callApi(`/v1/memories/${encodeURIComponent(state.selectedMemoryId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        content: state.selectedMemoryDraftContent.trim(),
      }),
    });
    await runMemorySearch();
  }

  async function createMemory(event: FormEvent) {
    event.preventDefault();
    if (!selectedWorkspace || !selectedProject) {
      return;
    }
    let metadata: Record<string, unknown> | undefined;
    if (state.newMemoryMetadata.trim()) {
      try {
        metadata = JSON.parse(state.newMemoryMetadata) as Record<string, unknown>;
      } catch (metadataError) {
        setError(
          metadataError instanceof Error
            ? `metadata JSON parse error: ${metadataError.message}`
            : 'metadata JSON parse error'
        );
        return;
      }
    }
    await callApi('/v1/memories', {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: selectedWorkspace,
        project_key: selectedProject,
        type: state.newMemoryType,
        content: state.newMemoryContent.trim(),
        metadata,
      }),
    });
    state.setNewMemoryContent('');
    await runMemorySearch();
  }

  return {
    loadDecisionKeywordPolicies,
    createDecisionKeywordPolicy,
    patchDecisionKeywordPolicy,
    deleteDecisionKeywordPolicy,
    loadDecisions,
    setDecisionStatus,
    loadImports,
    uploadImport,
    parseImport,
    extractImport,
    loadStagedMemories,
    commitImport,
    toggleStagedMemory,
    runRawSearch,
    viewRawMessage,
    loadRawEvents,
    submitCiEvent,
    loadAuditLogs,
    loadAccessTimeline,
    loadMoreAccessTimeline,
    exportAccessTimeline,
    runMemorySearch,
    loadContextBundle,
    loadPersonaRecommendation,
    loadProjectActiveWork,
    loadProjectActiveWorkEvents,
    updateProjectActiveWorkStatus,
    updateSelectedMemoryStatus,
    saveSelectedMemoryContent,
    createMemory,
  };
}

export type AdminMemorySearchActions = ReturnType<typeof useAdminMemorySearchActions>;

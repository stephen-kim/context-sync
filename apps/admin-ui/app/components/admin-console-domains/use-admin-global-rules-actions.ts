'use client';

import type { FormEvent } from 'react';
import type { GlobalRule } from '../../lib/types';
import type { AdminCallApi } from './types';
import type { AdminGlobalRulesState } from './use-admin-global-rules-state';

type Deps = {
  callApi: AdminCallApi;
  selectedWorkspace: string;
  state: AdminGlobalRulesState;
};

export function useAdminGlobalRulesActions(deps: Deps) {
  const { callApi, state } = deps;

  function parseTags(input: string): string[] {
    return Array.from(
      new Set(
        input
          .split(/[,\n]/g)
          .map((item) => item.trim().toLowerCase())
          .filter((item) => item.length > 0)
      )
    ).slice(0, 100);
  }

  async function loadGlobalRules(scope = state.scope, userId = state.targetUserId) {
    if (!deps.selectedWorkspace) {
      state.setRules([]);
      return;
    }
    const query = new URLSearchParams({
      workspace_key: deps.selectedWorkspace,
      scope,
    });
    if (scope === 'user' && userId.trim()) {
      query.set('user_id', userId.trim());
    }
    const response = await callApi<{ rules: GlobalRule[] }>(`/v1/global-rules?${query.toString()}`);
    state.setRules(response.rules || []);
  }

  async function createGlobalRule(event?: FormEvent) {
    event?.preventDefault();
    if (!deps.selectedWorkspace) {
      return;
    }
    if (!state.title.trim() || !state.content.trim()) {
      return;
    }
    await callApi('/v1/global-rules', {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: deps.selectedWorkspace,
        scope: state.scope,
        user_id: state.scope === 'user' ? state.targetUserId.trim() || undefined : undefined,
        title: state.title.trim(),
        content: state.content.trim(),
        category: state.category,
        priority: Math.min(Math.max(state.priority || 3, 1), 5),
        severity: state.severity,
        pinned: state.pinned,
        enabled: state.enabled,
        tags: parseTags(state.tags),
        reason: state.reason.trim() || undefined,
      }),
    });
    state.setTitle('');
    state.setContent('');
    state.setTags('');
    state.setPinned(false);
    state.setEnabled(true);
    await loadGlobalRules();
  }

  async function patchGlobalRule(
    id: string,
    patch: Partial<{
      title: string;
      content: string;
      category: 'policy' | 'security' | 'style' | 'process' | 'other';
      priority: number;
      severity: 'low' | 'medium' | 'high';
      pinned: boolean;
      enabled: boolean;
      tags: string[];
    }>
  ) {
    if (!deps.selectedWorkspace) {
      return;
    }
    await callApi(`/v1/global-rules/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        workspace_key: deps.selectedWorkspace,
        ...patch,
        reason: state.reason.trim() || undefined,
      }),
    });
    await loadGlobalRules();
  }

  async function deleteGlobalRule(id: string) {
    if (!deps.selectedWorkspace) {
      return;
    }
    const query = new URLSearchParams({ workspace_key: deps.selectedWorkspace });
    if (state.reason.trim()) {
      query.set('reason', state.reason.trim());
    }
    await callApi(`/v1/global-rules/${encodeURIComponent(id)}?${query.toString()}`, {
      method: 'DELETE',
    });
    await loadGlobalRules();
  }

  async function summarizeGlobalRules(mode: 'preview' | 'replace') {
    if (!deps.selectedWorkspace) {
      return;
    }
    const result = await callApi<{
      summary: string;
    }>('/v1/global-rules/summarize', {
      method: 'POST',
      body: JSON.stringify({
        workspace_key: deps.selectedWorkspace,
        scope: state.scope,
        user_id: state.scope === 'user' ? state.targetUserId.trim() || undefined : undefined,
        mode,
        reason: state.reason.trim() || undefined,
      }),
    });
    state.setSummaryPreview(result.summary || '');
    if (mode === 'replace') {
      await loadGlobalRules();
    }
  }

  return {
    loadGlobalRules,
    createGlobalRule,
    patchGlobalRule,
    deleteGlobalRule,
    summarizeGlobalRules,
  };
}

export type AdminGlobalRulesActions = ReturnType<typeof useAdminGlobalRulesActions>;

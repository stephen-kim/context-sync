'use client';

import { useState } from 'react';
import type { GlobalRule } from '../../lib/types';

export function useAdminGlobalRulesState() {
  const [scope, setScope] = useState<'workspace' | 'user'>('workspace');
  const [targetUserId, setTargetUserId] = useState('');
  const [rules, setRules] = useState<GlobalRule[]>([]);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [category, setCategory] = useState<'policy' | 'security' | 'style' | 'process' | 'other'>('policy');
  const [priority, setPriority] = useState(3);
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [pinned, setPinned] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [reason, setReason] = useState('');

  const [summaryPreview, setSummaryPreview] = useState('');

  function resetWorkspaceScopedState() {
    setScope('workspace');
    setTargetUserId('');
    setRules([]);
    setTitle('');
    setContent('');
    setTags('');
    setCategory('policy');
    setPriority(3);
    setSeverity('medium');
    setPinned(false);
    setEnabled(true);
    setReason('');
    setSummaryPreview('');
  }

  return {
    scope,
    setScope,
    targetUserId,
    setTargetUserId,
    rules,
    setRules,
    title,
    setTitle,
    content,
    setContent,
    tags,
    setTags,
    category,
    setCategory,
    priority,
    setPriority,
    severity,
    setSeverity,
    pinned,
    setPinned,
    enabled,
    setEnabled,
    reason,
    setReason,
    summaryPreview,
    setSummaryPreview,
    resetWorkspaceScopedState,
  };
}

export type AdminGlobalRulesState = ReturnType<typeof useAdminGlobalRulesState>;

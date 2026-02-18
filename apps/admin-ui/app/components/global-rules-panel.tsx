'use client';

import type { FormEvent } from 'react';
import type { GlobalRule, WorkspaceMember } from '../lib/types';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Input, Label, Textarea } from './ui';

type Props = {
  selectedWorkspace: string;
  members: WorkspaceMember[];
  scope: 'workspace' | 'user';
  setScope: (value: 'workspace' | 'user') => void;
  targetUserId: string;
  setTargetUserId: (value: string) => void;
  rules: GlobalRule[];
  title: string;
  setTitle: (value: string) => void;
  content: string;
  setContent: (value: string) => void;
  tags: string;
  setTags: (value: string) => void;
  category: 'policy' | 'security' | 'style' | 'process' | 'other';
  setCategory: (value: 'policy' | 'security' | 'style' | 'process' | 'other') => void;
  priority: number;
  setPriority: (value: number) => void;
  severity: 'low' | 'medium' | 'high';
  setSeverity: (value: 'low' | 'medium' | 'high') => void;
  pinned: boolean;
  setPinned: (value: boolean) => void;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  reason: string;
  setReason: (value: string) => void;
  summaryPreview: string;
  recommendMax: number;
  warnThreshold: number;
  summaryEnabled: boolean;
  summaryMinCount: number;
  selectionMode: 'score' | 'recent' | 'priority_only';
  routingEnabled: boolean;
  routingMode: 'semantic' | 'keyword' | 'hybrid';
  routingTopK: number;
  routingMinScore: number;
  bundleTokenBudgetTotal: number;
  bundleBudgetGlobalWorkspacePct: number;
  bundleBudgetGlobalUserPct: number;
  bundleBudgetProjectPct: number;
  bundleBudgetRetrievalPct: number;
  setBundleTokenBudgetTotal: (value: number) => void;
  setBundleBudgetGlobalWorkspacePct: (value: number) => void;
  setBundleBudgetGlobalUserPct: (value: number) => void;
  setBundleBudgetProjectPct: (value: number) => void;
  setBundleBudgetRetrievalPct: (value: number) => void;
  setSummaryEnabled: (value: boolean) => void;
  setSummaryMinCount: (value: number) => void;
  setSelectionMode: (value: 'score' | 'recent' | 'priority_only') => void;
  setRoutingEnabled: (value: boolean) => void;
  setRoutingMode: (value: 'semantic' | 'keyword' | 'hybrid') => void;
  setRoutingTopK: (value: number) => void;
  setRoutingMinScore: (value: number) => void;
  createGlobalRule: (event?: FormEvent) => Promise<void>;
  loadGlobalRules: (scope?: 'workspace' | 'user', userId?: string) => Promise<void>;
  patchGlobalRule: (
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
  ) => Promise<void>;
  deleteGlobalRule: (id: string) => Promise<void>;
  summarizeGlobalRules: (mode: 'preview' | 'replace') => Promise<void>;
  saveWorkspaceSettings: () => Promise<void>;
};

export function GlobalRulesPanel(props: Props) {
  const count = props.rules.length;
  const showInfo = count > props.recommendMax;
  const showWarn = count >= props.warnThreshold;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Global Rules</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="row items-end">
          <div className="stack gap-1">
            <Label className="muted">Scope</Label>
            <select
              value={props.scope}
              onChange={(event) => {
                const next = event.target.value === 'user' ? 'user' : 'workspace';
                props.setScope(next);
                void props.loadGlobalRules(next, props.targetUserId);
              }}
            >
              <option value="workspace">Workspace Global</option>
              <option value="user">User Global</option>
            </select>
          </div>
          {props.scope === 'user' ? (
            <div className="stack gap-1">
              <Label className="muted">Target User</Label>
              <select
                value={props.targetUserId}
                onChange={(event) => {
                  props.setTargetUserId(event.target.value);
                  void props.loadGlobalRules('user', event.target.value);
                }}
              >
                <option value="">Current user</option>
                {props.members.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.email}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="stack gap-1">
            <Label className="muted">Selection mode</Label>
            <select
              value={props.selectionMode}
              onChange={(event) =>
                props.setSelectionMode(
                  event.target.value === 'recent'
                    ? 'recent'
                    : event.target.value === 'priority_only'
                      ? 'priority_only'
                      : 'score'
                )
              }
            >
              <option value="score">Score</option>
              <option value="recent">Recent</option>
              <option value="priority_only">Priority only</option>
            </select>
          </div>
          <div className="stack gap-1">
            <Label className="muted">Routing mode</Label>
            <select
              value={props.routingMode}
              onChange={(event) =>
                props.setRoutingMode(
                  event.target.value === 'semantic'
                    ? 'semantic'
                    : event.target.value === 'keyword'
                      ? 'keyword'
                      : 'hybrid'
                )
              }
            >
              <option value="hybrid">Hybrid</option>
              <option value="semantic">Semantic</option>
              <option value="keyword">Keyword</option>
            </select>
          </div>
          <div className="stack gap-1">
            <Label className="muted">Routing top_k</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={props.routingTopK}
              onChange={(event) => props.setRoutingTopK(Math.min(Math.max(Number(event.target.value) || 1, 1), 100))}
            />
          </div>
          <div className="stack gap-1">
            <Label className="muted">Routing min score</Label>
            <Input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={props.routingMinScore}
              onChange={(event) =>
                props.setRoutingMinScore(Math.min(Math.max(Number(event.target.value) || 0, 0), 1))
              }
            />
          </div>
          <div className="stack gap-1">
            <Label className="muted">Summary min count</Label>
            <Input
              type="number"
              min={1}
              max={1000}
              value={props.summaryMinCount}
              onChange={(event) => props.setSummaryMinCount(Math.max(Number(event.target.value) || 1, 1))}
            />
          </div>
          <div className="stack gap-1">
            <Label className="muted">Total token budget</Label>
            <Input
              type="number"
              min={300}
              max={50000}
              value={props.bundleTokenBudgetTotal}
              onChange={(event) =>
                props.setBundleTokenBudgetTotal(
                  Math.min(Math.max(Number(event.target.value) || 300, 300), 50000)
                )
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="global-rules-summary-enabled"
              checked={props.summaryEnabled}
              onCheckedChange={(value) => props.setSummaryEnabled(value === true)}
            />
            <Label htmlFor="global-rules-summary-enabled" className="text-sm text-muted-foreground">
              summary enabled
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="global-rules-routing-enabled"
              checked={props.routingEnabled}
              onCheckedChange={(value) => props.setRoutingEnabled(value === true)}
            />
            <Label htmlFor="global-rules-routing-enabled" className="text-sm text-muted-foreground">
              semantic routing enabled
            </Label>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void props.saveWorkspaceSettings();
            }}
          >
            Save budget settings
          </Button>
        </div>

        <div className="row">
          <div className="stack gap-1">
            <Label className="muted">Workspace %</Label>
            <Input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={props.bundleBudgetGlobalWorkspacePct}
              onChange={(event) =>
                props.setBundleBudgetGlobalWorkspacePct(
                  Math.min(Math.max(Number(event.target.value) || 0, 0), 1)
                )
              }
            />
          </div>
          <div className="stack gap-1">
            <Label className="muted">User %</Label>
            <Input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={props.bundleBudgetGlobalUserPct}
              onChange={(event) =>
                props.setBundleBudgetGlobalUserPct(
                  Math.min(Math.max(Number(event.target.value) || 0, 0), 1)
                )
              }
            />
          </div>
          <div className="stack gap-1">
            <Label className="muted">Project %</Label>
            <Input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={props.bundleBudgetProjectPct}
              onChange={(event) =>
                props.setBundleBudgetProjectPct(
                  Math.min(Math.max(Number(event.target.value) || 0, 0), 1)
                )
              }
            />
          </div>
          <div className="stack gap-1">
            <Label className="muted">Retrieval %</Label>
            <Input
              type="number"
              step={0.01}
              min={0}
              max={1}
              value={props.bundleBudgetRetrievalPct}
              onChange={(event) =>
                props.setBundleBudgetRetrievalPct(
                  Math.min(Math.max(Number(event.target.value) || 0, 0), 1)
                )
              }
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{count} active rules</Badge>
          <Badge variant="outline">Recommended: keep ≤ {props.recommendMax} core rules</Badge>
          {showInfo ? <Badge variant="secondary">Info: rule count is above recommended</Badge> : null}
          {showWarn ? (
            <Badge variant="default">
              Warning: {props.warnThreshold}+ rules may reduce context clarity
            </Badge>
          ) : null}
        </div>

        <form className="stack gap-2" onSubmit={(event) => void props.createGlobalRule(event)}>
          <div className="row">
            <div className="stack gap-1">
              <Label className="muted">Title</Label>
              <Input value={props.title} onChange={(event) => props.setTitle(event.target.value)} />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Category</Label>
              <select
                value={props.category}
                onChange={(event) =>
                  props.setCategory(
                    (event.target.value as 'policy' | 'security' | 'style' | 'process' | 'other') || 'policy'
                  )
                }
              >
                <option value="policy">policy</option>
                <option value="security">security</option>
                <option value="style">style</option>
                <option value="process">process</option>
                <option value="other">other</option>
              </select>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Priority (1-5)</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={props.priority}
                onChange={(event) => props.setPriority(Math.min(Math.max(Number(event.target.value) || 3, 1), 5))}
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Severity</Label>
              <select
                value={props.severity}
                onChange={(event) =>
                  props.setSeverity(
                    event.target.value === 'high'
                      ? 'high'
                      : event.target.value === 'low'
                        ? 'low'
                        : 'medium'
                  )
                }
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
          </div>

          <div className="stack gap-1">
            <Label className="muted">Content</Label>
            <Textarea
              rows={4}
              value={props.content}
              onChange={(event) => props.setContent(event.target.value)}
              placeholder="Describe the global rule..."
            />
          </div>
          <div className="stack gap-1">
            <Label className="muted">Tags (comma-separated)</Label>
            <Input
              value={props.tags}
              onChange={(event) => props.setTags(event.target.value)}
              placeholder="security, commit, naming"
            />
          </div>

          <div className="row items-end">
            <div className="flex items-center gap-2">
              <Checkbox
                id="global-rule-pinned"
                checked={props.pinned}
                onCheckedChange={(value) => props.setPinned(value === true)}
              />
              <Label htmlFor="global-rule-pinned" className="text-sm text-muted-foreground">
                pinned
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="global-rule-enabled"
                checked={props.enabled}
                onCheckedChange={(value) => props.setEnabled(value === true)}
              />
              <Label htmlFor="global-rule-enabled" className="text-sm text-muted-foreground">
                enabled
              </Label>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Reason (audit)</Label>
              <Input value={props.reason} onChange={(event) => props.setReason(event.target.value)} />
            </div>
            <div className="toolbar">
              <Button type="submit" disabled={!props.selectedWorkspace}>
                Add Rule
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!props.selectedWorkspace}
                onClick={() => {
                  void props.summarizeGlobalRules('preview');
                }}
              >
                Auto summarize (preview)
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!props.selectedWorkspace}
                onClick={() => {
                  void props.summarizeGlobalRules('replace');
                }}
              >
                Auto summarize (apply)
              </Button>
            </div>
          </div>
        </form>

        {props.summaryPreview ? (
          <div className="stack gap-1">
            <Label className="muted">Summary Preview</Label>
            <pre>{props.summaryPreview}</pre>
          </div>
        ) : null}

        <div className="stack gap-2">
          {props.rules.map((rule) => (
            <div key={rule.id} className="result-item">
              <div className="row items-center">
                <strong>{rule.title}</strong>
                <span className="muted">{rule.category}</span>
                <span className="muted">p{rule.priority}</span>
                <span className="muted">{rule.severity}</span>
                {rule.pinned ? <Badge variant="outline">pinned</Badge> : null}
                {rule.enabled ? null : <Badge variant="secondary">disabled</Badge>}
                {rule.tags?.length ? <Badge variant="secondary">tags: {rule.tags.join(', ')}</Badge> : null}
              </div>
              <div className="muted">{rule.content}</div>
              <div className="toolbar">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void props.patchGlobalRule(rule.id, { pinned: !rule.pinned })}
                >
                  {rule.pinned ? 'Unpin' : 'Pin'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void props.patchGlobalRule(rule.id, { enabled: !rule.enabled })}
                >
                  {rule.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void props.patchGlobalRule(rule.id, {
                      severity:
                        rule.severity === 'high'
                          ? 'medium'
                          : rule.severity === 'medium'
                            ? 'low'
                            : 'high',
                    })
                  }
                >
                  Rotate severity
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void props.patchGlobalRule(rule.id, {
                      priority: rule.priority <= 1 ? 5 : rule.priority - 1,
                    })
                  }
                >
                  Raise priority
                </Button>
                <Button type="button" variant="destructive" onClick={() => void props.deleteGlobalRule(rule.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

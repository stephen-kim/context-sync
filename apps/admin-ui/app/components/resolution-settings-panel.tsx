'use client';

import type { FormEvent } from 'react';
import type {
  MonorepoContextMode,
  MonorepoMode,
  MonorepoSubprojectPolicy,
  Project,
  ProjectRole,
  ResolutionKind,
} from '../lib/types';
import { isSubprojectKey, kindDescription, monorepoModeDescription, reorderKinds } from '../lib/utils';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Select,
  Textarea,
} from './ui';

type Props = {
  resolutionOrder: ResolutionKind[];
  setResolutionOrder: (order: ResolutionKind[]) => void;
  autoCreateProject: boolean;
  setAutoCreateProject: (value: boolean) => void;
  autoCreateProjectSubprojects: boolean;
  setAutoCreateProjectSubprojects: (value: boolean) => void;
  autoSwitchRepo: boolean;
  setAutoSwitchRepo: (value: boolean) => void;
  autoSwitchSubproject: boolean;
  setAutoSwitchSubproject: (value: boolean) => void;
  allowManualPin: boolean;
  setAllowManualPin: (value: boolean) => void;
  enableGitEvents: boolean;
  setEnableGitEvents: (value: boolean) => void;
  enableCommitEvents: boolean;
  setEnableCommitEvents: (value: boolean) => void;
  enableMergeEvents: boolean;
  setEnableMergeEvents: (value: boolean) => void;
  enableCheckoutEvents: boolean;
  setEnableCheckoutEvents: (value: boolean) => void;
  checkoutDebounceSeconds: number;
  setCheckoutDebounceSeconds: (value: number) => void;
  checkoutDailyLimit: number;
  setCheckoutDailyLimit: (value: number) => void;
  enableActivityAutoLog: boolean;
  setEnableActivityAutoLog: (value: boolean) => void;
  enableDecisionExtraction: boolean;
  setEnableDecisionExtraction: (value: boolean) => void;
  decisionExtractionMode: 'llm_only' | 'hybrid_priority';
  setDecisionExtractionMode: (value: 'llm_only' | 'hybrid_priority') => void;
  decisionDefaultStatus: 'draft' | 'confirmed';
  setDecisionDefaultStatus: (value: 'draft' | 'confirmed') => void;
  decisionAutoConfirmEnabled: boolean;
  setDecisionAutoConfirmEnabled: (value: boolean) => void;
  decisionAutoConfirmMinConfidence: number;
  setDecisionAutoConfirmMinConfidence: (value: number) => void;
  decisionBatchSize: number;
  setDecisionBatchSize: (value: number) => void;
  decisionBackfillDays: number;
  setDecisionBackfillDays: (value: number) => void;
  activeWorkStaleDays: number;
  setActiveWorkStaleDays: (value: number) => void;
  activeWorkAutoCloseEnabled: boolean;
  setActiveWorkAutoCloseEnabled: (value: boolean) => void;
  activeWorkAutoCloseDays: number;
  setActiveWorkAutoCloseDays: (value: number) => void;
  rawAccessMinRole: ProjectRole;
  setRawAccessMinRole: (value: ProjectRole) => void;
  searchDefaultMode: 'hybrid' | 'keyword' | 'semantic';
  setSearchDefaultMode: (value: 'hybrid' | 'keyword' | 'semantic') => void;
  searchHybridAlpha: number;
  setSearchHybridAlpha: (value: number) => void;
  searchHybridBeta: number;
  setSearchHybridBeta: (value: number) => void;
  searchDefaultLimit: number;
  setSearchDefaultLimit: (value: number) => void;
  searchTypeWeightsJson: string;
  setSearchTypeWeightsJson: (value: string) => void;
  searchRecencyHalfLifeDays: number;
  setSearchRecencyHalfLifeDays: (value: number) => void;
  searchSubpathBoostWeight: number;
  setSearchSubpathBoostWeight: (value: number) => void;
  retentionPolicyEnabled: boolean;
  setRetentionPolicyEnabled: (value: boolean) => void;
  auditRetentionDays: number;
  setAuditRetentionDays: (value: number) => void;
  rawRetentionDays: number;
  setRawRetentionDays: (value: number) => void;
  retentionMode: 'archive' | 'hard_delete';
  setRetentionMode: (value: 'archive' | 'hard_delete') => void;
  githubPrefix: string;
  setGithubPrefix: (value: string) => void;
  localPrefix: string;
  setLocalPrefix: (value: string) => void;
  enableMonorepoResolution: boolean;
  setEnableMonorepoResolution: (value: boolean) => void;
  monorepoDetectionLevel: number;
  setMonorepoDetectionLevel: (value: number) => void;
  monorepoMode: MonorepoMode;
  setMonorepoMode: (value: MonorepoMode) => void;
  monorepoContextMode: MonorepoContextMode;
  setMonorepoContextMode: (value: MonorepoContextMode) => void;
  monorepoSubpathMetadataEnabled: boolean;
  setMonorepoSubpathMetadataEnabled: (value: boolean) => void;
  monorepoSubpathBoostEnabled: boolean;
  setMonorepoSubpathBoostEnabled: (value: boolean) => void;
  monorepoSubpathBoostWeight: number;
  setMonorepoSubpathBoostWeight: (value: number) => void;
  projects: Project[];
  monorepoSubprojectPolicies: MonorepoSubprojectPolicy[];
  newMonorepoPolicyRepoKey: string;
  setNewMonorepoPolicyRepoKey: (value: string) => void;
  newMonorepoPolicySubpath: string;
  setNewMonorepoPolicySubpath: (value: string) => void;
  newMonorepoPolicyEnabled: boolean;
  setNewMonorepoPolicyEnabled: (value: boolean) => void;
  monorepoPolicyReason: string;
  setMonorepoPolicyReason: (value: string) => void;
  createMonorepoSubprojectPolicy: (event?: FormEvent<Element>) => Promise<void>;
  patchMonorepoSubprojectPolicy: (id: string, enabled: boolean) => Promise<void>;
  removeMonorepoSubprojectPolicy: (id: string) => Promise<void>;
  monorepoWorkspaceGlobsText: string;
  setMonorepoWorkspaceGlobsText: (value: string) => void;
  monorepoExcludeGlobsText: string;
  setMonorepoExcludeGlobsText: (value: string) => void;
  monorepoRootMarkersText: string;
  setMonorepoRootMarkersText: (value: string) => void;
  monorepoMaxDepth: number;
  setMonorepoMaxDepth: (value: number) => void;
  workspaceSettingsReason: string;
  setWorkspaceSettingsReason: (value: string) => void;
  saveWorkspaceSettings: () => Promise<void>;
  draggingKind: ResolutionKind | null;
  setDraggingKind: (kind: ResolutionKind | null) => void;
};

const DEFAULT_ORDER: ResolutionKind[] = ['github_remote', 'repo_root_slug', 'manual'];

export function ResolutionSettingsPanel(props: Props) {
  function onDropOn(kind: ResolutionKind) {
    if (!props.draggingKind || props.draggingKind === kind) {
      return;
    }
    props.setResolutionOrder(reorderKinds(props.resolutionOrder, props.draggingKind, kind));
    props.setDraggingKind(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Resolution Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="muted">Drag to reorder: 1 &gt; 2 &gt; 3</div>
        <div className="drag-list">
          {props.resolutionOrder.map((kind) => (
            <div
              key={kind}
              className="drag-item"
              draggable
              onDragStart={() => props.setDraggingKind(kind)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDropOn(kind)}
            >
              <strong>{kind}</strong>
              <div className="muted">{kindDescription(kind)}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="auto-create-project"
            checked={props.autoCreateProject}
            onCheckedChange={(value) => props.setAutoCreateProject(value === true)}
          />
          <Label htmlFor="auto-create-project" className="text-sm text-muted-foreground">
            auto create project when mapping is missing
          </Label>
        </div>
        <div className="row">
          <div className="stack gap-1">
            <Label className="muted">GitHub Prefix</Label>
            <Input
              value={props.githubPrefix}
              onChange={(event) => props.setGithubPrefix(event.target.value)}
              placeholder="github:"
            />
          </div>
          <div className="stack gap-1">
            <Label className="muted">Local Prefix</Label>
            <Input
              value={props.localPrefix}
              onChange={(event) => props.setLocalPrefix(event.target.value)}
              placeholder="local:"
            />
          </div>
        </div>
        <div className="stack gap-1">
          <Label className="muted">Reason (for audit log)</Label>
          <Input
            value={props.workspaceSettingsReason}
            onChange={(event) => props.setWorkspaceSettingsReason(event.target.value)}
            placeholder="why this setting changed"
          />
        </div>
        <div className="toolbar">
          <Button type="button" onClick={() => void props.saveWorkspaceSettings()}>
            Save Resolution Settings
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              props.setResolutionOrder(DEFAULT_ORDER);
              props.setAutoCreateProject(true);
              props.setAutoSwitchRepo(true);
              props.setAutoSwitchSubproject(false);
              props.setAllowManualPin(true);
              props.setEnableGitEvents(true);
              props.setEnableCommitEvents(true);
              props.setEnableMergeEvents(true);
              props.setEnableCheckoutEvents(false);
              props.setCheckoutDebounceSeconds(30);
              props.setCheckoutDailyLimit(200);
              props.setEnableActivityAutoLog(true);
              props.setEnableDecisionExtraction(true);
              props.setDecisionExtractionMode('llm_only');
              props.setDecisionDefaultStatus('draft');
              props.setDecisionAutoConfirmEnabled(false);
              props.setDecisionAutoConfirmMinConfidence(0.9);
              props.setDecisionBatchSize(25);
              props.setDecisionBackfillDays(30);
              props.setActiveWorkStaleDays(14);
              props.setActiveWorkAutoCloseEnabled(false);
              props.setActiveWorkAutoCloseDays(45);
              props.setRawAccessMinRole('WRITER');
              props.setSearchDefaultMode('hybrid');
              props.setSearchHybridAlpha(0.6);
              props.setSearchHybridBeta(0.4);
              props.setSearchDefaultLimit(20);
              props.setSearchTypeWeightsJson(
                '{\n  "decision": 1.5,\n  "constraint": 1.35,\n  "goal": 1.2,\n  "activity": 1.05,\n  "active_work": 1.1,\n  "summary": 1.2,\n  "note": 1.0,\n  "problem": 1.0,\n  "caveat": 0.95\n}'
              );
              props.setSearchRecencyHalfLifeDays(14);
              props.setSearchSubpathBoostWeight(1.5);
              props.setRetentionPolicyEnabled(false);
              props.setAuditRetentionDays(365);
              props.setRawRetentionDays(90);
              props.setRetentionMode('archive');
              props.setGithubPrefix('github:');
              props.setLocalPrefix('local:');
              props.setAutoCreateProjectSubprojects(true);
              props.setEnableMonorepoResolution(false);
              props.setMonorepoDetectionLevel(2);
              props.setMonorepoMode('repo_hash_subpath');
              props.setMonorepoContextMode('shared_repo');
              props.setMonorepoSubpathMetadataEnabled(true);
              props.setMonorepoSubpathBoostEnabled(true);
              props.setMonorepoSubpathBoostWeight(1.5);
              props.setMonorepoWorkspaceGlobsText('apps/*\npackages/*');
              props.setMonorepoExcludeGlobsText(
                '**/node_modules/**\n**/.git/**\n**/dist/**\n**/build/**\n.next/**'
              );
              props.setMonorepoRootMarkersText(
                'pnpm-workspace.yaml\nturbo.json\nnx.json\nlerna.json'
              );
              props.setMonorepoMaxDepth(3);
            }}
          >
            Reset Default
          </Button>
        </div>

        <div className="row">
          <div className="flex items-center gap-2">
            <Checkbox
              id="auto-switch-repo"
              checked={props.autoSwitchRepo}
              onCheckedChange={(value) => props.setAutoSwitchRepo(value === true)}
            />
            <Label htmlFor="auto-switch-repo" className="text-sm text-muted-foreground">
              auto switch project when repository changes
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="allow-manual-pin"
              checked={props.allowManualPin}
              onCheckedChange={(value) => props.setAllowManualPin(value === true)}
            />
            <Label htmlFor="allow-manual-pin" className="text-sm text-muted-foreground">
              allow manual pin mode (`set_project`)
            </Label>
          </div>
        </div>

        <div className="stack gap-2">
          <Label className="muted">Git Events</Label>
          <div className="row">
            <div className="flex items-center gap-2">
              <Checkbox
                id="enable-git-events"
                checked={props.enableGitEvents}
                onCheckedChange={(value) => props.setEnableGitEvents(value === true)}
              />
              <Label htmlFor="enable-git-events" className="text-sm text-muted-foreground">
                enable git event capture
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="enable-commit-events"
                checked={props.enableCommitEvents}
                onCheckedChange={(value) => props.setEnableCommitEvents(value === true)}
              />
              <Label htmlFor="enable-commit-events" className="text-sm text-muted-foreground">
                post-commit
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="enable-merge-events"
                checked={props.enableMergeEvents}
                onCheckedChange={(value) => props.setEnableMergeEvents(value === true)}
              />
              <Label htmlFor="enable-merge-events" className="text-sm text-muted-foreground">
                post-merge
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="enable-checkout-events"
                checked={props.enableCheckoutEvents}
                onCheckedChange={(value) => props.setEnableCheckoutEvents(value === true)}
              />
              <Label htmlFor="enable-checkout-events" className="text-sm text-muted-foreground">
                post-checkout (optional)
              </Label>
            </div>
          </div>
          <div className="row">
            <div className="stack gap-1">
              <Label className="muted">Checkout Debounce Seconds</Label>
              <Input
                type="number"
                min={0}
                max={3600}
                value={props.checkoutDebounceSeconds}
                onChange={(event) =>
                  props.setCheckoutDebounceSeconds(Math.max(Number(event.target.value) || 0, 0))
                }
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Checkout Daily Limit</Label>
              <Input
                type="number"
                min={1}
                max={50000}
                value={props.checkoutDailyLimit}
                onChange={(event) =>
                  props.setCheckoutDailyLimit(Math.max(Number(event.target.value) || 1, 1))
                }
              />
            </div>
          </div>
        </div>

        <div className="stack gap-2">
          <Label className="muted">Extraction Pipeline</Label>
          <div className="row">
            <div className="flex items-center gap-2">
              <Checkbox
                id="enable-activity-auto-log"
                checked={props.enableActivityAutoLog}
                onCheckedChange={(value) => props.setEnableActivityAutoLog(value === true)}
              />
              <Label htmlFor="enable-activity-auto-log" className="text-sm text-muted-foreground">
                create activity memory for every commit/merge
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="enable-decision-extraction"
                checked={props.enableDecisionExtraction}
                onCheckedChange={(value) => props.setEnableDecisionExtraction(value === true)}
              />
              <Label htmlFor="enable-decision-extraction" className="text-sm text-muted-foreground">
                run LLM decision extraction jobs
              </Label>
            </div>
          </div>
          <div className="row">
            <div className="stack gap-1">
              <Label className="muted">Decision Extraction Mode</Label>
              <Select
                value={props.decisionExtractionMode}
                onChange={(event) =>
                  props.setDecisionExtractionMode(event.target.value as 'llm_only' | 'hybrid_priority')
                }
              >
                <option value="llm_only">llm_only</option>
                <option value="hybrid_priority">hybrid_priority</option>
              </Select>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Default Decision Status</Label>
              <Select
                value={props.decisionDefaultStatus}
                onChange={(event) =>
                  props.setDecisionDefaultStatus(event.target.value as 'draft' | 'confirmed')
                }
              >
                <option value="draft">draft</option>
                <option value="confirmed">confirmed</option>
              </Select>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Decision Batch Size</Label>
              <Input
                type="number"
                min={1}
                max={2000}
                value={props.decisionBatchSize}
                onChange={(event) => props.setDecisionBatchSize(Math.max(Number(event.target.value) || 1, 1))}
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Decision Backfill Days</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={props.decisionBackfillDays}
                onChange={(event) =>
                  props.setDecisionBackfillDays(Math.max(Number(event.target.value) || 1, 1))
                }
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Raw Access Minimum Role</Label>
              <Select
                value={props.rawAccessMinRole}
                onChange={(event) => props.setRawAccessMinRole(event.target.value as ProjectRole)}
              >
                <option value="OWNER">OWNER</option>
                <option value="MAINTAINER">MAINTAINER</option>
                <option value="WRITER">WRITER</option>
                <option value="READER">READER</option>
              </Select>
              <div className="muted">default: WRITER</div>
            </div>
          </div>
          <div className="row">
            <div className="stack gap-1">
              <Label className="muted">Active Work Stale Days</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={props.activeWorkStaleDays}
                onChange={(event) =>
                  props.setActiveWorkStaleDays(Math.min(Math.max(Number(event.target.value) || 1, 1), 3650))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="active-work-auto-close-enabled"
                checked={props.activeWorkAutoCloseEnabled}
                onCheckedChange={(value) => props.setActiveWorkAutoCloseEnabled(value === true)}
              />
              <Label htmlFor="active-work-auto-close-enabled" className="text-sm text-muted-foreground">
                enable active work auto-close
              </Label>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Active Work Auto-close Days</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={props.activeWorkAutoCloseDays}
                onChange={(event) =>
                  props.setActiveWorkAutoCloseDays(Math.min(Math.max(Number(event.target.value) || 1, 1), 3650))
                }
              />
            </div>
          </div>
          <div className="row">
            <div className="flex items-center gap-2">
              <Checkbox
                id="decision-auto-confirm-enabled"
                checked={props.decisionAutoConfirmEnabled}
                onCheckedChange={(value) => props.setDecisionAutoConfirmEnabled(value === true)}
              />
              <Label
                htmlFor="decision-auto-confirm-enabled"
                className="text-sm text-muted-foreground"
              >
                auto-confirm when confidence threshold is met
              </Label>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Auto Confirm Min Confidence</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={props.decisionAutoConfirmMinConfidence}
                onChange={(event) =>
                  props.setDecisionAutoConfirmMinConfidence(
                    Math.min(Math.max(Number(event.target.value) || 0, 0), 1)
                  )
                }
              />
            </div>
          </div>
          <div className="muted">
            Keywords do NOT decide decisions. They only prioritize LLM processing.
          </div>
        </div>

        <div className="stack gap-2">
          <Label className="muted">Search Defaults</Label>
          <div className="row">
            <div className="stack gap-1">
              <Label className="muted">Default Mode</Label>
              <Select
                value={props.searchDefaultMode}
                onChange={(event) =>
                  props.setSearchDefaultMode(event.target.value as 'hybrid' | 'keyword' | 'semantic')
                }
              >
                <option value="hybrid">hybrid</option>
                <option value="keyword">keyword</option>
                <option value="semantic">semantic</option>
              </Select>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Hybrid Alpha (vector)</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={props.searchHybridAlpha}
                onChange={(event) =>
                  props.setSearchHybridAlpha(Math.min(Math.max(Number(event.target.value) || 0, 0), 1))
                }
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Hybrid Beta (fts)</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={props.searchHybridBeta}
                onChange={(event) =>
                  props.setSearchHybridBeta(Math.min(Math.max(Number(event.target.value) || 0, 0), 1))
                }
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Default Limit</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={props.searchDefaultLimit}
                onChange={(event) =>
                  props.setSearchDefaultLimit(Math.max(Number(event.target.value) || 1, 1))
                }
              />
            </div>
          </div>
          <div className="row">
            <div className="stack gap-1">
              <Label className="muted">Recency Half-life (days)</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                step={1}
                value={props.searchRecencyHalfLifeDays}
                onChange={(event) =>
                  props.setSearchRecencyHalfLifeDays(
                    Math.min(Math.max(Number(event.target.value) || 1, 1), 3650)
                  )
                }
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Search Subpath Boost Weight</Label>
              <Input
                type="number"
                min={1}
                max={10}
                step={0.1}
                value={props.searchSubpathBoostWeight}
                onChange={(event) =>
                  props.setSearchSubpathBoostWeight(
                    Math.min(Math.max(Number(event.target.value) || 1.5, 1), 10)
                  )
                }
              />
            </div>
          </div>
          <div className="stack gap-1">
            <Label className="muted">Type Weights (JSON)</Label>
            <Textarea
              value={props.searchTypeWeightsJson}
              onChange={(event) => props.setSearchTypeWeightsJson(event.target.value)}
              rows={7}
              placeholder='{"decision":1.5,"constraint":1.35,"goal":1.2}'
            />
            <div className="muted">Used for hybrid ranking (decision &gt; constraint &gt; goal by default).</div>
          </div>
        </div>

        <div className="stack gap-2">
          <Label className="muted">Audit Retention Policy</Label>
          <div className="row">
            <div className="flex items-center gap-2">
              <Checkbox
                id="retention-policy-enabled"
                checked={props.retentionPolicyEnabled}
                onCheckedChange={(value) => props.setRetentionPolicyEnabled(value === true)}
              />
              <Label htmlFor="retention-policy-enabled" className="text-sm text-muted-foreground">
                enable retention policy (daily background job)
              </Label>
            </div>
          </div>
          <div className="row">
            <div className="stack gap-1">
              <Label className="muted">Audit Retention Days</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={props.auditRetentionDays}
                onChange={(event) =>
                  props.setAuditRetentionDays(Math.max(Number(event.target.value) || 1, 1))
                }
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Raw Retention Days</Label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={props.rawRetentionDays}
                onChange={(event) =>
                  props.setRawRetentionDays(Math.max(Number(event.target.value) || 1, 1))
                }
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Retention Mode</Label>
              <Select
                value={props.retentionMode}
                onChange={(event) =>
                  props.setRetentionMode(event.target.value as 'archive' | 'hard_delete')
                }
              >
                <option value="archive">archive (default, recommended)</option>
                <option value="hard_delete">hard_delete</option>
              </Select>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="flex items-center gap-2">
            <Checkbox
              id="enable-monorepo-resolution"
              checked={props.enableMonorepoResolution}
              onCheckedChange={(value) => props.setEnableMonorepoResolution(value === true)}
            />
            <Label htmlFor="enable-monorepo-resolution" className="text-sm text-muted-foreground">
              enable monorepo workspace resolution
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="auto-switch-subproject"
              checked={props.autoSwitchSubproject}
              onCheckedChange={(value) => props.setAutoSwitchSubproject(value === true)}
            />
            <Label htmlFor="auto-switch-subproject" className="text-sm text-muted-foreground">
              auto switch subproject within same repo
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="auto-create-subprojects"
              checked={props.autoCreateProjectSubprojects}
              onCheckedChange={(value) => props.setAutoCreateProjectSubprojects(value === true)}
            />
            <Label htmlFor="auto-create-subprojects" className="text-sm text-muted-foreground">
              auto create subprojects (`repo#subpath`)
            </Label>
          </div>
        </div>

        <div className="stack gap-2 rounded-md border border-border bg-muted/20 p-3">
          <Label className="muted">Monorepo Context</Label>
          <div className="stack gap-1">
            <Label className="muted">Mode</Label>
            <Select
              value={props.monorepoContextMode}
              onChange={(event) =>
                props.setMonorepoContextMode(event.target.value as MonorepoContextMode)
              }
            >
              <option value="shared_repo">Shared (Repo-level)</option>
              <option value="split_on_demand">Split (On-demand)</option>
              <option value="split_auto">Split (Auto - advanced)</option>
            </Select>
            <div className="muted">
              {props.monorepoContextMode === 'shared_repo'
                ? 'Shared: Memories are shared across the repo. Results are boosted for your current subpath.'
                : props.monorepoContextMode === 'split_on_demand'
                  ? 'In Split (On-demand) mode, only listed subpaths are isolated as separate projects.'
                  : 'Split (Auto): subprojects can be isolated automatically with guardrails.'}
            </div>
          </div>
          <div className="row">
            <div className="flex items-center gap-2">
              <Checkbox
                id="monorepo-subpath-metadata-enabled"
                checked={props.monorepoSubpathMetadataEnabled}
                onCheckedChange={(value) => props.setMonorepoSubpathMetadataEnabled(value === true)}
              />
              <Label
                htmlFor="monorepo-subpath-metadata-enabled"
                className="text-sm text-muted-foreground"
              >
                save subpath metadata
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="monorepo-subpath-boost-enabled"
                checked={props.monorepoSubpathBoostEnabled}
                onCheckedChange={(value) => props.setMonorepoSubpathBoostEnabled(value === true)}
              />
              <Label
                htmlFor="monorepo-subpath-boost-enabled"
                className="text-sm text-muted-foreground"
              >
                boost results by current subpath
              </Label>
            </div>
          </div>
          <div className="stack gap-1">
            <Label className="muted">Subpath Boost Weight</Label>
            <Input
              type="number"
              min={1}
              max={10}
              step={0.1}
              value={props.monorepoSubpathBoostWeight}
              onChange={(event) =>
                props.setMonorepoSubpathBoostWeight(
                  Math.min(Math.max(Number(event.target.value) || 1.5, 1), 10)
                )
              }
            />
          </div>
        </div>

        {props.monorepoContextMode === 'split_on_demand' ? (
          <div className="stack gap-2 rounded-md border border-border bg-muted/20 p-3">
            <Label className="muted">On-demand Subproject Split List</Label>
            <div className="row">
              <div className="stack gap-1">
                <Label className="muted">Repo Key</Label>
                <Select
                  value={props.newMonorepoPolicyRepoKey}
                  onChange={(event) => props.setNewMonorepoPolicyRepoKey(event.target.value)}
                >
                  <option value="">Select repo project</option>
                  {props.projects
                    .filter((project) => !isSubprojectKey(project.key))
                    .map((project) => (
                      <option key={project.id} value={project.key}>
                        {project.key}
                      </option>
                    ))}
                </Select>
              </div>
              <div className="stack gap-1">
                <Label className="muted">Subpath</Label>
                <Input
                  value={props.newMonorepoPolicySubpath}
                  onChange={(event) => props.setNewMonorepoPolicySubpath(event.target.value)}
                  placeholder="apps/admin-ui"
                />
              </div>
              <div className="flex items-end gap-2">
                <Checkbox
                  id="new-monorepo-policy-enabled"
                  checked={props.newMonorepoPolicyEnabled}
                  onCheckedChange={(value) => props.setNewMonorepoPolicyEnabled(value === true)}
                />
                <Label htmlFor="new-monorepo-policy-enabled" className="text-sm text-muted-foreground">
                  enabled
                </Label>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={() => {
                    void props.createMonorepoSubprojectPolicy();
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Reason (for audit log)</Label>
              <Input
                value={props.monorepoPolicyReason}
                onChange={(event) => props.setMonorepoPolicyReason(event.target.value)}
                placeholder="why this subproject split policy changed"
              />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Repo Key</th>
                    <th>Subpath</th>
                    <th>Enabled</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {props.monorepoSubprojectPolicies.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        no subproject split policies
                      </td>
                    </tr>
                  ) : (
                    props.monorepoSubprojectPolicies.map((policy) => (
                      <tr key={policy.id}>
                        <td>{policy.repo_key}</td>
                        <td>{policy.subpath}</td>
                        <td>{policy.enabled ? 'yes' : 'no'}</td>
                        <td>
                          <div className="toolbar">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                void props.patchMonorepoSubprojectPolicy(policy.id, !policy.enabled);
                              }}
                            >
                              {policy.enabled ? 'Disable' : 'Enable'}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => {
                                void props.removeMonorepoSubprojectPolicy(policy.id);
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
        ) : null}

        <div className="stack gap-1">
          <Label className="muted">Monorepo Detection Level</Label>
          <Select
            value={String(props.monorepoDetectionLevel)}
            onChange={(event) => props.setMonorepoDetectionLevel(Number(event.target.value))}
          >
            <option value="0">0 - off (repo only)</option>
            <option value="1">1 - apps/packages rules only</option>
            <option value="2">2 - workspace globs + apps/packages</option>
            <option value="3">3 - level2 + nearest package.json fallback</option>
          </Select>
        </div>

        <div className="stack gap-1">
          <Label className="muted">Monorepo Mode</Label>
          <Select
            value={props.monorepoMode}
            onChange={(event) => props.setMonorepoMode(event.target.value as MonorepoMode)}
          >
            <option value="repo_only">repo_only</option>
            <option value="repo_hash_subpath">repo_hash_subpath</option>
            <option value="repo_colon_subpath">repo_colon_subpath</option>
          </Select>
          <div className="muted">{monorepoModeDescription(props.monorepoMode)}</div>
        </div>

        <div className="row">
          <div className="stack gap-1">
            <Label className="muted">Workspace Globs (line-separated)</Label>
            <Textarea
              rows={4}
              value={props.monorepoWorkspaceGlobsText}
              onChange={(event) => props.setMonorepoWorkspaceGlobsText(event.target.value)}
              placeholder={'apps/*\npackages/*'}
            />
          </div>
          <div className="stack gap-1">
            <Label className="muted">Exclude Globs (line-separated)</Label>
            <Textarea
              rows={4}
              value={props.monorepoExcludeGlobsText}
              onChange={(event) => props.setMonorepoExcludeGlobsText(event.target.value)}
              placeholder={'**/node_modules/**\n**/.git/**'}
            />
          </div>
        </div>

        <div className="row">
          <div className="stack gap-1">
            <Label className="muted">Monorepo Root Markers (line-separated)</Label>
            <Textarea
              rows={4}
              value={props.monorepoRootMarkersText}
              onChange={(event) => props.setMonorepoRootMarkersText(event.target.value)}
              placeholder={'pnpm-workspace.yaml\nturbo.json'}
            />
          </div>
        </div>

        <div className="stack gap-1">
          <Label className="muted">Monorepo Max Depth</Label>
          <Input
            type="number"
            min={1}
            max={12}
            value={props.monorepoMaxDepth}
            onChange={(event) => props.setMonorepoMaxDepth(Number(event.target.value) || 3)}
          />
        </div>

        <div className="stack gap-2 rounded-md border border-border bg-muted/20 p-3">
          <div className="text-sm font-medium">MCP Pin Mode</div>
          <div className="muted">
            Pin state is session-local in MCP clients. Use `get_current_project` to inspect and
            `unset_project_pin` to release.
          </div>
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText('unset_project_pin({})');
              }}
            >
              Copy Unpin Command
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

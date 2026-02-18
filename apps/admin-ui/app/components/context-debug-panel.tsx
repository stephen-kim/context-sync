'use client';

import type { FormEvent } from 'react';
import type {
  ActiveWorkEventItem,
  ActiveWorkItem,
  ContextBundleResponse,
  ContextPersona,
  PersonaRecommendationResponse,
} from '../lib/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Input, Label } from './ui';

type Props = {
  selectedWorkspace: string;
  selectedProject: string;
  contextBundleQuery: string;
  setContextBundleQuery: (value: string) => void;
  contextBundleCurrentSubpath: string;
  setContextBundleCurrentSubpath: (value: string) => void;
  contextBundleBudget: number;
  setContextBundleBudget: (value: number) => void;
  contextBundleDefault: ContextBundleResponse | null;
  contextBundleDebug: ContextBundleResponse | null;
  loadContextBundle: (mode: 'default' | 'debug', event?: FormEvent) => Promise<void>;
  personaRecommendation: PersonaRecommendationResponse | null;
  recommendPersona: (event?: FormEvent) => Promise<void>;
  contextPersona: ContextPersona;
  setContextPersona: (value: ContextPersona) => void;
  saveContextPersona: () => Promise<void> | void;
  activeWorkItems: ActiveWorkItem[];
  activeWorkEvents: ActiveWorkEventItem[];
  selectedActiveWorkId: string;
  setSelectedActiveWorkId: (id: string) => void;
  activeWorkIncludeClosed: boolean;
  setActiveWorkIncludeClosed: (enabled: boolean) => void;
  refreshActiveWork: () => Promise<void>;
  refreshActiveWorkEvents: () => Promise<void>;
  updateActiveWorkStatus: (action: 'confirm' | 'close' | 'reopen', activeWorkId: string) => Promise<void>;
};

export function ContextDebugPanel(props: Props) {
  const recommendedPersona =
    props.personaRecommendation?.recommended || props.contextBundleDebug?.debug?.persona_recommended?.recommended;
  const recommendedConfidence =
    props.personaRecommendation?.confidence || props.contextBundleDebug?.debug?.persona_recommended?.confidence;
  const recommendedReasons =
    props.personaRecommendation?.reasons || props.contextBundleDebug?.debug?.persona_recommended?.reasons || [];
  const selectedActiveWork = props.activeWorkItems.find((item) => item.id === props.selectedActiveWorkId) || null;
  const filteredEvents = props.activeWorkEvents.filter(
    (event) => !props.selectedActiveWorkId || event.active_work_id === props.selectedActiveWorkId
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Context Debug</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="row"
          onSubmit={(event) => {
            void props.loadContextBundle('default', event);
          }}
        >
          <div className="stack gap-1">
            <Label className="muted">Workspace / Project</Label>
            <Input
              value={`${props.selectedWorkspace || '-'} / ${props.selectedProject || '-'}`}
              readOnly
            />
          </div>
          <div className="stack gap-1">
            <Label className="muted">Query (optional)</Label>
            <Input
              value={props.contextBundleQuery}
              onChange={(event) => props.setContextBundleQuery(event.target.value)}
              placeholder="migrate, auth, permissions..."
            />
          </div>
          <div className="stack gap-1">
            <Label className="muted">Current Subpath (optional)</Label>
            <Input
              value={props.contextBundleCurrentSubpath}
              onChange={(event) => props.setContextBundleCurrentSubpath(event.target.value)}
              placeholder="apps/admin-ui"
            />
          </div>
          <div className="stack gap-1">
            <Label className="muted">Token Budget</Label>
            <Input
              type="number"
              min={300}
              max={8000}
              value={props.contextBundleBudget}
              onChange={(event) =>
                props.setContextBundleBudget(Math.min(Math.max(Number(event.target.value) || 300, 300), 8000))
              }
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={!props.selectedWorkspace || !props.selectedProject}>
              Load Bundle
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!props.selectedWorkspace || !props.selectedProject}
              onClick={() => {
                void props.loadContextBundle('debug');
              }}
            >
              Load Debug
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!props.selectedWorkspace || !props.selectedProject}
              onClick={() => {
                void props.recommendPersona();
              }}
            >
              Recommend Persona
            </Button>
          </div>
        </form>

        <div className="stack gap-2 rounded-md border border-border bg-muted/20 p-3">
          <Label className="muted">Persona Transparency</Label>
          <div className="muted">
            current=<code>{props.contextPersona}</code>
          </div>
          {recommendedPersona ? (
            <div className="muted">
              recommended=<code>{recommendedPersona}</code>{' '}
              {typeof recommendedConfidence === 'number' ? `(confidence ${recommendedConfidence.toFixed(2)})` : ''}
            </div>
          ) : null}
          {recommendedReasons.length > 0 ? (
            <ul>
              {recommendedReasons.map((reason, index) => (
                <li key={`persona-reason-${index}`}>{reason}</li>
              ))}
            </ul>
          ) : null}
          {recommendedPersona && recommendedPersona !== props.contextPersona ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                props.setContextPersona(recommendedPersona);
                void props.saveContextPersona();
              }}
            >
              Apply Recommended Persona
            </Button>
          ) : null}
        </div>

        <div className="stack gap-2">
          <Label className="muted">Global Rules Included</Label>
          {(props.contextBundleDefault?.global?.workspace_rules?.length ||
            props.contextBundleDefault?.global?.user_rules?.length) ? (
            <div className="stack gap-2">
              <div>
                <strong>Workspace rules</strong>{' '}
                <span className="muted">
                  ({props.contextBundleDefault?.global?.workspace_rules?.length || 0})
                </span>
                <ul>
                  {(props.contextBundleDefault?.global?.workspace_rules || []).map((rule) => (
                    <li key={`ws-${rule.id}`}>
                      <code>{rule.selected_reason || 'score'}</code> · <strong>{rule.title}</strong> (
                      {rule.severity}, p{rule.priority})
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>User rules</strong>{' '}
                <span className="muted">
                  ({props.contextBundleDefault?.global?.user_rules?.length || 0})
                </span>
                <ul>
                  {(props.contextBundleDefault?.global?.user_rules || []).map((rule) => (
                    <li key={`user-${rule.id}`}>
                      <code>{rule.selected_reason || 'score'}</code> · <strong>{rule.title}</strong> (
                      {rule.severity}, p{rule.priority})
                    </li>
                  ))}
                </ul>
              </div>
              {props.contextBundleDefault?.global?.workspace_summary ? (
                <div>
                  <Label className="muted">Workspace summary (compressed)</Label>
                  <pre>{props.contextBundleDefault.global.workspace_summary}</pre>
                </div>
              ) : null}
              {props.contextBundleDefault?.global?.user_summary ? (
                <div>
                  <Label className="muted">User summary (compressed)</Label>
                  <pre>{props.contextBundleDefault.global.user_summary}</pre>
                </div>
              ) : null}
              {(props.contextBundleDefault?.global?.warnings || []).length > 0 ? (
                <div>
                  <Label className="muted">Warnings</Label>
                  <ul>
                    {(props.contextBundleDefault?.global?.warnings || []).map((warning, index) => (
                      <li key={`global-warning-${index}`}>
                        <strong>{warning.level.toUpperCase()}</strong>: {warning.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {props.contextBundleDefault?.global?.routing ? (
                <div className="stack gap-1">
                  <Label className="muted">Routing</Label>
                  <div className="muted">
                    mode=<code>{props.contextBundleDefault.global.routing.mode}</code>, q_used=
                    <code>{props.contextBundleDefault.global.routing.q_used || '(auto context)'}</code>
                  </div>
                  <div className="muted">
                    selected={props.contextBundleDefault.global.routing.selected_rule_ids.length}, dropped=
                    {props.contextBundleDefault.global.routing.dropped_rule_ids.length}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="muted">No global rules selected for the current bundle.</div>
          )}
        </div>

        <div className="stack gap-2">
          <Label className="muted">Active Work (Inferred)</Label>
          <div className="row">
            <div className="flex items-center gap-2">
              <Checkbox
                id="active-work-include-closed"
                checked={props.activeWorkIncludeClosed}
                onCheckedChange={(value) => props.setActiveWorkIncludeClosed(value === true)}
              />
              <Label htmlFor="active-work-include-closed" className="muted">
                Include closed items
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void props.refreshActiveWork()}>
                Refresh Active Work
              </Button>
              <Button type="button" variant="outline" onClick={() => void props.refreshActiveWorkEvents()}>
                Refresh Timeline
              </Button>
            </div>
          </div>
          {props.activeWorkItems.length ? (
            <ul>
              {props.activeWorkItems.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => props.setSelectedActiveWorkId(item.id)}>
                    <strong>{item.title}</strong>
                  </button>{' '}
                  · confidence={item.confidence.toFixed(2)} · status={item.status}
                  {item.stale ? ` · stale (${item.stale_reason || 'no recent evidence'})` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <div className="muted">No active work inferred yet.</div>
          )}
          {selectedActiveWork ? (
            <div className="toolbar">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void props.updateActiveWorkStatus('confirm', selectedActiveWork.id)}
              >
                Confirm / Pin
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void props.updateActiveWorkStatus('close', selectedActiveWork.id)}
              >
                Close
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void props.updateActiveWorkStatus('reopen', selectedActiveWork.id)}
              >
                Reopen
              </Button>
            </div>
          ) : null}
          <div className="stack gap-1">
            <Label className="muted">Active Work Timeline</Label>
            {filteredEvents.length ? (
              <ul>
                {filteredEvents.map((event) => (
                  <li key={event.id}>
                    <strong>{event.event_type}</strong> · {new Date(event.created_at).toLocaleString()}
                    {event.correlation_id ? ` · corr=${event.correlation_id}` : ''}
                    <pre>{JSON.stringify(event.details || {}, null, 2)}</pre>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="muted">No active work events available for this selection.</div>
            )}
          </div>
        </div>

        <div className="stack gap-2">
          <Label className="muted">Bundle Preview (default)</Label>
          <pre>{props.contextBundleDefault ? JSON.stringify(props.contextBundleDefault, null, 2) : 'No bundle loaded.'}</pre>
        </div>

        <div className="stack gap-2">
          <Label className="muted">Score Breakdown (debug retrieval)</Label>
          {props.contextBundleDebug?.retrieval.results?.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Snippet</th>
                    <th>Score Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {props.contextBundleDebug.retrieval.results.map((row) => (
                    <tr key={row.id}>
                      <td>{row.type}</td>
                      <td>{row.snippet}</td>
                      <td>
                        <code>{JSON.stringify(row.score_breakdown || {}, null, 2)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted">Load debug bundle to inspect ranking breakdown.</div>
          )}
        </div>

        <div className="stack gap-2">
          <Label className="muted">Routing Breakdown (debug)</Label>
          {props.contextBundleDebug?.global?.routing?.score_breakdown?.length ? (
            <pre>{JSON.stringify(props.contextBundleDebug.global.routing.score_breakdown, null, 2)}</pre>
          ) : (
            <div className="muted">
              Load debug bundle with a routing query to inspect global rule routing scores.
            </div>
          )}
        </div>

        <div className="stack gap-2">
          <Label className="muted">Extractor Status (debug)</Label>
          {props.contextBundleDebug?.debug?.persona_applied ? (
            <div className="muted">
              persona=<code>{props.contextBundleDebug.debug.persona_applied}</code>
            </div>
          ) : null}
          {props.contextBundleDebug?.debug?.persona_recommended ? (
            <div className="muted">
              recommended=<code>{props.contextBundleDebug.debug.persona_recommended.recommended}</code> (confidence{' '}
              {props.contextBundleDebug.debug.persona_recommended.confidence.toFixed(2)})
            </div>
          ) : null}
          {props.contextBundleDebug?.debug?.active_work_policy ? (
            <pre>{JSON.stringify(props.contextBundleDebug.debug.active_work_policy, null, 2)}</pre>
          ) : null}
          {props.contextBundleDebug?.debug?.active_work_candidates ? (
            <pre>{JSON.stringify(props.contextBundleDebug.debug.active_work_candidates, null, 2)}</pre>
          ) : null}
          {props.contextBundleDebug?.debug?.token_budget ? (
            <pre>{JSON.stringify(props.contextBundleDebug.debug.token_budget, null, 2)}</pre>
          ) : null}
          {props.contextBundleDebug?.debug?.weight_adjustments ? (
            <pre>{JSON.stringify(props.contextBundleDebug.debug.weight_adjustments, null, 2)}</pre>
          ) : null}
          <pre>{props.contextBundleDebug ? JSON.stringify(props.contextBundleDebug.debug || {}, null, 2) : 'No debug data loaded.'}</pre>
        </div>
      </CardContent>
    </Card>
  );
}

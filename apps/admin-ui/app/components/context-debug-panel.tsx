'use client';

import type { FormEvent } from 'react';
import type { ContextBundleResponse } from '../lib/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from './ui';

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
};

export function ContextDebugPanel(props: Props) {
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
          </div>
        </form>

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
          <Label className="muted">Extractor Status (debug)</Label>
          <pre>{props.contextBundleDebug ? JSON.stringify(props.contextBundleDebug.debug || {}, null, 2) : 'No debug data loaded.'}</pre>
        </div>
      </CardContent>
    </Card>
  );
}

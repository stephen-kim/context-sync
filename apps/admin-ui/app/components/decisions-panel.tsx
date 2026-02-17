'use client';

import type { FormEvent } from 'react';
import type { MemoryItem, Project } from '../lib/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from './ui';

type Props = {
  selectedWorkspace: string;
  projects: Project[];
  decisionProjectFilter: string;
  setDecisionProjectFilter: (value: string) => void;
  decisionStatusFilter: '' | 'draft' | 'confirmed' | 'rejected';
  setDecisionStatusFilter: (value: '' | 'draft' | 'confirmed' | 'rejected') => void;
  decisionConfidenceMinFilter: string;
  setDecisionConfidenceMinFilter: (value: string) => void;
  decisionConfidenceMaxFilter: string;
  setDecisionConfidenceMaxFilter: (value: string) => void;
  decisionLimit: number;
  setDecisionLimit: (value: number) => void;
  decisions: MemoryItem[];
  loadDecisions: (workspaceKey: string, event?: FormEvent) => Promise<void>;
  setDecisionStatus: (decisionId: string, status: 'confirmed' | 'rejected') => Promise<void>;
};

export function DecisionsPanel(props: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Decisions</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="stack gap-2"
          onSubmit={(event) => void props.loadDecisions(props.selectedWorkspace, event)}
        >
          <div className="row">
            <div className="stack gap-1">
              <Label className="muted">Project</Label>
              <Select
                value={props.decisionProjectFilter}
                onChange={(event) => props.setDecisionProjectFilter(event.target.value)}
              >
                <option value="">all projects</option>
                {props.projects.map((project) => (
                  <option key={project.id} value={project.key}>
                    {project.key}
                  </option>
                ))}
              </Select>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Status</Label>
              <Select
                value={props.decisionStatusFilter}
                onChange={(event) =>
                  props.setDecisionStatusFilter(
                    event.target.value as '' | 'draft' | 'confirmed' | 'rejected'
                  )
                }
              >
                <option value="">all</option>
                <option value="draft">draft</option>
                <option value="confirmed">confirmed</option>
                <option value="rejected">rejected</option>
              </Select>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Min Confidence</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={props.decisionConfidenceMinFilter}
                onChange={(event) => props.setDecisionConfidenceMinFilter(event.target.value)}
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Max Confidence</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={props.decisionConfidenceMaxFilter}
                onChange={(event) => props.setDecisionConfidenceMaxFilter(event.target.value)}
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Limit</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={props.decisionLimit}
                onChange={(event) => props.setDecisionLimit(Math.max(Number(event.target.value) || 1, 1))}
              />
            </div>
          </div>
          <div className="toolbar">
            <Button type="submit">Load Decisions</Button>
          </div>
        </form>

        <div className="results">
          {props.decisions.map((decision) => {
            const evidence =
              decision.evidence && typeof decision.evidence === 'object'
                ? (decision.evidence as Record<string, unknown>)
                : {};
            const rawEventIds = Array.isArray(evidence.raw_event_ids)
              ? (evidence.raw_event_ids as unknown[])
              : [];
            const rawEventId = rawEventIds.length > 0 ? String(rawEventIds[0]) : 'n/a';
            const commitSha = typeof evidence.commit_sha === 'string' ? evidence.commit_sha : 'n/a';
            return (
              <div key={decision.id} className="result-item">
                <div className="muted">
                  {decision.project.workspace.key}/{decision.project.key}
                </div>
                <div>
                  <strong>{decision.status || 'draft'}</strong> · confidence {decision.confidence ?? 0}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{decision.content}</div>
                <div className="muted">
                  evidence raw_event_id:{rawEventId} {' · '}commit_sha:{commitSha}
                </div>
                <div className="toolbar">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void props.setDecisionStatus(decision.id, 'confirmed')}
                  >
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void props.setDecisionStatus(decision.id, 'rejected')}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

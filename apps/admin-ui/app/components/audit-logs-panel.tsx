'use client';

import { useMemo, type FormEvent } from 'react';
import type { AccessTimelineItem, AuditLogItem, Project } from '../lib/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui';

type Props = {
  projects: Project[];
  auditProjectKey: string;
  setAuditProjectKey: (value: string) => void;
  auditActionKey: string;
  setAuditActionKey: (value: string) => void;
  auditActionPrefix: string;
  setAuditActionPrefix: (value: string) => void;
  auditActorUserId: string;
  setAuditActorUserId: (value: string) => void;
  auditLimit: number;
  setAuditLimit: (value: number) => void;
  selectedWorkspace: string;
  loadAuditLogs: (workspaceKey: string) => Promise<void>;
  auditLogs: AuditLogItem[];
  accessTimelineProjectKey: string;
  setAccessTimelineProjectKey: (value: string) => void;
  accessTimelineUserId: string;
  setAccessTimelineUserId: (value: string) => void;
  accessTimelineSource: '' | 'manual' | 'github' | 'oidc' | 'system';
  setAccessTimelineSource: (value: '' | 'manual' | 'github' | 'oidc' | 'system') => void;
  accessTimelineAction: '' | 'add' | 'change' | 'remove';
  setAccessTimelineAction: (value: '' | 'add' | 'change' | 'remove') => void;
  accessTimelineFrom: string;
  setAccessTimelineFrom: (value: string) => void;
  accessTimelineTo: string;
  setAccessTimelineTo: (value: string) => void;
  accessTimelineLimit: number;
  setAccessTimelineLimit: (value: number) => void;
  accessTimelineItems: AccessTimelineItem[];
  accessTimelineHasMore: boolean;
  accessTimelineLoading: boolean;
  accessTimelineExportFormat: 'csv' | 'json';
  setAccessTimelineExportFormat: (value: 'csv' | 'json') => void;
  loadAccessTimeline: (workspaceKey: string, event?: FormEvent) => Promise<void>;
  loadMoreAccessTimeline: (workspaceKey: string) => Promise<void>;
  exportAccessTimeline: (workspaceKey: string) => Promise<void>;
};

export function AuditLogsPanel(props: Props) {
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!props.selectedWorkspace) {
      return;
    }
    void props.loadAuditLogs(props.selectedWorkspace);
  }

  function onAccessTimelineSubmit(event: FormEvent) {
    event.preventDefault();
    if (!props.selectedWorkspace) {
      return;
    }
    void props.loadAccessTimeline(props.selectedWorkspace);
  }

  function readParamAsString(
    params: Record<string, unknown>,
    key: string
  ): string | null {
    const value = params[key];
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized || null;
  }

  function buildSummary(item: AccessTimelineItem): string {
    const targetUserId = readParamAsString(item.params, 'target_user_id') || 'unknown-user';
    const oldRole = readParamAsString(item.params, 'old_role');
    const newRole = readParamAsString(item.params, 'new_role');
    const projectKey = readParamAsString(item.params, 'project_key');
    const target = projectKey ? ` (${projectKey})` : ' (workspace)';
    if (item.action_key.endsWith('.added')) {
      return `${targetUserId} added as ${newRole || 'unknown'}${target}`;
    }
    if (item.action_key.endsWith('.removed')) {
      return `${targetUserId} removed from ${oldRole || 'unknown'}${target}`;
    }
    return `${targetUserId} role changed: ${oldRole || 'unknown'} → ${newRole || 'unknown'}${target}`;
  }

  function onCopyJson(item: AccessTimelineItem) {
    void navigator.clipboard.writeText(JSON.stringify(item.params, null, 2));
  }

  const groupedTimeline = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        correlationId: string | null;
        items: AccessTimelineItem[];
      }
    >();
    for (const item of props.accessTimelineItems) {
      const correlationId = item.correlation_id || readParamAsString(item.params, 'correlation_id');
      const key = correlationId ? `corr:${correlationId}` : `single:${item.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          correlationId: correlationId || null,
          items: [],
        });
      }
      groups.get(key)!.items.push(item);
    }
    return Array.from(groups.values());
  }, [props.accessTimelineItems]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Logs</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="row" onSubmit={onSubmit}>
          <Select
            value={props.auditProjectKey}
            onChange={(event) => props.setAuditProjectKey(event.target.value)}
          >
            <option value="">all projects</option>
            {props.projects.map((project) => (
              <option key={project.id} value={project.key}>
                {project.key}
              </option>
            ))}
          </Select>
          <Input
            value={props.auditActionKey}
            onChange={(event) => props.setAuditActionKey(event.target.value)}
            placeholder="action key (exact, optional)"
          />
          <Input
            value={props.auditActionPrefix}
            onChange={(event) => props.setAuditActionPrefix(event.target.value)}
            placeholder="action prefix (e.g. ci.)"
          />
          <Input
            value={props.auditActorUserId}
            onChange={(event) => props.setAuditActorUserId(event.target.value)}
            placeholder="actor user id (optional)"
          />
          <Input
            type="number"
            min={1}
            max={200}
            value={props.auditLimit}
            onChange={(event) => props.setAuditLimit(Number(event.target.value))}
          />
          <Button type="submit" className="md:col-span-2">
            Refresh Audit
          </Button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.auditLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                <TableCell>
                  {log.action}
                  {log.action === 'raw.search' || log.action === 'raw.view' ? (
                    <div className="mt-1">
                      <Badge variant="secondary">RAW ACCESS</Badge>
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>{log.actorUserId}</TableCell>
                <TableCell>{log.projectId || '-'}</TableCell>
                <TableCell>
                  <pre>{JSON.stringify(log.target, null, 2)}</pre>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-6 stack">
          <h3 className="text-base font-semibold">Access Timeline</h3>
          <form className="row" onSubmit={onAccessTimelineSubmit}>
            <Select
              value={props.accessTimelineProjectKey}
              onChange={(event) => props.setAccessTimelineProjectKey(event.target.value)}
            >
              <option value="">all projects</option>
              {props.projects.map((project) => (
                <option key={project.id} value={project.key}>
                  {project.key}
                </option>
              ))}
            </Select>
            <Input
              value={props.accessTimelineUserId}
              onChange={(event) => props.setAccessTimelineUserId(event.target.value)}
              placeholder="target user id (optional)"
            />
            <Select
              value={props.accessTimelineSource}
              onChange={(event) =>
                props.setAccessTimelineSource(
                  event.target.value as '' | 'manual' | 'github' | 'oidc' | 'system'
                )
              }
            >
              <option value="">all sources</option>
              <option value="manual">manual</option>
              <option value="github">github</option>
              <option value="oidc">oidc</option>
              <option value="system">system</option>
            </Select>
            <Select
              value={props.accessTimelineAction}
              onChange={(event) =>
                props.setAccessTimelineAction(event.target.value as '' | 'add' | 'change' | 'remove')
              }
            >
              <option value="">all actions</option>
              <option value="add">add</option>
              <option value="change">change</option>
              <option value="remove">remove</option>
            </Select>
            <Input
              type="datetime-local"
              value={props.accessTimelineFrom}
              onChange={(event) => props.setAccessTimelineFrom(event.target.value)}
            />
            <Input
              type="datetime-local"
              value={props.accessTimelineTo}
              onChange={(event) => props.setAccessTimelineTo(event.target.value)}
            />
            <Input
              type="number"
              min={1}
              max={200}
              value={props.accessTimelineLimit}
              onChange={(event) => props.setAccessTimelineLimit(Number(event.target.value))}
            />
            <Select
              value={props.accessTimelineExportFormat}
              onChange={(event) =>
                props.setAccessTimelineExportFormat(event.target.value as 'csv' | 'json')
              }
            >
              <option value="csv">csv</option>
              <option value="json">json</option>
            </Select>
            <Button type="submit" className="md:col-span-2" disabled={props.accessTimelineLoading}>
              {props.accessTimelineLoading ? 'Loading…' : 'Refresh Timeline'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="md:col-span-2"
              onClick={() => void props.exportAccessTimeline(props.selectedWorkspace)}
              disabled={props.accessTimelineLoading || !props.selectedWorkspace}
            >
              Export
            </Button>
          </form>

          {groupedTimeline.map((group) => {
            const firstItem = group.items[0];
            const groupLabel =
              group.correlationId && group.items.length > 1
                ? `Batch change (${group.items.length} events)`
                : buildSummary(firstItem);
            return (
              <div key={group.key} className="rounded-md border border-border p-3 stack-sm">
                <div className="text-sm font-medium">{groupLabel}</div>
                <div className="muted text-xs">
                  {group.correlationId ? `correlation_id: ${group.correlationId}` : 'single event'}
                </div>
                <details>
                  <summary className="text-xs muted cursor-pointer">Details</summary>
                  <div className="stack-sm mt-2">
                    {group.items.map((item) => {
                      const source = readParamAsString(item.params, 'source') || 'unknown';
                      const evidence = item.params.evidence;
                      const correlationId =
                        item.correlation_id || readParamAsString(item.params, 'correlation_id');
                      return (
                        <div key={item.id} className="rounded border border-border/50 p-2 stack-sm">
                          <div className="row">
                            <div className="md:col-span-6">
                              <div className="text-sm">{buildSummary(item)}</div>
                              <div className="muted text-xs">
                                {new Date(item.created_at).toLocaleString()}
                              </div>
                            </div>
                            <div className="md:col-span-2">
                              <Badge variant="secondary">{source}</Badge>
                            </div>
                            <div className="md:col-span-2">
                              <span className="muted text-xs">
                                {item.actor_user_id || item.system_actor || '-'}
                              </span>
                            </div>
                            <div className="md:col-span-2">
                              <Button type="button" variant="outline" onClick={() => onCopyJson(item)}>
                                Copy JSON
                              </Button>
                            </div>
                          </div>
                          <div className="muted text-xs">correlation_id: {correlationId || '-'}</div>
                          <div className="muted text-xs">action_key: {item.action_key}</div>
                          {evidence ? <pre>{JSON.stringify(evidence, null, 2)}</pre> : null}
                          <pre>{JSON.stringify(item.params, null, 2)}</pre>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            );
          })}

          {props.accessTimelineHasMore ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void props.loadMoreAccessTimeline(props.selectedWorkspace)}
              disabled={props.accessTimelineLoading}
            >
              {props.accessTimelineLoading ? 'Loading…' : 'Load more'}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

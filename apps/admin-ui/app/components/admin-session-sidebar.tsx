'use client';

import type { FormEvent } from 'react';
import type { User, Workspace } from '../lib/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from './ui';

type Props = {
  apiBaseUrl: string;
  initializeData: () => Promise<void>;
  logout: () => Promise<void>;
  workspaces: Workspace[];
  selectedWorkspace: string;
  setSelectedWorkspace: (key: string) => void;
  createWorkspace: (event: FormEvent) => void | Promise<void>;
  newWorkspaceKey: string;
  setNewWorkspaceKey: (value: string) => void;
  newWorkspaceName: string;
  setNewWorkspaceName: (value: string) => void;
  createUser: (event: FormEvent) => void | Promise<void>;
  newUserEmail: string;
  setNewUserEmail: (value: string) => void;
  newUserName: string;
  setNewUserName: (value: string) => void;
  users: User[];
};

export function AdminSessionSidebar(props: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <img
            src="/brand/logo-white.svg"
            alt="Claustrum logo"
            width={28}
            height={28}
            className="rounded-sm border border-border/60 bg-black/40 p-1"
          />
          <div>
            <CardTitle>Claustrum Admin</CardTitle>
            <p className="muted text-xs">Session and access controls</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="stack gap-2">
          <div className="stack gap-1">
            <Label className="muted">Memory Core URL</Label>
            <Input value={props.apiBaseUrl} readOnly />
          </div>
          <div className="toolbar">
            <Button variant="ghost" type="button" onClick={() => void props.initializeData()}>
              Refresh
            </Button>
            <Button variant="outline" type="button" onClick={() => void props.logout()}>
              Logout
            </Button>
          </div>
        </div>

        <div className="stack gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Workspaces</h3>
          <div className="list">
            {props.workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                className={workspace.key === props.selectedWorkspace ? 'active' : ''}
                onClick={() => props.setSelectedWorkspace(workspace.key)}
              >
                <strong>{workspace.name}</strong>
                <div className="muted">{workspace.key}</div>
              </button>
            ))}
          </div>
          <form className="stack" onSubmit={props.createWorkspace}>
            <Input
              value={props.newWorkspaceKey}
              onChange={(event) => props.setNewWorkspaceKey(event.target.value)}
              placeholder="workspace key"
              required
            />
            <Input
              value={props.newWorkspaceName}
              onChange={(event) => props.setNewWorkspaceName(event.target.value)}
              placeholder="workspace name"
              required
            />
            <Button type="submit" variant="secondary">
              Create Workspace
            </Button>
          </form>
        </div>

        <div className="stack gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Users</h3>
          <form className="stack" onSubmit={props.createUser}>
            <Input
              value={props.newUserEmail}
              onChange={(event) => props.setNewUserEmail(event.target.value)}
              placeholder="user@email.com"
              required
            />
            <Input
              value={props.newUserName}
              onChange={(event) => props.setNewUserName(event.target.value)}
              placeholder="display name (optional)"
            />
            <Button type="submit" variant="secondary">
              Create User
            </Button>
          </form>
          <div className="list">
            {props.users.map((user) => (
              <button key={user.id} type="button">
                <strong>{user.email}</strong>
                <div className="muted">{user.name || 'no name'}</div>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

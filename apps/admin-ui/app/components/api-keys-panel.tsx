'use client';

import type { FormEvent } from 'react';
import type { ApiKeyItem, WorkspaceMember } from '../lib/types';
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
  Textarea,
} from './ui';

type Props = {
  members: WorkspaceMember[];
  selfKeys: ApiKeyItem[];
  selectedUserId: string;
  setSelectedUserId: (value: string) => void;
  selectedUserKeys: ApiKeyItem[];
  selfLabel: string;
  setSelfLabel: (value: string) => void;
  createSelfKey: (event: FormEvent) => void | Promise<void>;
  revokeSelfKey: (apiKeyId: string) => void | Promise<void>;
  revokeUserKey: (apiKeyId: string) => void | Promise<void>;
  resetUserKeys: () => void | Promise<void>;
  latestSelfPlainKey: string;
  clearSelfPlainKey: () => void;
  latestOneTimeUrl: string;
  latestOneTimeExpiresAt: string;
  clearLatestOneTime: () => void;
};

export function ApiKeysPanel(props: Props) {
  const selectedMember = props.members.find((member) => member.user.id === props.selectedUserId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Keys</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="stack gap-3">
          <div className="stack gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Profile API Keys
            </h3>
            <form className="row" onSubmit={props.createSelfKey}>
              <Input
                value={props.selfLabel}
                onChange={(event) => props.setSelfLabel(event.target.value)}
                placeholder="key label (optional)"
              />
              <Button type="submit" className="md:col-span-2">
                Generate New Key
              </Button>
            </form>

            {props.latestSelfPlainKey ? (
              <div className="stack gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                <div className="text-xs text-amber-100/90">
                  This key is shown once. Copy and store it securely.
                </div>
                <Textarea value={props.latestSelfPlainKey} readOnly rows={3} />
                <div className="toolbar">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(props.latestSelfPlainKey);
                    }}
                  >
                    Copy
                  </Button>
                  <Button type="button" variant="ghost" onClick={props.clearSelfPlainKey}>
                    Hide
                  </Button>
                </div>
              </div>
            ) : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.selfKeys.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.label || '-'}</TableCell>
                    <TableCell>{new Date(item.created_at).toLocaleString()}</TableCell>
                    <TableCell>{item.last_used_at ? new Date(item.last_used_at).toLocaleString() : '-'}</TableCell>
                    <TableCell>{item.revoked_at ? 'revoked' : 'active'}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={Boolean(item.revoked_at)}
                        onClick={() => void props.revokeSelfKey(item.id)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="stack gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Workspace Member Keys
            </h3>
            <div className="row">
              <Select
                value={props.selectedUserId}
                onChange={(event) => props.setSelectedUserId(event.target.value)}
              >
                <option value="">Select workspace member</option>
                {props.members.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.email}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                className="md:col-span-2"
                disabled={!props.selectedUserId}
                onClick={() => void props.resetUserKeys()}
              >
                Reset Key (One-Time Link)
              </Button>
            </div>

            {selectedMember ? (
              <div className="muted text-xs">
                Selected: <span className="font-medium text-foreground">{selectedMember.user.email}</span>{' '}
                <Badge>{selectedMember.role}</Badge>
              </div>
            ) : null}

            {props.latestOneTimeUrl ? (
              <div className="stack gap-2 rounded-md border border-cyan-500/40 bg-cyan-500/5 p-3">
                <div className="text-xs text-cyan-100/90">
                  The link can be used once and expires in 15 minutes.
                </div>
                <Textarea value={props.latestOneTimeUrl} readOnly rows={3} />
                <div className="muted text-xs">
                  Expires at: {new Date(props.latestOneTimeExpiresAt).toLocaleString()}
                </div>
                <div className="toolbar">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(props.latestOneTimeUrl);
                    }}
                  >
                    Copy link
                  </Button>
                  <Button type="button" variant="ghost" onClick={props.clearLatestOneTime}>
                    Clear
                  </Button>
                </div>
              </div>
            ) : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.selectedUserKeys.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.id}</TableCell>
                    <TableCell>{item.label || '-'}</TableCell>
                    <TableCell>{new Date(item.created_at).toLocaleString()}</TableCell>
                    <TableCell>{item.last_used_at ? new Date(item.last_used_at).toLocaleString() : '-'}</TableCell>
                    <TableCell>{item.revoked_at ? 'revoked' : 'active'}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={Boolean(item.revoked_at)}
                        onClick={() => void props.revokeUserKey(item.id)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import type { FormEvent } from 'react';
import type { WorkspaceMember, WorkspaceRole } from '../lib/types';
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
  addMember: (event: FormEvent) => void | Promise<void>;
  createInvite: (event: FormEvent) => void | Promise<void>;
  updateMemberRole: (userId: string, role: WorkspaceRole) => void | Promise<void>;
  removeMember: (userId: string) => void | Promise<void>;
  email: string;
  setEmail: (value: string) => void;
  role: WorkspaceRole;
  setRole: (value: WorkspaceRole) => void;
  inviteEmail: string;
  setInviteEmail: (value: string) => void;
  inviteRole: WorkspaceRole;
  setInviteRole: (value: WorkspaceRole) => void;
  inviteProjectRolesJson: string;
  setInviteProjectRolesJson: (value: string) => void;
  latestInviteUrl: string;
  latestInviteExpiresAt: string;
  clearLatestInvite: () => void;
};

const WORKSPACE_ROLES: WorkspaceRole[] = ['OWNER', 'ADMIN', 'MEMBER'];

export function WorkspaceMembersPanel(props: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace Members</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="row" onSubmit={props.addMember}>
          <Input
            value={props.email}
            onChange={(event) => props.setEmail(event.target.value)}
            placeholder="member email"
            required
          />
          <Select
            value={props.role}
            onChange={(event) => props.setRole(event.target.value as WorkspaceRole)}
          >
            {WORKSPACE_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </Select>
          <Button type="submit" className="md:col-span-2">
            Add Member
          </Button>
        </form>

        <div className="stack gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Invite Member
          </h3>
          <form className="row" onSubmit={props.createInvite}>
            <Input
              value={props.inviteEmail}
              onChange={(event) => props.setInviteEmail(event.target.value)}
              placeholder="invite email"
              required
            />
            <Select
              value={props.inviteRole}
              onChange={(event) => props.setInviteRole(event.target.value as WorkspaceRole)}
            >
              {WORKSPACE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
            <Textarea
              className="md:col-span-4"
              value={props.inviteProjectRolesJson}
              onChange={(event) => props.setInviteProjectRolesJson(event.target.value)}
              rows={4}
              placeholder='{"github:owner/repo#apps/memory-core":"WRITER"}'
            />
            <Button type="submit" className="md:col-span-4">
              Generate Invite Link
            </Button>
          </form>

          {props.latestInviteUrl ? (
            <div className="stack gap-2">
              <div className="muted text-xs">
                Invite link expires at {new Date(props.latestInviteExpiresAt).toLocaleString()}.
              </div>
              <Textarea value={props.latestInviteUrl} readOnly rows={3} />
              <div className="toolbar">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(props.latestInviteUrl);
                  }}
                >
                  Copy invite link
                </Button>
                <Button type="button" variant="ghost" onClick={props.clearLatestInvite}>
                  Clear
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  {member.user.email}
                  <div className="muted">{member.user.name || 'no name'}</div>
                </TableCell>
                <TableCell>
                  <Badge>{member.role}</Badge>
                </TableCell>
                <TableCell>
                  <div className="toolbar">
                    <Select
                      value={member.role}
                      onChange={(event) =>
                        void props.updateMemberRole(member.user.id, event.target.value as WorkspaceRole)
                      }
                    >
                      {WORKSPACE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void props.removeMember(member.user.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

'use client';

import type { FormEvent } from 'react';
import type { ProjectMember, ProjectRole } from '../lib/types';
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
  addProjectMember: (event: FormEvent) => void | Promise<void>;
  updateProjectMemberRole: (userId: string, role: ProjectRole) => void | Promise<void>;
  removeProjectMember: (userId: string) => void | Promise<void>;
  inviteEmail: string;
  setInviteEmail: (value: string) => void;
  inviteRole: ProjectRole;
  setInviteRole: (value: ProjectRole) => void;
  members: ProjectMember[];
};

const PROJECT_ROLES: ProjectRole[] = ['OWNER', 'MAINTAINER', 'WRITER', 'READER'];

export function ProjectMembersPanel(props: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Members</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="row" onSubmit={props.addProjectMember}>
          <Input
            value={props.inviteEmail}
            onChange={(event) => props.setInviteEmail(event.target.value)}
            placeholder="member email"
            required
          />
          <Select
            value={props.inviteRole}
            onChange={(event) => props.setInviteRole(event.target.value as ProjectRole)}
          >
            {PROJECT_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </Select>
          <Button type="submit" className="md:col-span-2">
            Invite Member
          </Button>
        </form>
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
                        void props.updateProjectMemberRole(member.user.id, event.target.value as ProjectRole)
                      }
                    >
                      {PROJECT_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void props.removeProjectMember(member.user.id)}
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

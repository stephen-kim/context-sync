'use client';

import { useState } from 'react';
import type { ApiKeyItem, ContextPersona, User, WorkspaceMember, WorkspaceRole } from '../../lib/types';

export function useAdminAuthInviteApiKeyState() {
  const [users, setUsers] = useState<User[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceMemberEmail, setWorkspaceMemberEmail] = useState('');
  const [workspaceMemberRole, setWorkspaceMemberRole] = useState<WorkspaceRole>('MEMBER');
  const [workspaceInviteEmail, setWorkspaceInviteEmail] = useState('');
  const [workspaceInviteRole, setWorkspaceInviteRole] = useState<WorkspaceRole>('MEMBER');
  const [workspaceInviteProjectRolesJson, setWorkspaceInviteProjectRolesJson] = useState('{}');
  const [latestInviteUrl, setLatestInviteUrl] = useState('');
  const [latestInviteExpiresAt, setLatestInviteExpiresAt] = useState('');
  const [selfApiKeys, setSelfApiKeys] = useState<ApiKeyItem[]>([]);
  const [selectedUserApiKeys, setSelectedUserApiKeys] = useState<ApiKeyItem[]>([]);
  const [selectedApiKeyUserId, setSelectedApiKeyUserId] = useState('');
  const [selfApiKeyLabel, setSelfApiKeyLabel] = useState('');
  const [contextPersona, setContextPersona] = useState<ContextPersona>('neutral');
  const [generatedSelfApiKey, setGeneratedSelfApiKey] = useState('');
  const [latestOneTimeUrl, setLatestOneTimeUrl] = useState('');
  const [latestOneTimeExpiresAt, setLatestOneTimeExpiresAt] = useState('');

  function resetWorkspaceScopedState() {
    setWorkspaceMembers([]);
    setWorkspaceMemberEmail('');
    setWorkspaceMemberRole('MEMBER');
    setWorkspaceInviteEmail('');
    setWorkspaceInviteRole('MEMBER');
    setWorkspaceInviteProjectRolesJson('{}');
    setLatestInviteUrl('');
    setLatestInviteExpiresAt('');
    setSelfApiKeys([]);
    setSelectedUserApiKeys([]);
    setSelectedApiKeyUserId('');
    setContextPersona('neutral');
    setGeneratedSelfApiKey('');
    setLatestOneTimeUrl('');
    setLatestOneTimeExpiresAt('');
  }

  return {
    users,
    setUsers,
    newUserEmail,
    setNewUserEmail,
    newUserName,
    setNewUserName,
    workspaceMembers,
    setWorkspaceMembers,
    workspaceMemberEmail,
    setWorkspaceMemberEmail,
    workspaceMemberRole,
    setWorkspaceMemberRole,
    workspaceInviteEmail,
    setWorkspaceInviteEmail,
    workspaceInviteRole,
    setWorkspaceInviteRole,
    workspaceInviteProjectRolesJson,
    setWorkspaceInviteProjectRolesJson,
    latestInviteUrl,
    setLatestInviteUrl,
    latestInviteExpiresAt,
    setLatestInviteExpiresAt,
    selfApiKeys,
    setSelfApiKeys,
    selectedUserApiKeys,
    setSelectedUserApiKeys,
    selectedApiKeyUserId,
    setSelectedApiKeyUserId,
    selfApiKeyLabel,
    setSelfApiKeyLabel,
    contextPersona,
    setContextPersona,
    generatedSelfApiKey,
    setGeneratedSelfApiKey,
    latestOneTimeUrl,
    setLatestOneTimeUrl,
    latestOneTimeExpiresAt,
    setLatestOneTimeExpiresAt,
    resetWorkspaceScopedState,
  };
}

export type AdminAuthInviteApiKeyState = ReturnType<typeof useAdminAuthInviteApiKeyState>;

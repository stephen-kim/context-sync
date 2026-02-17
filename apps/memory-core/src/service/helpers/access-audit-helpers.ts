import type { Prisma } from '@prisma/client';

export type AccessAuditSource = 'manual' | 'github' | 'oidc' | 'system';

export const ACCESS_AUDIT_ACTION_KEYS = {
  workspaceAdded: 'access.workspace_member.added',
  workspaceRoleChanged: 'access.workspace_member.role_changed',
  workspaceRemoved: 'access.workspace_member.removed',
  projectAdded: 'access.project_member.added',
  projectRoleChanged: 'access.project_member.role_changed',
  projectRemoved: 'access.project_member.removed',
} as const;

export const ACCESS_AUDIT_ACTION_KEY_SET = new Set<string>(Object.values(ACCESS_AUDIT_ACTION_KEYS));

export type AccessTimelineActionFilter = 'add' | 'change' | 'remove';

export function resolveAccessTimelineActionKeys(
  action?: string
): ReadonlyArray<string> {
  const normalized = String(action || '').trim().toLowerCase();
  if (!normalized) {
    return Object.values(ACCESS_AUDIT_ACTION_KEYS);
  }
  if (normalized === 'add') {
    return [ACCESS_AUDIT_ACTION_KEYS.workspaceAdded, ACCESS_AUDIT_ACTION_KEYS.projectAdded];
  }
  if (normalized === 'change') {
    return [ACCESS_AUDIT_ACTION_KEYS.workspaceRoleChanged, ACCESS_AUDIT_ACTION_KEYS.projectRoleChanged];
  }
  if (normalized === 'remove') {
    return [ACCESS_AUDIT_ACTION_KEYS.workspaceRemoved, ACCESS_AUDIT_ACTION_KEYS.projectRemoved];
  }
  if (ACCESS_AUDIT_ACTION_KEY_SET.has(normalized)) {
    return [normalized];
  }
  return [];
}

export function resolveAccessAuditAction(args: {
  kind: 'workspace' | 'project';
  oldRole: string | null;
  newRole: string | null;
}): string | null {
  if (!args.oldRole && args.newRole) {
    return args.kind === 'workspace'
      ? ACCESS_AUDIT_ACTION_KEYS.workspaceAdded
      : ACCESS_AUDIT_ACTION_KEYS.projectAdded;
  }
  if (args.oldRole && !args.newRole) {
    return args.kind === 'workspace'
      ? ACCESS_AUDIT_ACTION_KEYS.workspaceRemoved
      : ACCESS_AUDIT_ACTION_KEYS.projectRemoved;
  }
  if (args.oldRole && args.newRole && args.oldRole !== args.newRole) {
    return args.kind === 'workspace'
      ? ACCESS_AUDIT_ACTION_KEYS.workspaceRoleChanged
      : ACCESS_AUDIT_ACTION_KEYS.projectRoleChanged;
  }
  return null;
}

export function buildAccessAuditParams(args: {
  source: AccessAuditSource;
  targetUserId: string;
  oldRole: string | null;
  newRole: string | null;
  workspaceKey: string;
  projectKey?: string;
  correlationId?: string | null;
  evidence?: Record<string, unknown> | null;
  systemActor?: string | null;
}): Record<string, unknown> {
  return {
    source: args.source,
    target_user_id: args.targetUserId,
    old_role: args.oldRole,
    new_role: args.newRole,
    workspace_key: args.workspaceKey,
    ...(args.projectKey ? { project_key: args.projectKey } : {}),
    correlation_id: args.correlationId || null,
    ...(args.systemActor ? { system_actor: args.systemActor } : {}),
    ...(args.evidence ? { evidence: args.evidence } : {}),
  };
}

export function toJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function readJsonString(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

export function readJsonRecord(obj: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = obj[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function normalizeTimelineActor(args: {
  actorUserId: string;
  params: Record<string, unknown>;
}): { actorUserId: string | null; systemActor: string | null } {
  const explicitSystemActor = readJsonString(args.params, 'system_actor');
  if (explicitSystemActor) {
    return {
      actorUserId: null,
      systemActor: explicitSystemActor,
    };
  }
  if (args.actorUserId.startsWith('system:')) {
    return {
      actorUserId: null,
      systemActor: args.actorUserId,
    };
  }
  return {
    actorUserId: args.actorUserId,
    systemActor: null,
  };
}

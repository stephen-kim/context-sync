import type { AuthContext } from '../../auth.js';
import { assertWorkspaceAccess, assertWorkspaceAdmin } from '../access-control.js';
import { NotFoundError, ValidationError } from '../errors.js';
import {
  type GithubTeamMappingDeps,
  type GithubTeamMappingInput,
  normalizeMappingInput,
} from './github-team-mapping-shared.js';

export async function listGithubTeamMappingsHandler(
  deps: GithubTeamMappingDeps,
  args: { auth: AuthContext; workspaceKey: string }
): Promise<{
  workspace_key: string;
  mappings: Array<{
    id: string;
    provider_installation_id: string | null;
    github_team_id: string;
    github_team_slug: string;
    github_org_login: string;
    target_type: 'workspace' | 'project';
    target_key: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'MAINTAINER' | 'WRITER' | 'READER';
    enabled: boolean;
    priority: number;
    created_at: string;
    updated_at: string;
  }>;
}> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, args.auth, workspace.id, 'MEMBER');

  const rows = await deps.prisma.githubTeamMapping.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ priority: 'asc' }, { githubOrgLogin: 'asc' }, { githubTeamSlug: 'asc' }],
  });

  return {
    workspace_key: workspace.key,
    mappings: rows.map((row) => ({
      id: row.id,
      provider_installation_id: row.providerInstallationId
        ? row.providerInstallationId.toString()
        : null,
      github_team_id: row.githubTeamId.toString(),
      github_team_slug: row.githubTeamSlug,
      github_org_login: row.githubOrgLogin,
      target_type: row.targetType,
      target_key: row.targetKey,
      role: row.role,
      enabled: row.enabled,
      priority: row.priority,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    })),
  };
}

export async function createGithubTeamMappingHandler(
  deps: GithubTeamMappingDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    input: GithubTeamMappingInput;
  }
): Promise<{ workspace_key: string; id: string; created: true }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);

  const normalized = await normalizeMappingInput(deps.prisma, workspace.id, args.input);
  const existing = await deps.prisma.githubTeamMapping.findFirst({
    where: {
      workspaceId: workspace.id,
      githubTeamId: normalized.githubTeamId,
      targetType: normalized.targetType,
      targetKey: normalized.targetKey,
    },
    select: { id: true },
  });
  if (existing) {
    throw new ValidationError('A mapping already exists for this team and target.');
  }

  const row = await deps.prisma.githubTeamMapping.create({
    data: {
      workspaceId: workspace.id,
      providerInstallationId: normalized.providerInstallationId,
      githubTeamId: normalized.githubTeamId,
      githubTeamSlug: normalized.githubTeamSlug,
      githubOrgLogin: normalized.githubOrgLogin,
      targetType: normalized.targetType,
      targetKey: normalized.targetKey,
      role: normalized.role,
      enabled: normalized.enabled,
      priority: normalized.priority,
    },
    select: { id: true },
  });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'github.team_mapping.created',
    target: {
      workspace_key: workspace.key,
      mapping_id: row.id,
      github_team_id: normalized.githubTeamId.toString(),
      github_org_login: normalized.githubOrgLogin,
      github_team_slug: normalized.githubTeamSlug,
      target_type: normalized.targetType,
      target_key: normalized.targetKey,
      role: normalized.role,
      enabled: normalized.enabled,
      priority: normalized.priority,
      provider_installation_id: normalized.providerInstallationId
        ? normalized.providerInstallationId.toString()
        : null,
    },
  });

  return { workspace_key: workspace.key, id: row.id, created: true };
}

export async function patchGithubTeamMappingHandler(
  deps: GithubTeamMappingDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    mappingId: string;
    input: Partial<GithubTeamMappingInput>;
  }
): Promise<{ workspace_key: string; id: string; updated: true }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);

  const current = await deps.prisma.githubTeamMapping.findFirst({
    where: {
      id: args.mappingId,
      workspaceId: workspace.id,
    },
  });
  if (!current) {
    throw new NotFoundError('GitHub team mapping not found.');
  }

  const normalized = await normalizeMappingInput(deps.prisma, workspace.id, {
    providerInstallationId:
      args.input.providerInstallationId !== undefined
        ? args.input.providerInstallationId
        : current.providerInstallationId?.toString() || null,
    githubTeamId: args.input.githubTeamId || current.githubTeamId.toString(),
    githubTeamSlug: args.input.githubTeamSlug || current.githubTeamSlug,
    githubOrgLogin: args.input.githubOrgLogin || current.githubOrgLogin,
    targetType: args.input.targetType || current.targetType,
    targetKey: args.input.targetKey || current.targetKey,
    role: args.input.role || current.role,
    enabled: args.input.enabled ?? current.enabled,
    priority: args.input.priority ?? current.priority,
  });

  const existing = await deps.prisma.githubTeamMapping.findFirst({
    where: {
      workspaceId: workspace.id,
      githubTeamId: normalized.githubTeamId,
      targetType: normalized.targetType,
      targetKey: normalized.targetKey,
      NOT: {
        id: args.mappingId,
      },
    },
    select: { id: true },
  });
  if (existing) {
    throw new ValidationError('A mapping already exists for this team and target.');
  }

  await deps.prisma.githubTeamMapping.update({
    where: { id: args.mappingId },
    data: {
      providerInstallationId: normalized.providerInstallationId,
      githubTeamId: normalized.githubTeamId,
      githubTeamSlug: normalized.githubTeamSlug,
      githubOrgLogin: normalized.githubOrgLogin,
      targetType: normalized.targetType,
      targetKey: normalized.targetKey,
      role: normalized.role,
      enabled: normalized.enabled,
      priority: normalized.priority,
    },
  });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'github.team_mapping.updated',
    target: {
      workspace_key: workspace.key,
      mapping_id: args.mappingId,
      github_team_id: normalized.githubTeamId.toString(),
      github_org_login: normalized.githubOrgLogin,
      github_team_slug: normalized.githubTeamSlug,
      target_type: normalized.targetType,
      target_key: normalized.targetKey,
      role: normalized.role,
      enabled: normalized.enabled,
      priority: normalized.priority,
      provider_installation_id: normalized.providerInstallationId
        ? normalized.providerInstallationId.toString()
        : null,
    },
  });

  return { workspace_key: workspace.key, id: args.mappingId, updated: true };
}

export async function deleteGithubTeamMappingHandler(
  deps: GithubTeamMappingDeps,
  args: {
    auth: AuthContext;
    workspaceKey: string;
    mappingId: string;
  }
): Promise<{ workspace_key: string; id: string; deleted: true }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, args.auth, workspace.id);

  const current = await deps.prisma.githubTeamMapping.findFirst({
    where: {
      id: args.mappingId,
      workspaceId: workspace.id,
    },
  });
  if (!current) {
    throw new NotFoundError('GitHub team mapping not found.');
  }

  await deps.prisma.githubTeamMapping.delete({ where: { id: args.mappingId } });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: args.auth.user.id,
    actorUserEmail: args.auth.user.email,
    action: 'github.team_mapping.deleted',
    target: {
      workspace_key: workspace.key,
      mapping_id: args.mappingId,
      github_team_id: current.githubTeamId.toString(),
      github_org_login: current.githubOrgLogin,
      github_team_slug: current.githubTeamSlug,
      target_type: current.targetType,
      target_key: current.targetKey,
      role: current.role,
    },
  });

  return { workspace_key: workspace.key, id: args.mappingId, deleted: true };
}

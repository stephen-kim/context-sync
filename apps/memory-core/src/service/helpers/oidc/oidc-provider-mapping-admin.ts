import type {
  OidcClaimGroupsFormat,
  OidcGroupMappingRole,
  OidcGroupMappingTargetType,
} from '@prisma/client';
import { assertWorkspaceAdmin } from '../../access-control.js';
import { normalizeReason } from '../../audit-utils.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import { assertGroupMappingRole, normalizeIssuer, type OidcAdminDeps } from './oidc-types.js';

export async function listOidcProvidersHandler(
  deps: OidcAdminDeps,
  args: { workspaceKey: string }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, deps.auth, workspace.id);

  const providers = await deps.prisma.oidcProvider.findMany({
    where: { workspaceId: workspace.id },
    orderBy: [{ createdAt: 'asc' }],
  });

  return {
    providers: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      issuer_url: provider.issuerUrl,
      client_id: provider.clientId,
      client_secret_configured: Boolean(provider.clientSecret),
      discovery_enabled: provider.discoveryEnabled,
      scopes: provider.scopes,
      claim_groups_name: provider.claimGroupsName,
      claim_groups_format: provider.claimGroupsFormat,
      enabled: provider.enabled,
      created_at: provider.createdAt,
      updated_at: provider.updatedAt,
    })),
  };
}

export async function upsertOidcProviderHandler(
  deps: OidcAdminDeps,
  args: {
    workspaceKey: string;
    providerId?: string;
    input: {
      name?: string;
      issuer_url?: string;
      client_id?: string;
      client_secret?: string;
      discovery_enabled?: boolean;
      scopes?: string;
      claim_groups_name?: string;
      claim_groups_format?: OidcClaimGroupsFormat;
      enabled?: boolean;
      reason?: string;
    };
  }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, deps.auth, workspace.id);
  const reason = normalizeReason(args.input.reason);

  if (!args.providerId) {
    if (!args.input.name?.trim()) {
      throw new ValidationError('name is required');
    }
    if (!args.input.issuer_url?.trim()) {
      throw new ValidationError('issuer_url is required');
    }
    if (!args.input.client_id?.trim()) {
      throw new ValidationError('client_id is required');
    }
    if (!args.input.client_secret?.trim()) {
      throw new ValidationError('client_secret is required');
    }

    const provider = await deps.prisma.oidcProvider.create({
      data: {
        workspaceId: workspace.id,
        name: args.input.name.trim(),
        issuerUrl: normalizeIssuer(args.input.issuer_url),
        clientId: args.input.client_id.trim(),
        clientSecret: args.input.client_secret.trim(),
        discoveryEnabled: args.input.discovery_enabled ?? true,
        scopes: (args.input.scopes || 'openid profile email').trim(),
        claimGroupsName: (args.input.claim_groups_name || 'groups').trim(),
        claimGroupsFormat: args.input.claim_groups_format ?? 'id',
        enabled: args.input.enabled ?? true,
      },
    });

    await deps.recordAudit({
      workspaceId: workspace.id,
      workspaceKey: workspace.key,
      actorUserId: deps.auth.user.id,
      actorUserEmail: deps.auth.user.email,
      action: 'oidc_provider.create',
      target: {
        workspace_key: workspace.key,
        provider_id: provider.id,
        reason,
        claim_groups_name: provider.claimGroupsName,
        claim_groups_format: provider.claimGroupsFormat,
      },
    });

    return {
      id: provider.id,
      name: provider.name,
      issuer_url: provider.issuerUrl,
      client_id: provider.clientId,
      client_secret_configured: true,
      discovery_enabled: provider.discoveryEnabled,
      scopes: provider.scopes,
      claim_groups_name: provider.claimGroupsName,
      claim_groups_format: provider.claimGroupsFormat,
      enabled: provider.enabled,
      created_at: provider.createdAt,
      updated_at: provider.updatedAt,
    };
  }

  const current = await deps.prisma.oidcProvider.findFirst({
    where: {
      id: args.providerId,
      workspaceId: workspace.id,
    },
  });
  if (!current) {
    throw new NotFoundError(`OIDC provider not found: ${args.providerId}`);
  }

  const updated = await deps.prisma.oidcProvider.update({
    where: { id: current.id },
    data: {
      name: args.input.name?.trim(),
      issuerUrl: args.input.issuer_url ? normalizeIssuer(args.input.issuer_url) : undefined,
      clientId: args.input.client_id?.trim(),
      clientSecret: args.input.client_secret?.trim() || undefined,
      discoveryEnabled: args.input.discovery_enabled,
      scopes: args.input.scopes?.trim(),
      claimGroupsName: args.input.claim_groups_name?.trim(),
      claimGroupsFormat: args.input.claim_groups_format,
      enabled: args.input.enabled,
    },
  });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: deps.auth.user.id,
    actorUserEmail: deps.auth.user.email,
    action: 'oidc_provider.update',
    target: {
      workspace_key: workspace.key,
      provider_id: updated.id,
      reason,
      enabled: updated.enabled,
      claim_groups_name: updated.claimGroupsName,
      claim_groups_format: updated.claimGroupsFormat,
    },
  });

  return {
    id: updated.id,
    name: updated.name,
    issuer_url: updated.issuerUrl,
    client_id: updated.clientId,
    client_secret_configured: Boolean(updated.clientSecret),
    discovery_enabled: updated.discoveryEnabled,
    scopes: updated.scopes,
    claim_groups_name: updated.claimGroupsName,
    claim_groups_format: updated.claimGroupsFormat,
    enabled: updated.enabled,
    created_at: updated.createdAt,
    updated_at: updated.updatedAt,
  };
}

export async function listOidcGroupMappingsHandler(
  deps: OidcAdminDeps,
  args: { workspaceKey: string; providerId?: string }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, deps.auth, workspace.id);

  const mappings = await deps.prisma.oidcGroupMapping.findMany({
    where: {
      workspaceId: workspace.id,
      providerId: args.providerId,
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });

  return {
    mappings: mappings.map((mapping) => ({
      id: mapping.id,
      provider_id: mapping.providerId,
      claim_name: mapping.claimName,
      group_id: mapping.groupId,
      group_display_name: mapping.groupDisplayName,
      target_type: mapping.targetType,
      target_key: mapping.targetKey,
      role: mapping.role,
      priority: mapping.priority,
      enabled: mapping.enabled,
      created_at: mapping.createdAt,
      updated_at: mapping.updatedAt,
    })),
  };
}

export async function upsertOidcGroupMappingHandler(
  deps: OidcAdminDeps,
  args: {
    workspaceKey: string;
    mappingId?: string;
    input: {
      provider_id: string;
      claim_name?: string;
      group_id?: string;
      group_display_name?: string;
      target_type?: OidcGroupMappingTargetType;
      target_key?: string;
      role?: OidcGroupMappingRole;
      priority?: number;
      enabled?: boolean;
      reason?: string;
    };
  }
) {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, deps.auth, workspace.id);
  const reason = normalizeReason(args.input.reason);

  const provider = await deps.prisma.oidcProvider.findFirst({
    where: {
      id: args.input.provider_id,
      workspaceId: workspace.id,
    },
  });
  if (!provider) {
    throw new NotFoundError(`OIDC provider not found: ${args.input.provider_id}`);
  }

  if (!args.mappingId) {
    if (!args.input.group_id?.trim()) {
      throw new ValidationError('group_id is required');
    }
    if (!args.input.group_display_name?.trim()) {
      throw new ValidationError('group_display_name is required');
    }
    if (!args.input.target_type) {
      throw new ValidationError('target_type is required');
    }
    if (!args.input.target_key?.trim()) {
      throw new ValidationError('target_key is required');
    }
    if (!args.input.role) {
      throw new ValidationError('role is required');
    }
    assertGroupMappingRole(args.input.target_type, args.input.role);

    const mapping = await deps.prisma.oidcGroupMapping.create({
      data: {
        workspaceId: workspace.id,
        providerId: provider.id,
        claimName: (args.input.claim_name || provider.claimGroupsName || 'groups').trim(),
        groupId: args.input.group_id.trim(),
        groupDisplayName: args.input.group_display_name.trim(),
        targetType: args.input.target_type,
        targetKey: args.input.target_key.trim(),
        role: args.input.role,
        priority: args.input.priority ?? 100,
        enabled: args.input.enabled ?? true,
      },
    });

    await deps.recordAudit({
      workspaceId: workspace.id,
      workspaceKey: workspace.key,
      actorUserId: deps.auth.user.id,
      actorUserEmail: deps.auth.user.email,
      action: 'oidc_group_mapping.create',
      target: {
        workspace_key: workspace.key,
        provider_id: mapping.providerId,
        mapping_id: mapping.id,
        reason,
      },
    });

    return {
      id: mapping.id,
      provider_id: mapping.providerId,
      claim_name: mapping.claimName,
      group_id: mapping.groupId,
      group_display_name: mapping.groupDisplayName,
      target_type: mapping.targetType,
      target_key: mapping.targetKey,
      role: mapping.role,
      priority: mapping.priority,
      enabled: mapping.enabled,
      created_at: mapping.createdAt,
      updated_at: mapping.updatedAt,
    };
  }

  const current = await deps.prisma.oidcGroupMapping.findFirst({
    where: {
      id: args.mappingId,
      workspaceId: workspace.id,
    },
  });
  if (!current) {
    throw new NotFoundError(`OIDC group mapping not found: ${args.mappingId}`);
  }

  const nextTargetType = args.input.target_type ?? current.targetType;
  const nextRole = args.input.role ?? current.role;
  assertGroupMappingRole(nextTargetType, nextRole);

  const updated = await deps.prisma.oidcGroupMapping.update({
    where: { id: current.id },
    data: {
      claimName: args.input.claim_name?.trim(),
      groupId: args.input.group_id?.trim(),
      groupDisplayName: args.input.group_display_name?.trim(),
      targetType: args.input.target_type,
      targetKey: args.input.target_key?.trim(),
      role: args.input.role,
      priority: args.input.priority,
      enabled: args.input.enabled,
    },
  });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: deps.auth.user.id,
    actorUserEmail: deps.auth.user.email,
    action: 'oidc_group_mapping.update',
    target: {
      workspace_key: workspace.key,
      provider_id: updated.providerId,
      mapping_id: updated.id,
      reason,
    },
  });

  return {
    id: updated.id,
    provider_id: updated.providerId,
    claim_name: updated.claimName,
    group_id: updated.groupId,
    group_display_name: updated.groupDisplayName,
    target_type: updated.targetType,
    target_key: updated.targetKey,
    role: updated.role,
    priority: updated.priority,
    enabled: updated.enabled,
    created_at: updated.createdAt,
    updated_at: updated.updatedAt,
  };
}

export async function deleteOidcGroupMappingHandler(
  deps: OidcAdminDeps,
  args: { workspaceKey: string; mappingId: string; reason?: string }
): Promise<{ deleted: true }> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, deps.auth, workspace.id);

  const mapping = await deps.prisma.oidcGroupMapping.findFirst({
    where: {
      id: args.mappingId,
      workspaceId: workspace.id,
    },
  });
  if (!mapping) {
    throw new NotFoundError(`OIDC group mapping not found: ${args.mappingId}`);
  }

  await deps.prisma.oidcGroupMapping.delete({ where: { id: mapping.id } });
  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: deps.auth.user.id,
    actorUserEmail: deps.auth.user.email,
    action: 'oidc_group_mapping.delete',
    target: {
      workspace_key: workspace.key,
      mapping_id: mapping.id,
      reason: normalizeReason(args.reason),
    },
  });

  return { deleted: true };
}

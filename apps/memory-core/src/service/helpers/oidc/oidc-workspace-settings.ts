import { OidcSyncMode } from '@prisma/client';
import { assertWorkspaceAccess, assertWorkspaceAdmin } from '../../access-control.js';
import { normalizeReason } from '../../audit-utils.js';
import { getEffectiveWorkspaceSettings } from '../../workspace-resolution.js';
import type { OidcAdminDeps } from './oidc-types.js';

export async function getWorkspaceSsoSettingsHandler(
  deps: OidcAdminDeps,
  args: { workspaceKey: string }
): Promise<{
  workspace_key: string;
  oidc_sync_mode: OidcSyncMode;
  oidc_allow_auto_provision: boolean;
}> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAccess(deps.prisma, deps.auth, workspace.id, 'MEMBER');
  const effective = await getEffectiveWorkspaceSettings(deps.prisma, workspace.id);
  return {
    workspace_key: workspace.key,
    oidc_sync_mode: effective.oidcSyncMode,
    oidc_allow_auto_provision: effective.oidcAllowAutoProvision,
  };
}

export async function updateWorkspaceSsoSettingsHandler(
  deps: OidcAdminDeps,
  args: {
    workspaceKey: string;
    oidcSyncMode?: OidcSyncMode;
    oidcAllowAutoProvision?: boolean;
    reason?: string;
  }
): Promise<{
  workspace_key: string;
  oidc_sync_mode: OidcSyncMode;
  oidc_allow_auto_provision: boolean;
}> {
  const workspace = await deps.getWorkspaceByKey(args.workspaceKey);
  await assertWorkspaceAdmin(deps.prisma, deps.auth, workspace.id);

  const settings = await deps.prisma.workspaceSettings.upsert({
    where: { workspaceId: workspace.id },
    update: {
      oidcSyncMode: args.oidcSyncMode,
      oidcAllowAutoProvision: args.oidcAllowAutoProvision,
    },
    create: {
      workspaceId: workspace.id,
      oidcSyncMode: args.oidcSyncMode ?? OidcSyncMode.add_only,
      oidcAllowAutoProvision: args.oidcAllowAutoProvision ?? true,
    },
    select: {
      oidcSyncMode: true,
      oidcAllowAutoProvision: true,
    },
  });

  await deps.recordAudit({
    workspaceId: workspace.id,
    workspaceKey: workspace.key,
    actorUserId: deps.auth.user.id,
    actorUserEmail: deps.auth.user.email,
    action: 'workspace_settings.oidc.update',
    target: {
      workspace_key: workspace.key,
      oidc_sync_mode: settings.oidcSyncMode,
      oidc_allow_auto_provision: settings.oidcAllowAutoProvision,
      reason: normalizeReason(args.reason),
    },
  });

  return {
    workspace_key: workspace.key,
    oidc_sync_mode: settings.oidcSyncMode,
    oidc_allow_auto_provision: settings.oidcAllowAutoProvision,
  };
}

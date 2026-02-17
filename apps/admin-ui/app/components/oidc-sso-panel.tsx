'use client';

import type { FormEvent } from 'react';
import type { OidcGroupMapping, OidcProvider } from '../lib/types';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from './ui';

type Props = {
  selectedWorkspace: string;
  oidcSyncMode: 'add_only' | 'add_and_remove';
  setOidcSyncMode: (value: 'add_only' | 'add_and_remove') => void;
  oidcAllowAutoProvision: boolean;
  setOidcAllowAutoProvision: (value: boolean) => void;
  saveWorkspaceSsoSettings: () => Promise<void>;

  providers: OidcProvider[];
  selectedProviderId: string;
  setSelectedProviderId: (value: string) => void;
  providerName: string;
  setProviderName: (value: string) => void;
  providerIssuerUrl: string;
  setProviderIssuerUrl: (value: string) => void;
  providerClientId: string;
  setProviderClientId: (value: string) => void;
  providerClientSecret: string;
  setProviderClientSecret: (value: string) => void;
  providerDiscoveryEnabled: boolean;
  setProviderDiscoveryEnabled: (value: boolean) => void;
  providerScopes: string;
  setProviderScopes: (value: string) => void;
  claimGroupsName: string;
  setClaimGroupsName: (value: string) => void;
  claimGroupsFormat: 'id' | 'name';
  setClaimGroupsFormat: (value: 'id' | 'name') => void;
  providerEnabled: boolean;
  setProviderEnabled: (value: boolean) => void;
  saveProvider: (event: FormEvent) => Promise<void>;

  mappings: OidcGroupMapping[];
  mappingClaimName: string;
  setMappingClaimName: (value: string) => void;
  mappingGroupId: string;
  setMappingGroupId: (value: string) => void;
  mappingDisplayName: string;
  setMappingDisplayName: (value: string) => void;
  mappingTargetType: 'workspace' | 'project';
  setMappingTargetType: (value: 'workspace' | 'project') => void;
  mappingTargetKey: string;
  setMappingTargetKey: (value: string) => void;
  mappingRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'MAINTAINER' | 'WRITER' | 'READER';
  setMappingRole: (value: 'OWNER' | 'ADMIN' | 'MEMBER' | 'MAINTAINER' | 'WRITER' | 'READER') => void;
  mappingPriority: string;
  setMappingPriority: (value: string) => void;
  mappingEnabled: boolean;
  setMappingEnabled: (value: boolean) => void;
  createMapping: (event: FormEvent) => Promise<void>;
  patchMapping: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteMapping: (id: string) => Promise<void>;

  reason: string;
  setReason: (value: string) => void;
};

export function OidcSsoPanel(props: Props) {
  const selectedProvider = props.providers.find((provider) => provider.id === props.selectedProviderId) || null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>SSO Settings (OIDC)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="stack gap-4">
          <div className="row">
            <div className="stack gap-1">
              <Label className="muted">Sync mode</Label>
              <Select
                value={props.oidcSyncMode}
                onChange={(event) =>
                  props.setOidcSyncMode(event.target.value as 'add_only' | 'add_and_remove')
                }
              >
                <option value="add_only">add_only</option>
                <option value="add_and_remove">add_and_remove</option>
              </Select>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Auto provision users</Label>
              <Select
                value={props.oidcAllowAutoProvision ? 'true' : 'false'}
                onChange={(event) => props.setOidcAllowAutoProvision(event.target.value === 'true')}
              >
                <option value="true">enabled</option>
                <option value="false">disabled</option>
              </Select>
            </div>
          </div>
          <p className="muted text-xs">
            If your IdP sends group names instead of stable IDs, renaming groups may break mappings.
          </p>

          <div className="toolbar">
            <Button type="button" onClick={() => void props.saveWorkspaceSsoSettings()}>
              Save Workspace SSO Settings
            </Button>
          </div>

          <div className="stack gap-2 rounded-md border border-border p-3">
            <h3 className="text-sm font-semibold">OIDC Provider</h3>
            <form className="stack gap-2" onSubmit={(event) => void props.saveProvider(event)}>
              <div className="row">
                <div className="stack gap-1">
                  <Label className="muted">Select provider</Label>
                  <Select
                    value={props.selectedProviderId}
                    onChange={(event) => props.setSelectedProviderId(event.target.value)}
                  >
                    <option value="">Create new provider</option>
                    {props.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="stack gap-1">
                  <Label className="muted">Claim groups format</Label>
                  <Select
                    value={props.claimGroupsFormat}
                    onChange={(event) => props.setClaimGroupsFormat(event.target.value as 'id' | 'name')}
                  >
                    <option value="id">id (recommended)</option>
                    <option value="name">name</option>
                  </Select>
                </div>
              </div>
              <div className="row">
                <Input
                  placeholder="Provider name"
                  value={props.providerName}
                  onChange={(event) => props.setProviderName(event.target.value)}
                  required
                />
                <Input
                  placeholder="Issuer URL"
                  value={props.providerIssuerUrl}
                  onChange={(event) => props.setProviderIssuerUrl(event.target.value)}
                  required
                />
              </div>
              <div className="row">
                <Input
                  placeholder="Client ID"
                  value={props.providerClientId}
                  onChange={(event) => props.setProviderClientId(event.target.value)}
                  required
                />
                <Input
                  placeholder="Client Secret (leave empty to keep)"
                  value={props.providerClientSecret}
                  onChange={(event) => props.setProviderClientSecret(event.target.value)}
                />
              </div>
              <div className="row">
                <Input
                  placeholder="Scopes"
                  value={props.providerScopes}
                  onChange={(event) => props.setProviderScopes(event.target.value)}
                />
                <Input
                  placeholder="Groups claim name"
                  value={props.claimGroupsName}
                  onChange={(event) => props.setClaimGroupsName(event.target.value)}
                />
              </div>
              <div className="row">
                <Select
                  value={props.providerDiscoveryEnabled ? 'true' : 'false'}
                  onChange={(event) => props.setProviderDiscoveryEnabled(event.target.value === 'true')}
                >
                  <option value="true">Discovery enabled</option>
                  <option value="false">Discovery disabled</option>
                </Select>
                <Select
                  value={props.providerEnabled ? 'true' : 'false'}
                  onChange={(event) => props.setProviderEnabled(event.target.value === 'true')}
                >
                  <option value="true">Provider enabled</option>
                  <option value="false">Provider disabled</option>
                </Select>
              </div>
              <Button type="submit">Save Provider</Button>
            </form>
            {selectedProvider ? (
              <div className="muted text-xs">
                Active provider: <strong>{selectedProvider.name}</strong> • groups claim:{' '}
                <code>{selectedProvider.claim_groups_name}</code>
              </div>
            ) : null}
          </div>

          <div className="stack gap-2 rounded-md border border-border p-3">
            <h3 className="text-sm font-semibold">Group Mappings</h3>
            <form className="stack gap-2" onSubmit={(event) => void props.createMapping(event)}>
              <div className="row">
                <Input
                  placeholder="Claim name (e.g. groups)"
                  value={props.mappingClaimName}
                  onChange={(event) => props.setMappingClaimName(event.target.value)}
                />
                <Input
                  placeholder="Group ID"
                  value={props.mappingGroupId}
                  onChange={(event) => props.setMappingGroupId(event.target.value)}
                  required
                />
                <Input
                  placeholder="Display name"
                  value={props.mappingDisplayName}
                  onChange={(event) => props.setMappingDisplayName(event.target.value)}
                  required
                />
              </div>
              <div className="row">
                <Select
                  value={props.mappingTargetType}
                  onChange={(event) => props.setMappingTargetType(event.target.value as 'workspace' | 'project')}
                >
                  <option value="workspace">workspace</option>
                  <option value="project">project</option>
                </Select>
                <Input
                  placeholder={props.mappingTargetType === 'workspace' ? 'workspace key' : 'project key'}
                  value={props.mappingTargetKey}
                  onChange={(event) => props.setMappingTargetKey(event.target.value)}
                  required
                />
                <Select
                  value={props.mappingRole}
                  onChange={(event) =>
                    props.setMappingRole(
                      event.target.value as
                        | 'OWNER'
                        | 'ADMIN'
                        | 'MEMBER'
                        | 'MAINTAINER'
                        | 'WRITER'
                        | 'READER'
                    )
                  }
                >
                  {props.mappingTargetType === 'workspace' ? (
                    <>
                      <option value="OWNER">OWNER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="MEMBER">MEMBER</option>
                    </>
                  ) : (
                    <>
                      <option value="OWNER">OWNER</option>
                      <option value="MAINTAINER">MAINTAINER</option>
                      <option value="WRITER">WRITER</option>
                      <option value="READER">READER</option>
                    </>
                  )}
                </Select>
              </div>
              <div className="row">
                <Input
                  type="number"
                  min={0}
                  max={100000}
                  value={props.mappingPriority}
                  onChange={(event) => props.setMappingPriority(event.target.value)}
                  placeholder="Priority"
                />
                <Select
                  value={props.mappingEnabled ? 'true' : 'false'}
                  onChange={(event) => props.setMappingEnabled(event.target.value === 'true')}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </Select>
                <Button type="submit">Add Mapping</Button>
              </div>
            </form>

            <div className="stack gap-2">
              {props.mappings.map((mapping) => (
                <div key={mapping.id} className="rounded-md border border-border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{mapping.target_type}</Badge>
                    <span className="text-sm">
                      <strong>{mapping.group_display_name}</strong> ({mapping.group_id}) → {mapping.target_key} /{' '}
                      {mapping.role}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        void props.patchMapping(mapping.id, {
                          enabled: !mapping.enabled,
                        })
                      }
                    >
                      {mapping.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        void props.patchMapping(mapping.id, {
                          priority: Math.max(mapping.priority - 10, 0),
                        })
                      }
                    >
                      Priority -10
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void props.deleteMapping(mapping.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
              {props.mappings.length === 0 ? <p className="muted">No mappings configured.</p> : null}
            </div>
          </div>

          <div className="stack gap-1">
            <Label className="muted">Reason (for audit log)</Label>
            <Input
              value={props.reason}
              onChange={(event) => props.setReason(event.target.value)}
              placeholder="why this SSO setting changed"
            />
          </div>

          <p className="muted text-xs">Workspace: {props.selectedWorkspace || '-'}</p>
        </div>
      </CardContent>
    </Card>
  );
}

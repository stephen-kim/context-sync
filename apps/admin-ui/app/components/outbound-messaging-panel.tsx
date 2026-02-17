'use client';

import type { OutboundIntegrationType, OutboundLocale, OutboundMode, OutboundStyle } from '../lib/types';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Input, Label, Select, Textarea } from './ui';

const LOCALES: OutboundLocale[] = ['en', 'ko', 'ja', 'es', 'zh'];
const INTEGRATIONS: OutboundIntegrationType[] = [
  'slack',
  'jira',
  'confluence',
  'notion',
  'webhook',
  'email',
];

type Props = {
  workspaceDefaultLocale: OutboundLocale;
  setWorkspaceDefaultLocale: (value: OutboundLocale) => void;
  workspaceSupportedLocales: OutboundLocale[];
  setWorkspaceSupportedLocales: (value: OutboundLocale[]) => void;
  outboundSettingsReason: string;
  setOutboundSettingsReason: (value: string) => void;
  saveWorkspaceOutboundSettings: () => Promise<void>;
  selectedIntegration: OutboundIntegrationType;
  setSelectedIntegration: (value: OutboundIntegrationType) => void;
  policyEnabled: boolean;
  setPolicyEnabled: (value: boolean) => void;
  policyMode: OutboundMode;
  setPolicyMode: (value: OutboundMode) => void;
  policyStyle: OutboundStyle;
  setPolicyStyle: (value: OutboundStyle) => void;
  policyLocaleDefault: OutboundLocale;
  setPolicyLocaleDefault: (value: OutboundLocale) => void;
  policySupportedLocales: OutboundLocale[];
  setPolicySupportedLocales: (value: OutboundLocale[]) => void;
  templateOverridesJson: string;
  setTemplateOverridesJson: (value: string) => void;
  llmPromptSystem: string;
  setLlmPromptSystem: (value: string) => void;
  llmPromptUser: string;
  setLlmPromptUser: (value: string) => void;
  outboundPolicyReason: string;
  setOutboundPolicyReason: (value: string) => void;
  saveOutboundPolicy: () => Promise<void>;
};

function toggleLocale(list: OutboundLocale[], locale: OutboundLocale, checked: boolean): OutboundLocale[] {
  if (checked) {
    if (list.includes(locale)) {
      return list;
    }
    return [...list, locale];
  }
  const next = list.filter((item) => item !== locale);
  return next.length > 0 ? next : list;
}

export function OutboundMessagingPanel(props: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Outbound Messaging</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="row">
          <div className="stack gap-1">
            <Label className="muted">Workspace Default Locale</Label>
            <Select
              value={props.workspaceDefaultLocale}
              onChange={(event) => props.setWorkspaceDefaultLocale(event.target.value as OutboundLocale)}
            >
              {LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {locale}
                </option>
              ))}
            </Select>
          </div>
          <div className="stack gap-1">
            <Label className="muted">Reason (audit)</Label>
            <Input
              value={props.outboundSettingsReason}
              onChange={(event) => props.setOutboundSettingsReason(event.target.value)}
              placeholder="why outbound locale defaults changed"
            />
          </div>
        </div>

        <div className="stack gap-2">
          <Label className="muted">Workspace Supported Locales (outbound only)</Label>
          <div className="row">
            {LOCALES.map((locale) => (
              <label key={locale} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
                <Checkbox
                  checked={props.workspaceSupportedLocales.includes(locale)}
                  onCheckedChange={(value) =>
                    props.setWorkspaceSupportedLocales(
                      toggleLocale(props.workspaceSupportedLocales, locale, value === true)
                    )
                  }
                />
                <span>{locale}</span>
              </label>
            ))}
          </div>
          <div>
            <Button type="button" onClick={() => void props.saveWorkspaceOutboundSettings()}>
              Save Workspace Outbound Settings
            </Button>
          </div>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <div className="row items-center">
            <Label className="muted">Integration Policy</Label>
            <div className="flex flex-wrap gap-2">
              {INTEGRATIONS.map((integration) => (
                <button
                  key={integration}
                  type="button"
                  className={`rounded-md border px-2 py-1 text-xs ${
                    props.selectedIntegration === integration
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground'
                  }`}
                  onClick={() => props.setSelectedIntegration(integration)}
                >
                  {integration}
                </button>
              ))}
            </div>
          </div>

          <div className="row mt-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="outbound-policy-enabled"
                checked={props.policyEnabled}
                onCheckedChange={(value) => props.setPolicyEnabled(value === true)}
              />
              <Label htmlFor="outbound-policy-enabled" className="text-sm text-muted-foreground">
                enabled
              </Label>
            </div>
            <Badge>{props.selectedIntegration}</Badge>
          </div>

          <div className="row mt-3">
            <div className="stack gap-1">
              <Label className="muted">Mode</Label>
              <Select
                value={props.policyMode}
                onChange={(event) => props.setPolicyMode(event.target.value as OutboundMode)}
              >
                <option value="template">template</option>
                <option value="llm">llm</option>
              </Select>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Style</Label>
              <Select
                value={props.policyStyle}
                onChange={(event) => props.setPolicyStyle(event.target.value as OutboundStyle)}
              >
                <option value="short">short</option>
                <option value="normal">normal</option>
                <option value="verbose">verbose</option>
              </Select>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Locale Default</Label>
              <Select
                value={props.policyLocaleDefault}
                onChange={(event) => props.setPolicyLocaleDefault(event.target.value as OutboundLocale)}
              >
                {LOCALES.map((locale) => (
                  <option key={locale} value={locale}>
                    {locale}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="stack gap-2 mt-3">
            <Label className="muted">Supported Locales (policy)</Label>
            <div className="row">
              {LOCALES.map((locale) => (
                <label key={locale} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
                  <Checkbox
                    checked={props.policySupportedLocales.includes(locale)}
                    onCheckedChange={(value) =>
                      props.setPolicySupportedLocales(
                        toggleLocale(props.policySupportedLocales, locale, value === true)
                      )
                    }
                  />
                  <span>{locale}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="stack gap-1 mt-3">
            <Label className="muted">Template Overrides JSON (action_key -&gt; locale map)</Label>
            <Textarea
              rows={6}
              value={props.templateOverridesJson}
              onChange={(event) => props.setTemplateOverridesJson(event.target.value)}
              placeholder='{"raw.search":{"en":"Searched for {q}","ko":"{q} 검색 완료"}}'
            />
          </div>

          <div className="stack gap-1 mt-3">
            <Label className="muted">LLM Prompt: System</Label>
            <Textarea
              rows={3}
              value={props.llmPromptSystem}
              onChange={(event) => props.setLlmPromptSystem(event.target.value)}
              placeholder="Optional. Used only when mode=llm."
            />
          </div>
          <div className="stack gap-1 mt-3">
            <Label className="muted">LLM Prompt: User</Label>
            <Textarea
              rows={3}
              value={props.llmPromptUser}
              onChange={(event) => props.setLlmPromptUser(event.target.value)}
              placeholder="Optional. Used only when mode=llm."
            />
          </div>

          <div className="stack gap-1 mt-3">
            <Label className="muted">Reason (audit)</Label>
            <Input
              value={props.outboundPolicyReason}
              onChange={(event) => props.setOutboundPolicyReason(event.target.value)}
              placeholder="why this policy changed"
            />
          </div>

          <div className="mt-3">
            <Button type="button" onClick={() => void props.saveOutboundPolicy()}>
              Save Outbound Policy
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

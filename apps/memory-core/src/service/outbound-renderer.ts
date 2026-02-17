import {
  defaultOutboundLocales,
  defaultOutboundTemplates,
  outboundIntegrationTypeSchema,
  outboundModeSchema,
  outboundStyleSchema,
  type OutboundIntegrationType,
  type OutboundLocale,
  type OutboundMode,
  type OutboundStyle,
} from '@claustrum/shared';

type WorkspaceOutboundSettings = {
  defaultOutboundLocale?: string;
  supportedOutboundLocales?: string[];
};

type OutboundPolicy = {
  localeDefault?: string;
  supportedLocales?: string[];
  mode?: OutboundMode;
  style?: OutboundStyle;
  templateOverrides?: Record<string, unknown>;
  llmPromptSystem?: string | null;
  llmPromptUser?: string | null;
};

function normalizeLocale(input: unknown): OutboundLocale | null {
  const value = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!value) {
    return null;
  }
  return defaultOutboundLocales.includes(value as OutboundLocale) ? (value as OutboundLocale) : null;
}

function normalizeLocaleList(input: unknown, fallback: OutboundLocale[]): OutboundLocale[] {
  if (!Array.isArray(input)) {
    return fallback;
  }
  const values: OutboundLocale[] = [];
  for (const item of input) {
    const locale = normalizeLocale(item);
    if (locale && !values.includes(locale)) {
      values.push(locale);
    }
  }
  return values.length > 0 ? values : fallback;
}

function applyTemplate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    const value = params[key];
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value);
  });
}

function getTemplateFromOverrides(args: {
  overrides: Record<string, unknown> | undefined;
  actionKey: string;
  locale: OutboundLocale;
}): string | null {
  const node = args.overrides?.[args.actionKey];
  if (!node) {
    return null;
  }
  if (typeof node === 'string') {
    return node;
  }
  if (typeof node !== 'object' || Array.isArray(node)) {
    return null;
  }
  const byLocale = node as Record<string, unknown>;
  const localized = byLocale[args.locale];
  if (typeof localized === 'string' && localized.trim()) {
    return localized;
  }
  const english = byLocale.en;
  if (typeof english === 'string' && english.trim()) {
    return english;
  }
  return null;
}

function summarizeParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params).slice(0, 6);
  if (entries.length === 0) {
    return 'no params';
  }
  return entries
    .map(([key, value]) => {
      if (value === null || value === undefined) {
        return `${key}=null`;
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return `${key}=${String(value)}`;
      }
      return `${key}=${JSON.stringify(value)}`;
    })
    .join(', ');
}

export function resolveOutboundLocale(
  workspaceSettings: WorkspaceOutboundSettings,
  policy: OutboundPolicy | null | undefined,
  override?: string
): OutboundLocale {
  const workspaceSupported = normalizeLocaleList(
    workspaceSettings.supportedOutboundLocales,
    [...defaultOutboundLocales]
  );
  const policySupported = normalizeLocaleList(policy?.supportedLocales, workspaceSupported);
  const supportedSet = new Set<OutboundLocale>([...workspaceSupported, ...policySupported]);
  const candidates = [
    normalizeLocale(override),
    normalizeLocale(policy?.localeDefault),
    normalizeLocale(workspaceSettings.defaultOutboundLocale),
    'en' as OutboundLocale,
  ];
  for (const candidate of candidates) {
    if (candidate && supportedSet.has(candidate)) {
      return candidate;
    }
  }
  return 'en';
}

export function renderOutboundMessage(args: {
  integrationType: string;
  actionKey: string;
  params?: Record<string, unknown>;
  locale: OutboundLocale;
  style: OutboundStyle;
  mode: OutboundMode;
  templateOverrides?: Record<string, unknown>;
}): string {
  const integrationParsed = outboundIntegrationTypeSchema.safeParse(args.integrationType);
  const integration = integrationParsed.success ? integrationParsed.data : 'slack';
  const locale = normalizeLocale(args.locale) || 'en';
  const style = outboundStyleSchema.safeParse(args.style).success ? args.style : 'short';
  const mode = outboundModeSchema.safeParse(args.mode).success ? args.mode : 'template';
  const params = args.params || {};

  const overrideTemplate = getTemplateFromOverrides({
    overrides: args.templateOverrides,
    actionKey: args.actionKey,
    locale,
  });
  const localeTemplates =
    defaultOutboundTemplates[locale][integration as OutboundIntegrationType] ||
    defaultOutboundTemplates[locale].slack;
  const englishTemplates =
    defaultOutboundTemplates.en[integration as OutboundIntegrationType] ||
    defaultOutboundTemplates.en.slack;
  const baseTemplate =
    overrideTemplate ||
    localeTemplates?.[args.actionKey] ||
    englishTemplates?.[args.actionKey] ||
    englishTemplates?.['integration.update'] ||
    `${args.actionKey} event`;

  let rendered = applyTemplate(baseTemplate, params).trim();
  if (!rendered) {
    rendered = `${args.actionKey} event`;
  }

  if (mode === 'llm') {
    // LLM mode is reserved for provider-backed generation. We keep deterministic fallback.
    rendered = rendered;
  }

  if (style === 'short') {
    return rendered.length > 160 ? `${rendered.slice(0, 157)}...` : rendered;
  }
  if (style === 'verbose') {
    return `${rendered}\nDetails: ${summarizeParams(params)}`;
  }
  return rendered;
}

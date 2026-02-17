import { IntegrationProvider, Prisma } from '@prisma/client';
import type {
  SlackRouteRule,
  SlackSeverity,
  SlackSeverityRule,
} from '../integrations/audit-slack-notifier.js';


export function normalizeIntegrationConfig(
  provider: IntegrationProvider,
  patch: Record<string, unknown>
): Record<string, unknown> {
  if (provider === IntegrationProvider.audit_reasoner) {
    const out: Record<string, unknown> = {};
    const providerOrder = normalizeAuditReasonerOrder(patch.provider_order);
    if (providerOrder.length > 0) {
      out.provider_order = providerOrder;
    }

    for (const providerName of ['openai', 'claude', 'gemini']) {
      const model = normalizeOptionalString(patch[`${providerName}_model`]);
      if (model !== undefined) {
        out[`${providerName}_model`] = model;
      }
      const apiKey = normalizeOptionalString(patch[`${providerName}_api_key`]);
      if (apiKey !== undefined) {
        out[`${providerName}_api_key`] = apiKey;
      }
      const baseUrl = normalizeOptionalString(patch[`${providerName}_base_url`]);
      if (baseUrl !== undefined) {
        out[`${providerName}_base_url`] = baseUrl;
      }
    }
    return out;
  }

  if (provider === IntegrationProvider.slack) {
    const out: Record<string, unknown> = {};
    const webhookUrl = normalizeOptionalString(patch.webhook_url);
    if (webhookUrl !== undefined) {
      out.webhook_url = webhookUrl;
    }
    const defaultChannel = normalizeOptionalString(patch.default_channel);
    if (defaultChannel !== undefined) {
      out.default_channel = defaultChannel;
    }
    if (typeof patch.format === 'string') {
      const format = patch.format.trim().toLowerCase();
      if (format === 'compact' || format === 'detailed') {
        out.format = format;
      }
    }
    const actionPrefixes = normalizeStringArrayPatch(patch.action_prefixes);
    if (actionPrefixes !== undefined) {
      out.action_prefixes = actionPrefixes;
    }
    const routes = normalizeSlackRoutesPatch(patch.routes);
    if (routes !== undefined) {
      out.routes = routes;
    }
    const severityRules = normalizeSlackSeverityRulesPatch(patch.severity_rules);
    if (severityRules !== undefined) {
      out.severity_rules = severityRules;
    }
    if (typeof patch.include_target_json === 'boolean') {
      out.include_target_json = patch.include_target_json;
    }
    if (typeof patch.mask_secrets === 'boolean') {
      out.mask_secrets = patch.mask_secrets;
    }
    return out;
  }

  const triggerKeys = ['write_on_commit', 'write_on_merge'];
  const keys =
    provider === IntegrationProvider.linear
      ? ['api_key', 'api_url', ...triggerKeys]
      : provider === IntegrationProvider.notion
        ? ['token', 'default_parent_page_id', 'write_enabled', ...triggerKeys]
        : ['base_url', 'email', 'api_token', ...triggerKeys];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (!(key in patch)) {
      continue;
    }
    const value = patch[key];
    if (
      key === 'write_on_commit' ||
      key === 'write_on_merge' ||
      (provider === IntegrationProvider.notion && key === 'write_enabled')
    ) {
      if (typeof value === 'boolean') {
        out[key] = value;
      }
      continue;
    }
    if (value === null || value === undefined) {
      out[key] = null;
      continue;
    }
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    out[key] = trimmed || null;
  }
  return out;
}

function normalizeOptionalString(input: unknown): string | null | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (input === null) {
    return null;
  }
  if (typeof input !== 'string') {
    return undefined;
  }
  const trimmed = input.trim();
  return trimmed || null;
}

function normalizeStringArrayPatch(input: unknown): string[] | null | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (input === null) {
    return null;
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(input)) {
    return undefined;
  }
  return input
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSlackRoutesPatch(input: unknown): SlackRouteRule[] | null | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (input === null) {
    return null;
  }
  if (!Array.isArray(input)) {
    return undefined;
  }
  const routes: SlackRouteRule[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const row = item as Record<string, unknown>;
    const actionPrefix = asString(row.action_prefix);
    if (!actionPrefix) {
      continue;
    }
    const route: SlackRouteRule = {
      action_prefix: actionPrefix,
    };
    const channel = asString(row.channel);
    if (channel) {
      route.channel = channel;
    }
    const minSeverity = toSlackSeverity(row.min_severity);
    if (minSeverity) {
      route.min_severity = minSeverity;
    }
    routes.push(route);
  }
  return routes;
}

function normalizeSlackSeverityRulesPatch(
  input: unknown
): SlackSeverityRule[] | null | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (input === null) {
    return null;
  }
  if (!Array.isArray(input)) {
    return undefined;
  }
  const rules: SlackSeverityRule[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const row = item as Record<string, unknown>;
    const actionPrefix = asString(row.action_prefix);
    const severity = toSlackSeverity(row.severity);
    if (!actionPrefix || !severity) {
      continue;
    }
    rules.push({
      action_prefix: actionPrefix,
      severity,
    });
  }
  return rules;
}

function toSlackSeverity(input: unknown): SlackSeverity | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }
  const value = input.trim().toLowerCase();
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value;
  }
  return undefined;
}

function asString(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim() ? input.trim() : undefined;
}

function normalizeAuditReasonerOrder(input: unknown): Array<'openai' | 'claude' | 'gemini'> {
  if (!Array.isArray(input)) {
    return [];
  }
  const out: Array<'openai' | 'claude' | 'gemini'> = [];
  for (const item of input) {
    if (typeof item !== 'string') {
      continue;
    }
    const value = item.trim().toLowerCase();
    if (value !== 'openai' && value !== 'claude' && value !== 'gemini') {
      continue;
    }
    if (!out.includes(value)) {
      out.push(value);
    }
  }
  return out;
}


import type { RawEventType } from '@prisma/client';
import type { AuditReasonerConfig } from '../../integrations/audit-reasoner.js';
import type { AuditReasonerProvider } from '../../config.js';

const REQUEST_TIMEOUT_MS = 15000;
const MAX_MESSAGE_LEN = 2000;
const MAX_FILES = 200;
const MAX_FILES_TEXT_LEN = 4000;

export const DECISION_CLASSIFIER_SYSTEM_PROMPT = [
  'You classify git events into durable engineering decisions.',
  'Return strict JSON only.',
  'Schema:',
  '{"label":"decision|not_decision","confidence":0..1,"summary":"string","reason":["string"],"tags":["string"]}',
  'Rules:',
  '- label=decision only when there is a durable choice (architecture, policy, migration, API contract, deprecation, ownership, process).',
  '- ignore temporary work, experiments, debug/test-only edits.',
  '- summary should be 1-2 concise lines.',
  '- reason should be 1-3 short bullets.',
  '- If label=not_decision, keep summary/reason/tags empty.',
].join('\n');

type ProviderConfig = {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
};

type RawEventForClassification = {
  id: string;
  eventType: RawEventType;
  commitSha?: string | null;
  commitMessage?: string | null;
  branch?: string | null;
  changedFiles: string[];
  metadata?: Record<string, unknown>;
};

export type DecisionLlmClassification = {
  label: 'decision' | 'not_decision';
  confidence: number;
  summary?: string;
  reason: string[];
  tags: string[];
  provider: AuditReasonerProvider;
  model: string;
  raw_text: string;
};

export async function classifyDecisionFromRawEvent(args: {
  config: AuditReasonerConfig;
  event: RawEventForClassification;
}): Promise<DecisionLlmClassification | undefined> {
  const prompt = buildClassifierUserPrompt(args.event);
  for (const provider of dedupeProviders(args.config.providerOrder)) {
    const providerConfig = args.config.providers[provider] as ProviderConfig | undefined;
    const apiKey = (providerConfig?.apiKey || '').trim();
    if (!apiKey) {
      continue;
    }
    const model = (providerConfig?.model || '').trim();
    if (!model) {
      continue;
    }
    try {
      const rawText =
        provider === 'openai'
          ? await classifyWithOpenAi({
              apiKey,
              model,
              baseUrl: providerConfig?.baseUrl,
              prompt,
            })
          : provider === 'claude'
            ? await classifyWithClaude({
                apiKey,
                model,
                baseUrl: providerConfig?.baseUrl,
                prompt,
              })
            : await classifyWithGemini({
                apiKey,
                model,
                baseUrl: providerConfig?.baseUrl,
                prompt,
              });
      const normalized = normalizeClassificationResponse(rawText);
      if (!normalized) {
        continue;
      }
      return {
        ...normalized,
        provider,
        model,
        raw_text: rawText,
      };
    } catch {
      // Keep provider fallback non-blocking.
    }
  }
  return undefined;
}

function buildClassifierUserPrompt(event: RawEventForClassification): string {
  const changedFiles = event.changedFiles.slice(0, MAX_FILES);
  const changedFilesText = truncateText(
    changedFiles.length > 0 ? changedFiles.join('\n') : '(none)',
    MAX_FILES_TEXT_LEN
  );
  const metadataText = truncateText(JSON.stringify(event.metadata || {}, null, 2), 2000);
  return [
    'Classify this git event.',
    '',
    `event_id: ${event.id}`,
    `event_type: ${event.eventType}`,
    `branch: ${event.branch || ''}`,
    `commit_sha: ${event.commitSha || ''}`,
    `commit_message: ${truncateText((event.commitMessage || '').trim(), MAX_MESSAGE_LEN)}`,
    '',
    'changed_files:',
    changedFilesText,
    '',
    'metadata:',
    metadataText,
    '',
    'Return strict JSON only.',
  ].join('\n');
}

function normalizeClassificationResponse(rawText: string): Omit<
  DecisionLlmClassification,
  'provider' | 'model' | 'raw_text'
> | null {
  const parsed = safeParseJsonObject(rawText);
  if (!parsed) {
    return null;
  }
  const labelRaw = String(parsed.label || '')
    .trim()
    .toLowerCase();
  const label = labelRaw === 'decision' ? 'decision' : labelRaw === 'not_decision' ? 'not_decision' : null;
  if (!label) {
    return null;
  }
  const confidenceNumber =
    typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence);
  const confidence = Number.isFinite(confidenceNumber)
    ? Math.min(Math.max(confidenceNumber, 0), 1)
    : 0;

  const summary =
    typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
      ? truncateText(parsed.summary.trim(), 280)
      : undefined;
  const reason = normalizeStringArray(parsed.reason, 3, 220);
  const tags = normalizeStringArray(parsed.tags, 6, 60).map((item) => item.toLowerCase());

  if (label === 'not_decision') {
    return {
      label,
      confidence,
      reason: [],
      tags: [],
    };
  }

  return {
    label,
    confidence,
    summary,
    reason,
    tags,
  };
}

function normalizeStringArray(
  input: unknown,
  maxItems: number,
  maxLen: number
): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') {
      continue;
    }
    const value = item.trim();
    if (!value) {
      continue;
    }
    const trimmed = truncateText(value, maxLen);
    if (!out.includes(trimmed)) {
      out.push(trimmed);
    }
    if (out.length >= maxItems) {
      break;
    }
  }
  return out;
}

function safeParseJsonObject(input: string): Record<string, unknown> | null {
  const direct = tryParseJson(input);
  if (direct) {
    return direct;
  }

  const first = input.indexOf('{');
  const last = input.lastIndexOf('}');
  if (first === -1 || last <= first) {
    return null;
  }
  return tryParseJson(input.slice(first, last + 1));
}

function tryParseJson(input: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(input) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function classifyWithOpenAi(args: {
  model: string;
  apiKey: string;
  baseUrl?: string;
  prompt: string;
}): Promise<string> {
  const endpoint = `${(args.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.1,
      max_tokens: 500,
      messages: [
        { role: 'system', content: DECISION_CLASSIFIER_SYSTEM_PROMPT },
        { role: 'user', content: args.prompt },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return (payload.choices?.[0]?.message?.content || '').trim();
}

async function classifyWithClaude(args: {
  model: string;
  apiKey: string;
  baseUrl?: string;
  prompt: string;
}): Promise<string> {
  const endpoint = `${(args.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': args.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 500,
      temperature: 0.1,
      system: DECISION_CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: args.prompt }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Claude HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return (
    payload.content
      ?.filter((item) => item.type === 'text')
      .map((item) => item.text || '')
      .join('\n')
      .trim() || ''
  );
}

async function classifyWithGemini(args: {
  model: string;
  apiKey: string;
  baseUrl?: string;
  prompt: string;
}): Promise<string> {
  const endpointBase = (args.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(
    /\/+$/,
    ''
  );
  const endpoint = `${endpointBase}/models/${encodeURIComponent(
    args.model
  )}:generateContent?key=${encodeURIComponent(args.apiKey)}`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: DECISION_CLASSIFIER_SYSTEM_PROMPT }],
      },
      contents: [{ role: 'user', parts: [{ text: args.prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 500,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  return (
    payload.candidates?.[0]?.content?.parts?.map((item) => item.text || '').join('\n').trim() || ''
  );
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function dedupeProviders(input: AuditReasonerProvider[]): AuditReasonerProvider[] {
  const out: AuditReasonerProvider[] = [];
  for (const provider of input) {
    if (!out.includes(provider)) {
      out.push(provider);
    }
  }
  return out;
}

function truncateText(input: string, maxLength: number): string {
  return input.length > maxLength ? `${input.slice(0, maxLength - 3)}...` : input;
}

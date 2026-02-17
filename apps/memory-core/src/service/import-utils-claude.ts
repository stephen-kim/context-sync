import { Prisma, ImportSource } from '@prisma/client';
import { parseGenericText, tryParseDate } from './import-utils-core.js';

export type ParsedImportResult = {
  session: {
    sourceSessionId: string;
    title: string;
    startedAt?: Date;
    endedAt?: Date;
    metadata: Record<string, unknown>;
  };
  messages: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown>;
    createdAt?: Date;
  }>;
};


export function parseClaudeExport(
  text: string,
  fallbackSessionId: string,
  fallbackTitle: string
): ParsedImportResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return parseGenericText(text, fallbackSessionId, fallbackTitle, ImportSource.claude);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return parseGenericText(text, fallbackSessionId, fallbackTitle, ImportSource.claude);
  }

  const root =
    parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  const dataRoot =
    root?.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : undefined;

  const messages = extractClaudeMessages(parsed);
  if (messages.length === 0) {
    return parseGenericText(text, fallbackSessionId, fallbackTitle, ImportSource.claude);
  }

  const sourceSessionId =
    tryGetFirstString(root, ['conversation_id', 'session_id', 'id', 'uuid']) ||
    tryGetFirstString(dataRoot, ['conversation_id', 'session_id', 'id', 'uuid']) ||
    `import:${fallbackSessionId}`;
  const title =
    tryGetFirstString(root, ['title', 'name', 'conversation_name']) ||
    tryGetFirstString(dataRoot, ['title', 'name', 'conversation_name']) ||
    fallbackTitle;

  const startedAt =
    tryParseDate(
      tryGetFirstString(root, ['started_at', 'created_at', 'createdAt', 'timestamp'])
    ) ||
    tryParseDate(
      tryGetFirstString(dataRoot, ['started_at', 'created_at', 'createdAt', 'timestamp'])
    );
  const endedAt =
    tryParseDate(
      tryGetFirstString(root, ['ended_at', 'updated_at', 'updatedAt', 'timestamp'])
    ) ||
    tryParseDate(
      tryGetFirstString(dataRoot, ['ended_at', 'updated_at', 'updatedAt', 'timestamp'])
    );

  return {
    session: {
      sourceSessionId,
      title,
      startedAt,
      endedAt,
      metadata: {
        parser: 'claude-json',
        message_count: messages.length,
      },
    },
    messages,
  };
}

function extractClaudeMessages(
  root: unknown
): Array<{
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}> {
  const candidates: unknown[] = [];
  const objectRoot = root && typeof root === 'object' ? (root as Record<string, unknown>) : undefined;

  if (Array.isArray(root)) {
    candidates.push(root);
  }
  if (objectRoot) {
    candidates.push(
      objectRoot.messages,
      objectRoot.chat_messages,
      objectRoot.items,
      objectRoot.conversation
    );
    if (objectRoot.data && typeof objectRoot.data === 'object') {
      const dataRoot = objectRoot.data as Record<string, unknown>;
      candidates.push(dataRoot.messages, dataRoot.chat_messages, dataRoot.items, dataRoot.conversation);
    }
  }

  for (const candidate of candidates) {
    const array = toMessageArray(candidate);
    if (!array) {
      continue;
    }
    const out: Array<{
      role: string;
      content: string;
      metadata?: Record<string, unknown>;
      createdAt?: Date;
    }> = [];
    for (const entry of array) {
      const normalized = toNormalizedMessage(entry);
      if (normalized) {
        out.push(normalized);
      }
    }
    if (out.length > 0) {
      return out;
    }
  }

  return extractConversationMessages(root).map((item) => ({
    role: normalizeImportedRole(item.role),
    content: item.content,
    metadata: {
      ...(item.metadata || {}),
      source: 'claude-fallback',
    },
    createdAt: item.createdAt,
  }));
}

function toMessageArray(value: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const array = value
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as Record<string, unknown>);
  return array.length > 0 ? array : null;
}

function toNormalizedMessage(
  input: Record<string, unknown>
):
  | {
      role: string;
      content: string;
      metadata?: Record<string, unknown>;
      createdAt?: Date;
    }
  | null {
  const entry =
    input.message && typeof input.message === 'object'
      ? (input.message as Record<string, unknown>)
      : input;

  const roleRaw =
    tryGetFirstString(entry, ['role', 'author_role', 'sender', 'actor']) ||
    tryGetFirstString(input, ['role', 'author_role', 'sender', 'actor']) ||
    'user';
  const role = normalizeImportedRole(roleRaw);
  const content = extractContentText(
    entry.content ?? entry.text ?? entry.message ?? entry.parts ?? entry.completion ?? entry.output_text
  );
  if (!content) {
    return null;
  }

  const createdAt = tryParseDate(
    tryGetFirstString(entry, ['created_at', 'createdAt', 'timestamp', 'updated_at'])
  );
  return {
    role,
    content: content.slice(0, 10000),
    metadata: {
      source: 'claude',
    },
    createdAt,
  };
}

function normalizeImportedRole(role: string): string {
  const value = role.trim().toLowerCase();
  if (value === 'human' || value === 'user') {
    return 'user';
  }
  if (value === 'assistant' || value === 'ai' || value === 'model') {
    return 'assistant';
  }
  if (value === 'system') {
    return 'system';
  }
  if (value === 'tool') {
    return 'tool';
  }
  return value || 'user';
}

export function extractConversationMessages(
  root: unknown
): Array<{
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}> {
  const out: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown>;
    createdAt?: Date;
  }> = [];
  const queue: unknown[] = [root];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    const node = current as Record<string, unknown>;

    const role = typeof node.role === 'string' ? node.role : '';
    const content = extractContentText(node.content ?? node.text ?? node.output_text ?? node.input);
    if (role && content) {
      out.push({
        role,
        content: content.slice(0, 10000),
        metadata: {
          extracted: true,
        },
        createdAt: tryParseDate(
          tryGetString(node, 'created_at') || tryGetString(node, 'timestamp')
        ),
      });
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          queue.push(item);
        }
      } else if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return out;
}

function extractContentText(value: unknown): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => extractContentText(entry))
      .filter(Boolean)
      .join('\n')
      .trim();
    return joined;
  }
  if (typeof value === 'object') {
    const node = value as Record<string, unknown>;
    if (typeof node.text === 'string') {
      return node.text.trim();
    }
    if (typeof node.content === 'string') {
      return node.content.trim();
    }
    return extractContentText(node.value ?? node.payload ?? node.message);
  }
  return '';
}

export function tryGetString(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!obj) {
    return undefined;
  }
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

function tryGetFirstString(
  obj: Record<string, unknown> | undefined,
  keys: string[]
): string | undefined {
  if (!obj) {
    return undefined;
  }
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

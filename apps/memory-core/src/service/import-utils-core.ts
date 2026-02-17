import { Prisma, ImportSource } from '@prisma/client';

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


import {
  parseClaudeExport,
  extractConversationMessages,
  tryGetString,
} from './import-utils-claude.js';

export function parseSourceFile(args: {
  source: ImportSource;
  text: string;
  fallbackSessionId: string;
  fallbackTitle: string;
}): ParsedImportResult {
  if (args.source === ImportSource.codex) {
    return parseCodexJsonl(args.text, args.fallbackSessionId, args.fallbackTitle);
  }
  if (args.source === ImportSource.claude) {
    return parseClaudeExport(args.text, args.fallbackSessionId, args.fallbackTitle);
  }
  return parseGenericText(args.text, args.fallbackSessionId, args.fallbackTitle, args.source);
}

export function buildStagedCandidate(projectId: string | null, content: string, role: string) {
  const normalized = content.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length < 24) {
    return null;
  }
  const clipped = normalized.slice(0, 1200);
  const type = classifyMemoryType(clipped);
  return {
    projectId: projectId || undefined,
    type,
    content: clipped,
    metadata: {
      source: 'import-extract',
      role,
    },
  };
}

export function createMemorySnippet(content: string, query: string, maxChars: number): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (!query) {
    return normalized.slice(0, maxChars);
  }
  const lower = normalized.toLowerCase();
  const q = query.toLowerCase();
  const at = lower.indexOf(q);
  if (at < 0) {
    return normalized.slice(0, maxChars);
  }
  const half = Math.floor(maxChars / 2);
  const start = Math.max(0, at - half);
  const end = Math.min(normalized.length, start + maxChars);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalized.length ? '...' : '';
  return `${prefix}${normalized.slice(start, end)}${suffix}`;
}

export function getStringFromJson(input: Prisma.JsonValue | null, key: string): string | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

export function tryParseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

function parseCodexJsonl(
  text: string,
  fallbackSessionId: string,
  fallbackTitle: string
): ParsedImportResult {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  let sessionId: string | undefined;
  let title: string | undefined;
  let startedAt: Date | undefined;
  let endedAt: Date | undefined;
  const messages: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown>;
    createdAt?: Date;
  }> = [];

  for (const line of lines) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const type = typeof entry.type === 'string' ? entry.type : '';
    const payload =
      entry.payload && typeof entry.payload === 'object'
        ? (entry.payload as Record<string, unknown>)
        : undefined;

    if (type === 'session_meta' && payload) {
      const payloadId = tryGetString(payload, 'id');
      const payloadTitle = tryGetString(payload, 'title');
      if (payloadId) {
        sessionId = payloadId;
      }
      if (payloadTitle) {
        title = payloadTitle;
      }
    }

    const entryTs = tryParseDate(
      tryGetString(entry, 'created_at') ||
        tryGetString(entry, 'timestamp') ||
        tryGetString(payload, 'created_at') ||
        tryGetString(payload, 'timestamp')
    );
    if (entryTs) {
      if (!startedAt || entryTs < startedAt) {
        startedAt = entryTs;
      }
      if (!endedAt || entryTs > endedAt) {
        endedAt = entryTs;
      }
    }

    const extracted = extractConversationMessages(entry);
    for (const message of extracted) {
      messages.push(message);
    }
  }

  return {
    session: {
      sourceSessionId: sessionId || `import:${fallbackSessionId}`,
      title: title || fallbackTitle,
      startedAt,
      endedAt,
      metadata: {
        line_count: lines.length,
      },
    },
    messages,
  };
}

export function parseGenericText(
  text: string,
  fallbackSessionId: string,
  fallbackTitle: string,
  source: ImportSource
): ParsedImportResult {
  const chunks = text
    .split(/\n{2,}/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 400);

  const messages = chunks.map((content) => ({
    role: 'user',
    content,
    metadata: {
      source,
    },
  }));

  return {
    session: {
      sourceSessionId: `import:${fallbackSessionId}`,
      title: fallbackTitle,
      metadata: {
        chunk_count: chunks.length,
        parser: 'generic',
      },
    },
    messages,
  };
}

export function classifyMemoryType(content: string): string {
  const lower = content.toLowerCase();
  if (/\b(decide|decision|chose|chosen|we will)\b/.test(lower)) {
    return 'decision';
  }
  if (/\b(constraint|must|cannot|can't|blocked by|limit)\b/.test(lower)) {
    return 'constraint';
  }
  if (/\b(goal|objective|target|want to)\b/.test(lower)) {
    return 'goal';
  }
  if (/\b(problem|issue|bug|error|failing)\b/.test(lower)) {
    return 'problem';
  }
  if (/\b(working on|next|todo|in progress|currently)\b/.test(lower)) {
    return 'active_work';
  }
  return 'note';
}

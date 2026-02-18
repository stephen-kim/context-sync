export type DiffRow = {
  id: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  notes: string[];
  a?: {
    global_rule_ids: string[];
    top_decisions: string[];
    active_work_titles: string[];
    retrieval_ids: string[];
    token_estimate?: number;
    token_breakdown?: Record<string, number>;
  };
  b?: {
    global_rule_ids: string[];
    top_decisions: string[];
    active_work_titles: string[];
    retrieval_ids: string[];
    token_estimate?: number;
    token_breakdown?: Record<string, number>;
  };
};

export function renderDiffHtml(args: {
  title: string;
  generatedAt: string;
  baseRun: string;
  headRun: string;
  rows: DiffRow[];
}): string {
  const escapeHtml = (value: string): string =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  const rowsHtml = args.rows
    .map((row) => {
      const cssClass =
        row.status === 'added'
          ? 'added'
          : row.status === 'removed'
            ? 'removed'
            : row.status === 'changed'
              ? 'changed'
              : 'unchanged';
      return `
      <tr class="${cssClass}">
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.notes.join(', ') || '-')}</td>
        <td>${escapeHtml(String(row.a?.token_estimate ?? '-'))}</td>
        <td>${escapeHtml(String(row.b?.token_estimate ?? '-'))}</td>
      </tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(args.title)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #111827; }
      h1 { margin-bottom: 8px; }
      .meta { color: #4b5563; margin-bottom: 18px; }
      table { border-collapse: collapse; width: 100%; font-size: 14px; }
      th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
      th { background: #f3f4f6; }
      tr.added { background: #ecfdf5; }
      tr.removed { background: #fef2f2; }
      tr.changed { background: #fffbeb; }
      tr.unchanged { background: #ffffff; }
      code { background: #f3f4f6; padding: 1px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(args.title)}</h1>
    <div class="meta">
      <div>Generated: <code>${escapeHtml(args.generatedAt)}</code></div>
      <div>Base: <code>${escapeHtml(args.baseRun)}</code> / Head: <code>${escapeHtml(args.headRun)}</code></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Question ID</th>
          <th>Status</th>
          <th>Notes</th>
          <th>A Tokens</th>
          <th>B Tokens</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </body>
</html>
`;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--' || !token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = 'true';
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.out) {
    return;
  }
  const fs = await import('node:fs');
  const path = await import('node:path');
  const input = JSON.parse(fs.readFileSync(path.resolve(args.input), 'utf8')) as {
    generated_at: string;
    base: string;
    head: string;
    rows: DiffRow[];
  };
  const html = renderDiffHtml({
    title: args.title || 'Context Bundle Diff',
    generatedAt: input.generated_at,
    baseRun: input.base,
    headRun: input.head,
    rows: input.rows || [],
  });
  fs.writeFileSync(path.resolve(args.out), html, 'utf8');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`[eval:render-html] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

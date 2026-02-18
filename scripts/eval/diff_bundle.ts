import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJsonlFile, type BundleJsonlEntry } from './helpers.js';
import { renderDiffHtml, type DiffRow } from './render_diff_html.js';

type BundleShape = {
  global_rule_ids: string[];
  top_decisions: string[];
  active_work_titles: string[];
  retrieval_ids: string[];
  retrieval_scores: Record<string, unknown>;
  token_estimate?: number;
  token_breakdown?: Record<string, number>;
};

type DiffReport = {
  generated_at: string;
  base: string;
  head: string;
  summary: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
  rows: DiffRow[];
};

function toBundleShape(entry: BundleJsonlEntry): BundleShape {
  const bundle = (entry.bundle || {}) as Record<string, unknown>;
  const global = (bundle.global || {}) as Record<string, unknown>;
  const snapshot = (bundle.snapshot || {}) as Record<string, unknown>;
  const retrieval = (bundle.retrieval || {}) as Record<string, unknown>;
  const debug = (bundle.debug || {}) as Record<string, unknown>;
  const tokenBudget = (debug.token_budget || {}) as Record<string, unknown>;
  const allocations = (tokenBudget.allocations || {}) as Record<string, unknown>;

  const workspaceRules = ((global.workspace_rules || []) as Array<Record<string, unknown>>).map((item) =>
    String(item.id || '')
  );
  const userRules = ((global.user_rules || []) as Array<Record<string, unknown>>).map((item) => String(item.id || ''));
  const selectedRouting = ((((global.routing || {}) as Record<string, unknown>).selected_rule_ids || []) as unknown[]).map(
    (item) => String(item || '')
  );
  const globalRuleIds = Array.from(new Set([...workspaceRules, ...userRules, ...selectedRouting].filter(Boolean))).sort();

  const topDecisions = ((snapshot.top_decisions || []) as Array<Record<string, unknown>>).map(
    (item) => `${String(item.id || '')}:${String(item.summary || '').slice(0, 80)}`
  );
  const activeWorkTitles = ((snapshot.active_work || []) as Array<Record<string, unknown>>).map((item) =>
    String(item.title || '')
  );
  const retrievalRows = (retrieval.results || []) as Array<Record<string, unknown>>;
  const retrievalIds = retrievalRows.map((item) => String(item.id || '')).filter(Boolean);

  const retrievalScores: Record<string, unknown> = {};
  for (const row of retrievalRows) {
    const id = String(row.id || '');
    if (!id) {
      continue;
    }
    retrievalScores[id] = row.score_breakdown || {};
  }

  const tokenBreakdown: Record<string, number> = {};
  for (const [key, value] of Object.entries(allocations)) {
    if (typeof value === 'number') {
      tokenBreakdown[key] = value;
    }
  }

  return {
    global_rule_ids: globalRuleIds,
    top_decisions: topDecisions,
    active_work_titles: activeWorkTitles,
    retrieval_ids: retrievalIds,
    retrieval_scores: retrievalScores,
    token_estimate: entry.token_estimate,
    token_breakdown: tokenBreakdown,
  };
}

function equalJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildDiff(baseRows: BundleJsonlEntry[], headRows: BundleJsonlEntry[]): DiffReport {
  const baseMap = new Map(baseRows.map((item) => [item.id, toBundleShape(item)]));
  const headMap = new Map(headRows.map((item) => [item.id, toBundleShape(item)]));
  const ids = Array.from(new Set([...baseMap.keys(), ...headMap.keys()])).sort();

  const rows: DiffRow[] = [];
  for (const id of ids) {
    const a = baseMap.get(id);
    const b = headMap.get(id);
    if (!a && b) {
      rows.push({
        id,
        status: 'added',
        notes: ['new_question_or_output'],
        b,
      });
      continue;
    }
    if (a && !b) {
      rows.push({
        id,
        status: 'removed',
        notes: ['missing_in_head'],
        a,
      });
      continue;
    }

    const notes: string[] = [];
    if (!equalJson(a!.global_rule_ids, b!.global_rule_ids)) {
      notes.push('global_rules_changed');
    }
    if (!equalJson(a!.top_decisions, b!.top_decisions)) {
      notes.push('top_decisions_changed');
    }
    if (!equalJson(a!.active_work_titles, b!.active_work_titles)) {
      notes.push('active_work_changed');
    }
    if (!equalJson(a!.retrieval_ids, b!.retrieval_ids)) {
      notes.push('retrieval_ids_changed');
    }
    if (!equalJson(a!.retrieval_scores, b!.retrieval_scores)) {
      notes.push('retrieval_scores_changed');
    }
    if (!equalJson(a!.token_breakdown, b!.token_breakdown)) {
      notes.push('token_breakdown_changed');
    }
    if ((a!.token_estimate || 0) !== (b!.token_estimate || 0)) {
      notes.push('token_estimate_changed');
    }

    rows.push({
      id,
      status: notes.length > 0 ? 'changed' : 'unchanged',
      notes: notes.length > 0 ? notes : ['stable'],
      a,
      b,
    });
  }

  const summary = {
    added: rows.filter((row) => row.status === 'added').length,
    removed: rows.filter((row) => row.status === 'removed').length,
    changed: rows.filter((row) => row.status === 'changed').length,
    unchanged: rows.filter((row) => row.status === 'unchanged').length,
  };

  return {
    generated_at: new Date().toISOString(),
    base: '',
    head: '',
    summary,
    rows,
  };
}

function markdown(report: DiffReport): string {
  const lines: string[] = [];
  lines.push('# Context Bundle Diff');
  lines.push('');
  lines.push(`- Generated: \`${report.generated_at}\``);
  lines.push(`- Base: \`${report.base}\``);
  lines.push(`- Head: \`${report.head}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Added: **${report.summary.added}**`);
  lines.push(`- Removed: **${report.summary.removed}**`);
  lines.push(`- Changed: **${report.summary.changed}**`);
  lines.push(`- Unchanged: **${report.summary.unchanged}**`);
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push('| id | status | notes | A tokens | B tokens |');
  lines.push('|---|---|---|---:|---:|');
  for (const row of report.rows) {
    lines.push(
      `| ${row.id} | ${row.status} | ${row.notes.join(', ')} | ${row.a?.token_estimate ?? '-'} | ${row.b?.token_estimate ?? '-'} |`
    );
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const aDir = path.resolve(args.a || args.base || '');
  const bDir = path.resolve(args.b || args.head || '');
  if (!aDir || !bDir) {
    throw new Error('Usage: tsx scripts/eval/diff_bundle.ts --a eval/runs/<A> --b eval/runs/<B> [--out-dir <dir>]');
  }

  const outDir = path.resolve(args['out-dir'] || bDir);
  const bundleA = readJsonlFile<BundleJsonlEntry>(path.join(aDir, 'bundle.jsonl'));
  const bundleB = readJsonlFile<BundleJsonlEntry>(path.join(bDir, 'bundle.jsonl'));

  const report = buildDiff(bundleA, bundleB);
  report.base = path.basename(aDir);
  report.head = path.basename(bDir);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'diff.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(outDir, 'diff.md'), markdown(report), 'utf8');
  fs.writeFileSync(
    path.join(outDir, 'diff.html'),
    renderDiffHtml({
      title: 'Context Bundle Diff',
      generatedAt: report.generated_at,
      baseRun: report.base,
      headRun: report.head,
      rows: report.rows,
    }),
    'utf8'
  );

  process.stdout.write(
    `[eval:diff] base=${path.relative(process.cwd(), aDir)} head=${path.relative(process.cwd(), bDir)} changed=${report.summary.changed}\n`
  );
  process.stdout.write(`[eval:diff] output=${outDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`[eval:diff] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

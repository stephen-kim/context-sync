import fs from 'node:fs';
import path from 'node:path';
import {
  type BundleJsonlEntry,
  type EvalConfig,
  type EvalExpected,
  collectBundleTypes,
  estimateKeywordMatches,
  flattenJsonForSearch,
  hasField,
  parseArgs,
  ratio,
  readJsonlFile,
  scoreComponent,
  shortText,
  uniqueLower,
} from './helpers.js';

type JudgeResult = {
  score: number;
  reasons: string[];
  suggestions: string[];
} | null;

export type ScoredCase = {
  id: string;
  category?: string;
  q?: string;
  request_ok: boolean;
  status_code: number;
  token_estimate: number;
  budget: number;
  token_within_budget: boolean;
  score: number;
  passed: boolean;
  judge_score?: number;
  judge_reasons?: string[];
  judge_suggestions?: string[];
  checks: {
    must_types_ok: boolean;
    must_not_types_ok: boolean;
    must_fields_ok: boolean;
    must_keywords_ok: boolean;
  };
  details: {
    seen_types: string[];
    missing_must_types: string[];
    seen_forbidden_types: string[];
    missing_must_fields: string[];
    missing_must_keywords: string[];
    missing_should_keywords: string[];
    missing_should_types: string[];
    keyword_matches: string[];
  };
  output_ref: string;
  error?: string;
};

export type ScoreRun = {
  run_id: string;
  created_at: string;
  totals: {
    total: number;
    passed: number;
    failed: number;
    avg_score: number;
    avg_judge_score?: number;
  };
  judge: {
    enabled: boolean;
    provider?: string;
    skipped_reason?: string;
  };
  cases: ScoredCase[];
};

function buildExpectedMap(config: EvalConfig): Map<string, EvalExpected> {
  return new Map(config.questions.map((item) => [String(item.id), item.expected || {}]));
}

function buildCaseScore(entry: BundleJsonlEntry, expected: EvalExpected): ScoredCase {
  const mustTypes = uniqueLower(expected.must_include_types || []);
  const shouldTypes = uniqueLower(expected.should_include_types || []);
  const mustNotTypes = uniqueLower(expected.must_not_include_types || []);
  const mustKeywords = uniqueLower(expected.must_include_keywords || []);
  const shouldKeywords = uniqueLower(expected.should_include_keywords || []);
  const mustFields = uniqueLower(expected.must_include_fields || []);

  const seenTypes = collectBundleTypes(entry.bundle);
  const flattened = flattenJsonForSearch(entry.bundle);

  const missingMustTypes = mustTypes.filter((item) => !seenTypes.includes(item));
  const seenForbiddenTypes = mustNotTypes.filter((item) => seenTypes.includes(item));
  const missingMustFields = mustFields.filter((item) => !hasField(entry.bundle, item));

  const mustKeywordMatches = estimateKeywordMatches(flattened, mustKeywords);
  const shouldKeywordMatches = estimateKeywordMatches(flattened, shouldKeywords);
  const missingShouldTypes = shouldTypes.filter((item) => !seenTypes.includes(item));

  const tokenWithinBudget = entry.token_estimate <= entry.budget;
  const mustTypesOk = missingMustTypes.length === 0;
  const mustNotTypesOk = seenForbiddenTypes.length === 0;
  const mustFieldsOk = missingMustFields.length === 0;
  const mustKeywordsOk = mustKeywordMatches.missing.length === 0;

  const score =
    scoreComponent(ratio(mustTypes.length - missingMustTypes.length, mustTypes.length), 25) +
    scoreComponent(ratio(mustFields.length - missingMustFields.length, mustFields.length), 15) +
    scoreComponent(ratio(mustKeywords.length - mustKeywordMatches.missing.length, mustKeywords.length), 20) +
    scoreComponent(ratio(mustNotTypes.length - seenForbiddenTypes.length, mustNotTypes.length), 10) +
    scoreComponent(ratio(shouldTypes.length - missingShouldTypes.length, shouldTypes.length), 10) +
    scoreComponent(
      ratio(shouldKeywords.length - shouldKeywordMatches.missing.length, shouldKeywords.length),
      10
    ) +
    (tokenWithinBudget ? 10 : 0);

  const passed =
    entry.request.ok &&
    tokenWithinBudget &&
    mustTypesOk &&
    mustNotTypesOk &&
    mustFieldsOk &&
    mustKeywordsOk;

  return {
    id: entry.id,
    category: entry.category,
    q: entry.q,
    request_ok: entry.request.ok,
    status_code: entry.request.status,
    token_estimate: entry.token_estimate,
    budget: entry.budget,
    token_within_budget: tokenWithinBudget,
    score,
    passed,
    checks: {
      must_types_ok: mustTypesOk,
      must_not_types_ok: mustNotTypesOk,
      must_fields_ok: mustFieldsOk,
      must_keywords_ok: mustKeywordsOk,
    },
    details: {
      seen_types: seenTypes,
      missing_must_types: missingMustTypes,
      seen_forbidden_types: seenForbiddenTypes,
      missing_must_fields: missingMustFields,
      missing_must_keywords: mustKeywordMatches.missing,
      missing_should_keywords: shouldKeywordMatches.missing,
      missing_should_types: missingShouldTypes,
      keyword_matches: [...mustKeywordMatches.matched, ...shouldKeywordMatches.matched],
    },
    output_ref: `bundle.jsonl#${entry.id}`,
    error: entry.request.error,
  };
}

function extractJudgeJson(text: string): { score?: number; reasons?: string[]; suggestions?: string[] } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const snippet = text.slice(start, end + 1);
    try {
      return JSON.parse(snippet) as { score?: number; reasons?: string[]; suggestions?: string[] };
    } catch {
      return {};
    }
  }
  return {};
}

async function llmJudge(
  provider: string,
  apiKey: string,
  input: { q: string; expected: EvalExpected; bundle: Record<string, unknown> }
): Promise<JudgeResult> {
  const prompt = [
    'Evaluate how helpful this context bundle is for the question.',
    'Return JSON only: {"score":1-5,"reasons":["..."],"suggestions":["..."]}',
    `Question: ${input.q || '(none)'}`,
    `Expected hints: ${JSON.stringify(input.expected || {})}`,
    `Bundle summary: ${shortText(JSON.stringify(input.bundle), 3500)}`,
  ].join('\n\n');

  if (provider === 'openai') {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.EVAL_JUDGE_MODEL || 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          { role: 'system', content: 'You are a strict evaluation judge.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!resp.ok) {
      return null;
    }
    const json = (await resp.json()) as Record<string, unknown>;
    const content = String(
      ((((json.choices as unknown[]) || [])[0] as Record<string, unknown>)?.message as Record<string, unknown>)
        ?.content || ''
    );
    const parsed = extractJudgeJson(content);
    if (!parsed.score) {
      return null;
    }
    return {
      score: Math.max(1, Math.min(5, Number(parsed.score))),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3).map(String) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3).map(String) : [],
    };
  }

  if (provider === 'claude') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.EVAL_JUDGE_MODEL || 'claude-3-5-haiku-latest',
        max_tokens: 400,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) {
      return null;
    }
    const json = (await resp.json()) as Record<string, unknown>;
    const contentArr = (json.content || []) as Array<Record<string, unknown>>;
    const content = String((contentArr[0] || {}).text || '');
    const parsed = extractJudgeJson(content);
    if (!parsed.score) {
      return null;
    }
    return {
      score: Math.max(1, Math.min(5, Number(parsed.score))),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3).map(String) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3).map(String) : [],
    };
  }

  if (provider === 'gemini') {
    const model = process.env.EVAL_JUDGE_MODEL || 'gemini-1.5-flash';
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=` +
      encodeURIComponent(apiKey);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { temperature: 0.1 },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    });
    if (!resp.ok) {
      return null;
    }
    const json = (await resp.json()) as Record<string, unknown>;
    const candidates = (json.candidates || []) as Array<Record<string, unknown>>;
    const parts = (((candidates[0] || {}).content as Record<string, unknown>)?.parts || []) as Array<
      Record<string, unknown>
    >;
    const content = String((parts[0] || {}).text || '');
    const parsed = extractJudgeJson(content);
    if (!parsed.score) {
      return null;
    }
    return {
      score: Math.max(1, Math.min(5, Number(parsed.score))),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3).map(String) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3).map(String) : [],
    };
  }

  return null;
}

function markdownReport(args: { run: ScoreRun; topFailCount?: number }): string {
  const topFailCount = args.topFailCount || 5;
  const lines: string[] = [];
  lines.push('# Context Bundle Eval Report');
  lines.push('');
  lines.push(`- Run ID: \`${args.run.run_id}\``);
  lines.push(`- Created At: \`${args.run.created_at}\``);
  lines.push(`- Total: **${args.run.totals.total}**`);
  lines.push(`- Passed: **${args.run.totals.passed}**`);
  lines.push(`- Failed: **${args.run.totals.failed}**`);
  lines.push(`- Avg Score: **${args.run.totals.avg_score.toFixed(2)}**`);
  if (typeof args.run.totals.avg_judge_score === 'number') {
    lines.push(`- Avg Judge Score: **${args.run.totals.avg_judge_score.toFixed(2)} / 5**`);
  }
  lines.push('');
  lines.push('## Cases');
  lines.push('');
  lines.push('| id | status | score | token | notes |');
  lines.push('|---|---:|---:|---:|---|');
  for (const row of args.run.cases) {
    const notes: string[] = [];
    if (!row.request_ok) {
      notes.push(`http:${row.status_code}`);
    }
    if (!row.token_within_budget) {
      notes.push('over_budget');
    }
    if (!row.checks.must_types_ok) {
      notes.push('must_types');
    }
    if (!row.checks.must_fields_ok) {
      notes.push('must_fields');
    }
    if (!row.checks.must_keywords_ok) {
      notes.push('must_keywords');
    }
    if (!row.checks.must_not_types_ok) {
      notes.push('forbidden_types');
    }
    if (typeof row.judge_score === 'number') {
      notes.push(`judge:${row.judge_score}`);
    }
    lines.push(`| ${row.id} | ${row.passed ? 'PASS' : 'FAIL'} | ${row.score.toFixed(2)} | ${row.token_estimate}/${row.budget} | ${notes.join(', ') || '-'} |`);
  }
  lines.push('');

  const failures = args.run.cases
    .filter((row) => !row.passed)
    .sort((a, b) => a.score - b.score)
    .slice(0, topFailCount);
  if (failures.length > 0) {
    lines.push(`## Fail Top ${failures.length}`);
    lines.push('');
    for (const row of failures) {
      lines.push(`### ${row.id}`);
      lines.push('');
      lines.push(`- score: ${row.score.toFixed(2)}`);
      lines.push(`- token: ${row.token_estimate}/${row.budget}`);
      if (row.details.missing_must_types.length > 0) {
        lines.push(`- missing_must_types: ${row.details.missing_must_types.join(', ')}`);
      }
      if (row.details.missing_must_fields.length > 0) {
        lines.push(`- missing_must_fields: ${row.details.missing_must_fields.join(', ')}`);
      }
      if (row.details.missing_must_keywords.length > 0) {
        lines.push(`- missing_must_keywords: ${row.details.missing_must_keywords.join(', ')}`);
      }
      if (row.details.seen_forbidden_types.length > 0) {
        lines.push(`- forbidden_types_present: ${row.details.seen_forbidden_types.join(', ')}`);
      }
      if (row.judge_reasons && row.judge_reasons.length > 0) {
        lines.push(`- judge_reasons: ${row.judge_reasons.join(' | ')}`);
      }
      if (row.judge_suggestions && row.judge_suggestions.length > 0) {
        lines.push(`- judge_suggestions: ${row.judge_suggestions.join(' | ')}`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

export async function scoreBundleRun(args: {
  runId: string;
  runDir: string;
  config: EvalConfig;
  entries: BundleJsonlEntry[];
  enableJudge: boolean;
}): Promise<ScoreRun> {
  const expectedMap = buildExpectedMap(args.config);
  const scored: ScoredCase[] = [];

  const provider = (process.env.EVAL_JUDGE_PROVIDER || '').trim().toLowerCase();
  const judgeApiKey = (process.env.EVAL_JUDGE_API_KEY || '').trim();
  const judgeAvailable = args.enableJudge && Boolean(provider && judgeApiKey);
  const judgeScores: number[] = [];

  for (const entry of args.entries) {
    const expected = expectedMap.get(entry.id) || {};
    const row = buildCaseScore(entry, expected);

    if (judgeAvailable) {
      const judge = await llmJudge(provider, judgeApiKey, {
        q: entry.q || '',
        expected,
        bundle: entry.bundle,
      });
      if (judge) {
        row.judge_score = judge.score;
        row.judge_reasons = judge.reasons;
        row.judge_suggestions = judge.suggestions;
        judgeScores.push(judge.score);
      }
    }

    scored.push(row);
  }

  const total = scored.length;
  const passed = scored.filter((item) => item.passed).length;
  const avgScore = total > 0 ? scored.reduce((sum, item) => sum + item.score, 0) / total : 0;
  const run: ScoreRun = {
    run_id: args.runId,
    created_at: new Date().toISOString(),
    totals: {
      total,
      passed,
      failed: total - passed,
      avg_score: avgScore,
      avg_judge_score:
        judgeScores.length > 0
          ? judgeScores.reduce((sum, item) => sum + item, 0) / judgeScores.length
          : undefined,
    },
    judge: {
      enabled: args.enableJudge,
      provider: judgeAvailable ? provider : undefined,
      skipped_reason: args.enableJudge && !judgeAvailable ? 'missing EVAL_JUDGE_PROVIDER or EVAL_JUDGE_API_KEY' : undefined,
    },
    cases: scored,
  };

  fs.writeFileSync(path.join(args.runDir, 'scores.json'), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(args.runDir, 'report.md'), markdownReport({ run }), 'utf8');
  return run;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runDir = path.resolve(args['run-dir'] || '');
  if (!runDir) {
    throw new Error('Usage: tsx scripts/eval/score_bundle.ts --run-dir eval/runs/<timestamp>');
  }

  const bundlePath = path.join(runDir, 'bundle.jsonl');
  const configPath = path.join(runDir, 'questions.snapshot.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`questions snapshot not found: ${configPath}`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as EvalConfig;
  const entries = readJsonlFile<BundleJsonlEntry>(bundlePath);
  const run = await scoreBundleRun({
    runId: path.basename(runDir),
    runDir,
    config,
    entries,
    enableJudge: args.judge === 'true',
  });
  process.stdout.write(
    `[eval:score] run=${run.run_id} total=${run.totals.total} passed=${run.totals.passed} failed=${run.totals.failed}\n`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`[eval:score] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

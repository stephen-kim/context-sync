import fs from 'node:fs';
import path from 'node:path';
import { estimateTokenCount } from './token_count.ts';
import { scoreBundleRun } from './score_bundle.ts';
import {
  type BundleJsonlEntry,
  callContextBundle,
  defaultQuestionsPath,
  ensureDir,
  loadQuestionsConfig,
  maskSensitive,
  parseArgs,
  runTimestamp,
  sanitizeId,
} from './helpers.js';

async function main(): Promise<void> {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2));

  const baseUrl = (args['base-url'] || process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
  const apiKey = (args['api-key'] || process.env.MEMORY_CORE_API_KEY || '').trim();
  const questionFile = path.resolve(args.questions || defaultQuestionsPath(cwd));
  const limit = Math.max(0, Number(args.limit || 0));
  const withDebug = args.debug === 'true';
  const enableJudge = args.judge === 'true';
  const useMask = args.mask !== 'false';
  const runId = runTimestamp();
  const outDir = path.resolve(args['out-dir'] || path.join(cwd, 'eval', 'runs', runId));

  ensureDir(outDir);

  const loadedConfig = loadQuestionsConfig(questionFile);
  const selectedQuestions = limit > 0 ? loadedConfig.questions.slice(0, limit) : loadedConfig.questions;
  const config = {
    ...loadedConfig,
    questions: selectedQuestions,
  };
  fs.writeFileSync(path.join(outDir, 'questions.snapshot.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  const entries: BundleJsonlEntry[] = [];
  for (const question of selectedQuestions) {
    const id = sanitizeId(question.id || `q-${entries.length + 1}`);
    const workspaceKey = args['workspace-key'] || question.workspace_key || config.defaults?.workspace_key || 'personal';
    const projectKey = args['project-key'] || question.project_key || config.defaults?.project_key || 'default';
    const budget = Math.max(
      300,
      Number(args.budget || question.budget || config.defaults?.budget || 3000)
    );

    const defaultCall = await callContextBundle({
      baseUrl,
      apiKey,
      workspaceKey,
      projectKey,
      q: question.q,
      persona: question.persona,
      currentSubpath: question.current_subpath,
      budget,
      mode: 'default',
    });

    let debugBundle: Record<string, unknown> | undefined;
    if (withDebug) {
      const debugCall = await callContextBundle({
        baseUrl,
        apiKey,
        workspaceKey,
        projectKey,
        q: question.q,
        persona: question.persona,
        currentSubpath: question.current_subpath,
        budget,
        mode: 'debug',
      });
      debugBundle = debugCall.body;
    }

    const savedBundle = useMask ? (maskSensitive(defaultCall.body) as Record<string, unknown>) : defaultCall.body;
    const savedDebug = debugBundle
      ? useMask
        ? (maskSensitive(debugBundle) as Record<string, unknown>)
        : debugBundle
      : undefined;

    const tokenEstimate = estimateTokenCount(JSON.stringify(savedBundle));
    entries.push({
      id,
      category: question.category,
      q: question.q,
      persona: question.persona,
      workspace_key: workspaceKey,
      project_key: projectKey,
      current_subpath: question.current_subpath,
      budget,
      request: {
        base_url: baseUrl,
        mode: 'default',
        status: defaultCall.status,
        ok: defaultCall.ok,
        error: defaultCall.error,
      },
      token_estimate: tokenEstimate,
      bundle: savedBundle,
      debug_bundle: savedDebug,
      created_at: new Date().toISOString(),
    });
  }

  const jsonlPath = path.join(outDir, 'bundle.jsonl');
  const jsonlContent = entries.map((entry) => JSON.stringify(entry)).join('\n');
  fs.writeFileSync(jsonlPath, `${jsonlContent}\n`, 'utf8');

  const scored = await scoreBundleRun({
    runId: path.basename(outDir),
    runDir: outDir,
    config,
    entries,
    enableJudge,
  });

  process.stdout.write(
    `[eval:bundle] run=${scored.run_id} total=${scored.totals.total} passed=${scored.totals.passed} failed=${scored.totals.failed}\n`
  );
  process.stdout.write(`[eval:bundle] output=${outDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`[eval:bundle] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

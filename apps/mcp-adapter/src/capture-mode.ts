import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { detectGitContext } from './git-context.js';
import { detectSubproject } from './monorepo-detection.js';
import type { Logger } from './logger.js';
import type { ResolveResponse, WorkspaceSettingsResponse } from './types.js';

const execFileAsync = promisify(execFile);

type CaptureEventType = 'post_commit' | 'post_merge' | 'post_checkout';

type CaptureDeps = {
  memoryCoreUrl: string;
  memoryCoreApiKey: string;
  defaultWorkspaceKey: string;
  setActiveWorkspaceKey: (workspaceKey: string) => void;
  getWorkspaceSettings: () => Promise<WorkspaceSettingsResponse>;
  resolveProjectFromContext: (
    gitContext: Awaited<ReturnType<typeof detectGitContext>>,
    options: { manualProjectKey?: string; includeMonorepo: boolean }
  ) => Promise<ResolveResponse>;
  requestJson: <T>(
    pathname: string,
    options: { method: 'GET' | 'POST'; body?: Record<string, unknown> }
  ) => Promise<T>;
  ensureGitHooksInstalledForCwd: (workspaceKey: string) => Promise<void>;
  logger: Logger;
};

export async function runCaptureCommand(argv: string[], deps: CaptureDeps): Promise<void> {
  if (!deps.memoryCoreUrl) {
    throw new Error('MEMORY_CORE_URL is required for capture mode.');
  }
  if (!deps.memoryCoreApiKey) {
    throw new Error('MEMORY_CORE_API_KEY is required for capture mode.');
  }

  const options = parseCliOptions(argv);
  const rawEvent = String(options.event || '').trim() as CaptureEventType;
  if (!rawEvent || !['post_commit', 'post_merge', 'post_checkout'].includes(rawEvent)) {
    throw new Error('capture requires --event post_commit|post_merge|post_checkout');
  }

  const workspaceKey =
    String(
      options['workspace-key'] || process.env.MEMORY_CORE_WORKSPACE_KEY || deps.defaultWorkspaceKey
    ).trim() || deps.defaultWorkspaceKey;
  deps.setActiveWorkspaceKey(workspaceKey);

  const workspaceSettings = await deps.getWorkspaceSettings();
  const gitContext = await detectGitContext(process.cwd(), {
    enableMonorepoDetection: false,
  });
  if (!gitContext.repo_root) {
    deps.logger.warn('capture skipped: git repository not detected');
    return;
  }

  if (workspaceSettings.enable_monorepo_resolution === true && gitContext.repo_root && gitContext.cwd) {
    const subpath = await detectSubproject(gitContext.repo_root, gitContext.cwd, {
      monorepoDetectionLevel: workspaceSettings.monorepo_detection_level ?? 2,
      monorepoWorkspaceGlobs: workspaceSettings.monorepo_workspace_globs ?? ['apps/*', 'packages/*'],
      monorepoExcludeGlobs:
        workspaceSettings.monorepo_exclude_globs ??
        ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '.next/**'],
      monorepoRootMarkers:
        workspaceSettings.monorepo_root_markers ??
        ['pnpm-workspace.yaml', 'turbo.json', 'nx.json', 'lerna.json'],
      monorepoMaxDepth: workspaceSettings.monorepo_max_depth ?? 3,
    });
    if (subpath) {
      gitContext.monorepo = {
        enabled: true,
        candidate_subpaths: [subpath],
      };
    }
  }

  const resolved = await deps.resolveProjectFromContext(gitContext, {
    includeMonorepo: Boolean(gitContext.monorepo?.candidate_subpaths?.length),
  });

  const branch = (await safeGitExec(process.cwd(), ['rev-parse', '--abbrev-ref', 'HEAD'])) || undefined;
  const commitSha = (await safeGitExec(process.cwd(), ['rev-parse', 'HEAD'])) || undefined;
  const commitMessage = (await safeGitExec(process.cwd(), ['log', '-1', '--pretty=%s'])) || undefined;
  const changedFiles = await getChangedFiles(process.cwd());
  const fromRef = typeof options['from-ref'] === 'string' ? String(options['from-ref']) : undefined;
  const toRef = typeof options['to-ref'] === 'string' ? String(options['to-ref']) : undefined;
  const fromBranch = fromRef ? await resolveBranchName(process.cwd(), fromRef) : undefined;
  const toBranch = toRef ? await resolveBranchName(process.cwd(), toRef) : branch;

  await deps.requestJson('/v1/raw-events', {
    method: 'POST',
    body: {
      workspace_key: resolved.workspace_key,
      project_key: resolved.project.key,
      event_type: rawEvent,
      branch,
      from_branch: rawEvent === 'post_checkout' ? fromBranch : undefined,
      to_branch: rawEvent === 'post_checkout' ? toBranch : undefined,
      commit_sha: rawEvent === 'post_checkout' ? undefined : commitSha,
      commit_message: rawEvent === 'post_checkout' ? undefined : commitMessage,
      changed_files: changedFiles.length > 0 ? changedFiles : undefined,
      metadata: {
        source: 'git_hook',
        hook_event: rawEvent,
        checkout_flag:
          typeof options['checkout-flag'] === 'string' ? String(options['checkout-flag']) : undefined,
        squash: typeof options.squash === 'string' ? String(options.squash) : undefined,
        repo_root: gitContext.repo_root,
        cwd: gitContext.cwd,
        relative_path: gitContext.relative_path,
        github_remote: gitContext.github_remote?.normalized,
      },
    },
  });
}

export async function runInstallHooksCommand(argv: string[], deps: CaptureDeps): Promise<void> {
  if (!deps.memoryCoreUrl) {
    throw new Error('MEMORY_CORE_URL is required for install-hooks mode.');
  }
  if (!deps.memoryCoreApiKey) {
    throw new Error('MEMORY_CORE_API_KEY is required for install-hooks mode.');
  }
  const options = parseCliOptions(argv);
  const workspaceKey =
    String(
      options['workspace-key'] || process.env.MEMORY_CORE_WORKSPACE_KEY || deps.defaultWorkspaceKey
    ).trim() || deps.defaultWorkspaceKey;
  await deps.ensureGitHooksInstalledForCwd(workspaceKey);
}

function parseCliOptions(argv: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    i += 1;
  }
  return parsed;
}

async function safeGitExec(cwd: string, args: string[]): Promise<string | null> {
  try {
    const result = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000,
    });
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getChangedFiles(cwd: string): Promise<string[]> {
  const output = await safeGitExec(cwd, ['show', '--name-only', '--pretty=format:', 'HEAD']);
  if (!output) {
    return [];
  }
  return output
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2000);
}

async function resolveBranchName(cwd: string, ref: string): Promise<string | undefined> {
  const output = await safeGitExec(cwd, ['name-rev', '--name-only', '--exclude=tags/*', ref]);
  if (!output) {
    return undefined;
  }
  const normalized = output
    .replace(/^remotes\/origin\//, '')
    .replace(/^heads\//, '')
    .replace(/\^0$/, '')
    .trim();
  if (!normalized || normalized === 'undefined') {
    return undefined;
  }
  return normalized;
}

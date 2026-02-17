import * as fsSync from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ProjectProfiler } from '../../project/project-profiler.js';
import { RecallEngine, type RecallSynthesis } from '../../engines/recall-engine.js';
import { RememberEngine } from '../../engines/remember-engine.js';
import { GitHookManager } from '../../git/git-hook-manager.js';
import { logger } from '../../core/logger.js';
import { normalizeProjectKey } from '../../project/project-key.js';
import type { RememberInput } from '../../core/context-layers.js';
import type { ProjectContext } from '../../core/types.js';
import type { Storage } from '../../db/storage.js';
import type { WorkspaceDetector } from '../../project/workspace-detector.js';
import { createNotionHandlers } from '../../integrations/notion-handlers.js';
import type {
  NotionArgs,
  RecallArgs,
  SetProjectArgs,
  ToolResponse,
} from '../types.js';

type CoreToolHandlerDeps = {
  storage: Storage;
  workspaceDetector: WorkspaceDetector;
  getCurrentProjectKey: () => string | null;
  setCurrentProjectKey: (projectKey: string) => void;
  getNotionHandlers: () => ReturnType<typeof createNotionHandlers>;
};

export class CoreToolHandler {
  private readonly storage: Storage;
  private readonly workspaceDetector: WorkspaceDetector;
  private readonly getCurrentProjectKey: () => string | null;
  private readonly setCurrentProjectKey: (projectKey: string) => void;
  private readonly getNotionHandlers: () => ReturnType<typeof createNotionHandlers>;

  constructor(deps: CoreToolHandlerDeps) {
    this.storage = deps.storage;
    this.workspaceDetector = deps.workspaceDetector;
    this.getCurrentProjectKey = deps.getCurrentProjectKey;
    this.setCurrentProjectKey = deps.setCurrentProjectKey;
    this.getNotionHandlers = deps.getNotionHandlers;
  }

  async handleSetProject(args: SetProjectArgs): Promise<ToolResponse> {
    try {
      const keyInput = args.key?.trim();
      if (!keyInput) {
        return {
          content: [{ type: 'text', text: 'Missing required argument: key' }],
          isError: true,
        };
      }

      const key = normalizeProjectKey(keyInput);
      const label = args.label?.trim() || key;
      const metadataInput =
        args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
          ? args.metadata
          : {};
      const metadata = {
        ...metadataInput,
      };
      const enableGitHooks = args.enable_git_hooks === true;

      let workspaceSet = false;
      try {
        this.workspaceDetector.setWorkspace(process.cwd());
        workspaceSet = true;
      } catch (error) {
        logger.warn('Workspace attachment failed', error);
      }

      let profileSummary = '';
      if (workspaceSet) {
        try {
          const analysis = await ProjectProfiler.analyze(process.cwd());
          await this.storage.upsertProjectMetrics({
            projectKey: key,
            linesOfCode: analysis.metrics.linesOfCode,
            fileCount: analysis.metrics.fileCount,
            complexity:
              analysis.metrics.complexity === null || analysis.metrics.complexity === undefined
                ? null
                : String(analysis.metrics.complexity),
            contributors: 0,
            lastCommit: null,
            hotspots: [],
          });
          profileSummary =
            `\nTech stack: ${analysis.techStack.join(', ') || 'unknown'}\n` +
            `Architecture: ${analysis.architecture || 'unknown'}\n` +
            `Metrics: ${analysis.metrics.linesOfCode.toLocaleString()} LOC, ${analysis.metrics.fileCount} files`;
        } catch (error) {
          logger.warn('Project profiling failed', error);
        }
      }

      const project = await this.storage.upsertProject({
        key,
        label,
        path: workspaceSet ? process.cwd() : undefined,
        metadata,
      });
      this.setCurrentProjectKey(project.id);

      const metrics = await this.storage.getProjectMetrics(project.id);
      let response = `Project scope set: ${project.name}\n`;
      response += `Project key: ${project.id}\n`;
      if (workspaceSet) {
        response += `Workspace root: ${process.cwd()}\n`;
      }

      if (enableGitHooks) {
        const hookWorkerPath = this.resolveHookWorkerPath();
        if (!fsSync.existsSync(hookWorkerPath)) {
          response += `Git hooks: skipped (hook worker not found at ${hookWorkerPath})\n`;
        } else {
          const hookManager = new GitHookManager({
            projectPath: process.cwd(),
            projectKey: project.id,
            hookWorkerPath,
            memoryCoreUrl: process.env.MEMORY_CORE_URL,
            memoryCoreApiKey: process.env.MEMORY_CORE_API_KEY,
            memoryCoreWorkspaceKey: process.env.MEMORY_CORE_WORKSPACE_KEY,
          });

          if (!hookManager.isGitRepo()) {
            response += 'Git hooks: skipped (current directory is not a git repository)\n';
          } else {
            const installResult = hookManager.installHooks();
            if (installResult.success) {
              response += `Git hooks: installed (${installResult.installed.join(', ')})\n`;
              if (
                process.env.MEMORY_CORE_URL &&
                process.env.MEMORY_CORE_API_KEY &&
                process.env.MEMORY_CORE_WORKSPACE_KEY
              ) {
                response += 'Git hooks: memory-core forwarding enabled (/v1/git-events).\n';
              } else {
                response +=
                  'Git hooks: memory-core forwarding disabled (set MEMORY_CORE_URL, MEMORY_CORE_API_KEY, MEMORY_CORE_WORKSPACE_KEY).\n';
              }
            } else {
              response += `Git hooks: partial/failed install (${installResult.errors.join('; ')})\n`;
            }
          }
        }
      } else {
        response += 'Git hooks: disabled (default). Pass `enable_git_hooks=true` to install.\n';
      }

      if (metrics) {
        response += `Metrics: ${metrics.linesOfCode.toLocaleString()} LOC, ${metrics.fileCount} files`;
        if (metrics.complexity) {
          response += `, complexity=${metrics.complexity}`;
        }
        response += '\n';
      } else if (profileSummary) {
        response += `${profileSummary}\n`;
      }
      response += 'Use `remember` and `recall` for memory operations.';

      return {
        content: [{ type: 'text', text: response }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Failed to initialize project: ${error.message}` }],
        isError: true,
      };
    }
  }

  async handleRemember(args: RememberInput & { project_key?: string }): Promise<ToolResponse> {
    const scopedProject = await this.resolveProjectScope(args.project_key);
    if (!scopedProject) {
      return {
        content: [
          {
            type: 'text',
            text: 'No project scope selected. Run `set_project({ key })` first or pass `project_key`.',
          },
        ],
        isError: true,
      };
    }

    const { type, content, metadata, project_key } = args;

    try {
      const engine = new RememberEngine(this.storage.getDb(), scopedProject.id, scopedProject.path);
      const result = await engine.remember({ type, content, metadata });

      let response = `Remember ${result.action}: ${type}\n`;
      response += `Project key: ${scopedProject.id}\n`;
      if (project_key) {
        response += 'Scoped via project_key override.\n';
      }
      response += `"${content}"\n`;
      if (result.gitContext) {
        response += `Branch: ${result.gitContext.branch}\n`;
      }
      if (result.fileContext?.files.length) {
        response += `Files: ${result.fileContext.files.map((file) => file.path).join(', ')}\n`;
      }

      return {
        content: [{ type: 'text', text: response }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Failed to remember: ${error.message}` }],
        isError: true,
      };
    }
  }

  async handleRecall(args?: RecallArgs): Promise<ToolResponse> {
    const allProjects = args?.all_projects === true;
    const scopedProject = allProjects ? null : await this.resolveProjectScope(args?.project_key);
    if (!allProjects && !scopedProject) {
      return {
        content: [
          {
            type: 'text',
            text: 'No project scope selected. Run `set_project({ key })` first, pass `project_key`, or use `all_projects=true`.',
          },
        ],
        isError: true,
      };
    }

    const limit = args?.limit || 10;
    const query = args?.query;

    try {
      const engine = new RecallEngine(this.storage.getDb(), scopedProject?.id);
      const synthesis = await engine.recall({
        query,
        limit,
        projectKey: args?.project_key,
        allProjects,
      });

      return {
        content: [
          {
            type: 'text',
            text: this.buildRecallResponse({
              synthesis,
              query,
              allProjects,
              scopedProjectId: scopedProject?.id ?? null,
            }),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Failed to recall: ${error.message}` }],
        isError: true,
      };
    }
  }

  async handleNotion(args: NotionArgs): Promise<ToolResponse> {
    if (!args.action) {
      return {
        content: [
          {
            type: 'text',
            text: ' Missing required parameter: action (must be "search" or "read")',
          },
        ],
        isError: true,
      };
    }

    const notionHandlers = this.getNotionHandlers();
    if (args.action === 'search') {
      if (!args.query) {
        return {
          content: [
            {
              type: 'text',
              text: ' Missing required parameter: query (required for search action)',
            },
          ],
          isError: true,
        };
      }
      return notionHandlers.handleNotionSearch({ query: args.query }) as Promise<ToolResponse>;
    }

    if (args.action === 'read') {
      if (!args.pageId) {
        return {
          content: [
            {
              type: 'text',
              text: ' Missing required parameter: pageId (required for read action)',
            },
          ],
          isError: true,
        };
      }
      return notionHandlers.handleNotionReadPage({ pageId: args.pageId }) as Promise<ToolResponse>;
    }

    return {
      content: [{ type: 'text', text: ` Unknown action: "${args.action}". Use "search" or "read".` }],
      isError: true,
    };
  }

  private async getCurrentProject(): Promise<ProjectContext | null> {
    const currentProjectKey = this.getCurrentProjectKey();
    if (!currentProjectKey) {
      return null;
    }
    return this.storage.getProject(currentProjectKey);
  }

  private async resolveProjectScope(projectKeyOverride?: string): Promise<ProjectContext | null> {
    if (projectKeyOverride && projectKeyOverride.trim()) {
      return this.storage.getProject(projectKeyOverride);
    }
    return this.getCurrentProject();
  }

  private resolveHookWorkerPath(): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(currentDir, '../../hook-event.js'),
      path.resolve(currentDir, '../../hook-event.ts'),
      path.resolve(currentDir, '../../../dist/hook-event.js'),
    ];
    for (const candidate of candidates) {
      if (fsSync.existsSync(candidate)) {
        return candidate;
      }
    }
    return candidates[0];
  }

  private buildRecallResponse(input: {
    synthesis: RecallSynthesis;
    query?: string;
    allProjects: boolean;
    scopedProjectId: string | null;
  }): string {
    const { synthesis, query, allProjects, scopedProjectId } = input;

    let response = 'Context Recall\n';
    response += allProjects
      ? `Scope: all projects (${synthesis.projectKeys.length})\n`
      : `Scope: ${scopedProjectId}\n`;
    if (query) {
      response += `Query: "${query}"\n`;
    }
    response += '\nWhere You Left Off\n';
    response += synthesis.summary;
    response += '\n\n';

    if (synthesis.criticalPath.length > 0) {
      response += 'Critical Path\n';
      synthesis.criticalPath.forEach((step, index) => {
        response += `${index + 1}. ${step}\n`;
      });
      response += '\n';
    }

    const { fresh, recent, stale, expired } = synthesis.freshness;
    const total = fresh + recent + stale + expired;
    if (total > 0) {
      response += 'Freshness: ';
      const parts: string[] = [];
      if (fresh > 0) parts.push(`${fresh} fresh`);
      if (recent > 0) parts.push(`${recent} recent`);
      if (stale > 0) parts.push(`${stale} stale`);
      if (expired > 0) parts.push(`${expired} expired`);
      response += parts.join(', ');
      response += '\n\n';
    }

    if (synthesis.activeWork.length > 0) {
      response += 'Active Work\n';
      synthesis.activeWork.forEach((work: any) => {
        response += `- ${work.content}`;
        if (allProjects) {
          response += ` [${work.projectKey}]`;
        }
        response += '\n';
        if (work.metadata?.files && work.metadata.files.length > 0) {
          response += `  Files: ${work.metadata.files.join(', ')}\n`;
        }
      });
      response += '\n';
    }

    if (synthesis.caveats.length > 0) {
      response += `Tech Debt & Unresolved Issues (${synthesis.caveats.length})\n`;
      synthesis.caveats.forEach((cav: any) => {
        const category = String(cav.metadata?.category || 'workaround').toUpperCase();
        response += `- [${category}] ${cav.content}\n`;
        if (cav.metadata?.attempted) {
          response += `  Attempted: ${cav.metadata.attempted}\n`;
        }
        if (cav.metadata?.recovery) {
          response += `  Recovery: ${cav.metadata.recovery}\n`;
        }
        if (cav.metadata?.action_required) {
          response += `  Action Required: ${cav.metadata.action_required}\n`;
        }
      });
      response += '\n';
    }

    if (synthesis.problems.length > 0) {
      response += 'Open Problems\n';
      synthesis.problems.slice(0, 3).forEach((problem: any) => {
        response += `- ${problem.content}\n`;
      });
      if (synthesis.problems.length > 3) {
        response += `... and ${synthesis.problems.length - 3} more\n`;
      }
      response += '\n';
    }

    if (synthesis.constraints.length > 0) {
      response += 'Constraints\n';
      synthesis.constraints.slice(0, 3).forEach((constraint: any) => {
        response += `- ${constraint.content}\n`;
      });
      response += '\n';
    }

    if (synthesis.goals.length > 0) {
      response += 'Goals\n';
      synthesis.goals.slice(0, 3).forEach((goal: any) => {
        response += `- ${goal.content}`;
        if (goal.metadata?.status) {
          response += ` [${goal.metadata.status}]`;
        }
        response += '\n';
      });
      response += '\n';
    }

    if (synthesis.relationships.size > 0) {
      response += 'Relationships\n';
      let count = 0;
      for (const [decision, files] of synthesis.relationships) {
        if (count >= 2) {
          break;
        }
        response += `- "${decision}" affects: ${files.join(', ')}\n`;
        count += 1;
      }
      response += '\n';
    }

    if (synthesis.gaps.length > 0) {
      response += 'Context Gaps\n';
      synthesis.gaps.forEach((gap) => {
        response += `- ${gap}\n`;
      });
      response += '\n';
    }

    if (synthesis.suggestions.length > 0) {
      response += 'Suggestions\n';
      synthesis.suggestions.forEach((suggestion) => {
        response += `- ${suggestion}\n`;
      });
      response += '\n';
    }

    if (total === 0) {
      response += 'No context stored yet. Use `remember` to add information.';
    }

    return response;
  }
}

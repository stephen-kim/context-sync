import { GitStatusEngine } from '../../git/git-status-engine.js';
import { GitContextEngine } from '../../git/git-context-engine.js';
import { GitIntegration } from '../../git/git-integration.js';
import type { WorkspaceDetector } from '../../project/workspace-detector.js';
import type { GitArgs, ToolResponse } from '../types.js';

type GitToolHandlerDeps = {
  workspaceDetector: WorkspaceDetector;
};

export class GitToolHandler {
  private readonly workspaceDetector: WorkspaceDetector;

  constructor(deps: GitToolHandlerDeps) {
    this.workspaceDetector = deps.workspaceDetector;
  }

  async handleGit(args: GitArgs): Promise<ToolResponse> {
    const { action, ...restArgs } = args;
    switch (action) {
      case 'status':
        return this.handleGitStatus();
      case 'context':
        return this.handleGitContext(restArgs);
      case 'hotspots':
        return this.handleGitHotspots(restArgs.limit);
      case 'coupling':
        return this.handleGitCoupling(restArgs.minCoupling);
      case 'blame':
        if (!restArgs.path) {
          return {
            content: [{ type: 'text', text: ` Missing required parameter 'path' for git blame action.` }],
          };
        }
        return this.handleGitBlame(restArgs.path);
      case 'analysis':
        return this.handleGitAnalysis();
      default:
        return {
          content: [
            {
              type: 'text',
              text: ` Unknown git action: ${action}. Use 'status', 'context', 'hotspots', 'coupling', 'blame', or 'analysis'.`,
            },
          ],
        };
    }
  }

  private async handleGitStatus(): Promise<ToolResponse> {
    const workspace = this.workspaceDetector.getCurrentWorkspace();
    if (!workspace) {
      return {
        content: [{ type: 'text', text: ' No workspace set. Run `set_project` first.' }],
      };
    }

    try {
      const engine = new GitStatusEngine(workspace);
      const result = await engine.getStatus({
        analyzeImpact: true,
        enrichContext: true,
      });

      let response = ' **Git Status**\n\n';
      response += ` Branch: ${result.branch}\n`;
      if (result.ahead > 0) response += ` Ahead: ${result.ahead} commit(s)\n`;
      if (result.behind > 0) response += ` Behind: ${result.behind} commit(s)\n`;
      response += '\n';

      if (result.clean) {
        response += ' Working tree clean';
      } else {
        if (result.changes.staged.length > 0) {
          response += ` **Staged** (${result.changes.staged.length}):\n`;
          result.changes.staged.forEach((change) => {
            response += `   ${change.path}`;
            if (change.category) {
              response += ` [${change.category}]`;
            }
            response += '\n';
          });
        }

        if (result.changes.modified.length > 0) {
          response += `\n **Modified** (${result.changes.modified.length}):\n`;
          result.changes.modified.slice(0, 10).forEach((change) => {
            response += `   ${change.path}`;
            if (change.category) {
              response += ` [${change.category}]`;
            }
            response += '\n';
          });
          if (result.changes.modified.length > 10) {
            response += `  ... and ${result.changes.modified.length - 10} more\n`;
          }
        }

        if (result.changes.untracked.length > 0) {
          response += `\n **Untracked** (${result.changes.untracked.length}):\n`;
          result.changes.untracked.slice(0, 5).forEach((change) => {
            response += `   ${change.path}`;
            if (change.category) {
              response += ` [${change.category}]`;
            }
            response += '\n';
          });
          if (result.changes.untracked.length > 5) {
            response += `  ... and ${result.changes.untracked.length - 5} more\n`;
          }
        }

        if (result.changes.deleted.length > 0) {
          response += `\n  **Deleted** (${result.changes.deleted.length}):\n`;
          result.changes.deleted.forEach((change) => {
            response += `   ${change.path}\n`;
          });
        }
      }

      if (result.summary.totalChanges > 0) {
        response += '\n **Summary:**\n';
        response += ` ${result.summary.totalChanges} total change(s)`;
        if (result.summary.highImpact > 0) {
          response += ` (${result.summary.highImpact} high-impact)`;
        }
        response += '\n';

        if (Object.keys(result.summary.categories).length > 0) {
          const categories = Object.entries(result.summary.categories)
            .map(([category, count]) => `${count} ${category}`)
            .join(', ');
          response += ` Categories: ${categories}\n`;
        }

        if (result.summary.complexity.high > 0) {
          response += ` ${result.summary.complexity.high} complex file(s) changed\n`;
        }
      }

      if (result.changes.staged.length > 0) {
        response += `\n **Commit Readiness:** ${result.commitReadiness.ready ? 'Ready' : 'Review needed'}\n`;
        if (result.commitReadiness.warnings.length > 0) {
          response += '\n  **Warnings:**\n';
          result.commitReadiness.warnings.forEach((warning) => {
            response += `   ${warning}\n`;
          });
        }
        if (result.commitReadiness.suggestions.length > 0) {
          response += '\n **Suggestions:**\n';
          result.commitReadiness.suggestions.forEach((suggestion) => {
            response += `   ${suggestion}\n`;
          });
        }
      }

      return {
        content: [{ type: 'text', text: response }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: ` Git status failed: ${error.message}` }],
      };
    }
  }

  private async handleGitContext(_args?: { staged?: boolean; files?: string[] }): Promise<ToolResponse> {
    const workspace = this.workspaceDetector.getCurrentWorkspace();
    if (!workspace) {
      return {
        content: [{ type: 'text', text: ' No workspace set. Run `set_project` first.' }],
      };
    }

    try {
      const engine = new GitContextEngine(workspace);
      const context = await engine.getContext({
        generateCommitMessage: true,
        analyzeChanges: true,
      });

      let response = ' **Git Context**\n\n';
      response += ` **Current Branch**: ${context.branch}\n`;
      if (context.ahead > 0) response += ` Ahead: ${context.ahead} commit(s)\n`;
      if (context.behind > 0) response += ` Behind: ${context.behind} commit(s)\n`;
      response += '\n';

      if (context.lastCommit) {
        response += ' **Last Commit**:\n';
        response += `   Hash: ${context.lastCommit.hash}\n`;
        response += `   Author: ${context.lastCommit.author}\n`;
        response += `   Date: ${context.lastCommit.date.toLocaleDateString()}\n`;
        response += `   Message: ${context.lastCommit.message}\n\n`;
      }

      const totalChanges = context.stagedFiles.length + context.uncommittedFiles.length;
      if (totalChanges > 0) {
        response += ` **Changes**: ${totalChanges} file(s)\n`;
        if (context.stagedFiles.length > 0) {
          response += `   Staged: ${context.stagedFiles.length}\n`;
        }
        if (context.uncommittedFiles.length > 0) {
          response += `   Uncommitted: ${context.uncommittedFiles.length}\n`;
        }
        response += '\n';
      }

      if (context.changeAnalysis) {
        const analysis = context.changeAnalysis;
        response += ' **Change Analysis**:\n';
        response += `   Files changed: ${analysis.filesChanged}\n`;
        response += `   Insertions: +${analysis.insertions}\n`;
        response += `   Deletions: -${analysis.deletions}\n`;
        if (analysis.primaryCategory) {
          response += `   Primary category: ${analysis.primaryCategory}\n`;
        }
        if (analysis.scope) {
          response += `   Scope: ${analysis.scope}\n`;
        }
        if (Object.keys(analysis.categories).length > 0) {
          const categories = Object.entries(analysis.categories)
            .map(([category, count]) => `${count} ${category}`)
            .join(', ');
          response += `   Categories: ${categories}\n`;
        }
        response += '\n';
      }

      if (context.suggestedCommitMessage) {
        response += ` **Suggested Commit Message**:\n\`\`\`\n${context.suggestedCommitMessage}\n\`\`\`\n\n`;
        response += ' This follows conventional commits format. Edit as needed.';
      } else if (context.stagedFiles.length === 0) {
        response += ' Stage files to get a suggested commit message.';
      }

      return {
        content: [{ type: 'text', text: response }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: ` Git context failed: ${error.message}` }],
      };
    }
  }

  private async handleGitHotspots(limit = 10): Promise<ToolResponse> {
    const workspace = this.workspaceDetector.getCurrentWorkspace();
    if (!workspace) {
      return {
        content: [{ type: 'text', text: ' No workspace set. Run `set_project` first.' }],
      };
    }

    try {
      const git = new GitIntegration(workspace);
      if (!git.isGitRepo()) {
        return {
          content: [{ type: 'text', text: ' Not a git repository' }],
        };
      }

      const hotspots = git.getHotspots(limit);
      if (!hotspots || hotspots.length === 0) {
        return {
          content: [{ type: 'text', text: ' No hotspots found. Repository may be too new or have limited history.' }],
        };
      }

      let response = ' **Git Hotspots - Risk Analysis**\n\n';
      response += 'Files with high change frequency (last 6 months):\n\n';
      for (const spot of hotspots) {
        response += `**${spot.file}** (${spot.risk} risk)\n`;
        response += `   ${spot.changes} changes\n`;
        response += `   Last changed: ${spot.lastChanged}\n\n`;
      }
      response += '\n **Why This Matters:**\n';
      response += ' High churn = complexity or instability\n';
      response += ' Critical/high risk files need extra testing\n';
      response += ' Consider refactoring frequently changed files\n';

      return {
        content: [{ type: 'text', text: response }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: ` Git hotspots failed: ${error.message}` }],
      };
    }
  }

  private async handleGitCoupling(minCoupling = 3): Promise<ToolResponse> {
    const workspace = this.workspaceDetector.getCurrentWorkspace();
    if (!workspace) {
      return {
        content: [{ type: 'text', text: ' No workspace set. Run `set_project` first.' }],
      };
    }

    try {
      const git = new GitIntegration(workspace);
      if (!git.isGitRepo()) {
        return {
          content: [{ type: 'text', text: ' Not a git repository' }],
        };
      }

      const couplings = git.getFileCoupling(minCoupling);
      if (!couplings || couplings.length === 0) {
        return {
          content: [{ type: 'text', text: ` No strong file couplings found (minimum ${minCoupling} co-changes).` }],
        };
      }

      let response = ' **Git Coupling - Hidden Dependencies**\n\n';
      response += 'Files that frequently change together (last 6 months):\n\n';
      for (const coupling of couplings) {
        response += `**${coupling.coupling.toUpperCase()} coupling** (${coupling.timesChanged} together)\n`;
        response += `   ${coupling.fileA}\n`;
        response += `   ${coupling.fileB}\n\n`;
      }
      response += '\n **Why This Matters:**\n';
      response += ' Strong coupling = hidden dependencies\n';
      response += ' Files that change together should maybe be merged\n';
      response += ' Or they need better abstraction/interfaces\n';
      response += ' Use this to find refactoring opportunities\n';

      return {
        content: [{ type: 'text', text: response }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: ` Git coupling failed: ${error.message}` }],
      };
    }
  }

  private async handleGitBlame(filepath: string): Promise<ToolResponse> {
    const workspace = this.workspaceDetector.getCurrentWorkspace();
    if (!workspace) {
      return {
        content: [{ type: 'text', text: ' No workspace set. Run `set_project` first.' }],
      };
    }

    try {
      const git = new GitIntegration(workspace);
      if (!git.isGitRepo()) {
        return {
          content: [{ type: 'text', text: ' Not a git repository' }],
        };
      }

      const ownership = git.getBlame(filepath);
      if (!ownership || ownership.length === 0) {
        return {
          content: [{ type: 'text', text: ` Could not get blame info for ${filepath}. File may not exist or not be tracked.` }],
        };
      }

      let response = ` **Code Ownership - ${filepath}**\n\n`;
      for (const owner of ownership) {
        const barLength = Math.floor(owner.percentage / 5);
        const bar = ''.repeat(barLength) + ''.repeat(20 - barLength);
        response += `**${owner.author}** - ${owner.percentage}%\n`;
        response += `${bar}\n`;
        response += `   ${owner.lines} lines\n`;
        response += `   Last edit: ${owner.lastEdit}\n\n`;
      }

      const primaryOwner = ownership[0];
      response += `\n **Primary Expert:** ${primaryOwner.author} (${primaryOwner.percentage}% ownership)\n`;
      response += "Ask them about this file's architecture and design decisions.\n";

      return {
        content: [{ type: 'text', text: response }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: ` Git blame failed: ${error.message}` }],
      };
    }
  }

  private async handleGitAnalysis(): Promise<ToolResponse> {
    const workspace = this.workspaceDetector.getCurrentWorkspace();
    if (!workspace) {
      return {
        content: [{ type: 'text', text: ' No workspace set. Run `set_project` first.' }],
      };
    }

    try {
      const git = new GitIntegration(workspace);
      if (!git.isGitRepo()) {
        return {
          content: [{ type: 'text', text: ' Not a git repository' }],
        };
      }

      const analysis = git.getAnalysis();
      if (!analysis) {
        return {
          content: [{ type: 'text', text: ' Could not analyze repository' }],
        };
      }

      let response = ' **Git Repository Analysis**\n\n';
      response += ' **Branch Health**\n';
      response += `   Current: ${analysis.branchHealth.current}\n`;
      if (analysis.branchHealth.ahead > 0) {
        response += `   Ahead: ${analysis.branchHealth.ahead} commits\n`;
      }
      if (analysis.branchHealth.behind > 0) {
        response += `   Behind: ${analysis.branchHealth.behind} commits`;
        if (analysis.branchHealth.stale) {
          response += '  STALE - merge main!\n';
        } else {
          response += '\n';
        }
      }
      response += '\n';

      if (analysis.contributors.length > 0) {
        response += ' **Top Contributors** (last 6 months)\n';
        for (const contributor of analysis.contributors.slice(0, 5)) {
          response += `   ${contributor.name} - ${contributor.commits} commits (last: ${contributor.lastCommit})\n`;
        }
        response += '\n';
      }

      if (analysis.hotspots.length > 0) {
        response += ' **Top 5 Hotspots** (high-risk files)\n';
        for (const spot of analysis.hotspots.slice(0, 5)) {
          response += `  ${spot.file} - ${spot.changes} changes\n`;
        }
        response += '\n';
      }

      if (analysis.coupling.length > 0) {
        response += ' **Strongest Couplings** (hidden dependencies)\n';
        for (const coupling of analysis.coupling.slice(0, 5)) {
          response += `   ${coupling.fileA}  ${coupling.fileB} (${coupling.timesChanged} together)\n`;
        }
        response += '\n';
      }

      response += ' **Recommendations:**\n';
      if (analysis.branchHealth.stale) {
        response += `    Merge main branch - you're ${analysis.branchHealth.behind} commits behind\n`;
      }
      if (analysis.hotspots.some((hotspot: any) => hotspot.risk === 'critical')) {
        const criticalFiles = analysis.hotspots.filter((hotspot: any) => hotspot.risk === 'critical');
        response += `    Review ${criticalFiles.length} critical-risk file(s) - consider refactoring\n`;
      }
      if (analysis.coupling.some((coupling: any) => coupling.coupling === 'strong')) {
        const strongCouplings = analysis.coupling.filter((coupling: any) => coupling.coupling === 'strong');
        response += `    ${strongCouplings.length} strong coupling(s) detected - refactor to reduce dependencies\n`;
      }

      return {
        content: [{ type: 'text', text: response }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: ` Git analysis failed: ${error.message}` }],
      };
    }
  }
}

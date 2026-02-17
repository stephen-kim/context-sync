import { ReadFileEngine } from '../../engines/read-file-engine.js';
import { SearchEngine } from '../../engines/search-engine.js';
import { StructureEngine } from '../../engines/structure-engine.js';
import type { WorkspaceDetector } from '../../project/workspace-detector.js';
import type { ReadFileArgs, SearchArgs, StructureArgs, ToolResponse } from '../types.js';

type WorkspaceToolHandlerDeps = {
  workspaceDetector: WorkspaceDetector;
};

export class WorkspaceToolHandler {
  private readonly workspaceDetector: WorkspaceDetector;

  constructor(deps: WorkspaceToolHandlerDeps) {
    this.workspaceDetector = deps.workspaceDetector;
  }

  async handleReadFile(args: ReadFileArgs): Promise<ToolResponse> {
    const workspace = this.workspaceDetector.getCurrentWorkspace();
    if (!workspace) {
      return {
        content: [{ type: 'text', text: ' No workspace set. Run `set_project` first.' }],
      };
    }

    try {
      const engine = new ReadFileEngine(workspace);
      const fileContext = await engine.read(args.path);

      let response = ` **${fileContext.path}**\n\n`;

      response += ' **Metadata**\n';
      response += ` Language: ${fileContext.metadata.language}\n`;
      response += ` Size: ${(fileContext.metadata.size / 1024).toFixed(1)} KB\n`;
      response += ` Lines: ${fileContext.metadata.linesOfCode} LOC\n`;
      response += ` Last Modified: ${fileContext.metadata.lastModified.toLocaleDateString()}\n`;
      if (fileContext.metadata.author) {
        response += ` Last Author: ${fileContext.metadata.author}\n`;
      }
      if (fileContext.metadata.changeFrequency > 0) {
        response += ` Change Frequency: ${fileContext.metadata.changeFrequency} commit(s) in last 30 days\n`;
      }
      response += '\n';

      response += ` **Complexity: ${fileContext.complexity.level}** (score: ${fileContext.complexity.score})\n`;
      if (fileContext.complexity.reasons.length > 0) {
        response += `   ${fileContext.complexity.reasons.join(', ')}\n`;
      }
      response += '\n';

      if (fileContext.relationships.imports.length > 0) {
        response += ` **Imports** (${fileContext.relationships.imports.length}):\n`;
        fileContext.relationships.imports.slice(0, 5).forEach((imp) => {
          response += `    ${imp}\n`;
        });
        if (fileContext.relationships.imports.length > 5) {
          response += `   ... and ${fileContext.relationships.imports.length - 5} more\n`;
        }
        response += '\n';
      }

      if (fileContext.relationships.relatedTests.length > 0) {
        response += ' **Related Tests**:\n';
        fileContext.relationships.relatedTests.forEach((test) => {
          response += `    ${test}\n`;
        });
        response += '\n';
      }

      if (fileContext.relationships.relatedConfigs.length > 0) {
        response += ' **Related Configs**:\n';
        fileContext.relationships.relatedConfigs.forEach((config) => {
          response += `    ${config}\n`;
        });
        response += '\n';
      }

      response += ` **Content**\n\n\`\`\`${fileContext.metadata.language.toLowerCase()}\n${fileContext.content}\n\`\`\``;

      return {
        content: [{ type: 'text', text: response }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: ` Failed to read file: ${error.message}\n\nStack: ${error.stack}` }],
      };
    }
  }

  async handleSearch(args: SearchArgs): Promise<ToolResponse> {
    const workspace = this.workspaceDetector.getCurrentWorkspace();
    if (!workspace) {
      return {
        content: [{ type: 'text', text: ' No workspace set. Run `set_project` first.' }],
      };
    }

    try {
      const { query, type, options = {} } = args;
      const engine = new SearchEngine(workspace);

      if (type === 'files') {
        const result = await engine.searchFiles(query, {
          maxResults: options.maxResults || 50,
          enrichContext: true,
          caseSensitive: options.caseSensitive || false,
        });

        if (result.totalMatches === 0) {
          return {
            content: [{ type: 'text', text: ` No files found matching "${query}"` }],
          };
        }

        let response = ` **Found ${result.totalMatches} files**\n\n`;
        result.matches.slice(0, 20).forEach((match, index) => {
          response += `${index + 1}. ${match.relativePath}`;
          if (match.context) {
            response += ` (${match.context.complexity}`;
            if (match.context.linesOfCode) {
              response += `, ${match.context.linesOfCode} LOC`;
            }
            response += ')';
          }
          response += '\n';
        });

        if (result.totalMatches > 20) {
          response += `\n... and ${result.totalMatches - 20} more matches`;
        }

        if (result.suggestions && result.suggestions.length > 0) {
          response += `\n\n **Suggestions:** ${result.suggestions.join(', ')}`;
        }

        if (result.clusters && Object.keys(result.clusters).length > 1) {
          response += '\n\n **Clustered by directory:**\n';
          Object.entries(result.clusters)
            .slice(0, 5)
            .forEach(([dir, matches]) => {
              response += `   ${dir}: ${matches.length} file(s)\n`;
            });
        }

        return {
          content: [{ type: 'text', text: response }],
        };
      }

      const result = await engine.searchContent(query, {
        maxResults: options.maxResults || 100,
        filePattern: options.filePattern,
        caseSensitive: options.caseSensitive || false,
        regex: options.regex || false,
        enrichContext: false,
      });

      if (result.totalMatches === 0) {
        return {
          content: [{ type: 'text', text: ` No content found matching "${query}"` }],
        };
      }

      let response = ` **Found ${result.totalMatches} matches**\n\n`;
      if (result.clusters) {
        const files = Object.keys(result.clusters).slice(0, 10);
        files.forEach((file) => {
          const matches = result.clusters![file];
          response += ` **${file}** (${matches.length} match${matches.length > 1 ? 'es' : ''})\n`;
          matches.slice(0, 3).forEach((match) => {
            response += `   Line ${match.line}: ${match.text?.trim().substring(0, 100)}\n`;
          });
          if (matches.length > 3) {
            response += `   ... and ${matches.length - 3} more\n`;
          }
          response += '\n';
        });

        if (Object.keys(result.clusters).length > 10) {
          response += `... and ${Object.keys(result.clusters).length - 10} more files\n`;
        }
      }

      return {
        content: [{ type: 'text', text: response }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: ` Search failed: ${error.message}` }],
      };
    }
  }

  async handleStructure(args?: StructureArgs): Promise<ToolResponse> {
    const workspace = this.workspaceDetector.getCurrentWorkspace();
    if (!workspace) {
      return {
        content: [{ type: 'text', text: ' No workspace set. Run `set_project` first.' }],
      };
    }

    try {
      const depth = args?.depth || 3;
      const engine = new StructureEngine(workspace);
      const result = await engine.getStructure(depth, {
        includeMetadata: true,
        analyzeComplexity: true,
        detectHotspots: true,
      });

      let response = ' **Project Structure**\n\n';
      response += `\`\`\`\n${result.tree}\`\`\`\n\n`;

      response += ' **Summary**\n';
      response += ` ${result.summary.totalFiles} files, ${result.summary.totalDirectories} directories\n`;
      if (result.summary.totalLOC > 0) {
        response += ` ${result.summary.totalLOC.toLocaleString()} lines of code\n`;
      }
      response += ` ${(result.summary.totalSize / (1024 * 1024)).toFixed(2)} MB total size\n`;

      if (Object.keys(result.summary.languages).length > 0) {
        const languages = Object.entries(result.summary.languages)
          .sort(([, left], [, right]) => right - left)
          .map(([lang]) => lang)
          .slice(0, 3)
          .join(', ');
        response += ` Languages: ${languages}\n`;
      }

      if (result.summary.architecturePattern) {
        response += `\n **Architecture:** ${result.summary.architecturePattern}\n`;
      }

      if (result.summary.hotspots && result.summary.hotspots.length > 0) {
        response += '\n **Hotspots** (high complexity areas):\n';
        result.summary.hotspots.forEach((hotspot, index) => {
          response += `${index + 1}. ${hotspot.path} - ${hotspot.reason} (${hotspot.loc.toLocaleString()} LOC)\n`;
        });
      }

      if (result.insights && result.insights.length > 0) {
        response += '\n **Insights**\n';
        result.insights.forEach((insight) => {
          response += ` ${insight}\n`;
        });
      }

      return {
        content: [{ type: 'text', text: response }],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: ` Failed to get structure: ${error.message}` }],
      };
    }
  }
}

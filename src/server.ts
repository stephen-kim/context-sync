/**
 * Claustrum MCP Server
 * Keep this file as an orchestrator and delegate tool logic to handler modules.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Storage } from './db/storage.js';
import { ProjectDetector } from './project/project-detector.js';
import { WorkspaceDetector } from './project/workspace-detector.js';
import { CORE_TOOLS } from './core/core-tools.js';
import { NotionIntegration } from './integrations/notion-integration.js';
import { createNotionHandlers } from './integrations/notion-handlers.js';
import { logger } from './core/logger.js';
import {
  MCP_PROMPTS,
  MCP_RESOURCES,
  getPromptText,
  getResourceText,
} from './server-docs.js';
import { CoreToolHandler } from './server/handlers/core-tool-handler.js';
import { WorkspaceToolHandler } from './server/handlers/workspace-tool-handler.js';
import { GitToolHandler } from './server/handlers/git-tool-handler.js';
import type {
  GitArgs,
  NotionArgs,
  PromptRequest,
  ReadFileArgs,
  RecallArgs,
  ResourceRequest,
  SearchArgs,
  SetProjectArgs,
  StructureArgs,
  ToolCallRequest,
} from './server/types.js';

export class ContextSyncServer {
  private readonly server: Server;
  private readonly storage: Storage;
  private readonly projectDetector: ProjectDetector;
  private readonly workspaceDetector: WorkspaceDetector;

  private notionIntegration: NotionIntegration | null = null;
  private notionHandlers: ReturnType<typeof createNotionHandlers>;
  private currentProjectKey: string | null = null;

  private readonly coreToolHandler: CoreToolHandler;
  private readonly workspaceToolHandler: WorkspaceToolHandler;
  private readonly gitToolHandler: GitToolHandler;

  constructor() {
    this.storage = new Storage();
    this.projectDetector = new ProjectDetector(this.storage);
    this.workspaceDetector = new WorkspaceDetector(this.storage, this.projectDetector);

    this.notionHandlers = createNotionHandlers(null);
    this.initializeNotion();

    this.coreToolHandler = new CoreToolHandler({
      storage: this.storage,
      workspaceDetector: this.workspaceDetector,
      getCurrentProjectKey: () => this.currentProjectKey,
      setCurrentProjectKey: (projectKey: string) => {
        this.currentProjectKey = projectKey;
      },
      getNotionHandlers: () => this.notionHandlers,
    });
    this.workspaceToolHandler = new WorkspaceToolHandler({
      workspaceDetector: this.workspaceDetector,
    });
    this.gitToolHandler = new GitToolHandler({
      workspaceDetector: this.workspaceDetector,
    });

    this.server = new Server(
      {
        name: 'claustrum',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  private async initializeNotion(): Promise<void> {
    try {
      const configPath = path.join(os.homedir(), '.claustrum', 'config.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);

      if (config.notion?.token) {
        this.notionIntegration = new NotionIntegration({
          token: config.notion.token,
          defaultParentPageId: config.notion.defaultParentPageId,
        });
      }
    } catch {
      this.notionIntegration = null;
    }

    this.notionHandlers = createNotionHandlers(this.notionIntegration);
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: CORE_TOOLS,
    }));

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [...MCP_PROMPTS],
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request: PromptRequest) => {
      const { name } = request.params;
      const text = getPromptText(name);
      if (!text) {
        throw new Error(`Unknown prompt: ${name}`);
      }
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text,
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [...MCP_RESOURCES],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: ResourceRequest) => {
      const { uri } = request.params;
      const text = getResourceText(uri);
      if (!text) {
        throw new Error(`Unknown resource: ${uri}`);
      }
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text,
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: ToolCallRequest) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'set_project':
          return this.coreToolHandler.handleSetProject(args as SetProjectArgs);
        case 'remember':
          return this.coreToolHandler.handleRemember(args as any);
        case 'recall':
          return this.coreToolHandler.handleRecall(args as RecallArgs);
        case 'read_file':
          return this.workspaceToolHandler.handleReadFile(args as ReadFileArgs);
        case 'search':
          return this.workspaceToolHandler.handleSearch(args as SearchArgs);
        case 'structure':
          return this.workspaceToolHandler.handleStructure(args as StructureArgs);
        case 'git':
          return this.gitToolHandler.handleGit(args as GitArgs);
        case 'notion':
          return this.coreToolHandler.handleNotion(args as NotionArgs);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async run(): Promise<void> {
    await this.storage.ensureSchemaIsReady();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  close(): void {
    this.storage.close().catch((error) => {
      logger.warn('Failed to close storage cleanly', error);
    });
  }
}

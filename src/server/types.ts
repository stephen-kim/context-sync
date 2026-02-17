export type PromptRequest = { params: { name: string } };
export type ResourceRequest = { params: { uri: string } };
export type ToolCallRequest = { params: { name: string; arguments?: unknown } };

export type ToolTextContent = {
  type: 'text';
  text: string;
};

export type ToolResponse = {
  content: ToolTextContent[];
  isError?: boolean;
};

export type SetProjectArgs = {
  key: string;
  label?: string;
  metadata?: Record<string, unknown>;
  enable_git_hooks?: boolean;
};

export type ScopedProjectArgs = {
  project_key?: string;
};

export type RecallArgs = {
  query?: string;
  limit?: number;
  project_key?: string;
  all_projects?: boolean;
};

export type ReadFileArgs = {
  path: string;
};

export type SearchArgs = {
  query: string;
  type: 'files' | 'content';
  options?: {
    regex?: boolean;
    caseSensitive?: boolean;
    filePattern?: string;
    maxResults?: number;
  };
};

export type StructureArgs = {
  depth?: number;
};

export type GitArgs = {
  action: 'status' | 'context' | 'hotspots' | 'coupling' | 'blame' | 'analysis';
  staged?: boolean;
  files?: string[];
  path?: string;
  limit?: number;
  minCoupling?: number;
};

export type NotionArgs = {
  action: 'search' | 'read';
  query?: string;
  pageId?: string;
};

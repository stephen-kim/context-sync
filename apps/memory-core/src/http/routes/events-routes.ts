import express from 'express';
import { z } from 'zod';
import type { MemoryCoreService } from '../../service/index.js';
import type { AuthedRequest } from '../types.js';

export function registerEventsRoutes(app: express.Express, service: MemoryCoreService): void {
  app.post('/v1/git-events', async (req, res, next) => {
    try {
      const body = z
        .object({
          workspace_key: z.string().min(1),
          project_key: z.string().min(1),
          event: z.enum(['commit', 'merge', 'checkout']),
          branch: z.string().min(1).optional(),
          from_branch: z.string().min(1).optional(),
          to_branch: z.string().min(1).optional(),
          commit_hash: z.string().min(7).optional(),
          message: z.string().optional(),
          changed_files: z.array(z.string().min(1)).max(2000).optional(),
          metadata: z.record(z.unknown()).optional(),
        })
        .parse(req.body);
      const eventType =
        body.event === 'commit'
          ? 'post_commit'
          : body.event === 'merge'
            ? 'post_merge'
            : 'post_checkout';
      const result = await service.captureRawEvent({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: body.workspace_key,
        projectKey: body.project_key,
        eventType,
        branch: body.branch,
        fromBranch: body.from_branch,
        toBranch: body.to_branch,
        commitSha: body.commit_hash,
        commitMessage: body.message,
        changedFiles: body.changed_files,
        metadata: body.metadata,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/raw-events', async (req, res, next) => {
    try {
      const body = z
        .object({
          workspace_key: z.string().min(1),
          project_key: z.string().min(1),
          event_type: z.enum(['post_commit', 'post_merge', 'post_checkout']),
          branch: z.string().min(1).optional(),
          from_branch: z.string().min(1).optional(),
          to_branch: z.string().min(1).optional(),
          commit_sha: z.string().min(7).optional(),
          commit_message: z.string().optional(),
          changed_files: z.array(z.string().min(1)).max(2000).optional(),
          metadata: z.record(z.unknown()).optional(),
        })
        .parse(req.body);
      const result = await service.captureRawEvent({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: body.workspace_key,
        projectKey: body.project_key,
        eventType: body.event_type,
        branch: body.branch,
        fromBranch: body.from_branch,
        toBranch: body.to_branch,
        commitSha: body.commit_sha,
        commitMessage: body.commit_message,
        changedFiles: body.changed_files,
        metadata: body.metadata,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/raw-events', async (req, res, next) => {
    try {
      const query = z
        .object({
          workspace_key: z.string().min(1),
          project_key: z.string().optional(),
          event_type: z.enum(['post_commit', 'post_merge', 'post_checkout']).optional(),
          commit_sha: z.string().optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          limit: z.coerce.number().int().positive().optional(),
        })
        .parse(req.query);
      const result = await service.listRawEvents({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: query.workspace_key,
        projectKey: query.project_key,
        eventType: query.event_type,
        commitSha: query.commit_sha,
        from: query.from,
        to: query.to,
        limit: query.limit,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/ci-events', async (req, res, next) => {
    try {
      const body = z
        .object({
          workspace_key: z.string().min(1),
          status: z.enum(['success', 'failure']),
          provider: z.enum(['github_actions', 'generic']).default('github_actions'),
          project_key: z.string().min(1).optional(),
          workflow_name: z.string().min(1).optional(),
          workflow_run_id: z.union([z.string().min(1), z.number().int().nonnegative()]).optional(),
          workflow_run_url: z.string().url().optional(),
          repository: z.string().min(1).optional(),
          branch: z.string().min(1).optional(),
          sha: z.string().min(7).optional(),
          event_name: z.string().min(1).optional(),
          job_name: z.string().min(1).optional(),
          message: z.string().optional(),
          metadata: z.record(z.unknown()).optional(),
        })
        .parse(req.body);
      const result = await service.handleCiEvent({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: body.workspace_key,
        status: body.status,
        provider: body.provider,
        projectKey: body.project_key,
        workflowName: body.workflow_name,
        workflowRunId:
          typeof body.workflow_run_id === 'number'
            ? String(body.workflow_run_id)
            : body.workflow_run_id,
        workflowRunUrl: body.workflow_run_url,
        repository: body.repository,
        branch: body.branch,
        sha: body.sha,
        eventName: body.event_name,
        jobName: body.job_name,
        message: body.message,
        metadata: body.metadata,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}

import express from 'express';
import { z } from 'zod';
import type { MemoryCoreService } from '../../service/index.js';
import type { AuthedRequest } from '../types.js';

export function registerCoreSettingsGlobalRulesRoutes(
  app: express.Express,
  service: MemoryCoreService
): void {
  app.get('/v1/global-rules', async (req, res, next) => {
    try {
      const query = z
        .object({
          workspace_key: z.string().min(1),
          scope: z.enum(['workspace', 'user']),
          user_id: z.string().min(1).optional(),
        })
        .parse(req.query);
      const result = await service.listGlobalRules({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: query.workspace_key,
        scope: query.scope,
        userId: query.user_id,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/global-rules', async (req, res, next) => {
    try {
      const body = z
        .object({
          workspace_key: z.string().min(1),
          scope: z.enum(['workspace', 'user']),
          user_id: z.string().min(1).optional(),
          title: z.string().min(1).max(200),
          content: z.string().min(1).max(10000),
          category: z.enum(['policy', 'security', 'style', 'process', 'other']).optional(),
          priority: z.coerce.number().int().min(1).max(5).optional(),
          severity: z.enum(['low', 'medium', 'high']).optional(),
          pinned: z.boolean().optional(),
          enabled: z.boolean().optional(),
          tags: z.array(z.string().min(1).max(64)).max(100).optional(),
          reason: z.string().max(500).optional(),
        })
        .parse(req.body);
      const result = await service.createGlobalRule({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: body.workspace_key,
        input: body,
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.put('/v1/global-rules/:id', async (req, res, next) => {
    try {
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          workspace_key: z.string().min(1),
          title: z.string().min(1).max(200).optional(),
          content: z.string().min(1).max(10000).optional(),
          category: z.enum(['policy', 'security', 'style', 'process', 'other']).optional(),
          priority: z.coerce.number().int().min(1).max(5).optional(),
          severity: z.enum(['low', 'medium', 'high']).optional(),
          pinned: z.boolean().optional(),
          enabled: z.boolean().optional(),
          tags: z.array(z.string().min(1).max(64)).max(100).optional(),
          reason: z.string().max(500).optional(),
        })
        .parse(req.body);
      const result = await service.updateGlobalRule({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: body.workspace_key,
        ruleId: params.id,
        input: body,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/v1/global-rules/:id', async (req, res, next) => {
    try {
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const query = z
        .object({
          workspace_key: z.string().min(1),
          reason: z.string().max(500).optional(),
        })
        .parse(req.query);
      const result = await service.deleteGlobalRule({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: query.workspace_key,
        ruleId: params.id,
        reason: query.reason,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/global-rules/summarize', async (req, res, next) => {
    try {
      const body = z
        .object({
          workspace_key: z.string().min(1),
          scope: z.enum(['workspace', 'user']),
          user_id: z.string().min(1).optional(),
          mode: z.enum(['replace', 'preview']),
          reason: z.string().max(500).optional(),
        })
        .parse(req.body);
      const result = await service.summarizeGlobalRules({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: body.workspace_key,
        scope: body.scope,
        userId: body.user_id,
        mode: body.mode,
        reason: body.reason,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}

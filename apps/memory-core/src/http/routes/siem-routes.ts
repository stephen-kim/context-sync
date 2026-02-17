import express from 'express';
import { z } from 'zod';
import type { MemoryCoreService } from '../../service/index.js';
import type { AuthedRequest } from '../types.js';

export function registerSiemRoutes(app: express.Express, service: MemoryCoreService): void {
  app.get('/v1/audit-sinks', async (req, res, next) => {
    try {
      const query = z.object({ workspace_key: z.string().min(1) }).parse(req.query);
      const result = await service.listAuditSinks({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: query.workspace_key,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/audit-sinks', async (req, res, next) => {
    try {
      const body = z
        .object({
          workspace_key: z.string().min(1),
          type: z.enum(['webhook', 'http']).default('webhook'),
          name: z.string().min(1),
          enabled: z.boolean().optional(),
          endpoint_url: z.string().url(),
          secret: z.string().min(1),
          event_filter: z.record(z.unknown()).optional(),
          retry_policy: z.record(z.unknown()).optional(),
          reason: z.string().max(500).optional(),
        })
        .parse(req.body);
      const result = await service.createAuditSink({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: body.workspace_key,
        type: body.type,
        name: body.name,
        enabled: body.enabled,
        endpointUrl: body.endpoint_url,
        secret: body.secret,
        eventFilter: body.event_filter,
        retryPolicy: body.retry_policy,
        reason: body.reason,
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/v1/audit-sinks/:id', async (req, res, next) => {
    try {
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          workspace_key: z.string().min(1),
          name: z.string().min(1).optional(),
          enabled: z.boolean().optional(),
          endpoint_url: z.string().url().optional(),
          secret: z.string().min(1).optional(),
          event_filter: z.record(z.unknown()).optional(),
          retry_policy: z.record(z.unknown()).optional(),
          reason: z.string().max(500).optional(),
        })
        .parse(req.body);
      const result = await service.updateAuditSink({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: body.workspace_key,
        sinkId: params.id,
        input: body,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/v1/audit-sinks/:id', async (req, res, next) => {
    try {
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const query = z
        .object({
          workspace_key: z.string().min(1),
          reason: z.string().max(500).optional(),
        })
        .parse(req.query);
      const result = await service.deleteAuditSink({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: query.workspace_key,
        sinkId: params.id,
        reason: query.reason,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/audit-sinks/:id/test-delivery', async (req, res, next) => {
    try {
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z.object({ workspace_key: z.string().min(1) }).parse(req.body);
      const result = await service.testAuditSinkDelivery({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: body.workspace_key,
        sinkId: params.id,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/audit-deliveries', async (req, res, next) => {
    try {
      const query = z
        .object({
          workspace_key: z.string().min(1),
          sink_id: z.string().uuid().optional(),
          status: z.enum(['queued', 'sending', 'delivered', 'failed']).optional(),
          limit: z.coerce.number().int().positive().max(500).optional(),
        })
        .parse(req.query);
      const result = await service.listAuditDeliveryQueue({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: query.workspace_key,
        sinkId: query.sink_id,
        status: query.status,
        limit: query.limit,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/detection-rules', async (req, res, next) => {
    try {
      const query = z.object({ workspace_key: z.string().min(1) }).parse(req.query);
      const result = await service.listDetectionRules({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: query.workspace_key,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/detection-rules', async (req, res, next) => {
    try {
      const body = z
        .object({
          workspace_key: z.string().min(1),
          name: z.string().min(1),
          enabled: z.boolean().optional(),
          severity: z.enum(['low', 'medium', 'high']).optional(),
          condition: z.record(z.unknown()),
          notify: z.record(z.unknown()).optional(),
          reason: z.string().max(500).optional(),
        })
        .parse(req.body);
      const result = await service.createDetectionRule({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: body.workspace_key,
        input: body,
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/v1/detection-rules/:id', async (req, res, next) => {
    try {
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          workspace_key: z.string().min(1),
          name: z.string().min(1).optional(),
          enabled: z.boolean().optional(),
          severity: z.enum(['low', 'medium', 'high']).optional(),
          condition: z.record(z.unknown()).optional(),
          notify: z.record(z.unknown()).optional(),
          reason: z.string().max(500).optional(),
        })
        .parse(req.body);
      const result = await service.updateDetectionRule({
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

  app.delete('/v1/detection-rules/:id', async (req, res, next) => {
    try {
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const query = z
        .object({
          workspace_key: z.string().min(1),
          reason: z.string().max(500).optional(),
        })
        .parse(req.query);
      const result = await service.deleteDetectionRule({
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

  app.get('/v1/detections', async (req, res, next) => {
    try {
      const query = z
        .object({
          workspace_key: z.string().min(1),
          status: z.enum(['open', 'ack', 'closed']).optional(),
          limit: z.coerce.number().int().positive().max(500).optional(),
        })
        .parse(req.query);
      const result = await service.listDetections({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: query.workspace_key,
        status: query.status,
        limit: query.limit,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/v1/detections/:id/status', async (req, res, next) => {
    try {
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          workspace_key: z.string().min(1),
          status: z.enum(['open', 'ack', 'closed']),
          reason: z.string().max(500).optional(),
        })
        .parse(req.body);
      const result = await service.updateDetectionStatus({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: body.workspace_key,
        detectionId: params.id,
        status: body.status,
        reason: body.reason,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}

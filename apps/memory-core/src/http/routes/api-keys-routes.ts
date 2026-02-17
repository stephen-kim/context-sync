import express from 'express';
import { z } from 'zod';
import type { MemoryCoreService } from '../../service/index.js';
import type { AuthedRequest } from '../types.js';

export function registerApiKeysRoutes(app: express.Express, service: MemoryCoreService): void {
  app.post('/v1/api-keys', async (req, res, next) => {
    try {
      const body = z
        .object({
          label: z.string().max(120).optional(),
        })
        .parse(req.body);
      const result = await service.createSelfApiKey({
        auth: (req as AuthedRequest).auth!,
        label: body.label,
        ip: req.ip,
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/api-keys', async (req, res, next) => {
    try {
      const result = await service.listOwnApiKeys({
        auth: (req as AuthedRequest).auth!,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/users/:userId/api-keys', async (req, res, next) => {
    try {
      const params = z.object({ userId: z.string().min(1) }).parse(req.params);
      const result = await service.listUserApiKeys({
        auth: (req as AuthedRequest).auth!,
        userId: params.userId,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/api-keys/:id/revoke', async (req, res, next) => {
    try {
      const params = z.object({ id: z.string().min(1) }).parse(req.params);
      const result = await service.revokeApiKey({
        auth: (req as AuthedRequest).auth!,
        apiKeyId: params.id,
        ip: req.ip,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/users/:userId/api-keys/reset', async (req, res, next) => {
    try {
      const params = z.object({ userId: z.string().min(1) }).parse(req.params);
      const requestBaseUrl = `${req.protocol}://${req.get('host') || ''}`;
      const result = await service.resetUserApiKeys({
        auth: (req as AuthedRequest).auth!,
        userId: params.userId,
        requestBaseUrl,
        ip: req.ip,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/api-keys/one-time/:token', async (req, res, next) => {
    try {
      const params = z.object({ token: z.string().min(1) }).parse(req.params);
      const result = await service.viewOneTimeApiKey({
        token: params.token,
        ip: req.ip,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}

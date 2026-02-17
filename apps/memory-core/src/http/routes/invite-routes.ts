import express from 'express';
import { z } from 'zod';
import type { MemoryCoreService } from '../../service/index.js';
import type { AuthedRequest } from '../types.js';

const workspaceRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER']);
const projectRoleSchema = z.enum(['OWNER', 'MAINTAINER', 'WRITER', 'READER']);

export function registerInviteRoutes(app: express.Express, service: MemoryCoreService): void {
  app.post('/v1/workspaces/:key/invite', async (req, res, next) => {
    try {
      const params = z.object({ key: z.string().min(1) }).parse(req.params);
      const body = z
        .object({
          email: z.string().email(),
          role: workspaceRoleSchema.default('MEMBER'),
          project_roles: z.record(projectRoleSchema).optional(),
        })
        .parse(req.body);
      const requestBaseUrl = `${req.protocol}://${req.get('host') || ''}`;
      const result = await service.createWorkspaceInvite({
        auth: (req as AuthedRequest).auth!,
        workspaceKey: params.key,
        email: body.email,
        role: body.role,
        projectRoles: body.project_roles,
        requestBaseUrl,
        ip: req.ip,
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/v1/invite/:token', async (req, res, next) => {
    try {
      const params = z.object({ token: z.string().min(1) }).parse(req.params);
      const result = await service.getInvite({
        token: params.token,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/v1/invite/:token/accept', async (req, res, next) => {
    try {
      const params = z.object({ token: z.string().min(1) }).parse(req.params);
      const body = z
        .object({
          password: z.string().min(12),
          name: z.string().max(200).optional(),
        })
        .parse(req.body);
      const result = await service.acceptInvite({
        token: params.token,
        password: body.password,
        name: body.name,
        ip: req.ip,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}

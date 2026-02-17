import express from 'express';
import multer from 'multer';
import type { MemoryCoreService } from '../../service/index.js';
import { registerCoreRoutes } from './core-routes.js';
import { registerImportRawRoutes } from './import-raw-routes.js';
import { registerKnowledgeRoutes } from './knowledge-routes.js';
import { registerEventsRoutes } from './events-routes.js';
import { registerAuthRoutes } from './auth-routes.js';
import { registerApiKeysRoutes } from './api-keys-routes.js';
import { registerInviteRoutes } from './invite-routes.js';

export function registerV1Routes(
  app: express.Express,
  service: MemoryCoreService,
  upload: multer.Multer,
  authConfig: { sessionSecret: string; sessionTtlSeconds: number }
): void {
  registerAuthRoutes(app, service, authConfig);
  registerInviteRoutes(app, service);
  registerApiKeysRoutes(app, service);
  registerCoreRoutes(app, service);
  registerImportRawRoutes(app, service, upload);
  registerKnowledgeRoutes(app, service);
  registerEventsRoutes(app, service);
}

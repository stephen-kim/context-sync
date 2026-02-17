import express from 'express';
import type { MemoryCoreService } from '../../service/index.js';
import { registerCorePrimaryRoutes } from './core-primary-routes.js';
import { registerCoreSettingsRoutes } from './core-settings-routes.js';
import { registerGithubRoutes } from './github-routes.js';
import { registerSiemRoutes } from './siem-routes.js';

export function registerCoreRoutes(app: express.Express, service: MemoryCoreService): void {
  registerCorePrimaryRoutes(app, service);
  registerCoreSettingsRoutes(app, service);
  registerGithubRoutes(app, service);
  registerSiemRoutes(app, service);
}

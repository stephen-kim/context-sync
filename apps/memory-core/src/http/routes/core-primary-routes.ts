import express from 'express';
import type { MemoryCoreService } from '../../service/index.js';
import { registerCorePrimaryMainRoutes } from './core-primary-routes-main.js';
import { registerCorePrimaryAccessRoutes } from './core-primary-routes-access.js';

export function registerCorePrimaryRoutes(app: express.Express, service: MemoryCoreService): void {
  registerCorePrimaryMainRoutes(app, service);
  registerCorePrimaryAccessRoutes(app, service);
}

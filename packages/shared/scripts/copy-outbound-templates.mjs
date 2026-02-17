#!/usr/bin/env node

import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const fromDir = path.join(packageRoot, 'outbound-templates');
const toDir = path.join(packageRoot, 'dist', 'outbound-templates');

await mkdir(path.dirname(toDir), { recursive: true });
await cp(fromDir, toDir, { recursive: true });

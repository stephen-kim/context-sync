#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const raw = fs.readFileSync(packageJsonPath, 'utf8');
const pkg = JSON.parse(raw);

const currentVersion = String(pkg.version || '').trim();
const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/);

if (!match) {
  console.error(`[version] Unsupported version format: ${currentVersion}`);
  process.exit(1);
}

const major = Number(match[1]);
const minor = Number(match[2]);
const patch = Number(match[3]);
const suffix = match[4] || '';
const nextVersion = `${major}.${minor}.${patch + 1}${suffix}`;

pkg.version = nextVersion;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

console.log(`[version] ${currentVersion} -> ${nextVersion}`);
console.log('[version] Policy: major.minor unchanged, patch increment only.');

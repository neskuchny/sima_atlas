#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const p = path.join(root, 'Sima (Remix)', 'atlas_bootstrap.js');
if (!fs.existsSync(p)) {
  console.error('bootstrap projection missing');
  process.exit(1);
}
const text = fs.readFileSync(p, 'utf8');
const checks = [
  ['has SIMA_BOOTSTRAP', text.includes('window.SIMA_BOOTSTRAP')],
  ['has canvas sources', text.includes('"canvas"') && text.includes('"sources"')],
  ['has take field', text.includes('"take"')],
  ['has userstory', text.includes('"userstory"')],
  ['merges ARCH_BY_PROJECT', text.includes('window.ARCH_BY_PROJECT = Object.assign')],
];
const failed = checks.filter(([,ok])=>!ok);
if (failed.length) {
  console.error('Bootstrap projection validation failed:');
  for (const [name] of failed) console.error(` - ${name}`);
  process.exit(2);
}
console.log('Bootstrap projection validation: OK');

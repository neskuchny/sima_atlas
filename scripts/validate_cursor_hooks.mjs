#!/usr/bin/env node
// PR4: validate that .cursor/hooks.json is in the format Cursor accepts
// AND that every command it references actually exists on disk.
//
// Cursor accepts:
//   { "version": <int>, "hooks": { "<event>": [{ "command": "..." }, ...] } }
// Allowed events (as of PR4): beforeSubmitPrompt, afterFileEdit,
// beforeShellExecution, stop.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const hooksPath = path.join(root, '.cursor', 'hooks.json');

if (!fs.existsSync(hooksPath)) {
  console.error(`✗ ${hooksPath} missing`);
  process.exit(1);
}

let json;
try { json = JSON.parse(fs.readFileSync(hooksPath, 'utf8')); }
catch (e) { console.error(`✗ ${hooksPath} not valid JSON: ${e.message}`); process.exit(1); }

const errors = [];
const warnings = [];

if (json.version !== 1) errors.push(`version must be 1; got ${json.version}`);

const ALLOWED_EVENTS = new Set(['beforeSubmitPrompt', 'afterFileEdit', 'beforeShellExecution', 'stop']);

if (!json.hooks || typeof json.hooks !== 'object') {
  errors.push('hooks: must be an object keyed by event name');
} else {
  for (const event of Object.keys(json.hooks)) {
    if (!ALLOWED_EVENTS.has(event)) {
      errors.push(`hooks.${event}: unknown event (allowed: ${[...ALLOWED_EVENTS].join(', ')})`);
      continue;
    }
    const arr = json.hooks[event];
    if (!Array.isArray(arr)) {
      errors.push(`hooks.${event}: must be an array of {command} entries`);
      continue;
    }
    for (let i = 0; i < arr.length; i++) {
      const entry = arr[i];
      if (!entry || typeof entry !== 'object') {
        errors.push(`hooks.${event}[${i}]: must be an object with a "command" field`);
        continue;
      }
      if (typeof entry.command !== 'string' || !entry.command.trim()) {
        errors.push(`hooks.${event}[${i}]: missing or empty "command"`);
        continue;
      }
      // Best-effort: verify the script file referenced by `node <path>` exists.
      const m = entry.command.match(/^\s*node\s+(\S+)/);
      if (m) {
        const scriptPath = path.join(root, m[1]);
        if (!fs.existsSync(scriptPath)) {
          errors.push(`hooks.${event}[${i}]: command refers to missing file → ${m[1]}`);
        }
      } else {
        warnings.push(`hooks.${event}[${i}]: command does not start with "node <script>" — skipping existence check`);
      }
    }
  }
}

// Sanity: no leftovers from the invented format
if (Array.isArray(json.hooks)) {
  errors.push('hooks: array form is the deprecated PR1 format; expected object keyed by event name');
}

if (warnings.length) {
  console.warn('cursor hooks warnings:');
  warnings.forEach((w) => console.warn(' ⚠', w));
}
if (errors.length) {
  console.error('cursor hooks validation FAILED:');
  errors.forEach((e) => console.error(' ✗', e));
  process.exit(1);
}

const eventCount = Object.keys(json.hooks).length;
const cmdCount = Object.values(json.hooks).reduce((acc, arr) => acc + arr.length, 0);
console.log(`cursor hooks validation: OK (${eventCount} events, ${cmdCount} commands)`);

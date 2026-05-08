#!/usr/bin/env node
// PR4: emit a Cursor-valid .cursor/hooks.json that wires real action scripts.
//
// Cursor hook spec (current public format):
//   {
//     "version": 1,
//     "hooks": {
//       "<event>": [{ "command": "<shell command>" }, ...]
//     }
//   }
// Supported events used here:
//   * beforeSubmitPrompt    — runs before user's prompt is sent to the agent;
//                             we inject atlas context-pack hints.
//   * beforeShellExecution  — runs before agent executes a shell command;
//                             we validate the command against tech_stack/rules.
//   * afterFileEdit         — runs after the agent edits a file; we map the
//                             file to its owner block and append a checks.log
//                             line with a `git diff --stat` snippet.
//   * stop                  — runs at session end; we capture intelligence_health.
//
// Cursor passes context through env variables. Different builds use different
// names; the action scripts read them with fallback (env → argv) so they also
// run from CLI for tests.
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const atlasRoot = path.join(repoRoot, 'atlas');
const outPath = path.join(repoRoot, '.cursor', 'hooks.json');

const graph = JSON.parse(fs.readFileSync(path.join(atlasRoot, 'graph.json'), 'utf8'));
const blockIds = (graph.blocks || []).map((b) => b.id);

const hooks = {
  version: 1,
  _generatedAt: new Date().toISOString(),
  _atlas: {
    root: '/atlas',
    blocks: blockIds,
    rules: '/atlas/rules.md',
    tech_stack: '/atlas/tech_stack.md',
    context_packs: '/atlas/context_packs',
  },
  hooks: {
    beforeSubmitPrompt: [
      {
        command: 'node scripts/inject_context_pack.mjs',
        purpose: 'Prepend block-scoped atlas context (mission/kpi/depends/files) to the agent prompt.',
      },
    ],
    afterFileEdit: [
      {
        command: 'node scripts/observe_file_edit.mjs',
        purpose: "Map the edited file to its owner block via files.md and append a 'cursor_edit' line to that block's checks.log.",
      },
    ],
    beforeShellExecution: [
      {
        command: 'node scripts/guard_against_drift.mjs',
        purpose: 'Reject shell commands that contradict /atlas/tech_stack.md or /atlas/rules.md (e.g., pip install when stack is React+Node).',
      },
    ],
    stop: [
      {
        command: 'node scripts/calc_intelligence_health.mjs',
        purpose: 'Recompute intelligence_health on session end so the dashboard is always fresh.',
      },
    ],
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(hooks, null, 2) + '\n', 'utf8');
console.log(`Generated ${outPath}`);
console.log(`  events: ${Object.keys(hooks.hooks).join(', ')}`);

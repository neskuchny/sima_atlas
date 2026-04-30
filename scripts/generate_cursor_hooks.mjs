import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const atlasRoot = path.join(repoRoot, 'atlas');
const outPath = path.join(repoRoot, '.cursor', 'hooks.json');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const graph = readJson(path.join(atlasRoot, 'graph.json'));
const blockIds = (graph.blocks || []).map((b) => b.id);

const hooks = {
  version: 1,
  generatedAt: new Date().toISOString(),
  atlas: {
    root: '/atlas',
    blocks: blockIds,
    rules: '/atlas/rules.md',
    techStack: '/atlas/tech_stack.md',
  },
  hooks: [
    {
      name: 'beforePromptSent',
      purpose: 'Inject atlas context-pack hints before agent prompt',
      action: {
        type: 'prepend_text',
        text: 'Read /atlas/project.md, /atlas/rules.md, /atlas/tech_stack.md and selected /atlas/blocks/<id> before coding.'
      }
    },
    {
      name: 'afterFileEdit',
      purpose: 'Remind updating files registry and checks',
      action: {
        type: 'append_text',
        text: 'Update atlas block files.md + checks.log and keep files_registry in sync.'
      }
    },
    {
      name: 'beforeShellExecution',
      purpose: 'Guard against stack/rules drift',
      action: {
        type: 'validate_text',
        text: 'Command must not violate /atlas/rules.md and /atlas/tech_stack.md.'
      }
    }
  ]
};

fs.writeFileSync(outPath, JSON.stringify(hooks, null, 2) + '\n', 'utf8');
console.log(`Generated ${outPath}`);

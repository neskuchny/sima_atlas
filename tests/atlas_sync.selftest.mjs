import fs from 'node:fs';
import vm from 'node:vm';

function createStorage() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
}

const code = fs.readFileSync('frontend/atlas_sync.js', 'utf8');
const sandbox = {
  window: {},
  localStorage: createStorage(),
  Date,
  JSON,
  Set,
  Map,
  console,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'atlas_sync.js' });

const core = sandbox.SIMA_ATLAS_CORE;
if (!core) throw new Error('SIMA_ATLAS_CORE was not initialized');

const arch = {
  blocks: [
    { id: 'b.a', title: 'A' },
    { id: 'b.b', title: 'B' },
  ],
};

let atlas = core.loadAtlas('p1', arch);
atlas.blocks['b.a'].dependsOn = ['b.b'];
atlas.blocks['b.a'].requires = ['auth_token'];
atlas.blocks['b.b'].provides = ['auth_token'];
atlas.blocks['b.a'].kpi = [{ id: 'k1', passed: true }];
atlas.blocks['b.a'].acceptance = [{ id: 'a1', done: true }];
core.logCheck(atlas, 'b.a', { kind: 'kpi', result: 'pass' });
core.logCheck(atlas, 'b.a', { kind: 'acceptance', result: 'pass' });
core.markFileStatus(atlas, 'src/a.ts', 'alive', 'active', 'b.a');

const reportOk = core.syncCheck(atlas, arch);
if (reportOk.broken !== 0) throw new Error('Expected no broken blocks in happy path');

// induce broken: mark active file as dead
core.markFileStatus(atlas, 'src/a.ts', 'dead', 'deprecated', 'b.a');
const reportBroken = core.syncCheck(atlas, arch);
const deadIssue = (reportBroken.details || []).some(d => (d.issues || []).some(i => String(i).includes('помечен dead')));
if (!deadIssue) throw new Error('Expected dead-file issue in sync report');


// transitions state machine
const t1 = core.transitionBlock(atlas, 'b.a', 'wip', { actor: 'test' });
if (!t1.ok) throw new Error('Expected valid transition idea->wip');
const t2 = core.transitionBlock(atlas, 'b.a', 'done', { actor: 'test' });
if (t2.ok) throw new Error('Expected invalid transition wip->done (must go review)');
const t3 = core.transitionBlock(atlas, 'b.a', 'review', { actor: 'test' });
if (!t3.ok) throw new Error('Expected valid transition wip->review');
const t4 = core.transitionBlock(atlas, 'b.a', 'done', { actor: 'test' });
if (!t4.ok) throw new Error('Expected valid transition review->done');

const pack = core.buildContextPack(atlas, arch, 'b.a');
if (!pack || pack.block.id !== 'b.a') throw new Error('Context pack build failed');

console.log('atlas_sync.selftest: OK');

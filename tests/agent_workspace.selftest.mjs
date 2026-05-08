#!/usr/bin/env node
// PR-8 (b.agent-orchestrator): selftest for scripts/agent_workspace.mjs.
//
// 7 test groups:
//  1. createWorkspace copies repo + writes .atlas_workspace.json marker
//  2. SKIP_DIRS not copied (node_modules / atlas/llm_traces)
//  3. captureDiff returns 0 changes for unmodified workspace
//  4. captureDiff detects added / modified / removed files
//  5. writeDiffProposal writes proposal kind=agent_run_diff to atlas/
//     proposals/ with truncation marker on long diff
//  6. cleanupWorkspace refuses to delete paths outside WORKSPACES_ROOT
//     and refuses without marker; succeeds when both checks pass
//  7. listWorkspaces returns the workspace we just created

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

// Use a tiny fake source repo as the "real" repo, point ATLAS_ROOT at its
// atlas/, and point WORKSPACES_ROOT at another tmp dir. This isolates the
// selftest from the real repo entirely.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-ws-'));
const fakeRepo = path.join(tmpRoot, 'repo');
const wsRoot = path.join(tmpRoot, 'workspaces');
fs.mkdirSync(fakeRepo, { recursive: true });
fs.mkdirSync(wsRoot, { recursive: true });

// Populate the fake repo with a few representative files
fs.mkdirSync(path.join(fakeRepo, 'atlas', 'blocks', 'b.synth-ws'), { recursive: true });
fs.writeFileSync(path.join(fakeRepo, 'atlas', 'graph.json'), JSON.stringify({ blocks: [{ id: 'b.synth-ws', layer: 'logic' }] }));
fs.writeFileSync(path.join(fakeRepo, 'atlas', 'blocks', 'b.synth-ws', 'mission.md'), '# mission\nhello\n');
fs.writeFileSync(path.join(fakeRepo, 'src.js'), 'console.log("hello");\n');
// Files that SHOULD be skipped
fs.mkdirSync(path.join(fakeRepo, 'node_modules', 'foo'), { recursive: true });
fs.writeFileSync(path.join(fakeRepo, 'node_modules', 'foo', 'bigfile.bin'), 'X'.repeat(10000));
fs.mkdirSync(path.join(fakeRepo, 'atlas', 'llm_traces'), { recursive: true });
fs.writeFileSync(path.join(fakeRepo, 'atlas', 'llm_traces', 'a.json'), '{}');

process.env.ATLAS_ROOT = path.join(fakeRepo, 'atlas');
process.env.ATLAS_WORKSPACES_ROOT = wsRoot;

const { createWorkspace, captureDiff, writeDiffProposal, cleanupWorkspace, listWorkspaces }
  = await import('../scripts/agent_workspace.mjs?cb=' + Date.now()); // bust cache if rerun

try {
  // ─── Group 1: createWorkspace
  const ws = createWorkspace({ block_id: 'b.synth-ws', source_root: fakeRepo });
  check('group1:workspace_path exists', fs.existsSync(ws.workspace_path));
  check('group1:marker written', fs.existsSync(path.join(ws.workspace_path, '.atlas_workspace.json')));
  check('group1:graph.json copied',
    fs.existsSync(path.join(ws.workspace_path, 'atlas', 'graph.json')));
  check('group1:src.js copied',
    fs.existsSync(path.join(ws.workspace_path, 'src.js')));

  // ─── Group 2: SKIP_DIRS not copied
  check('group2:node_modules NOT copied',
    !fs.existsSync(path.join(ws.workspace_path, 'node_modules', 'foo', 'bigfile.bin')),
    'node_modules should be skipped to keep workspaces small');
  check('group2:atlas/llm_traces NOT copied',
    !fs.existsSync(path.join(ws.workspace_path, 'atlas', 'llm_traces', 'a.json')),
    'llm_traces should be skipped (runtime artefacts)');

  // ─── Group 3: zero changes
  {
    const d = captureDiff({ workspace_path: ws.workspace_path, source_root: fakeRepo });
    check('group3:no changed files', d.changed_files.length === 0,
      `changed=${JSON.stringify(d.changed_files)}`);
  }

  // ─── Group 4: changes detected
  {
    // Modify
    fs.writeFileSync(path.join(ws.workspace_path, 'src.js'), 'console.log("changed");\n');
    // Add
    fs.writeFileSync(path.join(ws.workspace_path, 'new.js'), 'export const x = 1;\n');
    // Remove (delete from workspace, original still has it)
    const removed = path.join(ws.workspace_path, 'atlas', 'blocks', 'b.synth-ws', 'mission.md');
    fs.unlinkSync(removed);

    const d = captureDiff({ workspace_path: ws.workspace_path, source_root: fakeRepo });
    const kinds = d.changed_files.reduce((acc, f) => { acc[f.kind] = (acc[f.kind] || 0) + 1; return acc; }, {});
    check('group4:1 modified', kinds.modified === 1, `kinds=${JSON.stringify(kinds)}`);
    check('group4:1 added', kinds.added === 1);
    check('group4:1 removed', kinds.removed === 1);
    check('group4:diff_text non-empty', d.diff_text.length > 0);
    check('group4:diff cites src.js OR new.js', /src\.js|new\.js|mission\.md/.test(d.diff_text),
      `diff sample: ${d.diff_text.slice(0, 200)}`);
  }

  // ─── Group 5: writeDiffProposal
  {
    const proposalsDir = path.join(fakeRepo, 'atlas', 'proposals');
    const before = new Set(fs.existsSync(proposalsDir) ? fs.readdirSync(proposalsDir) : []);
    const d = captureDiff({ workspace_path: ws.workspace_path, source_root: fakeRepo });
    const id = writeDiffProposal({
      run_id: 'b.synth-ws__test-run', block_id: 'b.synth-ws',
      workspace_path: ws.workspace_path, diff: d,
    });
    const after = fs.readdirSync(proposalsDir);
    const created = after.filter((f) => !before.has(f));
    check('group5:1 new proposal', created.length === 1, `created=${created.join(',')}`);
    const j = JSON.parse(fs.readFileSync(path.join(proposalsDir, created[0]), 'utf8'));
    check('group5:kind agent_run_diff', j.kind === 'agent_run_diff');
    check('group5:has changed_files', Array.isArray(j.changed_files) && j.changed_files.length === 3);
    check('group5:has diff_preview', typeof j.diff_preview === 'string');
  }

  // ─── Group 6: cleanupWorkspace safety
  {
    // Refuse paths outside WORKSPACES_ROOT
    const r1 = cleanupWorkspace({ workspace_path: '/etc' });
    check('group6:refuse /etc', !r1.cleaned && /outside WORKSPACES_ROOT/.test(r1.reason));

    // Without marker → refuse
    const fakeWs = path.join(wsRoot, 'fake');
    fs.mkdirSync(fakeWs);
    const r2 = cleanupWorkspace({ workspace_path: fakeWs });
    check('group6:refuse without marker', !r2.cleaned && /marker/.test(r2.reason));
    fs.rmSync(fakeWs, { recursive: true });

    // With marker AND inside WORKSPACES_ROOT → succeed
    const r3 = cleanupWorkspace({ workspace_path: ws.workspace_path });
    check('group6:cleaned', r3.cleaned === true);
    check('group6:directory removed', !fs.existsSync(ws.workspace_path));
  }

  // ─── Group 7: listWorkspaces
  {
    const ws2 = createWorkspace({ block_id: 'b.synth-ws-2', source_root: fakeRepo });
    const items = listWorkspaces();
    check('group7:>=1 workspace', items.length >= 1);
    check('group7:has block_id', items.some((w) => w.block_id === 'b.synth-ws-2'));
    cleanupWorkspace({ workspace_path: ws2.workspace_path });
  }
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

if (failures.length) {
  console.error('agent_workspace.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('agent_workspace.selftest: OK (7 test groups, all assertions green)');

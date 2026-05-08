#!/usr/bin/env node
// Phase R-4 — selftest for chat_fill plan acceptance.
//
// Reproduces the user-reported bug «принял несколько блоков, они не появились
// на схеме»: chat_fill plans had no verdict and accept_proposal didn't
// understand the kind, so accepting was a silent no-op.
//
// This test:
//   1. Builds an isolated client atlas with a graph + a chat_fill plan
//      that proposes 2 brand-new blocks.
//   2. Runs accept_proposal.mjs with --client.
//   3. Asserts: plan flips to verdict=accepted, both blocks show in
//      graph.json, contract files (mission/kpi/acceptance) are written.
//   4. Re-running accept rejects (already accepted).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const tmpClient = `selftest-r4-${Date.now()}`;
const clientDir = path.join(ROOT, 'atlas', 'clients', tmpClient);
fs.mkdirSync(path.join(clientDir, 'proposals'), { recursive: true });
fs.mkdirSync(path.join(clientDir, 'blocks'),    { recursive: true });
fs.writeFileSync(path.join(clientDir, 'graph.json'), JSON.stringify({ blocks: [], edges: [] }, null, 2), 'utf8');

const planId = '2099-01-01T00-00-00-000Z__chat_fill';
const plan = {
  id: planId,
  kind: 'chat_fill',
  verdict: 'pending',
  block_id: null,
  created_at: '2099-01-01T00:00:00.000Z',
  source: { provider: 'mock', mock: true },
  summary: { proposed_new_blocks: 2, target_blocks_count: 0, filled_blocks_count: 0, total_fields_filled: 0, ambiguities: 0 },
  insights: { summary: 'test', goals: [], constraints: [], ideas: [], risks: [], terms: [] },
  filled: [],
  new_block_proposals: [
    {
      id: 'b.r4-auth-test',
      title: 'Auth (R-4 selftest)',
      layer: 'logic',
      mission: 'JWT auth with email + Google OAuth',
      kpi: ['login_success_rate > 99%'],
      acceptance: ['user can sign up', 'user can log in via Google'],
      depends_on_capabilities: ['user-store'],
      provides_capabilities: ['session-token'],
    },
    {
      id: 'b.r4-notify-test',
      title: 'Notifications (R-4 selftest)',
      layer: 'logic',
      mission: 'Email + push notifications',
      kpi: ['delivery_rate > 99% within 60s'],
      acceptance: [],
      depends_on_capabilities: [],
      provides_capabilities: ['notification-bus'],
    },
  ],
  ambiguities: [],
};
fs.writeFileSync(path.join(clientDir, 'proposals', `${planId}.json`), JSON.stringify(plan, null, 2), 'utf8');

// Pre-check: chat_fill plan visible in list_proposals --client
const listed = JSON.parse(execFileSync('node', ['scripts/list_proposals.mjs', '--client', tmpClient, '--json'], { cwd: ROOT }).toString());
assert.equal(listed.length, 1, `chat_fill plan should appear in client proposals list (got ${listed.length})`);
assert.equal(listed[0].id, planId);
assert.equal(listed[0].kind, 'chat_fill');

// Accept the plan.
const acceptOut = execFileSync('node', ['scripts/accept_proposal.mjs', planId, '--client', tmpClient], { cwd: ROOT }).toString();
assert.match(acceptOut, /chat_fill plan .* created 2 block/, `accept should report 2 blocks created (got: ${acceptOut})`);

// Verify side effects.
const updatedPlan = JSON.parse(fs.readFileSync(path.join(clientDir, 'proposals', `${planId}.json`), 'utf8'));
assert.equal(updatedPlan.verdict, 'accepted');
assert.deepEqual(updatedPlan.applied?.created?.sort(), ['b.r4-auth-test', 'b.r4-notify-test']);

const graph = JSON.parse(fs.readFileSync(path.join(clientDir, 'graph.json'), 'utf8'));
const ids = (graph.blocks || []).map((b) => b.id).sort();
assert.deepEqual(ids, ['b.r4-auth-test', 'b.r4-notify-test'], `both blocks should be in graph (got ${JSON.stringify(ids)})`);

const auth = (graph.blocks || []).find((b) => b.id === 'b.r4-auth-test');
assert.equal(auth.layer, 'logic');
assert.equal(auth.title, 'Auth (R-4 selftest)');

// Contract files written.
const missionPath = path.join(clientDir, 'blocks', 'b.r4-auth-test', 'mission.md');
assert.ok(fs.existsSync(missionPath), 'mission.md should exist');
assert.match(fs.readFileSync(missionPath, 'utf8'), /JWT auth with email/);
const kpiPath = path.join(clientDir, 'blocks', 'b.r4-auth-test', 'kpi.md');
assert.ok(fs.existsSync(kpiPath), 'kpi.md should exist');
assert.match(fs.readFileSync(kpiPath, 'utf8'), /login_success_rate/);

// Re-accept must refuse (already accepted).
let reAcceptFailed = false;
try { execFileSync('node', ['scripts/accept_proposal.mjs', planId, '--client', tmpClient], { cwd: ROOT, stdio: 'pipe' }); }
catch { reAcceptFailed = true; }
assert.ok(reAcceptFailed, 're-accept of an already-accepted plan should fail');

// Cleanup.
fs.rmSync(clientDir, { recursive: true, force: true });

console.log('chat_fill_accept.selftest: OK (plan listed, accepted, blocks created, contract files written, re-accept refused)');

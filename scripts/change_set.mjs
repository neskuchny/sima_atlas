#!/usr/bin/env node
// R-7.92 (S-7) — transactional change-sets for cross-cutting changes.
//
// Some changes don't live in one block: renaming a capability that five blocks
// provide/consume, migrating REST→GraphQL, swapping a DB. Done block-by-block
// you can end up half-migrated — block A speaks the new contract, block B still
// the old one, and nothing tells you the system is in a torn state.
//
// A change-set groups the blocks touched by ONE cross-cutting change and treats
// their acceptance as a UNIT:
//   * status  — re-verify every member, show per-block verdict + the overall
//               (all-green / torn) state
//   * commit  — only allowed when ALL members pass; locks the set. You can't
//               ship a half-migrated change.
//   * rollback— marks the set rolled-back and annotates each member's
//               narrative.md so the operator sees what to revert (never
//               auto-deletes code — surfaces for review, per the operator's
//               standing principle).
//
// Storage: atlas/change_sets/<id>.json  (or atlas/clients/<id>/change_sets/).
//
// Usage:
//   node scripts/change_set.mjs create --intent "rename auth.session → auth.token" [--client X]
//   node scripts/change_set.mjs add --id <cs> --block b.auth --block b.payments
//   node scripts/change_set.mjs list [--client X] [--json]
//   node scripts/change_set.mjs status --id <cs> [--json]
//   node scripts/change_set.mjs commit --id <cs>
//   node scripts/change_set.mjs rollback --id <cs> --reason "migration reverted"

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const flagAll = (name) => argv.reduce((acc, a, i) => (a === name && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
const has = (name) => argv.includes(name);

const JSON_OUT = has('--json');
const CLIENT = flag('--client', '');
const ATLAS = CLIENT ? path.join(ROOT, 'atlas', 'clients', CLIENT) : path.join(ROOT, 'atlas');
const CS_DIR = path.join(ATLAS, 'change_sets');

function ensureDir() { fs.mkdirSync(CS_DIR, { recursive: true }); }
function csPath(id) { return path.join(CS_DIR, `${id}.json`); }
function readCs(id) {
  const p = csPath(id);
  if (!fs.existsSync(p)) { fail(`change-set "${id}" not found`); }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeCs(cs) {
  ensureDir();
  const p = csPath(cs.id);
  fs.writeFileSync(p, JSON.stringify(cs, null, 2) + '\n', 'utf8');
  return p;
}
function out(obj, line) {
  if (JSON_OUT) process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  else if (line) console.log(line);
}
function fail(msg) {
  if (JSON_OUT) process.stdout.write(JSON.stringify({ ok: false, error: msg }, null, 2) + '\n');
  else console.error(`change_set: ${msg}`);
  process.exit(1);
}

function verifyBlock(blockId) {
  // Re-run the acceptance verifier; return pass|fail|inconclusive.
  try {
    const env = { ...process.env };
    if (CLIENT) env.ATLAS_ROOT = ATLAS;
    if (!process.env.ANTHROPIC_API_KEY) env.ATLAS_FORCE_MOCK_LLM = '1';
    const o = execFileSync('node', ['scripts/verify_block_acceptance.mjs', blockId], { cwd: ROOT, stdio: 'pipe', env }).toString();
    if (/:\s*pass\b/.test(o) || /\bpass\b.*fail=0\b/.test(o)) return 'pass';
    if (/inconclusive/.test(o)) return 'inconclusive';
    return 'fail';
  } catch (e) {
    const o = (e.stdout || '').toString();
    return /inconclusive/.test(o) ? 'inconclusive' : 'fail';
  }
}

// ─────────────────────────────────────────────────────────── commands

if (cmd === 'create') {
  const intent = flag('--intent');
  if (!intent) fail('create: --intent "..." required');
  const id = `cs-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const cs = {
    id, intent, state: 'open', client: CLIENT || null,
    blocks: flagAll('--block'),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    committed_at: null, rolled_back_at: null, rollback_reason: null,
    history: [{ at: new Date().toISOString(), event: 'created', note: intent }],
  };
  writeCs(cs);
  out({ ok: true, change_set: cs }, `✓ created change-set ${id}\n  intent: ${intent}\n  blocks: ${cs.blocks.join(', ') || '(none yet — add with --block)'}`);
  process.exit(0);
}

if (cmd === 'add') {
  const id = flag('--id'); if (!id) fail('add: --id <cs> required');
  const cs = readCs(id);
  if (cs.state !== 'open') fail(`add: change-set is ${cs.state}, can only add to an open set`);
  const newBlocks = flagAll('--block').filter((b) => !cs.blocks.includes(b));
  cs.blocks.push(...newBlocks);
  cs.updated_at = new Date().toISOString();
  cs.history.push({ at: cs.updated_at, event: 'add_blocks', note: newBlocks.join(', ') });
  writeCs(cs);
  out({ ok: true, change_set: cs }, `✓ ${id} now has ${cs.blocks.length} block(s): ${cs.blocks.join(', ')}`);
  process.exit(0);
}

if (cmd === 'list') {
  ensureDir();
  const sets = fs.readdirSync(CS_DIR).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(CS_DIR, f), 'utf8')))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (JSON_OUT) { out({ ok: true, change_sets: sets }); process.exit(0); }
  if (!sets.length) { console.log('No change-sets yet. Create one: node scripts/change_set.mjs create --intent "..."'); process.exit(0); }
  console.log('Change-sets:');
  for (const cs of sets) {
    console.log(`  ${cs.id}  [${cs.state}]  ${cs.blocks.length} block(s)  — ${cs.intent}`);
  }
  process.exit(0);
}

if (cmd === 'status') {
  const id = flag('--id'); if (!id) fail('status: --id <cs> required');
  const cs = readCs(id);
  const results = cs.blocks.map((b) => ({ block: b, verdict: verifyBlock(b) }));
  const allPass = results.length > 0 && results.every((r) => r.verdict === 'pass');
  const anyFail = results.some((r) => r.verdict === 'fail');
  const overall = results.length === 0 ? 'empty' : allPass ? 'all-green' : anyFail ? 'torn (has failing blocks)' : 'inconclusive';
  const report = { ok: true, id: cs.id, intent: cs.intent, state: cs.state, overall, blocks: results };
  if (JSON_OUT) { out(report); process.exit(0); }
  console.log(`Change-set ${cs.id} [${cs.state}] — ${cs.intent}`);
  console.log(`  overall: ${overall}`);
  for (const r of results) {
    const mark = r.verdict === 'pass' ? '✓' : r.verdict === 'fail' ? '✗' : '~';
    console.log(`    ${mark} ${r.block}: ${r.verdict}`);
  }
  if (!allPass && cs.state === 'open') console.log(`  → commit is blocked until every block is green.`);
  process.exit(0);
}

if (cmd === 'commit') {
  const id = flag('--id'); if (!id) fail('commit: --id <cs> required');
  const cs = readCs(id);
  if (cs.state !== 'open') fail(`commit: change-set is ${cs.state}, not open`);
  if (!cs.blocks.length) fail('commit: change-set has no blocks');
  const results = cs.blocks.map((b) => ({ block: b, verdict: verifyBlock(b) }));
  const allPass = results.every((r) => r.verdict === 'pass');
  if (!allPass) {
    const bad = results.filter((r) => r.verdict !== 'pass').map((r) => `${r.block}:${r.verdict}`).join(', ');
    fail(`commit refused — not all blocks green: ${bad}. A cross-cutting change ships as a unit or not at all.`);
  }
  cs.state = 'committed';
  cs.committed_at = new Date().toISOString();
  cs.updated_at = cs.committed_at;
  cs.history.push({ at: cs.committed_at, event: 'committed', note: `${cs.blocks.length} blocks all green` });
  writeCs(cs);
  out({ ok: true, change_set: cs, blocks: results }, `✓ committed ${id} — all ${cs.blocks.length} block(s) green. Cross-cutting change is consistent.`);
  process.exit(0);
}

if (cmd === 'rollback') {
  const id = flag('--id'); if (!id) fail('rollback: --id <cs> required');
  const reason = flag('--reason', 'no reason given');
  const cs = readCs(id);
  if (cs.state === 'rolled-back') fail('rollback: already rolled back');
  cs.state = 'rolled-back';
  cs.rolled_back_at = new Date().toISOString();
  cs.rollback_reason = reason;
  cs.updated_at = cs.rolled_back_at;
  cs.history.push({ at: cs.rolled_back_at, event: 'rolled_back', note: reason });
  writeCs(cs);
  // Annotate each member's narrative so the operator sees what to revert.
  // We never auto-delete/revert code — surface for review (operator principle).
  for (const b of cs.blocks) {
    const nar = path.join(ATLAS, 'blocks', b, 'narrative.md');
    try {
      fs.appendFileSync(nar, `\n## ${cs.rolled_back_at} · change-set ${cs.id} rolled back\n\n### What and why\n- Cross-cutting change «${cs.intent}» was rolled back. Reason: ${reason}\n\n### Recommended action\n- Operator: review whether this block's contract/code needs to revert to its pre-change state (this change-set is no longer being shipped).\n`);
    } catch {}
  }
  out({ ok: true, change_set: cs }, `✓ rolled back ${id}. ${cs.blocks.length} member block(s) annotated for operator review. (Code not auto-reverted — surfaced for review.)`);
  process.exit(0);
}

fail(`unknown command "${cmd || ''}". Commands: create · add · list · status · commit · rollback`);

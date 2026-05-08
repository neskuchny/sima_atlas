#!/usr/bin/env node
// PR-1 (b.operator-profile-learner): selftest for scripts/aggregate_operator_profile.mjs
//
// 7 test groups covering:
//  1. Empty repo → warming_up + profile written + history snapshot
//  2. Synthetic repo with < min data → still warming_up
//  3. Synthetic repo at min threshold → switches to "live"
//  4. work_style aggregation: rollback_rate, median_time_idea_to_done_h
//  5. agents_used picks agent from llm_extraction note
//  6. tech_stack_history with satisfaction inferred from rollback per block
//  7. proposals_stats accept/reject rates

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aggregateOperatorProfile } from '../scripts/aggregate_operator_profile.mjs';

const failures = [];
function check(name, cond, detail = '') {
  if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

// Helpers to build a minimal synthetic atlas/ tree under a tmp dir
function buildSyntheticRepo({
  transitions = [],
  blockChecks = {},     // { blockId: [{ts, kind, result, note}] }
  blockGraph = null,    // graph.json
  llmTraces = [],
  proposals = [],
  decisions = {},
  patterns = {},
} = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opprofile-'));
  const atlas = path.join(tmp, 'atlas');
  fs.mkdirSync(atlas, { recursive: true });
  fs.mkdirSync(path.join(atlas, 'blocks'), { recursive: true });
  fs.mkdirSync(path.join(atlas, 'llm_traces'), { recursive: true });
  fs.mkdirSync(path.join(atlas, 'proposals'), { recursive: true });

  if (transitions.length) {
    fs.writeFileSync(path.join(atlas, 'transitions.log'),
      '# ts\tblock_id\tfrom\tto\tmeta\n' +
      transitions.map((t) => `${t.ts}\t${t.block_id}\t${t.from}\t${t.to}\t${t.meta || ''}`).join('\n') + '\n',
      'utf8');
  }

  for (const [blockId, lines] of Object.entries(blockChecks)) {
    const dir = path.join(atlas, 'blocks', blockId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'checks.log'),
      lines.map((l) => `${l.ts}\t${l.kind}\t${l.result || 'pass'}\t${l.note || ''}`).join('\n') + '\n',
      'utf8');
  }

  for (const [blockId, lines] of Object.entries(decisions)) {
    const dir = path.join(atlas, 'blocks', blockId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'decisions.log'),
      lines.map((l) => `${l.ts}\t${l.kind || 'misc'}\t${l.text}`).join('\n') + '\n',
      'utf8');
  }

  for (const [blockId, content] of Object.entries(patterns)) {
    const dir = path.join(atlas, 'blocks', blockId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'patterns.md'), content, 'utf8');
  }

  if (blockGraph) {
    fs.writeFileSync(path.join(atlas, 'graph.json'), JSON.stringify(blockGraph, null, 2), 'utf8');
  } else {
    fs.writeFileSync(path.join(atlas, 'graph.json'), JSON.stringify({ blocks: [] }), 'utf8');
  }

  for (const t of llmTraces) {
    fs.writeFileSync(path.join(atlas, 'llm_traces', `${t.at.replace(/[:.]/g, '-')}__${t.provider}__${t.prompt_hash}.json`),
      JSON.stringify(t), 'utf8');
  }

  for (const p of proposals) {
    fs.writeFileSync(path.join(atlas, 'proposals', `${p.id}.json`), JSON.stringify(p), 'utf8');
  }

  return atlas;
}

function cleanup(atlas) {
  // atlas is .../tmp/opprofile-XXX/atlas; remove parent.
  fs.rmSync(path.dirname(atlas), { recursive: true, force: true });
}

// ─── Group 1: empty repo
{
  const atlas = buildSyntheticRepo();
  const p = aggregateOperatorProfile({ atlas_root: atlas });
  check('empty:warming_up', p._status === 'warming_up');
  check('empty:profile written', fs.existsSync(path.join(atlas, 'operator_profile', 'profile.json')));
  check('empty:history snapshot', fs.readdirSync(path.join(atlas, 'operator_profile', 'history')).length === 1);
  check('empty:patterns warming_up', JSON.parse(fs.readFileSync(path.join(atlas, 'operator_profile', 'patterns', 'work_style.json'), 'utf8'))._status === 'warming_up');
  cleanup(atlas);
}

// ─── Group 2: synthetic but below threshold → warming_up
{
  const transitions = [
    { ts: '2026-04-01T00:00:00Z', block_id: 'b.x', from: 'idea', to: 'wip' },
    { ts: '2026-04-01T01:00:00Z', block_id: 'b.x', from: 'wip',  to: 'done' },
    { ts: '2026-04-02T00:00:00Z', block_id: 'b.y', from: 'idea', to: 'wip' },
    { ts: '2026-04-02T01:00:00Z', block_id: 'b.y', from: 'wip',  to: 'done' },
  ];
  const atlas = buildSyntheticRepo({ transitions });
  const p = aggregateOperatorProfile({ atlas_root: atlas });
  check('below_threshold:warming_up', p._status === 'warming_up', `status=${p._status} done=${p._preview.total_done}`);
  check('below_threshold:preview total_done=2', p._preview.total_done === 2);
  cleanup(atlas);
}

// ─── Group 3: at threshold → live
{
  const transitions = [
    ['b.a','wip'],['b.a','done'],
    ['b.b','wip'],['b.b','done'],
    ['b.c','wip'],['b.c','done'],
    ['b.d','wip'],['b.d','done'],
    ['b.e','wip'],['b.e','done'],
  ].map(([id, to], i) => ({ ts: `2026-04-${String(i+1).padStart(2,'0')}T00:00:00Z`, block_id: id, from: to === 'wip' ? 'idea' : 'wip', to }));
  const atlas = buildSyntheticRepo({ transitions });
  const p = aggregateOperatorProfile({ atlas_root: atlas });
  check('at_threshold:live', p._status === 'live', `status=${p._status}`);
  check('at_threshold:work_style.total_done', p.work_style?.total_done === 5);
  check('at_threshold:patterns work_style live',
    JSON.parse(fs.readFileSync(path.join(atlas, 'operator_profile', 'patterns', 'work_style.json'), 'utf8')).total_done === 5);
  cleanup(atlas);
}

// ─── Group 4: work_style — rollback_rate + median time
{
  const transitions = [
    // 5 done blocks (each idea→wip→done)
    { ts: '2026-04-01T00:00:00Z', block_id: 'b.a', from: 'idea', to: 'wip' },
    { ts: '2026-04-01T02:00:00Z', block_id: 'b.a', from: 'wip', to: 'done' },
    { ts: '2026-04-02T00:00:00Z', block_id: 'b.b', from: 'idea', to: 'wip' },
    { ts: '2026-04-02T04:00:00Z', block_id: 'b.b', from: 'wip', to: 'done' },
    { ts: '2026-04-03T00:00:00Z', block_id: 'b.c', from: 'idea', to: 'wip' },
    { ts: '2026-04-03T06:00:00Z', block_id: 'b.c', from: 'wip', to: 'done' },
    { ts: '2026-04-04T00:00:00Z', block_id: 'b.d', from: 'idea', to: 'wip' },
    { ts: '2026-04-04T08:00:00Z', block_id: 'b.d', from: 'wip', to: 'done' },
    { ts: '2026-04-05T00:00:00Z', block_id: 'b.e', from: 'idea', to: 'wip' },
    { ts: '2026-04-05T10:00:00Z', block_id: 'b.e', from: 'wip', to: 'done' },
    // 1 broken
    { ts: '2026-04-06T00:00:00Z', block_id: 'b.f', from: 'wip', to: 'broken' },
  ];
  const atlas = buildSyntheticRepo({ transitions });
  const p = aggregateOperatorProfile({ atlas_root: atlas });
  // Median of [2,4,6,8,10] is 6
  check('work_style:median 6h', p.work_style?.median_time_idea_to_done_h === 6,
    `got ${p.work_style?.median_time_idea_to_done_h}`);
  // rollback_rate = 1/(1+5) = 0.17
  check('work_style:rollback_rate ~0.17',
    Math.abs((p.work_style?.rollback_rate ?? 0) - 0.17) < 0.01,
    `got ${p.work_style?.rollback_rate}`);
  cleanup(atlas);
}

// ─── Group 5: agents_used picks agent from note
{
  const transitions = Array.from({ length: 5 }, (_, i) => ([
    { ts: `2026-04-0${i+1}T00:00:00Z`, block_id: `b.${i}`, from: 'idea', to: 'wip' },
    { ts: `2026-04-0${i+1}T01:00:00Z`, block_id: `b.${i}`, from: 'wip', to: 'done' },
  ])).flat();
  const blockChecks = {
    'b.0': [
      { ts: '2026-04-01T00:30:00Z', kind: 'llm_extraction', result: 'pass', note: 'applied touched=1 provider=mock model=mock-1' },
      { ts: '2026-04-01T00:40:00Z', kind: 'agent_invocation', result: 'pass', note: 'agent=claude block=b.x exit=0' },
    ],
    'b.1': [
      { ts: '2026-04-02T00:30:00Z', kind: 'agent_invocation', result: 'pass', note: 'agent=claude block=b.y exit=0' },
      { ts: '2026-04-02T00:40:00Z', kind: 'agent_invocation', result: 'fail', note: 'agent=claude block=b.y exit=1' },
    ],
  };
  const atlas = buildSyntheticRepo({ transitions, blockChecks });
  const p = aggregateOperatorProfile({ atlas_root: atlas });
  check('agents:claude detected', p.agents_used?.claude !== undefined,
    `got: ${JSON.stringify(Object.keys(p.agents_used || {}))}`);
  check('agents:claude count=3', p.agents_used?.claude?.count === 3,
    `got: ${p.agents_used?.claude?.count}`);
  // 2 pass / 1 fail = 0.67
  check('agents:claude success_rate ~0.67', Math.abs((p.agents_used?.claude?.success_rate ?? 0) - 0.67) < 0.01,
    `got: ${p.agents_used?.claude?.success_rate}`);
  cleanup(atlas);
}

// ─── Group 6: tech_stack_history with satisfaction
{
  // 5 done blocks all using "fastify" → all rollback=0 → high satisfaction
  // 5 broken blocks all using "express" → satisfaction low
  // We need at-threshold done (5) but also broken events for express
  const blocks = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `b.fast${i}`, layer: 'logic', tech_stack: ['fastify'] })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `b.exp${i}`, layer: 'logic', tech_stack: ['express'] })),
  ];
  const transitions = [
    ...blocks.slice(0, 5).flatMap((b, i) => ([
      { ts: `2026-04-${String(i+1).padStart(2,'0')}T00:00:00Z`, block_id: b.id, from: 'idea', to: 'wip' },
      { ts: `2026-04-${String(i+1).padStart(2,'0')}T01:00:00Z`, block_id: b.id, from: 'wip', to: 'done' },
    ])),
    ...blocks.slice(5).flatMap((b, i) => ([
      { ts: `2026-04-${String(i+10).padStart(2,'0')}T00:00:00Z`, block_id: b.id, from: 'wip', to: 'broken' },
    ])),
  ];
  const atlas = buildSyntheticRepo({ transitions, blockGraph: { blocks } });
  const p = aggregateOperatorProfile({ atlas_root: atlas });
  const backend = p.tech_stack_history?.backend || [];
  const fastify = backend.find((x) => x.name === 'fastify');
  const express = backend.find((x) => x.name === 'express');
  check('tech:fastify uses=5', fastify?.uses === 5);
  check('tech:fastify satisfaction=high', fastify?.satisfaction === 'high', `got ${fastify?.satisfaction}`);
  check('tech:express satisfaction=low', express?.satisfaction === 'low', `got ${express?.satisfaction}`);
  cleanup(atlas);
}

// ─── Group 7: proposals accept/reject rates
{
  const transitions = Array.from({ length: 5 }, (_, i) => ([
    { ts: `2026-04-0${i+1}T00:00:00Z`, block_id: `b.${i}`, from: 'idea', to: 'wip' },
    { ts: `2026-04-0${i+1}T01:00:00Z`, block_id: `b.${i}`, from: 'wip', to: 'done' },
  ])).flat();
  const proposals = [
    { id: 'p1', block_id: 'b.0', verdict: 'accepted' },
    { id: 'p2', block_id: 'b.0', verdict: 'accepted' },
    { id: 'p3', block_id: 'b.1', verdict: 'rejected' },
    { id: 'p4', block_id: 'b.1', verdict: 'pending' },
  ];
  const atlas = buildSyntheticRepo({ transitions, proposals });
  const p = aggregateOperatorProfile({ atlas_root: atlas });
  check('proposals:total=4', p.proposals_stats?.total === 4);
  check('proposals:accept_rate=0.5', p.proposals_stats?.accept_rate === 0.5,
    `got ${p.proposals_stats?.accept_rate}`);
  check('proposals:reject_rate=0.25', p.proposals_stats?.reject_rate === 0.25,
    `got ${p.proposals_stats?.reject_rate}`);
  cleanup(atlas);
}

if (failures.length) {
  console.error('operator_profile.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('operator_profile.selftest: OK (7 test groups, all assertions green)');

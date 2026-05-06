#!/usr/bin/env node
// Phase R-2 — «Sima, fill the schema from this chat».
//
// Single orchestrator that turns a chat transcript into:
//   1. extracted insights (goals / constraints / ideas / risks / terms)
//   2. fills missing/weak contract fields on existing target blocks
//      (mission / user_story / kpi / acceptance / depends_on / provides)
//   3. proposes 1-3 NEW blocks the chat suggests
//   4. flags ambiguities the operator must clarify
//   5. saves a structured plan to atlas/proposals/<ts>__chat_fill.json
//      so the operator can review/accept/reject in the «✦ Предложения» panel
//
// Designed to be called:
//   - as MCP tool sima_fill_from_chat (so Claude Code / Cursor / Codex
//     can invoke it inside their own session)
//   - via /atlas/sima/fill-from-chat HTTP route (UI button)
//   - directly from CLI for ad-hoc batches
//
// CLI:
//   node scripts/sima_fill_from_chat.mjs --transcript-path=<file> [--target=b.id ...] [--dry-run] [--json]
//   echo "<transcript text>" | node scripts/sima_fill_from_chat.mjs --stdin [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractInsights, synthesizeBlock, fillField } from './atlas_synthesis_api.mjs';
import { patchBlockFile } from './atlas_blocks_api.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS_DEFAULT = path.join(ROOT, 'atlas');

function readGraph(root) {
  const p = path.join(root || ATLAS_DEFAULT, 'graph.json');
  if (!fs.existsSync(p)) return { blocks: [], edges: [] };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { blocks: [], edges: [] }; }
}
function readMd(root, block_id, file) {
  const p = path.join(root || ATLAS_DEFAULT, 'blocks', block_id, file);
  try { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; } catch { return ''; }
}
function isWeak(content) {
  if (!content) return true;
  const body = String(content).replace(/^#[^\n]*\n+/, '').trim();
  if (!body) return true;
  if (body.length < 80) return true;
  if (/Заполни через детальную панель|добавь конкретную метрику|^- none\s*$/im.test(body)) return true;
  return false;
}

const FIELDS_TO_FILL = ['mission.md', 'user_story.md', 'kpi.md', 'acceptance.md'];

export async function simaFillFromChat({
  transcript,
  target_block_ids,
  proposeNew = true,
  dryRun = false,
  productContext,
  root,
  client_id,
} = {}) {
  if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 30) {
    throw new Error('simaFillFromChat: transcript (≥ 30 chars) required');
  }
  const atlas = root || (client_id ? path.join(ROOT, 'atlas', 'clients', client_id) : ATLAS_DEFAULT);
  const startedAt = new Date().toISOString();

  // ── Step 1: extract insights so the rest of the pipeline has structure
  const insights = await extractInsights({ text: transcript, kind: 'transcript' });
  const mock = !!insights.mock;

  // ── Step 2: walk target blocks (or all live blocks), fill weak fields
  const graph = readGraph(atlas);
  const liveBlocks = (graph.blocks || []).filter((b) => b.status !== 'archived');
  const targets = target_block_ids?.length
    ? liveBlocks.filter((b) => target_block_ids.includes(b.id))
    : liveBlocks;

  const filled = [];
  for (const b of targets) {
    const fields_filled = [];
    const fields_skipped = [];
    const layer = b.layer || 'logic';
    const missionCurrent = readMd(atlas, b.id, 'mission.md');
    for (const f of FIELDS_TO_FILL) {
      const cur = readMd(atlas, b.id, f);
      if (!isWeak(cur)) { fields_skipped.push({ file: f, reason: 'already filled' }); continue; }
      let r;
      try {
        r = await fillField({
          block_id: b.id,
          field: f,
          mission_context: `${missionCurrent}\n\n--- additional context from chat ---\n${transcript.slice(0, 4000)}`,
          layer,
          neighbors: { kpi: readMd(atlas, b.id, 'kpi.md'), acceptance: readMd(atlas, b.id, 'acceptance.md') },
        });
      } catch (e) {
        fields_skipped.push({ file: f, reason: String(e.message || e) });
        continue;
      }
      if (!r?.ok || !r.content || !r.content.trim()) {
        fields_skipped.push({ file: f, reason: 'LLM returned empty (likely demo mode)' });
        continue;
      }
      // Wrap with H1 if missing
      const heading = `# ${b.id} — ${f.replace(/\.md$/, '')}`;
      const body = r.content.trim();
      const content = body.startsWith('#') ? body + '\n' : `${heading}\n\n${body}\n`;
      if (!dryRun) {
        try {
          patchBlockFile({ atlas_root: atlas, block_id: b.id, file: f, content });
          fields_filled.push({ file: f, bytes: content.length });
        } catch (e) {
          fields_skipped.push({ file: f, reason: String(e.message || e) });
        }
      } else {
        fields_filled.push({ file: f, bytes: content.length, dry_run: true, preview: content.slice(0, 200) });
      }
    }
    if (fields_filled.length || fields_skipped.length) {
      filled.push({ block_id: b.id, title: b.title || b.id, fields_filled, fields_skipped });
    }
  }

  // ── Step 3: propose new blocks the chat suggests
  let proposals = [];
  if (proposeNew) {
    try {
      const r = await synthesizeBlock({
        source_text: transcript,
        product_context: productContext || null,
        count: 3,
      });
      if (r?.ok && Array.isArray(r.proposals)) {
        // Filter out proposals whose id collides with existing blocks
        const existingIds = new Set(liveBlocks.map((b) => b.id));
        proposals = r.proposals.filter((p) => p.id && !existingIds.has(p.id));
      }
    } catch (e) {
      // non-fatal — we still return the fill results
    }
  }

  // ── Step 4: derive ambiguities — pieces that didn't make it through
  const ambiguities = [];
  if (insights.summary && !filled.length && !proposals.length) {
    ambiguities.push('Sima извлекла смыслы, но не нашла блоков, к которым их применить — возможно нужно сначала создать первые блоки руками или через шаблон.');
  }
  for (const f of filled) {
    for (const s of f.fields_skipped) {
      if (/empty.*demo/.test(s.reason)) ambiguities.push(`${f.block_id}/${s.file}: LLM вернул пусто (demo mode без ключа?)`);
    }
  }

  // ── Step 5: persist proposal so it shows in «✦ Предложения» panel.
  // Phase R-4: verdict='pending' is required for list_proposals to surface
  // it; without this the chat_fill plans were silently dropped.
  const plan = {
    id: `${startedAt.replace(/[:.]/g, '-')}__chat_fill`,
    kind: 'chat_fill',
    verdict: 'pending',
    block_id: null,
    created_at: startedAt,
    source: { provider: insights.provider || null, model: insights.model || null, mock },
    summary: {
      target_blocks_count: targets.length,
      filled_blocks_count: filled.filter((f) => f.fields_filled.length).length,
      total_fields_filled: filled.reduce((s, f) => s + f.fields_filled.length, 0),
      proposed_new_blocks: proposals.length,
      ambiguities: ambiguities.length,
    },
    insights: {
      summary: insights.summary,
      goals: insights.goals,
      constraints: insights.constraints,
      ideas: insights.ideas,
      risks: insights.risks,
      terms: insights.terms,
    },
    filled,
    new_block_proposals: proposals,
    ambiguities,
  };

  if (!dryRun) {
    try {
      const dir = path.join(atlas, 'proposals');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${plan.id}.json`), JSON.stringify(plan, null, 2) + '\n', 'utf8');
    } catch {}
  }

  return { ok: true, dry_run: dryRun, plan, mock };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const wantJson = args.includes('--json');
  const dryRun = args.includes('--dry-run');
  const useStdin = args.includes('--stdin');
  const transcriptPathArg = args.find((a) => a.startsWith('--transcript-path='));
  const targets = args.filter((a) => a.startsWith('--target=')).map((a) => a.slice(9));
  const clientArg = args.find((a) => a.startsWith('--client='));
  const client_id = clientArg ? clientArg.slice(9) : undefined;

  (async () => {
    let transcript;
    if (useStdin) {
      transcript = await new Promise((resolve) => {
        let buf = ''; process.stdin.on('data', (d) => buf += d); process.stdin.on('end', () => resolve(buf));
      });
    } else if (transcriptPathArg) {
      const eq = transcriptPathArg.indexOf('=');
      const p = transcriptPathArg.slice(eq + 1);
      transcript = fs.readFileSync(p, 'utf8');
    } else {
      console.error('usage: sima_fill_from_chat.mjs (--stdin | --transcript-path=<file>) [--target=b.id ...] [--client=<id>] [--dry-run] [--json]');
      process.exit(1);
    }

    try {
      const r = await simaFillFromChat({
        transcript,
        target_block_ids: targets.length ? targets : undefined,
        dryRun, client_id,
      });
      if (wantJson) {
        console.log(JSON.stringify(r, null, 2));
      } else {
        const p = r.plan;
        console.log(`sima_fill_from_chat: ${r.mock ? '(demo mode)' : '(real)'}`);
        console.log(`  filled blocks:     ${p.summary.filled_blocks_count}/${p.summary.target_blocks_count} (${p.summary.total_fields_filled} fields)`);
        console.log(`  new proposals:     ${p.summary.proposed_new_blocks}`);
        console.log(`  ambiguities:       ${p.summary.ambiguities}`);
        if (!dryRun) console.log(`  plan saved:        atlas/proposals/${p.id}.json`);
      }
    } catch (e) {
      console.error('sima_fill_from_chat: FAIL —', e.message);
      process.exit(1);
    }
  })();
}

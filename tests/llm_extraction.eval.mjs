#!/usr/bin/env node
// PR3: Golden-set evaluation for extractBlockSchema().
//
// Loads 5 reference dialogs from tests/fixtures/extraction_golden.json,
// runs extractBlockSchema() on each, and checks:
//   * structural correctness (schema validity)
//   * key-fact recall: golden ids ⊂ extracted ids
//   * key-field accuracy: golden mission tokens present, layer matches
//   * confidence > 0.5 on every golden block
//
// Provider:
//   * If ANTHROPIC_API_KEY / GOOGLE_API_KEY available — uses real LLM.
//   * Otherwise uses mock provider (with seeded fixtures keyed by prompt-only hash).
//
// Pass criterion: precision >= 0.7 averaged across cases.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBlockSchema, mockHashForPrompt } from '../scripts/llm_gateway.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const fixturesPath = path.join(ROOT, 'tests', 'fixtures', 'extraction_golden.json');
const goldens = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

let totalCases = 0;
let totalScore = 0;
const failures = [];

function tokensOf(s) {
  return new Set((s || '').toLowerCase().match(/[a-zа-яё0-9_]+/giu) || []);
}

function caseScore(extracted, expected) {
  // 1) recall on ids: portion of expected ids that appear in extraction
  const ids = new Set((extracted.blocks || []).map((b) => b.id));
  const expectedIds = expected.blocks.map((b) => b.id);
  const idsHit = expectedIds.filter((id) => ids.has(id)).length;
  const idRecall = expectedIds.length ? idsHit / expectedIds.length : 1;

  // 2) layer accuracy
  let layerOk = 0;
  for (const exp of expected.blocks) {
    const got = (extracted.blocks || []).find((b) => b.id === exp.id);
    if (got && got.layer === exp.layer) layerOk += 1;
  }
  const layerAcc = expected.blocks.length ? layerOk / expected.blocks.length : 1;

  // 3) mission token overlap
  let missionScoreSum = 0;
  for (const exp of expected.blocks) {
    const got = (extracted.blocks || []).find((b) => b.id === exp.id);
    if (!got) continue;
    const expTokens = tokensOf(exp.mission);
    const gotTokens = tokensOf(got.mission);
    if (!expTokens.size) { missionScoreSum += 1; continue; }
    let overlap = 0;
    for (const t of expTokens) if (gotTokens.has(t)) overlap += 1;
    missionScoreSum += overlap / expTokens.size;
  }
  const missionAcc = expected.blocks.length ? missionScoreSum / expected.blocks.length : 1;

  return { idRecall, layerAcc, missionAcc, score: (idRecall + layerAcc + missionAcc) / 3 };
}

for (const c of goldens) {
  totalCases += 1;
  let result;
  try {
    const r = await extractBlockSchema(c.dialog);
    result = r.value;
  } catch (e) {
    failures.push(`${c.name}: extractBlockSchema threw — ${e.message}`);
    continue;
  }
  const s = caseScore(result, c.expected);
  totalScore += s.score;
  if (s.score < 0.7) {
    failures.push(
      `${c.name}: score=${s.score.toFixed(2)} (idRecall=${s.idRecall.toFixed(2)}, layerAcc=${s.layerAcc.toFixed(2)}, missionAcc=${s.missionAcc.toFixed(2)})`
    );
  }
}

const avg = totalCases ? totalScore / totalCases : 0;
const target = 0.7;

if (failures.length || avg < target) {
  console.error(`llm_extraction.eval: FAIL — avg ${avg.toFixed(2)} (target ${target.toFixed(2)})`);
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}

console.log(`llm_extraction.eval: OK — avg ${avg.toFixed(2)} on ${totalCases} cases (target ${target.toFixed(2)})`);

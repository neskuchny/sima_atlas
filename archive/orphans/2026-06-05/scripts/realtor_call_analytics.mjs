#!/usr/bin/env node
// b.block-10 (my-saas): агрегация метрик по звонкам риелторов из NDJSON/JSONL.
// Вход: файл (--input) или stdin; каждая строка — объект JSON с полем transcript (строка).
// Дополнительные поля: id, agentName | agent, durationSec | duration (число).
// Выход: один JSON-объект в stdout. Без встроенных «демо»-звонков — только из потока.

import fs from 'node:fs';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

const TOPIC_PATTERNS = [
  { key: 'mortgage', re: /ипотек|ипотек[а-я]*|банк|ставк|одобрен/i },
  { key: 'showing', re: /показ|просмотр|встреч|подъезд|экскурс/i },
  { key: 'object', re: /объект|квартир|дом|недвижим|метраж|этаж|район/i },
  { key: 'pricing', re: /цен|стоим|торг|скидк|задаток|залог/i },
  { key: 'client_intent', re: /купл|покуп|интерес|готов|реш|срок/i },
];

function usage() {
  console.error(`Usage: node ${pathBasename(__filename)} --input <file.ndjson>
       cat calls.ndjson | node ${pathBasename(__filename)}`);
}

function pathBasename(p) {
  return p.split(/[/\\]/).pop();
}

function pickAgent(rec) {
  if (rec && typeof rec.agentName === 'string' && rec.agentName.trim()) return rec.agentName.trim();
  if (rec && typeof rec.agent === 'string' && rec.agent.trim()) return rec.agent.trim();
  return '_unknown';
}

function pickDuration(rec) {
  const d = rec?.durationSec ?? rec?.duration;
  const n = Number(d);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function countTopicHits(text) {
  const hits = {};
  for (const { key, re } of TOPIC_PATTERNS) {
    const m = text.match(re);
    hits[key] = m ? 1 : 0;
  }
  return hits;
}

function mergeTopicTotals(totals, hits) {
  const out = { ...totals };
  for (const k of Object.keys(hits)) {
    out[k] = (out[k] || 0) + hits[k];
  }
  return out;
}

function emptyReport() {
  const topicTotals = Object.fromEntries(TOPIC_PATTERNS.map((t) => [t.key, 0]));
  return {
    version: 1,
    calls_total: 0,
    calls_with_transcript: 0,
    parse_errors: 0,
    duration: { count_with_value: 0, sum_sec: 0, avg_sec: null },
    words: { total: 0, avg_per_call: null },
    topics: { calls_with_hit: Object.fromEntries(TOPIC_PATTERNS.map((t) => [t.key, 0])), totals: topicTotals },
    by_agent: {},
  };
}

function finalizeReport(r) {
  const n = r.calls_with_transcript;
  if (n > 0) r.words.avg_per_call = r.words.total / n;
  const dc = r.duration.count_with_value;
  if (dc > 0) r.duration.avg_sec = r.duration.sum_sec / dc;
  return r;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    usage();
    process.exit(0);
  }
  let inputPath = null;
  const i = argv.indexOf('--input');
  if (i >= 0 && argv[i + 1]) inputPath = argv[i + 1];

  const report = emptyReport();
  const stream = inputPath
    ? fs.createReadStream(inputPath, { encoding: 'utf8' })
    : process.stdin;

  if (inputPath && !fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(2);
  }

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      report.parse_errors += 1;
      continue;
    }
    report.calls_total += 1;
    const transcript = typeof rec.transcript === 'string' ? rec.transcript : '';
    if (!transcript.trim()) continue;
    report.calls_with_transcript += 1;

    const words = transcript.trim().split(/\s+/).filter(Boolean);
    report.words.total += words.length;

    const agent = pickAgent(rec);
    if (!report.by_agent[agent]) {
      report.by_agent[agent] = { calls: 0, words: 0, duration_sum_sec: 0, duration_count: 0 };
    }
    const ba = report.by_agent[agent];
    ba.calls += 1;
    ba.words += words.length;

    const dur = pickDuration(rec);
    if (dur != null) {
      report.duration.count_with_value += 1;
      report.duration.sum_sec += dur;
      ba.duration_sum_sec += dur;
      ba.duration_count += 1;
    }

    const hits = countTopicHits(transcript);
    report.topics.totals = mergeTopicTotals(report.topics.totals, hits);
    for (const key of Object.keys(hits)) {
      if (hits[key]) report.topics.calls_with_hit[key] += 1;
    }
  }

  for (const agent of Object.keys(report.by_agent)) {
    const ba = report.by_agent[agent];
    ba.avg_words_per_call = ba.calls ? ba.words / ba.calls : null;
    ba.avg_duration_sec = ba.duration_count ? ba.duration_sum_sec / ba.duration_count : null;
  }

  console.log(JSON.stringify(finalizeReport(report), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

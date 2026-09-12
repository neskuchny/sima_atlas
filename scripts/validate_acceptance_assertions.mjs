// R-8.05 — this validator used to test `checks.log.toLowerCase().includes('pass')`
// over the WHOLE file. Any occurrence of the word anywhere — including the
// note field of a FAILING line (`verdict=fail pass=0 fail=2`) or an unrelated
// `sync pass transition -> done` — satisfied «done block requires acceptance
// pass». A done block whose only acceptance_verifier line said fail validated
// green. It now parses checks.log as TSV and judges the LATEST line per kind,
// with acceptance_runs/<id>/_latest.json authoritative when present.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlasRoot = process.env.ATLAS_ROOT || path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlasRoot, 'graph.json'), 'utf8'));

function read(p) {
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

// checks.log line shape: <ts>\t<kind>\t<result>\t<note>
// Two formats coexist in this repo: the current tab-separated one and a legacy
// space-aligned one written before the TSV convention (e.g. b.core-sync,
// b.docs). Both are real history, so both are parsed; splitting on a tab OR a
// run of 2+ spaces handles them without loosening what counts as a pass.
const VERDICTS = new Set(['pass', 'fail', 'inconclusive', 'skipped', 'warn']);
function parseChecks(text) {
  return text.split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => l.split(/\t|\s{2,}/).map((c) => c.trim()).filter(Boolean))
    .filter((c) => c.length >= 3)
    .map(([ts, kind, result, ...rest]) => ({
      ts: ts || '',
      kind: (kind || '').toLowerCase(),
      result: (result || '').toLowerCase(),
      note: rest.join(' ').trim(),
    }))
    // A legacy line can carry a trailing date column; keep only rows whose
    // result column is an actual verdict so a note word can never pose as one.
    .filter((c) => VERDICTS.has(c.result));
}

// Latest entry whose kind matches, by file order (checks.log is append-only).
function latestOfKind(entries, kindPredicate) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (kindPredicate(entries[i].kind)) return entries[i];
  }
  return null;
}

function parseChecklist(md){
  return md.split(/\r?\n/)
    .map(l => l.trim())
    .map((l) => {
      const m = l.match(/^- \[( |x|X)\] (.+)$/);
      if (!m) return null;
      return { checked: m[1].toLowerCase()==='x', text: m[2].trim() };
    })
    .filter(Boolean);
}

const errors = [];
for (const b of graph.blocks || []) {
  if (!['review', 'done'].includes(b.status)) continue;
  const blockDir = path.join(atlasRoot, 'blocks', b.id);
  const checksText = read(path.join(blockDir, 'checks.log'));
  const entries = parseChecks(checksText);
  const acceptanceMd = read(path.join(blockDir, 'acceptance.md'));
  const items = parseChecklist(acceptanceMd);

  if (!checksText.trim()) {
    errors.push(`${b.id}: checks.log empty for status=${b.status}`);
    continue;
  }

  if (items.length < 2) {
    errors.push(`${b.id}: acceptance.md should contain at least 2 checklist items`);
  }

  const latestAcceptance = latestOfKind(entries, (k) => k.includes('acceptance'));
  if (!latestAcceptance) errors.push(`${b.id}: missing acceptance assertion in checks.log`);

  if (b.status === 'review') {
    const semanticTokens = ['логика', 'завис', 'ui', 'sync', 'scenario', 'flow'];
    if (!semanticTokens.some(t => acceptanceMd.toLowerCase().includes(t))) {
      errors.push(`${b.id}: acceptance.md lacks semantic scenario tokens`);
    }
  }

  if (b.status === 'done') {
    const checkedCount = items.filter(i => i.checked).length;
    if (checkedCount === 0) errors.push(`${b.id}: done block requires checked acceptance items`);

    // The persisted run report is authoritative when it exists; checks.log is
    // the fallback for blocks verified before the runs directory existed.
    const latestRunPath = path.join(atlasRoot, 'acceptance_runs', b.id, '_latest.json');
    let runVerdict = null;
    if (fs.existsSync(latestRunPath)) {
      try { runVerdict = JSON.parse(read(latestRunPath)).verdict || null; }
      catch (e) { errors.push(`${b.id}: acceptance_runs/_latest.json unparseable (${e.message})`); }
    }
    if (runVerdict && runVerdict !== 'pass') {
      errors.push(`${b.id}: done block requires acceptance pass — latest verifier verdict is "${runVerdict}"`);
    } else if (!runVerdict) {
      if (!latestAcceptance) {
        errors.push(`${b.id}: done block requires acceptance pass — no acceptance line in checks.log`);
      } else if (latestAcceptance.result !== 'pass') {
        errors.push(`${b.id}: done block requires acceptance pass — latest acceptance line is "${latestAcceptance.result}" (${latestAcceptance.note.slice(0, 80)})`);
      }
    }

    const latestKpi = latestOfKind(entries, (k) => k === 'kpi' || k.startsWith('kpi'));
    if (!latestKpi) {
      errors.push(`${b.id}: done block requires kpi pass — no kpi line in checks.log`);
    } else if (latestKpi.result !== 'pass') {
      errors.push(`${b.id}: done block requires kpi pass — latest kpi line is "${latestKpi.result}"`);
    }
  }
}

if (errors.length) {
  console.error('Acceptance assertions validation failed:');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}

console.log('Acceptance assertions validation: OK');

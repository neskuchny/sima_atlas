#!/usr/bin/env node
// R-8.13 (b.clarify) — a draft of a contract file is reviewed BEFORE it is
// written (OpenSpec: both sides see the delta, then it is applied). The
// review must name exactly the dangerous changes and stay quiet otherwise:
//   g1  «rewrite»: a removed check, a changed threshold, an added requirement
//   g2  numbers: labels (A2, KPI-3) are names, not values; units stay attached
//   g3  «not about this product»: judged only when both sides are long enough
//   g4  ticks, trailing spaces and the title never count as a change
//   g5  fill of an empty file: everything is «added», nothing is a risk
//   g6  the manual editor keeps the «## Layer» tail: no silent removal
//   g7  KPI-9 source: who wrote the contract text, from the audit lines
//
// Pure library, no server, no LLM. The HTTP route and the audit line are
// checked in tests/frame_gate_flow.selftest.mjs (F2).

import { reviewDraft, stems, numbersOf, draftWriteStats } from '../scripts/contract_draft_review.mjs';

const failures = [];
const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };
const kinds = (r) => r.risks.map((x) => `${x.kind}:${x.key || ''}`).sort();

const MISSION = '# b.export — mission\n\nЭкспорт месячного отчёта в CSV для финансового отдела, с фильтрами по подразделению и периоду. Выгрузка открывается в Excel и LibreOffice без ручной правки кодировки.\n\n## Layer\nlogic\n';
const PROJECT = '# Проект\n\nВнутренний портал финансовой отчётности: отчёты, выгрузки, фильтры по подразделениям, согласование бюджета.\n';

// ── g1: rewrite ─────────────────────────────────────────────────────────────
{
  const current = [
    '# b.export — acceptance', '',
    '- [ ] **A1.** Выгрузка месячного отчёта занимает < 2 с на 10 000 строк.',
    '- [ ] **A2.** CSV открывается в Excel без правки кодировки.',
    '- [ ] **A3.** Фильтр по подразделению сокращает выгрузку до его строк.',
  ].join('\n');
  const draft = [
    '# b.export — acceptance', '',
    '- [ ] **A1.** Выгрузка месячного отчёта укладывается в 5 с на 10 000 строк.',
    '- [ ] **A2.** Файл CSV открывается в Excel без ручной правки кодировки.',
    '- [ ] **A4.** Выгрузка пишет запись в журнал аудита.',
  ].join('\n');
  const r = reviewDraft({ file: 'acceptance.md', current, draft, mode: 'rewrite', mission: MISSION, project: PROJECT });
  check('g1: removed A3, threshold of A1, A4 added by a rewrite — and nothing else',
    JSON.stringify(kinds(r)) === JSON.stringify(['numbers:A1', 'removed:A3', 'rewrite_added:A4']), JSON.stringify(r.risks));
  const n = r.risks.find((x) => x.kind === 'numbers');
  check('g1: the threshold change names both values', JSON.stringify(n?.before) === '["2с"]' && JSON.stringify(n?.after) === '["5с"]', JSON.stringify(n));
  check('g1: A2 reworded without new numbers is a change, not a risk',
    r.delta.modified.some((m) => m.key === 'A2') && !r.risks.some((x) => x.key === 'A2'));
  check('g1: delta counts', r.delta.added.length === 1 && r.delta.modified.length === 2 && r.delta.removed.length === 1, JSON.stringify(r.delta).slice(0, 200));
  check('g1: on-topic draft is not flagged', !r.risks.some((x) => x.kind === 'off_topic'));

  const expand = reviewDraft({ file: 'acceptance.md', current, draft, mode: 'expand', mission: MISSION, project: PROJECT });
  check('g1: «expand» may add requirements — no rewrite_added there', !expand.risks.some((x) => x.kind === 'rewrite_added'));
  check('g1: …but a removal is a risk in any mode', expand.risks.some((x) => x.kind === 'removed' && x.key === 'A3'));
}

// ── g2: numbers ─────────────────────────────────────────────────────────────
{
  check('g2: labels are not values; units stay attached',
    JSON.stringify(numbersOf('- [ ] **A2.** < 2 с и 10 MB, 95% случаев, как в KPI-3')) === '["10mb","2с","95%"]',
    JSON.stringify(numbersOf('- [ ] **A2.** < 2 с и 10 MB, 95% случаев, как в KPI-3')));
  check('g2: decimal comma equals decimal point', JSON.stringify(numbersOf('1,5 с')) === JSON.stringify(numbersOf('1.5 с')));
  const kpi0 = '# k\n\n- **KPI-1 (скорость):** p95 выгрузки < 2 с.\n- **KPI-2:** доля ошибок < 1%.\n';
  const kpi1 = '# k\n\n- **KPI-1 (скорость):** p95 выгрузки меньше 2 с.\n- **KPI-2:** доля ошибок < 3%.\n';
  const r = reviewDraft({ file: 'kpi.md', current: kpi0, draft: kpi1, mode: 'rewrite', mission: MISSION, project: PROJECT });
  check('g2: same number in other words → no risk; 1% → 3% → risk on KPI-2 only',
    JSON.stringify(kinds(r)) === '["numbers:KPI-2"]', JSON.stringify(r.risks));
}

// ── g3: off topic ───────────────────────────────────────────────────────────
{
  const medical = [
    '# b.export — user story', '',
    'Как врач-терапевт, когда пациент приходит на приём с жалобами на давление,',
    'я хочу видеть историю назначений лекарств и результаты анализов крови,',
    'чтобы скорректировать дозировку препаратов и записать рекомендации в медицинскую карту.',
  ].join('\n');
  const r = reviewDraft({ file: 'user_story.md', current: '', draft: medical, mode: 'fill', mission: MISSION, project: PROJECT });
  const off = r.risks.find((x) => x.kind === 'off_topic');
  check('g3: a draft about another product is flagged with its basis', off && off.total >= 12 && off.shared / off.total < 0.15, JSON.stringify(r.relevance));
  const onTopic = [
    '# b.export — user story', '',
    'Как бухгалтер финансового отдела, в конце месяца,',
    'я хочу выгрузить месячный отчёт в CSV с фильтром по подразделению,',
    'чтобы открыть его в Excel и сверить расходы без ручной правки кодировки.',
  ].join('\n');
  const r2 = reviewDraft({ file: 'user_story.md', current: '', draft: onTopic, mode: 'fill', mission: MISSION, project: PROJECT });
  check('g3: a draft about this product is not flagged', !r2.risks.length && r2.relevance.judged === true, JSON.stringify(r2.relevance));
  const manual = reviewDraft({ file: 'user_story.md', current: '', draft: medical, mode: 'manual', mission: MISSION, project: PROJECT });
  check('g3: the operator\'s own text is never «off topic»', !manual.risks.some((x) => x.kind === 'off_topic') && manual.relevance.judged === false);
  const blind = reviewDraft({ file: 'user_story.md', current: '', draft: medical, mode: 'fill', mission: '# m\n\nTBD\n', project: '' });
  check('g3: nothing to compare with → not judged, no false alarm', !blind.risks.length && blind.relevance.judged === false, JSON.stringify(blind.relevance));
  check('g3: stems drop short and service words', !stems('блок это для контракта').size && stems('выгрузка выгрузки').size === 1);
}

// ── g4: not a change ────────────────────────────────────────────────────────
{
  const cur = '# b.export — acceptance\n\n- [x] **A1.** CSV открывается в Excel.   \n- [ ] **A2.** Фильтр работает.\n';
  const dr = '# b.export — acceptance — новая шапка\n\n- [ ] **A1.** CSV открывается в Excel.\n- [x] **A2.** Фильтр работает.';
  const r = reviewDraft({ file: 'acceptance.md', current: cur, draft: dr, mode: 'manual' });
  check('g4: ticks and trailing spaces are not changes; a new title is a change of the opening text, not a risk',
    !r.risks.length && r.delta.modified.length === 1 && r.delta.modified[0].key === '(начало)' && !r.delta.added.length && !r.delta.removed.length, JSON.stringify(r.delta));
  const same = reviewDraft({ file: 'acceptance.md', current: cur, draft: cur.replace('[x]', '[ ]'), mode: 'manual' });
  check('g4: only a tick differs → unchanged', same.unchanged === true && !same.risks.length, JSON.stringify(same.delta));
}

// ── g5: fill of an empty file ───────────────────────────────────────────────
{
  const draft = '# b.export — acceptance\n\n- [ ] **A1.** CSV открывается в Excel.\n- [ ] **A2.** Фильтр по подразделению работает.\n';
  const r = reviewDraft({ file: 'acceptance.md', current: '', draft, mode: 'fill', mission: MISSION, project: PROJECT });
  check('g5: all added, none removed, no risk', r.delta.added.filter((a) => a.key !== '(начало)').length === 2 && !r.delta.removed.length && !r.risks.length, JSON.stringify(r.risks));
  const tpl = '# b.export — acceptance\n\n- [ ] Заполни через детальную панель\n';
  const r2 = reviewDraft({ file: 'acceptance.md', current: tpl, draft, mode: 'fill', mission: MISSION, project: PROJECT });
  check('g5: replacing a template is not a «removal»', !r2.risks.some((x) => x.kind === 'removed'), JSON.stringify(r2.risks));
}

// ── g6: the «## Layer» tail ─────────────────────────────────────────────────
{
  // What the canvas writes when the manual editor keeps the tail (panels.jsx
  // composeContractContent) versus what it wrote before R-8.13.
  const kept = '# b.export — mission\n\nЭкспорт месячного отчёта в CSV, с фильтрами.\n\n## Layer\nlogic\n';
  const dropped = '# b.export — mission\n\nЭкспорт месячного отчёта в CSV, с фильтрами.\n';
  const r = reviewDraft({ file: 'mission.md', current: MISSION, draft: kept, mode: 'manual' });
  check('g6: kept tail → the edit is a change of the text only', !r.risks.length && !r.delta.removed.length, JSON.stringify(r.risks));
  const r2 = reviewDraft({ file: 'mission.md', current: MISSION, draft: dropped, mode: 'manual' });
  check('g6: a dropped tail is named as a removal (it used to happen silently)', r2.risks.some((x) => x.kind === 'removed' && x.key === 'Layer'), JSON.stringify(r2.risks));
}

// ── g7: who wrote the text (KPI-9) ──────────────────────────────────────────
{
  const log = [
    '2026-09-29T10:00:00.000Z\tdesign_patch\tpass\tatlas/blocks/b.x/kpi.md by=sima-rewrite provider=mock model=mock edited',
    '2026-09-29T10:01:00.000Z\tdesign_patch\tpass\tatlas/blocks/b.x/kpi.md by=sima-fill provider=gemini',
    '2026-09-29T10:02:00.000Z\tdesign_patch\tpass\tatlas/blocks/b.x/mission.md by=manual',
    '2026-09-29T10:03:00.000Z\tdesign_patch\tpass\tatlas/blocks/b.x/mission.md by=manual trajectory',
    '2026-09-29T10:04:00.000Z\tdesign_patch\tpass\tatlas/blocks/b.x/kpi.md by=template saas',
    '2026-09-29T10:05:00.000Z\tdesign_patch\tpass\tatlas/blocks/b.x/kpi.md',
    '2026-09-29T10:06:00.000Z\tdesign_patch\tpass\t{"title":"x"}',
    '2026-09-29T10:07:00.000Z\tacceptance\tpass\tby=sima-fill edited',
  ].join('\n');
  check('g7: model drafts, edited ones, manual, other, unattributed — and nothing else counted',
    JSON.stringify(draftWriteStats(log)) === JSON.stringify({ manual: 2, model: 2, model_edited: 1, other: 1, unattributed: 1 }), JSON.stringify(draftWriteStats(log)));
  check('g7: «edited» is a word, not a substring', draftWriteStats('t\tdesign_patch\tpass\tatlas/blocks/b/k.md by=sima-fill model=unedited-1').model_edited === 0);
}

if (failures.length) {
  console.error('contract_draft_review.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('contract_draft_review.selftest: OK (7 groups)');

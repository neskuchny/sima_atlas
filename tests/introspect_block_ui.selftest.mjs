#!/usr/bin/env node
// PR-1 (b.user-docs-generator): selftest for scripts/introspect_block_ui.mjs.
//
// 7 test groups:
//  1. introspectBlock returns no-files warning for nonexistent block
//  2. synthetic fixture: 3 buttons with cleaned labels
//  3. synthetic fixture: 1 input + 1 textarea with placeholders + names
//  4. synthetic fixture: 1 form with onSubmit + action + method
//  5. synthetic fixture: 3 links (Link / NavLink / a) with targets + labels
//  6. synthetic fixture: 2 routes parsed; 1 fetch with method=POST
//  7. real block (b.llm-gateway): JSX with arrow-function onClick parses
//     into clean labels, not corrupted by `=>` inside attributes

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { introspectBlock } from '../scripts/introspect_block_ui.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

function mkBlockFromFixture(fixtureRel) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'introspect-'));
  const atlas = path.join(tmp, 'atlas');
  const blockDir = path.join(atlas, 'blocks', 'b.synth-introspect');
  fs.mkdirSync(blockDir, { recursive: true });
  // We resolve fixture from this repo; the introspector resolves UI files
  // relative to REPO_ROOT-of-tmp. We point files.md to a path that includes
  // the absolute fixture location.
  const repoRel = path.relative(tmp, path.join(REPO_ROOT, fixtureRel));
  fs.writeFileSync(path.join(blockDir, 'files.md'), `# files\n- ${repoRel} [alive]\n`, 'utf8');
  return { atlas, tmp };
}

try {
  // ─── Group 1: missing block / empty files.md
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'introspect-'));
    const atlas = path.join(tmp, 'atlas');
    fs.mkdirSync(path.join(atlas, 'blocks', 'b.empty'), { recursive: true });
    fs.writeFileSync(path.join(atlas, 'blocks', 'b.empty', 'files.md'), '# files\n', 'utf8');
    const r = introspectBlock('b.empty', { atlas_root: atlas });
    check('group1:empty files', r.files_scanned.length === 0);
    check('group1:warning present', r.warnings.length === 1 && /no UI files/.test(r.warnings[0]));
    check('group1:no buttons', r.buttons.length === 0);
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ─── Group 2-6: synthetic fixture
  {
    const { atlas, tmp } = mkBlockFromFixture('tests/fixtures/jsx/synthetic_panel.jsx');
    const r = introspectBlock('b.synth-introspect', { atlas_root: atlas });
    check('synth:scanned 1 file', r.files_scanned.length === 1);
    check('synth:no warnings', r.warnings.length === 0,
      `warnings: ${JSON.stringify(r.warnings)}`);

    // Group 2: buttons
    const labels = r.buttons.map((b) => b.label).filter(Boolean);
    check('group2:button "Создать задачу"', labels.includes('Создать задачу'),
      `got labels: ${JSON.stringify(labels)}`);
    check('group2:button "Очистить всё"', labels.includes('Очистить всё'),
      `got labels: ${JSON.stringify(labels)}`);
    check('group2:button "Сохранить"', labels.includes('Сохранить'));
    check('group2:onClick captured', r.buttons.some((b) => /onCreate|deleteAll|fetch/.test(b.on_click || '')));

    // Group 3: inputs + textareas
    check('group3:1 input', r.inputs.length === 1);
    check('group3:input placeholder', r.inputs[0]?.placeholder === 'Введите название');
    check('group3:input required true', r.inputs[0]?.required === true);
    check('group3:input name=title', r.inputs[0]?.name === 'title');
    check('group3:1 textarea', r.textareas.length === 1);
    check('group3:textarea placeholder', r.textareas[0]?.placeholder === 'Описание (опционально)');
    check('group3:textarea rows=3', r.textareas[0]?.rows === '3');

    // Group 4: form
    check('group4:1 form', r.forms.length === 1);
    check('group4:form action', r.forms[0]?.action === '/api/tasks');
    check('group4:form method', r.forms[0]?.method === 'POST');
    check('group4:onSubmit captured', /onCreate|preventDefault/.test(r.forms[0]?.on_submit || ''));

    // Group 5: links
    const linkTargets = r.links.map((l) => l.target);
    check('group5:Link /tasks/active', linkTargets.includes('/tasks/active'));
    check('group5:NavLink /tasks/done', linkTargets.includes('/tasks/done'));
    check('group5:a https://example.com/help', linkTargets.includes('https://example.com/help'));
    const labelMap = {};
    for (const l of r.links) labelMap[l.target] = l.label;
    check('group5:Link label "Активные"', labelMap['/tasks/active'] === 'Активные',
      `got: ${JSON.stringify(labelMap)}`);
    check('group5:NavLink label "Готовые"', labelMap['/tasks/done'] === 'Готовые');
    check('group5:a label "Справка"', labelMap['https://example.com/help'] === 'Справка');

    // Group 6: routes + fetches
    check('group6:2 routes', r.routes.length === 2,
      `got: ${JSON.stringify(r.routes)}`);
    check('group6:route /tasks', r.routes.some((rt) => rt.path === '/tasks'));
    check('group6:route /tasks/:id', r.routes.some((rt) => rt.path === '/tasks/:id'));
    check('group6:1 fetch', r.fetches.length === 1);
    check('group6:fetch method POST', r.fetches[0]?.method === 'POST');
    check('group6:fetch url /api/tasks', r.fetches[0]?.url === '/api/tasks');

    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ─── Group 7: real block — proves arrow-function onClick doesn't break parser
  {
    const r = introspectBlock('b.llm-gateway');
    // proposals_panel.jsx is the alive JSX file. Parser should NOT corrupt
    // labels with leftover JSX expression fragments.
    const labels = r.buttons.map((b) => b.label);
    check('group7:Accept clean', labels.includes('Accept'));
    check('group7:Reject clean', labels.includes('Reject'));
    check('group7:no leftover JSX braces', !labels.some((l) => /\{|\}/.test(l)),
      `labels with stray braces: ${JSON.stringify(labels.filter((l) => /\{|\}/.test(l)))}`);
    check('group7:no `=>` leakage', !labels.some((l) => /=>/.test(l)),
      `labels with =>: ${JSON.stringify(labels.filter((l) => /=>/.test(l)))}`);
    check('group7:fetch detected', r.fetches.length >= 1);
  }
} catch (e) {
  failures.push('test runner threw: ' + e.message);
}

if (failures.length) {
  console.error('introspect_block_ui.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('introspect_block_ui.selftest: OK (7 test groups, all assertions green)');

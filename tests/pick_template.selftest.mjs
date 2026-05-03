#!/usr/bin/env node
// PR-2 (b.operator-profile-learner): selftest for scripts/pick_template.mjs
//
// 8 cases:
//  1. scopeFromLayer maps layers correctly (and returns null for non-mappable)
//  2. pickTemplate returns null for invalid scope
//  3. backend scope returns backend-mvp with non-empty flat_tech_stack
//  4. frontend scope returns frontend-spa with react+vite
//  5. testing scope returns testing-stack
//  6. flat_tech_stack is canonicalized (no "react-hook-form + zod resolver" mess)
//  7. profile_state === 'warming_up' when no profile.json exists or _status === warming_up
//  8. adjustments populate when profile has tech_stack_history with clear winner

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pickTemplate, scopeFromLayer, flattenTechStack } from '../scripts/pick_template.mjs';

const failures = [];
function check(name, cond, detail = '') {
  if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

// ─── Test 1: scopeFromLayer
check('scopeFromLayer:logic→backend', scopeFromLayer('logic') === 'backend');
check('scopeFromLayer:data→backend', scopeFromLayer('data') === 'backend');
check('scopeFromLayer:front→frontend', scopeFromLayer('front') === 'frontend');
check('scopeFromLayer:user→frontend', scopeFromLayer('user') === 'frontend');
check('scopeFromLayer:testing→testing', scopeFromLayer('testing') === 'testing');
check('scopeFromLayer:ai→null', scopeFromLayer('ai') === null);
check('scopeFromLayer:content→null', scopeFromLayer('content') === null);
check('scopeFromLayer:undefined→null', scopeFromLayer(undefined) === null);

// ─── Test 2: invalid scope
check('pickTemplate:invalid scope→null', pickTemplate({ scope: 'mobile' }) === null);
check('pickTemplate:no args→null', pickTemplate() === null);

// ─── Test 3: backend
{
  const t = pickTemplate({ scope: 'backend' });
  check('pickTemplate:backend not null', t !== null);
  check('pickTemplate:backend template_id', t?.template_id === 'backend-mvp');
  check('pickTemplate:backend scope', t?.scope === 'backend');
  check('pickTemplate:backend flat tech_stack non-empty', Array.isArray(t?.flat_tech_stack) && t.flat_tech_stack.length >= 5,
    `got ${t?.flat_tech_stack?.length} items`);
  check('pickTemplate:backend includes fastify', t?.flat_tech_stack?.includes('fastify'));
  check('pickTemplate:backend includes typescript', t?.flat_tech_stack?.includes('typescript'));
  check('pickTemplate:backend must_have_acceptance', Array.isArray(t?.must_have_acceptance) && t.must_have_acceptance.length > 0);
  check('pickTemplate:backend anti_patterns', Array.isArray(t?.anti_patterns) && t.anti_patterns.length > 0);
}

// ─── Test 4: frontend
{
  const t = pickTemplate({ scope: 'frontend' });
  check('pickTemplate:frontend template_id', t?.template_id === 'frontend-spa');
  check('pickTemplate:frontend includes react', t?.flat_tech_stack?.includes('react'));
  check('pickTemplate:frontend includes vite', t?.flat_tech_stack?.includes('vite'));
}

// ─── Test 5: testing
{
  const t = pickTemplate({ scope: 'testing' });
  check('pickTemplate:testing template_id', t?.template_id === 'testing-stack');
  check('pickTemplate:testing includes vitest', t?.flat_tech_stack?.includes('vitest'));
  check('pickTemplate:testing includes playwright', t?.flat_tech_stack?.includes('playwright'));
}

// ─── Test 6: canonicalization (no compound strings leaking)
{
  const t = pickTemplate({ scope: 'frontend' });
  for (const s of t.flat_tech_stack) {
    check(`pickTemplate:no compound string [${s}]`, !s.includes(' + ') && !s.includes(' (') && !s.includes(') '),
      `compound: '${s}'`);
  }
}

// ─── Test 7: warming_up profile state
{
  const t = pickTemplate({ scope: 'backend' });
  check('pickTemplate:no profile→warming_up', t?.profile_state === 'warming_up');
  check('pickTemplate:no adjustments when warming_up',
    Array.isArray(t?.adjustments) && t.adjustments.length === 0);
}

// ─── Test 8: profile-driven adjustment (synthetic profile in tmp dir)
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-'));
  const profilePath = path.join(tmp, 'profile.json');
  fs.writeFileSync(profilePath, JSON.stringify({
    operator_id: 'test',
    _status: 'live',
    tech_stack_history: {
      backend: [
        { name: 'express', uses: 5, satisfaction: 'high' },
        { name: 'fastify', uses: 1, satisfaction: 'low' },
      ],
    },
    dont_use: [],
  }), 'utf8');
  const t = pickTemplate({ scope: 'backend', profile_path: profilePath });
  check('pickTemplate:profile-driven framework adjustment', t?.adjustments?.some(
    (a) => a.category === 'framework' && a.from === 'fastify' && a.to === 'express'
  ), `got adjustments: ${JSON.stringify(t?.adjustments)}`);
  check('pickTemplate:profile-driven flat reflects swap',
    t?.flat_tech_stack?.includes('express') && !t?.flat_tech_stack?.includes('fastify'),
    `flat=${t?.flat_tech_stack?.join(',')}`);

  // Test dont_use: operator says no fastify
  fs.writeFileSync(profilePath, JSON.stringify({
    operator_id: 'test',
    _status: 'live',
    tech_stack_history: { backend: [] },
    dont_use: ['fastify'],
  }), 'utf8');
  const t2 = pickTemplate({ scope: 'backend', profile_path: profilePath });
  check('pickTemplate:dont_use forces alternative',
    t2?.adjustments?.some((a) => a.reason === 'dont_use' && a.from === 'fastify'),
    `got: ${JSON.stringify(t2?.adjustments)}`);

  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('pick_template.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('pick_template.selftest: OK (8 test groups, all assertions green)');

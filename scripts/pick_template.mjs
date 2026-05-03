#!/usr/bin/env node
// PR-2 (b.operator-profile-learner): pickTemplate(scope, profile?)
//
// Reads templates from atlas/operator_profile/templates/ and returns a default
// stack for a given scope (backend / frontend / testing). When an
// operator_profile/profile.json exists with `_status !== "warming_up"` and
// non-empty tech_stack_history, the chosen template is *adjusted*:
//   - if a category (e.g. backend.framework) has a clear winner in the
//     operator's history (>= 3 uses, satisfaction === 'high'), swap the
//     template default to that.
//
// In warming_up state (i.e. PR-1 of operator-profile-learner not landed yet,
// or operator has < 5 done blocks) the function returns the unchanged starter
// template — so consumers can call it safely today and benefit from
// personalization later without a code change.
//
// API:
//   import { pickTemplate, scopeFromLayer, flattenTechStack } from './pick_template.mjs';
//   const t = pickTemplate({ scope: 'backend', profile_path: 'atlas/operator_profile/profile.json' });
//   t -> { template_id, scope, flat_tech_stack: string[], must_have_acceptance: string[],
//          anti_patterns: string[], full: <full template json>, adjustments: [...] }
//
//   const scope = scopeFromLayer('logic'); // 'backend'
//
//   const flat = flattenTechStack(template); // ['typescript','nodejs',...]
//
// CLI usage (for inspection):
//   node scripts/pick_template.mjs backend
//   node scripts/pick_template.mjs frontend --json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const TEMPLATES_DIR = path.join(ROOT, 'atlas', 'operator_profile', 'templates');
const DEFAULT_PROFILE_PATH = path.join(ROOT, 'atlas', 'operator_profile', 'profile.json');

const SCOPE_DEFAULTS = {
  backend: 'backend-mvp',
  frontend: 'frontend-spa',
  testing: 'testing-stack',
};

const LAYER_TO_SCOPE = {
  user: 'frontend',
  front: 'frontend',
  logic: 'backend',
  data: 'backend',
  ext: 'backend',
  testing: 'testing',
  ai: null,
  content: null,
};

export function scopeFromLayer(layer) {
  if (!layer) return null;
  return LAYER_TO_SCOPE[layer] ?? null;
}

function readTemplate(templateId) {
  const p = path.join(TEMPLATES_DIR, `${templateId}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// Flatten the nested tech_stack object into the flat string[] format that
// graph.json blocks use (["nodejs","esm","fastify",...]).
function canonical(s) {
  // "react-hook-form + zod resolver" → "react-hook-form"
  // "shadcn/ui (radix + tailwind)"   → "shadcn/ui"
  // "fastify"                        → "fastify"
  if (typeof s !== 'string') return null;
  let out = s.split('(')[0].split(' + ')[0].trim();
  if (!out || out === 'none' || out === 'none_yet') return null;
  return out;
}

export function flattenTechStack(template) {
  if (!template || !template.tech_stack) return [];
  const out = new Set();
  const ts = template.tech_stack;
  // Order matters: high-signal labels first so consumers can truncate.
  const high = ['language', 'runtime', 'framework', 'build_tool', 'router', 'state_global',
                'data_fetching', 'forms', 'ui_lib', 'css', 'validation', 'orm', 'db',
                'cache', 'queue', 'auth', 'logging', 'tests', 'primary_runner',
                'container', 'orchestration'];
  for (const k of high) {
    const c = canonical(ts[k]);
    if (c) out.add(c);
  }
  // Also include nested object groups (unit/integration_backend/component_react/e2e)
  // for testing-stack template. We pick their primary tool field.
  for (const v of Object.values(ts)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const c = canonical(v.tool || v.runner || v.lib || v.platform);
      if (c) out.add(c);
    }
  }
  return Array.from(out);
}

function readProfile(profilePath) {
  if (!profilePath || !fs.existsSync(profilePath)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    if (j._status === 'warming_up') return null;
    return j;
  } catch {
    return null;
  }
}

// Walk operator's tech_stack_history and find a clear winner per template
// category. "Clear winner" = uses >= 3 AND satisfaction === 'high' AND it's
// different from the starter-template default.
function adjustForProfile(template, profile, scope) {
  const adjustments = [];
  if (!profile || !profile.tech_stack_history) return { template, adjustments };

  const history = profile.tech_stack_history;
  const adjusted = JSON.parse(JSON.stringify(template));

  // Map scope → which history group to look at.
  const scopeToHistoryKey = {
    backend: 'backend',
    frontend: 'frontend',
    testing: 'testing',
  };
  const histKey = scopeToHistoryKey[scope];
  const items = histKey ? (history[histKey] || []) : [];

  // Map template-category → history-name keywords. Naive but explicit.
  const categoryHints = {
    framework: ['fastify', 'express', 'hono', 'nestjs', 'koa'],
    db: ['postgres', 'mysql', 'sqlite', 'mongo'],
    state_global: ['zustand', 'jotai', 'redux', 'valtio', 'mobx'],
    ui_lib: ['shadcn/ui', 'mantine', 'chakra-ui', 'antd', 'mui'],
    css: ['tailwindcss', 'css-modules', 'styled-components', 'vanilla-extract'],
    primary_runner: ['vitest', 'jest', 'mocha'],
  };

  for (const [category, candidates] of Object.entries(categoryHints)) {
    const winner = items
      .filter((h) => candidates.includes(h.name) && h.uses >= 3 && h.satisfaction === 'high')
      .sort((a, b) => b.uses - a.uses)[0];
    if (winner && adjusted.tech_stack && adjusted.tech_stack[category] && adjusted.tech_stack[category] !== winner.name) {
      adjustments.push({
        category,
        from: adjusted.tech_stack[category],
        to: winner.name,
        evidence_uses: winner.uses,
      });
      adjusted.tech_stack[category] = winner.name;
    }
  }

  // dont_use list overrides — if profile.dont_use contains current default, swap
  // to first alternative if available.
  if (Array.isArray(profile.dont_use) && profile.dont_use.length && adjusted.tech_stack) {
    for (const [k, v] of Object.entries(adjusted.tech_stack)) {
      if (typeof v !== 'string') continue;
      if (profile.dont_use.includes(v)) {
        const altKey = `${k}_alternatives`;
        const alt = adjusted.tech_stack[altKey];
        if (Array.isArray(alt) && alt.length) {
          // Pick first alternative that is also not in dont_use; alts may be
          // strings like "redux-toolkit (если команда привыкла)" — strip parens.
          const cleanAlt = alt
            .map((s) => String(s).split('(')[0].trim())
            .find((s) => s && !profile.dont_use.includes(s));
          if (cleanAlt) {
            adjustments.push({ category: k, from: v, to: cleanAlt, reason: 'dont_use' });
            adjusted.tech_stack[k] = cleanAlt;
          }
        }
      }
    }
  }

  return { template: adjusted, adjustments };
}

export function pickTemplate({ scope, profile_path } = {}) {
  if (!scope || !SCOPE_DEFAULTS[scope]) return null;
  const starter = readTemplate(SCOPE_DEFAULTS[scope]);
  if (!starter) return null;

  const profile = readProfile(profile_path || DEFAULT_PROFILE_PATH);
  const { template, adjustments } = adjustForProfile(starter, profile, scope);

  return {
    template_id: template.template_id,
    scope,
    flat_tech_stack: flattenTechStack(template),
    must_have_acceptance: Array.isArray(template.must_have_acceptance_items)
      ? template.must_have_acceptance_items
      : [],
    anti_patterns: Array.isArray(template.anti_patterns_to_warn_about)
      ? template.anti_patterns_to_warn_about
      : [],
    estimated_hours: template.estimated_first_deploy_hours
      ?? template.estimated_first_deploy_days
      ?? template.estimated_setup_hours
      ?? null,
    full: template,
    adjustments,
    profile_state: profile ? 'live' : 'warming_up',
  };
}

// ────────────────────── CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const scope = argv[0];
  if (!scope || !SCOPE_DEFAULTS[scope]) {
    console.error('Usage: node scripts/pick_template.mjs <backend|frontend|testing> [--json]');
    process.exit(1);
  }
  const result = pickTemplate({ scope });
  if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Template: ${result.template_id} (${result.scope})`);
    console.log(`Profile state: ${result.profile_state}`);
    console.log(`Adjustments: ${result.adjustments.length ? JSON.stringify(result.adjustments) : 'none'}`);
    console.log(`Flat tech_stack: ${result.flat_tech_stack.join(', ')}`);
  }
}

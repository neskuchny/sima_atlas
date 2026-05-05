#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Phase R-1 — nightly pipeline forces mock LLM provider so the green-build
// stays deterministic / fast / free regardless of which providers (paid
// API keys, local claude CLI) are available in the developer's env. Real
// LLM is for interactive work in the design UI; nightly is for invariants.
process.env.ATLAS_FORCE_MOCK_LLM = '1';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const reportPath = path.join(atlas, 'nightly_report.md');

const checks = [
  ['ingestion_queue', 'node scripts/apply_ingestion_queue.mjs'],
  ['ingestion_contracts', 'node scripts/validate_ingestion_contracts.mjs'],
  ['ingestion_quality', 'node scripts/validate_ingestion_quality.mjs'],
  ['block_contracts', 'node scripts/validate_block_contracts.mjs'],
  ['no_template_placeholders', 'node scripts/validate_no_template_placeholders.mjs'],
  ['files_registry', 'node scripts/validate_files_registry.mjs'],
  ['projects_contracts', 'node scripts/validate_projects.mjs'],
  ['subschemas_contracts', 'node scripts/validate_subschemas.mjs'],
  ['dependency_contracts', 'node scripts/validate_dependency_contracts.mjs'],
  ['acceptance_assertions', 'node scripts/validate_acceptance_assertions.mjs'],
  ['atlas_selftest', 'node tests/atlas_sync.selftest.mjs'],
  ['bootstrap_layered_smoke', 'node tests/atlas_bootstrap.smoke.mjs'],
  ['llm_gateway_selftest', 'node tests/llm_gateway.selftest.mjs'],
  ['pick_template_selftest', 'node tests/pick_template.selftest.mjs'],
  ['operator_profile_selftest', 'node tests/operator_profile.selftest.mjs'],
  ['aggregate_operator_profile', 'node scripts/aggregate_operator_profile.mjs'],
  ['operator_profile_lessons_smoke', 'node tests/operator_profile_lessons.smoke.mjs'],
  ['operator_profile_inject_smoke', 'node tests/operator_profile_inject.smoke.mjs'],
  ['analyze_lessons_from_history', 'node scripts/analyze_lessons_from_history.mjs --window-days 30'],
  ['dont_use_management_selftest', 'node tests/dont_use_management.selftest.mjs'],
  ['validate_dont_use_compliance', 'node scripts/validate_dont_use_compliance.mjs'],
  ['introspect_block_ui_selftest', 'node tests/introspect_block_ui.selftest.mjs'],
  ['user_docs_smoke', 'node tests/user_docs.smoke.mjs'],
  ['screenshots_integration_selftest', 'node tests/screenshots_integration.selftest.mjs'],
  ['user_docs_drift_selftest', 'node tests/user_docs_drift.selftest.mjs'],
  ['run_state_selftest', 'node tests/run_state.selftest.mjs'],
  ['agent_workspace_selftest', 'node tests/agent_workspace.selftest.mjs'],
  ['detect_stalled_runs', 'node scripts/run_state.mjs detect-stalled --json'],
  ['cursor_live_headless_smoke', 'node tests/cursor_live.headless.smoke.mjs'],
  ['playwright_canvas', 'npx playwright test tests/playwright/canvas_screenshots.spec.ts --reporter=line'],
  ['sima_design_payload_selftest', 'node tests/sima_design_payload.selftest.mjs'],
  ['atlas_blocks_api_selftest', 'node tests/atlas_blocks_api.selftest.mjs'],
  ['atlas_artifacts_api_selftest', 'node tests/atlas_artifacts_api.selftest.mjs'],
  ['atlas_runs_api_selftest', 'node tests/atlas_runs_api.selftest.mjs'],
  ['atlas_synthesis_api_selftest', 'node tests/atlas_synthesis_api.selftest.mjs'],
  ['atlas_subsystems_api_selftest', 'node tests/atlas_subsystems_api.selftest.mjs'],
  ['atlas_files_api_selftest', 'node tests/atlas_files_api.selftest.mjs'],
  ['cleanup_block_memory_selftest', 'node tests/cleanup_block_memory.selftest.mjs'],
  ['build_sima_design_payload', 'node scripts/build_sima_design_payload.mjs'],
  ['playwright_sima_design', 'npx playwright test tests/playwright/sima_design.spec.ts --reporter=line'],
  ['parse_acceptance_selftest', 'node tests/parse_acceptance.selftest.mjs'],
  ['evidence_collectors_selftest', 'node tests/evidence_collectors.selftest.mjs'],
  ['llm_judge_smoke', 'node tests/llm_judge.smoke.mjs'],
  ['acceptance_verifier_e2e_smoke', 'node tests/acceptance_verifier.e2e.smoke.mjs'],
  ['seed_llm_mocks', 'node scripts/seed_llm_mocks.mjs'],
  ['llm_extraction_eval', 'node tests/llm_extraction.eval.mjs'],
  ['simulate_conversation_branches', 'node scripts/simulate_conversation_branches.mjs'],
  ['validate_cursor_hooks', 'node scripts/validate_cursor_hooks.mjs'],
  ['cursor_hooks_actions', 'node tests/cursor_hooks_actions.test.mjs'],
  ['proposals_flow_smoke', 'node tests/proposals_flow.smoke.mjs'],
  ['list_proposals_index', 'node scripts/list_proposals.mjs --write-index --json'],
  ['agent_parity_real', 'node tests/agent_parity_real.smoke.mjs'],
  ['connection_drift', 'node tests/connection_drift.smoke.mjs'],
  ['atlas_live_polling', 'node tests/atlas_live_polling.smoke.mjs'],
  ['sync_context_packs', 'node scripts/sync_context_packs.mjs'],
  ['agent_parity', 'node scripts/validate_agent_parity.mjs'],
  ['parity_matrix', 'node scripts/validate_parity_matrix.mjs'],
  ['generate_wiki', 'node scripts/generate_wiki.mjs'],
  ['render_wiki_html', 'node scripts/render_wiki_html.mjs'],
  ['generate_tz', 'node scripts/generate_tz_from_atlas.mjs'],
  ['rebuild_roadmap', 'node scripts/rebuild_atlas_roadmap.mjs'],
  // Acceptance verifier runs LAST among artefact-producing steps so it
  // sees the freshest wiki.html / auto_tz.md / roadmap.md when checking
  // assertions about them (b.docs A2/A4, b.core-sync A5).
  ['verify_all_acceptance', 'node scripts/verify_all_acceptance.mjs'],
  ['verify_done_blocks_still_green', 'node scripts/verify_done_blocks_still_green.mjs'],
  ['mcp_smoke_e2e', 'node scripts/mcp_smoke_e2e.mjs'],
  ['intelligence_health', 'node scripts/calc_intelligence_health.mjs'],
];

const lines = ['# Atlas Nightly Consolidation Report', '', `_Generated: ${new Date().toISOString()}_`, ''];
let failed = 0;
for (const [name, cmd] of checks){
  try {
    const out = execSync(cmd, { cwd: root, stdio: ['ignore','pipe','pipe'] }).toString().trim();
    lines.push(`- ✅ ${name}: ok`);
    if (out) lines.push(`  - output: ${out.split('\n')[0]}`);
  } catch (e) {
    failed += 1;
    const stderr = (e.stderr || '').toString().trim();
    lines.push(`- ❌ ${name}: fail`);
    if (stderr) lines.push(`  - error: ${stderr.split('\n')[0]}`);
  }
}

lines.push('');
lines.push(`Summary: ${failed===0 ? 'PASS' : 'FAIL'} (${checks.length-failed}/${checks.length})`);
fs.writeFileSync(reportPath, lines.join('\n')+'\n','utf8');
console.log(`Nightly consolidation complete: ${reportPath}`);
if (failed) process.exit(1);

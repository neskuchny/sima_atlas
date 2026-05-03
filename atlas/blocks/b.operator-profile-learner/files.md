# b.operator-profile-learner — files

Все пути с тегом `[pending]` — *планируемые* (status: idea). Реальные `[alive]` помечаются по мере мержа PR-1…PR-6.

## Aggregator + storage (PR-1)
- scripts/aggregate_operator_profile.mjs [alive]
- atlas/operator_profile/profile.json [alive]
- atlas/operator_profile/patterns/work_style.json [alive]
- atlas/operator_profile/patterns/agents.json [alive]
- atlas/operator_profile/patterns/tech_stack.json [alive]
- atlas/operator_profile/patterns/environment.json [alive]
- atlas/operator_profile/patterns/failures.json [alive]
- tests/operator_profile.selftest.mjs [alive]

## Templates (PR-2)
- atlas/operator_profile/templates/backend-mvp.json [alive]
- atlas/operator_profile/templates/backend-prod.json [alive]
- atlas/operator_profile/templates/frontend-spa.json [alive]
- atlas/operator_profile/templates/testing-stack.json [alive]
- scripts/pick_template.mjs [alive] (PR-2: pickTemplate(scope, profile?) + scopeFromLayer + flattenTechStack; CLI for inspection)
- tests/pick_template.selftest.mjs [alive] (PR-2: 8 test groups: scopeFromLayer + invalid scope + each scope returns expected template + canonicalization + warming_up state + profile-driven tech_stack adjustment + dont_use forces alternative)

## Don't-use (PR-3)
- scripts/manage_dont_use.mjs [alive]
- scripts/validate_dont_use_compliance.mjs [alive]
- tests/dont_use_management.selftest.mjs [alive]

## Lessons (PR-4)
- scripts/analyze_lessons_from_history.mjs [alive]
- tests/operator_profile_lessons.smoke.mjs [alive]

## Inject (PR-5) — touches inject_context_pack.mjs (owned by b.agent-orchestrator)
- tests/operator_profile_inject.smoke.mjs [alive]

## UI (PR-6) — touches arch_canvas.jsx (b.ui-control) + proposals_panel.jsx (b.llm-gateway)
PR-6 cross-cutting changes (host blocks own JSX; documented in checks.log + tasks.md):

  • `Sima (Remix)/arch_canvas.jsx` (owned by b.ui-control) gained ProfileHintsSection
  • `Sima (Remix)/proposals_panel.jsx` (owned by b.llm-gateway) gained complianceWithProfile + match/conflict badge
  • `scripts/generate_atlas_bootstrap_js.mjs` (owned by b.ui-control) now exposes operatorProfile + operatorLessons + operatorDontUse

## Documentation
- atlas/blocks/b.operator-profile-learner/mission.md [alive]
- atlas/blocks/b.operator-profile-learner/kpi.md [alive]
- atlas/blocks/b.operator-profile-learner/acceptance.md [alive]
- atlas/blocks/b.operator-profile-learner/tasks.md [alive]
- atlas/blocks/b.operator-profile-learner/depends_on.md [alive]
- atlas/blocks/b.operator-profile-learner/provides.md [alive]
- atlas/blocks/b.operator-profile-learner/files.md [alive]
- atlas/blocks/b.operator-profile-learner/checks.log [alive]

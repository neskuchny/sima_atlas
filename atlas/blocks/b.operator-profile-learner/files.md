# b.operator-profile-learner — files

Все пути с тегом `[pending]` — *планируемые* (status: idea). Реальные `[alive]` помечаются по мере мержа PR-1…PR-6.

## Aggregator + storage (PR-1)
- scripts/aggregate_operator_profile.mjs [pending] (PR-1: read-only агрегатор всех 10 источников)
- atlas/operator_profile/profile.json [pending] (PR-1: главная карточка оператора)
- atlas/operator_profile/patterns/work_style.json [pending] (PR-1)
- atlas/operator_profile/patterns/agents.json [pending] (PR-1)
- atlas/operator_profile/patterns/tech_stack.json [pending] (PR-1)
- atlas/operator_profile/patterns/environment.json [pending] (PR-1)
- atlas/operator_profile/patterns/failures.json [pending] (PR-1)
- atlas/operator_profile/history/.gitkeep [pending] (PR-1: snapshot per nightly)
- tests/operator_profile.selftest.mjs [pending] (PR-1)

## Templates (PR-2)
- atlas/operator_profile/templates/backend-mvp.json [pending] (PR-2)
- atlas/operator_profile/templates/backend-prod.json [pending] (PR-2)
- atlas/operator_profile/templates/frontend-spa.json [pending] (PR-2)
- atlas/operator_profile/templates/testing-stack.json [pending] (PR-2)

## Don't-use (PR-3)
- atlas/operator_profile/dont_use.json [pending] (PR-3)
- atlas/operator_profile/always_use.json [pending] (PR-3)
- scripts/validate_dont_use_compliance.mjs [pending] (PR-3: nightly warning, not fail)

## Lessons (PR-4)
- atlas/operator_profile/lessons.json [pending] (PR-4: append-only с expires_at)
- scripts/analyze_lessons_from_history.mjs [pending] (PR-4: LLM single-shot per nightly)
- tests/operator_profile_lessons.smoke.mjs [pending] (PR-4)

## Inject (PR-5)
- tests/operator_profile_inject.smoke.mjs [pending] (PR-5)

## UI (PR-6)
- Sima (Remix)/profile_hint_badge.jsx [pending] (PR-6: ProposalsPanel match/conflict/neutral)
- Sima (Remix)/inspector_profile_section.jsx [pending] (PR-6: Inspector секция «Подсказки от профиля»)

## Documentation
- atlas/blocks/b.operator-profile-learner/mission.md [alive]
- atlas/blocks/b.operator-profile-learner/kpi.md [alive]
- atlas/blocks/b.operator-profile-learner/acceptance.md [alive]
- atlas/blocks/b.operator-profile-learner/tasks.md [alive]
- atlas/blocks/b.operator-profile-learner/depends_on.md [alive]
- atlas/blocks/b.operator-profile-learner/provides.md [alive]
- atlas/blocks/b.operator-profile-learner/files.md [alive]
- atlas/blocks/b.operator-profile-learner/checks.log [alive]

# b.operator-profile-learner — acceptance

Acceptance gate для перехода `idea → wip → review → done`. Все пункты должны иметь признак прохождения в `checks.log` либо в auto-evidence из nightly.

- [ ] **A1.** PR-1 (data collector) merged: `scripts/aggregate_operator_profile.mjs` агрегирует все 10 источников из mission.md в `atlas/operator_profile/profile.json` и `patterns/*.json`; selftest `tests/operator_profile.selftest.mjs` зелёный (≥ 6 case: empty repo, < min-data threshold, full repo, agent stats, tech stack frequencies, lesson evidence).
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/operator_profile.selftest.mjs
  expect_in_stdout: "OK"
```
- [ ] **A2.** PR-2 (templates set) merged: `atlas/operator_profile/templates/{backend-mvp,backend-prod,frontend-spa,testing-stack}.json` с реальными примерами стека; UI-выбор шаблона в `analyze_conversation_to_atlas` подставляется в proposal `tech_stack` если оператор не указал явно.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/pick_template.selftest.mjs
  expect_in_stdout: "OK"
```
- [ ] **A3.** PR-3 (dont-use list) merged: MCP tools `set_dont_use` / `set_always_use` живые; `guard_against_drift.mjs` читает `atlas/operator_profile/dont_use.json` и блокирует `npm install <pkg>` где pkg ∈ dont_use; UI Inspector показывает badge `dont_use оператора`.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/dont_use_management.selftest.mjs
  expect_in_stdout: "OK"
```
- [ ] **A4.** PR-4 (lessons LLM analyser) merged: `node scripts/analyze_lessons_from_history.mjs` через b.llm-gateway достаёт уроки из `decisions.log + checks.log fail` записей, пишет в `lessons.json` с `evidence: [block_id@date]`; nightly запускает раз в сутки; cost guard ≤ $0.05.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/operator_profile_lessons.smoke.mjs
  expect_in_stdout: "OK"
```
- [ ] **A5.** PR-5 (inject_context_pack hook) merged: `inject_context_pack.mjs` добавляет секцию `## Operator profile (likely preferences)` в context-pack агента; smoke `tests/operator_profile_inject.smoke.mjs` подтверждает наличие подсказок и dont_use в финальном промпте; **молчит** если данных < min.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/operator_profile_inject.smoke.mjs
  expect_in_stdout: "OK"
```
- [ ] **A6.** PR-6 (UI hints) merged: ProposalsPanel показывает badge `соответствует профилю` / `противоречит профилю`; Inspector под mission блока — секция `Подсказки от профиля` со списком (`evidence: [block_id]` рядом с каждой подсказкой).
```yaml
evidence_kind: log_grep
evidence_spec:
  file: Sima (Remix)/proposals_panel.jsx
  pattern: "complianceWithProfile"
```
- [ ] **A7.** Privacy gate: `atlas/operator_profile/` упоминается в `.gitignore` (опц.) с пояснением в `atlas/rules.md`; никакого PII (имена / e-mail / API-ключи) не пишется в profile.json — selftest A1 проверяет regex.
- [ ] **A8.** Reversibility: `revoke_lesson L-001` → context-pack для следующего invoke не содержит этого урока (smoke-тест diff'ом).
```yaml
evidence_kind: log_grep
evidence_spec:
  file: scripts/analyze_lessons_from_history.mjs
  pattern: "export function revokeLesson"
```

## Что считается NOT acceptance
- Существование папки `atlas/operator_profile/` без агрегатора и без потребителей.
- LLM-генерация profile.json при каждом point-update (это нарушает KPI-2 и KPI-7).
- Авто-применение профиля к коду блока (это нарушает UX-принцип «не auto-применяется»).

## Logic-flow при review
- Каждый артефакт в profile имеет `evidence: [block_id]` → пользователь видит, на чём основан вывод.
- Если оператор хоть раз нажмёт `revoke_lesson` или `forget_pattern` через UI → запись исчезает из всех downstream'ов (context-pack, badge, validators).
- Block остаётся `idea` пока не накопится минимум данных по критерию KPI-3 в реальном использовании Атласа.

## Зависимости
- b.operator-profile-learner → читает b.db (graph + transitions), b.core-sync (checks.log), b.agent-orchestrator (invocations + context-pack), b.llm-gateway (on-demand failure analysis), b.docs (рендер карточки).
- Никто из других блоков не depends_on b.operator-profile-learner — это чисто-аддитивный слой.

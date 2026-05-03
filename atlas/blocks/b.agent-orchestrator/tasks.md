# b.agent-orchestrator — tasks

- [ ] T1: Заменить выдуманный `afterPromptSent` в `.cursor/hooks.json` на валидные Cursor события — **PR4**
- [ ] T2: Реализовать `scripts/observe_file_edit.mjs`: на `afterFileEdit` пишет в `checks.log` блока с `git diff --stat` — **PR4**
- [ ] T3: `scripts/guard_against_drift.mjs`: на `beforeShellExecution` сверяет команду с `tech_stack.md` — **PR4**
- [ ] T4: Adapter для Claude Code CLI: MCP tool `run_block_implementation(block_id)` — **PR4**
- [ ] T5: `validate_agent_parity.mjs` — нечестная проверка форматов; нужно сравнение реального context-pack diff между агентами — **PR4**
- [ ] T6: Distillate генератор через `b.llm-gateway`: чат → factual notes → блок — **PR3**

## Late-stage (Symphony-inspired) — после PR4.5 / PR-Live стабильны

- [ ] T7: **Run-lifecycle FSM** — заменить fire-and-forget `run_block_implementation.mjs` на FSM с явными состояниями `PreparingWorkspace → BuildingPrompt → LaunchingAgent → InitializingSession → StreamingTurn → Finishing → Succeeded|Failed|TimedOut|Stalled|CanceledByReconciliation`. Хранить состояние в `atlas/run_state/<block_id>__<UTC>.json`, мутировать через единый `transition_run_state(run_id, new_state)`. UI читает live-state, показывает прогресс/застрял. Stalled-detection по `max_turn_idle_ms`. Cancel-ability через MCP tool. Reference: openai/symphony SPEC §7.2. — **PR-7**
- [ ] T8: **Per-block sandboxed workspace** — каждый агент-прогон работает в `~/.atlas_workspaces/<block_id>__<UTC>/` (deterministic path), НЕ в основной рабочей директории. После Succeeded — `git diff --no-index` против origin → пишется как proposal, требует Accept чтобы попасть в реальный repo. Это позволит запускать 2–3 блока параллельно без конфликтов. Reference: openai/symphony SPEC §4.1 Workspace. — **PR-8**
- [ ] T9: Интеграция T7/T8 с `b.acceptance-verifier-loop`: после `Succeeded` авто-спавн verifier'а в том же workspace (до Accept в реальный repo) — fail blocks Accept. — **PR-9**

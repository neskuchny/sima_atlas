# b.core-sync — calls

Что этот блок вызывает во время работы: запускает отдельным процессом или
вызывает по HTTP. Это не зависимость для порядка сборки — её пишут в
depends_on.md, и она не может замыкать цикл. Вызов может идти «вверх», к
блоку, который сам зависит от этого. Каждую строку подтверждает код: карта
кода и проверка графа кода сверяют их с тем, что код делает.

- b.acceptance-verifier-loop: verify_all.mjs запускает verify_all_acceptance.mjs — общая проверка репозитория включает приёмку всех блоков
- b.agent-orchestrator: frontend/atlas_sync.js вызывает POST /atlas/checks/append — проверки из интерфейса пишутся в checks.log на диске; audit_production_readiness.mjs запускает simulate_conversation_branches.mjs, subagent_schema_syncer.mjs запускает validate_cursor_hooks.mjs
- b.docs: validate_bootstrap_regeneration.mjs запускает generate_atlas_bootstrap_js.mjs — проверка пересобирает данные канваса и сверяет результат

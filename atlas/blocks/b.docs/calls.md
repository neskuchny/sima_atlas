# b.docs — calls

Что этот блок использует во время работы, но не для порядка сборки:
запускает отдельным процессом, вызывает по HTTP, пишет в файлы атласа
другого блока или читает их там, где зависимость замкнула бы цикл. Порядок
сборки — это depends_on.md, и он не может замыкать цикл; вызов может идти
«вверх», к блоку, который сам зависит от этого. Каждую строку подтверждает
код: карта кода и проверка графа кода сверяют их с тем, что код делает.

- b.acceptance-verifier-loop: generate_atlas_bootstrap_js.mjs читает atlas/acceptance_runs — канвас без сервера показывает последние вердикты приёмки
- b.agent-orchestrator: generate_atlas_bootstrap_js.mjs читает atlas/run_state — канвас показывает, у какого блока сейчас работает агент
- b.operator-profile-learner: generate_atlas_bootstrap_js.mjs читает atlas/operator_profile — канвас показывает профиль оператора и его уроки
- b.user-docs-generator: generate_atlas_bootstrap_js.mjs читает atlas/docs/end-user/_meta — у блока на канвасе появляется кнопка его пользовательской документации

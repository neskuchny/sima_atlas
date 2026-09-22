# Rules

1. Любое изменение блока фиксируется в его `tasks.md` и `checks.log`.
2. Перед изменением кода агент читает: `project.md`, `tech_stack.md`, `rules.md`, `blocks/<id>/*`.
3. Файлы без владельца-блока считаются out-of-scope.
4. Блок `done` только при выполнении acceptance + KPI, а не только compile/runtime.
5. `atlas/operator_profile/` — профиль оператора. Его сырая история (`history/`) не коммитится (`.gitignore`): там фрагменты сессий оператора. В `profile.json` и `patterns/*.json` — только обезличенные закономерности: никаких имён, e-mail, API-ключей и токенов.

# Rules

1. Любое изменение блока фиксируется в его `tasks.md` и `checks.log`.
2. Перед изменением кода агент читает: `project.md`, `tech_stack.md`, `rules.md`, `blocks/<id>/*`.
3. Файлы без владельца-блока считаются out-of-scope.
4. Блок `done` только при выполнении acceptance + KPI, а не только compile/runtime.

# b.desktop — calls

Что этот блок использует во время работы, но не для порядка сборки:
запускает отдельным процессом, вызывает по HTTP, пишет в файлы атласа
другого блока или читает их там, где зависимость замкнула бы цикл. Порядок
сборки — это depends_on.md, и он не может замыкать цикл; вызов может идти
«вверх», к блоку, который сам зависит от этого. Каждую строку подтверждает
код: карта кода и проверка графа кода сверяют их с тем, что код делает.

- b.acceptance-verifier-loop: main.mjs запускает verify_all_acceptance.mjs — пункт меню «Verify All Blocks»
- b.docs: main.mjs запускает generate_wiki.mjs, generate_tz_from_atlas.mjs и rebuild_atlas_roadmap.mjs — пункт меню «Generate Wiki + TZ + Roadmap»
- b.llm-gateway: main.mjs запускает token_economics.mjs — сводка расходов на LLM за 30 дней из меню приложения
- b.operator-profile-learner: main.mjs создаёт папку atlas/operator_profile в новом проекте — ученику профиля есть куда писать с первого запуска

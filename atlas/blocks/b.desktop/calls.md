# b.desktop — calls

Что этот блок вызывает во время работы: запускает отдельным процессом или
вызывает по HTTP. Это не зависимость для порядка сборки — её пишут в
depends_on.md, и она не может замыкать цикл. Вызов может идти «вверх», к
блоку, который сам зависит от этого. Каждую строку подтверждает код: карта
кода и проверка графа кода сверяют их с тем, что код делает.

- b.acceptance-verifier-loop: main.mjs запускает verify_all_acceptance.mjs — пункт меню «Verify All Blocks»
- b.docs: main.mjs запускает generate_wiki.mjs, generate_tz_from_atlas.mjs и rebuild_atlas_roadmap.mjs — пункт меню «Generate Wiki + TZ + Roadmap»
- b.llm-gateway: main.mjs запускает token_economics.mjs — сводка расходов на LLM за 30 дней из меню приложения

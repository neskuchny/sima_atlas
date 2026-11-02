# b.code-graph — files

- scripts/build_code_graph.mjs [alive] (PR1 — экстрактор + CLI)
- scripts/validate_code_graph_vs_contracts.mjs [alive] (PR2 — детектор drift'ов)
- tests/code_graph_extractor.selftest.mjs [alive]
- tests/code_graph_validator.selftest.mjs [alive]
- scripts/atlas_map.mjs [alive] (R-8.14: карта кода — продукт как здание: блоки, файлы, их части, каждая связь с тем, что по ней проходит — импорт с именами, вызов HTTP-маршрута, запуск скрипта — или «только в контракте»; у файла: что делает, зачем нужен, стек; след каждого изменения из git. Экспортирует buildCodeMap / readMapFile и правила разбора. Зачем: чтобы канвас показывал реальный код, а не рисовал его сам)
- tests/atlas_map.selftest.mjs [alive] (R-8.14: 8 групп — части файла покрывают каждую строку, стек, что запускает файл, связи не-импорты без комментариев и спецификаторов модулей, зачем нужен файл, связи блоков по видам, карта на одноразовом репо и отказ отдавать файлы вне карты, реальный атлас)
- atlas/code_graph.json [alive] (auto-generated артефакт)
- atlas/blocks/b.code-graph/understanding.md [alive] (R-8.14: объявленная рамка блока — как агент понял задачу карты кода; ждёт ответа оператора)
- atlas/blocks/b.code-graph/calls.md [alive] (R-8.17: что блок использует во время работы — чужие данные, которые он читает или пишет; не порядок сборки)

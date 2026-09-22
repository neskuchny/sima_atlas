# b.clarify — files

## Код
- scripts/clarify_block.mjs [alive] (R-8.06: протокол вопроса + маркеры неопределённости + append-only Q→A лог + снятие маркера без остатка. Экспортирует clarifyBlock / normalizeQuestions / findMarkers / blockMarkers / appendAnswers / resolveMarker)
- scripts/validate_clarifications.mjs [alive] (R-8.06: гейт — done-блок не может нести открытый маркер; review → warning; idea/wip → info, чтобы черновик оставался свободным)
- scripts/block_meaning.mjs [alive] (R-8.08: направление «человек → модель». Экспортирует readTrajectory / trajectoryPromptLines — секция «Во что это вырастет» в mission.md и её подача агенту; understandingPromptLines / parseUnderstanding / readUnderstanding / understandingStaleness — объявление понимания агентом до кода)
- scripts/validate_meaning.mjs [alive] (R-8.08: отчёт, не гейт — траектория, наличие/полнота/устаревание understanding.md по блокам. Условия повышения до гейта и снятия — в шапке файла)

## Тесты
- tests/clarify_block.selftest.mjs [alive] (R-8.06: 10 групп — порядок enum, честная деградация на mock, пустой контракт, отбраковка ярлыка, отбраковка вопроса без выбора, сортировка по impact, поиск маркеров, append-only лог, снятие маркера, срабатывание done-гейта)
- tests/block_meaning.selftest.mjs [alive] (R-8.08: 8 групп — кириллические заголовки траектории, границы секции, пустой против отсутствующего, строки промпта, разбор understanding.md, устаревание по mtime, E2E-промпт на одноразовом клиенте, operative_frame на mock)

## Контракт
- atlas/blocks/b.clarify/mission.md [alive]
- atlas/blocks/b.clarify/user_story.md [alive]
- atlas/blocks/b.clarify/kpi.md [alive]
- atlas/blocks/b.clarify/acceptance.md [alive]
- atlas/blocks/b.clarify/tasks.md [alive]
- atlas/blocks/b.clarify/depends_on.md [alive]
- atlas/blocks/b.clarify/provides.md [alive]
- atlas/blocks/b.clarify/files.md [alive]
- atlas/blocks/b.clarify/narrative.md [alive]
- atlas/blocks/b.clarify/decisions.log [alive]
- atlas/blocks/b.clarify/patterns.md [alive]
- atlas/blocks/b.clarify/checks.log [alive]
- atlas/blocks/b.clarify/understanding.md [alive] (R-8.08: объявленная рамка самого блока — написана до кода, как требует собственный протокол)

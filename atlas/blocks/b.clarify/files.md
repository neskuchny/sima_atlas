# b.clarify — files

## Код
- scripts/clarify_block.mjs [alive] (R-8.06: протокол вопроса + маркеры неопределённости + append-only Q→A лог + снятие маркера без остатка. Экспортирует clarifyBlock / normalizeQuestions / findMarkers / blockMarkers / appendAnswers / resolveMarker)
- scripts/validate_clarifications.mjs [alive] (R-8.06: гейт — done-блок не может нести открытый маркер; review → warning; idea/wip → info, чтобы черновик оставался свободным)
- scripts/block_meaning.mjs [alive] (R-8.08: направление «человек → модель». Экспортирует readTrajectory / trajectoryPromptLines — секция «Во что это вырастет» в mission.md и её подача агенту; understandingPromptLines / parseUnderstanding / readUnderstanding / understandingStaleness — объявление понимания агентом до кода; blockMeaningSummary — единый читатель для ночного отчёта и канваса; R-8.09: frameGate / recordDeclared / recordFrameReview / contractFingerprint — шлюз «объявил → человек подтвердил → код», declarePhasePromptLines / implementPhasePromptLines / operatorLanguage — промпты двух фаз на языке миссии)
- scripts/validate_meaning.mjs [alive] (R-8.08: отчёт, не гейт — траектория, наличие/полнота/устаревание understanding.md по блокам. Условия повышения до гейта и снятия — в шапке файла)

## Тесты
- tests/clarify_block.selftest.mjs [alive] (R-8.06: 10 групп — порядок enum, честная деградация на mock, пустой контракт, отбраковка ярлыка, отбраковка вопроса без выбора, сортировка по impact, поиск маркеров, append-only лог, снятие маркера, срабатывание done-гейта)
- tests/block_meaning.selftest.mjs [alive] (R-8.08/R-8.09: 10 групп — кириллические заголовки траектории, границы секции, пустой против отсутствующего, строки промпта, разбор understanding.md, устаревание по mtime, operative_frame на mock, один читатель для отчёта и библиотеки, шлюз как машина состояний, язык объявления и промпты двух фаз. Сквозные проверки оркестратора — в tests/frame_gate_flow.selftest.mjs, у b.agent-orchestrator)

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
- atlas/blocks/b.clarify/understanding.md [alive] (R-8.08/R-8.09: объявленная рамка самого блока — написана до кода, как требует собственный протокол)
- atlas/blocks/b.clarify/frame_reviews.jsonl [alive] (R-8.09: append-only журнал шлюза — объявлено / верно / не так; из него выводится состояние, и он же корпус поправок)

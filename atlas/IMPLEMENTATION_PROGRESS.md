# Реализация: что готово / что не готово

Дата: 2026-04-30

## Реализовано
- [x] Очередь ingestion принимает `conversation_text` и обрабатывает его в nightly/apply path.
- [x] Семантический разбор выделяет block-id из веток диалога и обновляет статус блока в `atlas/graph.json`.
- [x] Поддержан smoke/replay тест на реалистичных ветках общения (`simulate_conversation_branches`).
- [x] Для новых блоков создаются минимальные артефакты (`mission.md`, `tasks.md`, `checks.log`).

## Не реализовано (следующие шаги)
- [ ] Настоящий LLM-анализ смысла диалога (с извлечением mission/depends/provides/tasks), а не regex-эвристики.
- [ ] Автоматическое обновление `depends_on.md`/`provides.md` по смыслу обсуждения.
- [ ] Разрешение конфликтов между несколькими ветками (merge policy, confidence, human-approval).
- [ ] Persisted evaluation quality set (precision/recall на эталонных разговорах).
- [ ] UI-визуализация confidence и diff-предложений перед записью в Atlas.

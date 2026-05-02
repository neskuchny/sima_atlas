# b.docs — mission

Документ-генератор Атласа: на каждый блок собирает живую страницу wiki из его `mission.md / kpi.md / acceptance.md / depends_on.md / provides.md / files.md / patterns.md`. На каждый проект собирает `auto_tz.md` (агрегированное ТЗ) и `roadmap.md` (приоритизированный список блоков по статусу и зависимостям).

Главное правило — **никакой генерации текста, не основанной на содержимом блоков**. Если у блока mission.md шаблонный или пустой, в wiki это блок попадает с явной пометкой `[требует заполнения]`, а не «Ключевая цель блока…».

Реализация: `scripts/generate_wiki.mjs`, `scripts/generate_tz_from_atlas.mjs`, `scripts/render_wiki_html.mjs`, `scripts/rebuild_atlas_roadmap.mjs`.

## Layer
content

## Что должен делать в done-версии
1. Wiki содержит секции по слоям (front/back/ai/data/...) и навигацию между блоками по `depends_on`.
2. Mermaid-диаграмма графа в `wiki.html` (по `graph.json`).
3. ТЗ автогенерируется только из non-template mission/kpi (контракт `validate_no_template_placeholders`).
4. Roadmap учитывает не только статус блока, но и `depends_on` (топологическая сортировка).
5. Скриншоты блоков (когда `b.ui-control` дойдёт до этой фичи) встраиваются в wiki.

## Out of scope
- Извлечение содержимого блоков из чата (это `b.llm-gateway` + `b.agent-orchestrator`).

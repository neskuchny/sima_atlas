# b.docs — KPI

- **KPI-1 (no template leakage)**: ни одна страница wiki не содержит шаблонных фраз («Ключевая цель блока», «Автосоздано», «определить»). Сейчас: ✗ (пока проверка не подключена; PR1 чинит).
- **KPI-2 (graph diagram)**: `wiki.html` содержит Mermaid-диаграмму с блоками и зависимостями. Сейчас: ✗ (`render_wiki_html.mjs` рендерит plain markdown).
- **KPI-3 (layer navigation)**: wiki разбит на разделы по слоям (front/logic/ai/data/...). Сейчас: ✗ (зависит от поля `layer` в graph.json — добавляется в PR2).
- **KPI-4 (roadmap topo-sort)**: при двух блоках A→B (A зависит от B), B всегда раньше A в roadmap, даже если у B статус `done`, а у A `wip`. Сейчас: ✗ (`rebuild_atlas_roadmap.mjs` сортирует только по статусу).
- **KPI-5 (auto_tz coverage)**: auto_tz.md содержит секции для каждого активного блока с заполненной mission, и пропускает блоки в статусе `idea` без mission. Сейчас: △ (генерирует все, без фильтра по template).

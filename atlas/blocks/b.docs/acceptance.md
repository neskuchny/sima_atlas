# b.docs — acceptance

- [ ] **A1.** При наличии в любом mission.md фразы «Ключевая цель блока…» или «Автосоздано из…» команда `node scripts/generate_wiki.mjs` падает с ненулевым exit-кодом. (Гейт против шаблонов.)
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: node scripts/validate_no_template_placeholders.mjs
  expect_in_stdout: "OK"
```
- [ ] **A2.** В `wiki.html` присутствует `<div class="mermaid">` с актуальным графом по `graph.json`.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: atlas/wiki.html
  pattern: "class=\"mermaid\""
```
- [ ] **A3.** Если блок A `depends_on: [B]`, то в `roadmap.md` B появляется на меньшей позиции, чем A — независимо от статуса.
- [ ] **A4.** `auto_tz.md` собран только из non-template mission/kpi и содержит ссылки на исходные `blocks/<id>/*.md`.
```yaml
evidence_kind: fs_glob
evidence_spec:
  pattern: ТЗ/auto_tz.md
  min_count: 1
```
- [ ] **A5.** При отсутствии у блока поля `layer` (старый формат) wiki показывает раздел «Без слоя», а не пихает в первый попавшийся.

## Не считается acceptance:
- наличие файлов `wiki.html`, `auto_tz.md`, `roadmap.md` (это smoke).

# b.ui-control — acceptance

Блок переходит в `done` только когда:

- [ ] **A1.** HTML открывается в браузере и `<div id="root">` заполнен (smoke-тест: `headless run` грузит страницу, ловит `error`-события, ждёт что DOM содержит `.l2-top` и `.workarea`).
- [ ] **A2.** Все JSX-зависимости `app_v2.jsx` подгружены (нет `useTweaks/SourcePalette/CanvasInspector is not defined` в консоли).
- [ ] **A3.** При выбранном проекте `atlas-live` канвас архитектуры рисует ≥ 3 горизонтальных слоя; в каждом слое — корректные блоки из `graph.json` по полю `layer` (зависит от PR2).
- [ ] **A4.** Sync-check на 5 блоках возвращает либо ok, либо drift с конкретной причиной (`status_reason`) — без ложных «всё зелёное».
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: node scripts/validate_block_contracts.mjs
  expect_in_stdout: "OK"
```
- [ ] **A5.** Кнопка Done заблокирована, если `acceptance` чек-листа блока не отмечены полностью И в `checks.log` нет `acceptance pass` + `kpi pass`.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: scripts/log_transition.mjs
  pattern: "verdict !== 'pass'"
```

## Не считается acceptance:
- наличие файлов;
- прохождение `validate_block_contracts.mjs` (это контрактный gate, не приёмка);
- генерация `wiki.html` (это `b.docs`).

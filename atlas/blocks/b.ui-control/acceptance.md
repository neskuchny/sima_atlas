# b.ui-control — acceptance

Блок переходит в `done` только когда:

- [ ] **A1.** HTML открывается в браузере и `<div id="root">` заполнен (smoke-тест: `headless run` грузит страницу, ловит `error`-события, ждёт что DOM содержит `.l2-top` и `.workarea`).
- [ ] **A2.** Все JSX-зависимости `app_v2.jsx` подгружены (нет `useTweaks/SourcePalette/CanvasInspector is not defined` в консоли).
- [ ] **A3.** При выбранном проекте `atlas-live` канвас архитектуры рисует ≥ 3 горизонтальных слоя; в каждом слое — корректные блоки из `graph.json` по полю `layer` (зависит от PR2).
- [ ] **A4.** Sync-check на 5 блоках возвращает либо ok, либо drift с конкретной причиной (`status_reason`) — без ложных «всё зелёное».
- [ ] **A5.** Кнопка Done заблокирована, если `acceptance` чек-листа блока не отмечены полностью И в `checks.log` нет `acceptance pass` + `kpi pass`.

## Не считается acceptance:
- наличие файлов;
- прохождение `validate_block_contracts.mjs` (это контрактный gate, не приёмка);
- генерация `wiki.html` (это `b.docs`).

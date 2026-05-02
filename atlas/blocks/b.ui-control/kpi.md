# b.ui-control — KPI

- **KPI-1 (boot)**: HTML-страница `Sima (Remix)/Сима - универсальный конструктор.html` открывается в браузере без ошибок в консоли (всё React-дерево рендерится). Сейчас: ✗ (часть JSX не подключена).
- **KPI-2 (multi-layer)**: канвас рисует не менее 5 горизонтальных слоёв из `ARCH_LAYERS`, и блоки распределены по этим слоям по полю `layer`. Сейчас: ✗ (графа без поля `layer`, всё валится в один контейнер).
- **KPI-3 (sync visibility)**: при `syncCheck` блоки со статусом drift/broken визуально подсвечиваются на канвасе с причиной из `syncReport.details`. Сейчас: △ (логика есть в `atlas_sync.js`, но завязана только на наличие файлов).
- **KPI-4 (lifecycle gating)**: кнопка Done на блоке заблокирована, пока не пройдены acceptance + kpi проверки. Сейчас: ✓ (логика `isReadyToDone` в `app_v2.jsx`).
- **KPI-5 (context-pack export)**: для выбранного блока копируется в буфер deterministic JSON со всеми ссылками на mission/kpi/depends/provides. Сейчас: ✓ для UI-кнопки, файл-output генерируется через `scripts/build_context_pack.mjs`.

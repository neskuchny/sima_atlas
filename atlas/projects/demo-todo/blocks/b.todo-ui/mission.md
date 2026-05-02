# b.todo-ui — mission

React SPA для Demo TODO. Реализует все 5 user-stories из `b.user-stories`. Основные виды: список задач сверху-вниз, чекбокс toggle, корзина для удаления (с undo-toast), фильтр-chips по категориям сверху, опциональная suggested-category под полем ввода.

## Layer
front

## Главный flow
1. Юзер набирает текст → если включён `b.smart-categorizer`, под полем появляется chip-предложение категории.
2. Enter → POST /todos → новая задача в начале списка.
3. Чекбокс — PATCH /todos/:id с {done:true} → задача переезжает в подсписок «Сделано».
4. Корзина — DELETE /todos/:id → задача исчезает; toast «Удалено · Undo» 5 сек.

## Out of scope MVP
- Drag-and-drop reorder, sub-tasks, sharing, push-уведомления.

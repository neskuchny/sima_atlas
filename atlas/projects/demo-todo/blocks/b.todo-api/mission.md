# b.todo-api — mission

Fastify-сервис, который реализует CRUD контракт `/todos` и подкладывает в БД через drizzle-orm. Любая фича, доступная в UI, приходит сюда сначала.

## Layer
logic

## Контракт endpoints
- `GET    /todos?category=&done=`        — список задач с фильтром
- `POST   /todos                {text}`  — создать задачу
- `PATCH  /todos/:id {text?, category?, done?}` — обновить
- `DELETE /todos/:id`                    — удалить
- `POST   /todos/categorize {text}`      — (опционально) категоризовать через b.smart-categorizer

## Главный flow
1. UI вызывает POST /todos с {text}.
2. API валидирует длину 1..280 chars; пишет в БД с created_at = now.
3. Возвращает {id, text, category:null, done:false, created_at}.
4. UI добавляет задачу в начало списка.

## Out of scope MVP
- Auth, multi-tenant, rate-limit.

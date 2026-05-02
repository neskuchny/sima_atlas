# b.todo-db — mission

PostgreSQL 16 + drizzle-orm. Одна таблица `todos`, миграции через drizzle-kit. БД-слой полностью владеется этим блоком: API не пишет SQL напрямую, только через drizzle-схему отсюда.

## Layer
data

## Schema
```sql
todos (
  id          uuid primary key default gen_random_uuid(),
  text        text not null check (char_length(text) between 1 and 280),
  category    text,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
)
```

## Главный flow
- API импортирует drizzle-схему, читает/пишет через `db.select / insert / update / delete`.
- Миграции — `drizzle-kit migrate`.

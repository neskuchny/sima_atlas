# b.smart-categorizer — mission

Опциональный AI-помощник: при наборе нового todo (через POST /todos/categorize) подсказывает одну из существующих категорий. Использует общий gateway `b.llm-gateway` Атласа — ходит туда через MCP-tool, а не через прямой Anthropic / Google SDK. Это обеспечивает единый trace, cost cap и выбор провайдера для всего демо-проекта.

## Layer
ai

## Главный flow
1. API получает POST /todos/categorize {text:"купить молоко"}.
2. Этот блок собирает known categories пользователя (`SELECT DISTINCT category FROM todos`).
3. Зовёт b.llm-gateway: structured output `{category: enum, confidence: number}`.
4. Возвращает API первое предложение с confidence ≥ 0.6, иначе null.
5. UI показывает chip-предложение под полем ввода.

## Out of scope
- Создание новых категорий из ничего (только из существующих).
- Bulk re-classification всех старых задач.

# b.smoke-sandbox — KPI

- **KPI-1 (idempotency)**: повторный запуск `mcp_smoke_e2e.mjs` оставляет sandbox в идентичном состоянии (нет накопления мусора в graph.json или других блоках).
- **KPI-2 (isolation)**: ни одно действие smoke-теста не модифицирует другой блок atlas; gate `validate_no_template_placeholders` остаётся зелёным после прогона.
- **KPI-3 (smoke-coverage)**: smoke-тест прокатывает все 21+ MCP-tools хотя бы раз без ошибок.

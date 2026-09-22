# b.smoke-sandbox — acceptance

- [ ] **A1.** Sandbox используется только тестовыми скриптами (`scripts/mcp_smoke_e2e.mjs`, etc.). Никакая реальная фича не должна писать или читать из этого блока.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: scripts/mcp_smoke_e2e.mjs
  pattern: "b.smoke-sandbox"
```
- [x] **A2.** Регулярный grep по содержимому `mission.md` других блоков **не находит** упоминаний b.smoke-sandbox (никакой блок-продукт не должен от него зависеть).
  _R-8.11: была на LLM-судье; это факт о файлах, поэтому проверяется детерминированно (grep по mission.md всех остальных блоков)_
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: "! grep -lF 'b.smoke-sandbox' atlas/blocks/*/mission.md | grep -vF 'atlas/blocks/b.smoke-sandbox/'"
```
- [ ] **A3.** Между двумя последовательными `mcp_smoke_e2e.mjs` прогонами `git diff` в других блоках пуст.
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: node scripts/mcp_smoke_e2e.mjs
  expect_in_stdout: "OK"
```

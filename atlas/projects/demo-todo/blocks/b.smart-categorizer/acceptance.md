# b.smart-categorizer — acceptance

- [ ] **A1 (logic flow).** Golden eval JSON в tests/llm_mocks/categorizer/ покрывает 20 примеров; flow add → suggest → accept проходит.
- [ ] **A2 (sync).** API endpoint `/todos/categorize` сохраняет схему контракта; UI принимает {category:string|null, confidence:number}.
- [ ] **A3 (scenario).** При выключенном AI (нет ключей) UI не падает — chip просто не показывается.

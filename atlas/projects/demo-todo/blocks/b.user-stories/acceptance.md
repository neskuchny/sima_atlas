# b.user-stories — acceptance

- [ ] **A1 (logic flow).** Все 5 user-stories US-1..US-5 имеют чёткие acceptance criteria и referenced acceptance test ID в `b.todo-ui/acceptance.md`.
- [ ] **A2 (sync).** Если в `b.todo-ui` появляется новая фича без upstream user-story в этом блоке — sync-check возвращает drift.
- [ ] **A3 (scenario).** Golden e2e flow «add → toggle → delete» проходит зелёным, отражая US-1, US-2, US-3.

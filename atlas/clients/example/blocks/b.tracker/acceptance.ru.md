# b.tracker — acceptance

- [ ] **A1.** POST /checkin с habit_id + date → 200 + новый event
- [ ] **A2.** Двойной POST с тем же client_event_id → 200 + same event id
- [ ] **A3.** Чек-ин на будущую дату → 400
- [ ] **A4.** Чек-ин на дату > 30 дней назад → 400 (anti-cheating)

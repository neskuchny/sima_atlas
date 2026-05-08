# b.tracker — acceptance

- [ ] **A1.** POST /checkin with habit_id + date → 200 + new event
- [ ] **A2.** Duplicate POST with the same client_event_id → 200 + same event id
- [ ] **A3.** Check-in for a future date → 400
- [ ] **A4.** Check-in for a date > 30 days ago → 400 (anti-cheating)

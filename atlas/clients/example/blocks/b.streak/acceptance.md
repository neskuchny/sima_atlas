# b.streak — acceptance

- [ ] **A1.** streak_count = N when there are N consecutive days with a check-in
- [ ] **A2.** 1 missed day + freeze available → streak is preserved
- [ ] **A3.** 2+ missed days in a row → streak = 0, streak_reset event emitted
- [ ] **A4.** The 7-day achievement triggers exactly once even after reset+rebuild

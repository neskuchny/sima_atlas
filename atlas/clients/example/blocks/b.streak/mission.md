# b.streak — mission

Tracks streaks and achievements. A streak = N consecutive days with a
check-in. The main UX goal is to handle slip-ups gently. After 1 missed
day the streak does NOT reset — we grant a "freeze" (Duolingo-style).
After 2 missed days the streak softly resets with a friendly "Time to
start again" message.

Storage: Redis sorted set for top streaks, Postgres for history.

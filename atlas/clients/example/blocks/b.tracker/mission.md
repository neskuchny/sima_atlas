# b.tracker — mission

Business logic for daily check-ins: the user marks that they completed
a habit. The most important thing is simplicity — one tap = one check-in.

Each check-in is recorded in Postgres (event sourcing — we don't update
a counter, we append an event). Streaks are recomputed lazily on read
or proactively by the streak block.

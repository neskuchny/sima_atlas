# b.auth — tasks

- [ ] T1: password hashing (argon2id/bcrypt) + verify
- [ ] T2: JWT access issue/verify (15 min, local verify)
- [ ] T3: rotating refresh tokens (30 day, single-use, family revoke on reuse)
- [ ] T4: session lifecycle endpoints (login / refresh / logout / revoke-all)
- [ ] T5: RBAC check (deny-by-default) exposed as auth.rbac
- [ ] T6: tests/auth.selftest.mjs covering A1–A4

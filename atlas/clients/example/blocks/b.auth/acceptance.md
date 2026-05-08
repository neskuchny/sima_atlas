# b.auth — acceptance

- [ ] **A1.** /auth/oauth/google returns JWT + refresh after a successful code exchange
- [ ] **A2.** /auth/oauth/apple works identically
- [ ] **A3.** An expired refresh token returns 401 with no hints about the account
- [ ] **A4.** JWT secret rotates every 30 days — old tokens accepted for another 24h
- [ ] **A5.** Verified that requests without a User-Agent header are rejected (anti-bot)

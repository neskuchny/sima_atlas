# b.auth — acceptance

- [ ] **A1.** /auth/oauth/google возвращает JWT + refresh после успешного code exchange
- [ ] **A2.** /auth/oauth/apple работает идентично
- [ ] **A3.** Истёкший refresh-токен возвращает 401 без подсказок об учётке
- [ ] **A4.** JWT secret вращается раз в 30 дней — старые токены принимаются ещё 24ч
- [ ] **A5.** Проверено что без User-Agent header запрос отбрасывается (anti-bot)

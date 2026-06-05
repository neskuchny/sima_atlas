# b.auth — acceptance

- [ ] **A1.** Login with valid credentials returns an access + refresh token pair.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/auth.selftest.mjs
  expect_in_stdout: "login: OK"
```
- [ ] **A2.** A tampered/expired access token is rejected with 401.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/auth.selftest.mjs
  expect_in_stdout: "reject-tampered: OK"
```
- [ ] **A3.** A refresh token can be used once; reuse revokes the family.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/auth.selftest.mjs
  expect_in_stdout: "refresh-rotation: OK"
```
- [ ] **A4.** Passwords are stored hashed — no plaintext in the store.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: tests/auth.selftest.mjs
  pattern: "no-plaintext"
```

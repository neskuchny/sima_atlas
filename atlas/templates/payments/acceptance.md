# b.payments — acceptance

- [ ] **A1.** Two charge requests with the same idempotency key produce one charge.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/payments.selftest.mjs
  expect_in_stdout: "idempotent-charge: OK"
```
- [ ] **A2.** A duplicate webhook delivery is a no-op (no double state transition).
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/payments.selftest.mjs
  expect_in_stdout: "webhook-replay-safe: OK"
```
- [ ] **A3.** A refund moves the charge to `refunded` and is itself idempotent.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/payments.selftest.mjs
  expect_in_stdout: "refund: OK"
```
- [ ] **A4.** No raw card numbers in code or logs — only provider tokens.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: tests/payments.selftest.mjs
  pattern: "no-pan"
```

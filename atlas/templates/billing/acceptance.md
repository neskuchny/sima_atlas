# b.billing — acceptance

- [ ] **A1.** Subscribing to a plan creates an active subscription.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/billing.selftest.mjs
  expect_in_stdout: "subscribe: OK"
```
- [ ] **A2.** Usage metering counts each event once (idempotent by event id).
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/billing.selftest.mjs
  expect_in_stdout: "metering: OK"
```
- [ ] **A3.** An over-quota operation is denied (deny-by-default).
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/billing.selftest.mjs
  expect_in_stdout: "limit-enforced: OK"
```
- [ ] **A4.** Invoice total equals the sum of its line items to the cent.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/billing.selftest.mjs
  expect_in_stdout: "invoice-total: OK"
```

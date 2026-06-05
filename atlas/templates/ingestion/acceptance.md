# b.ingestion — acceptance

- [ ] **A1.** A valid event is accepted and delivered to storage once.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/ingestion.selftest.mjs
  expect_in_stdout: "intake: OK"
```
- [ ] **A2.** A re-sent event with the same dedup key lands exactly once.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/ingestion.selftest.mjs
  expect_in_stdout: "exactly-once: OK"
```
- [ ] **A3.** A malformed payload is rejected with a reason, nothing stored.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/ingestion.selftest.mjs
  expect_in_stdout: "reject-malformed: OK"
```
- [ ] **A4.** Under a burst, no events are dropped (queued).
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/ingestion.selftest.mjs
  expect_in_stdout: "backpressure: OK"
```

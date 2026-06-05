# b.search — acceptance

- [ ] **A1.** A keyword query returns matching items ranked by relevance.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/search.selftest.mjs
  expect_in_stdout: "ranked-query: OK"
```
- [ ] **A2.** Filters (e.g. status, date range) narrow results correctly.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/search.selftest.mjs
  expect_in_stdout: "filter: OK"
```
- [ ] **A3.** Pagination is consistent — page 1 + page 2 cover all hits with no overlap.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/search.selftest.mjs
  expect_in_stdout: "pagination: OK"
```
- [ ] **A4.** An empty/garbage query returns [] not an error.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/search.selftest.mjs
  expect_in_stdout: "empty-query-safe: OK"
```

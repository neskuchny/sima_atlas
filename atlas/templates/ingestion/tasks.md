# b.ingestion — tasks

- [ ] T1: intake endpoint (accept fast, ack < 50ms)
- [ ] T2: schema validation at the boundary (reject malformed with reason)
- [ ] T3: dedup-key store for exactly-once
- [ ] T4: async delivery to storage with a queue (backpressure-safe)
- [ ] T5: dead-letter for repeatedly-failing payloads
- [ ] T6: tests/ingestion.selftest.mjs covering A1–A4

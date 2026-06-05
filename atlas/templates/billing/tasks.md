# b.billing — tasks

- [ ] T1: plan model + subscription lifecycle (subscribe/change/cancel)
- [ ] T2: usage meter (idempotent by event id, monotonic)
- [ ] T3: plan-limit enforcement (deny-by-default) exposed as billing.usage
- [ ] T4: invoice generation (integer-cent math, total == sum)
- [ ] T5: proration on plan change within a period
- [ ] T6: tests/billing.selftest.mjs covering A1–A4

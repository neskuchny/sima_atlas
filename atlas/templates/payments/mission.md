# b.payments — mission

Take money safely. Handles checkout intent creation, provider webhooks
(Stripe / etc), idempotent charge handling (a retried request never
double-charges), and refunds. Records every state transition so a charge's
history is auditable.

## Why
Money is the one place a silent bug is unforgivable. Centralising charge
state + idempotency here means no caller has to reason about double-submits,
webhook ordering, or partial failures.

## Out of scope
- Subscription/usage logic (that's b.billing — it consumes payments.charge)
- UI checkout forms (frontend block)

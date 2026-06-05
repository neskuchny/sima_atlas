# b.billing — mission

Turn usage into revenue. Manages subscription plans, meters usage, generates
invoices, and enforces plan limits (deny-by-default when over quota). Sits
on top of b.payments for the actual money movement.

## Why
Billing logic leaks everywhere if it isn't centralised — every feature ends
up checking «is this user over their limit?». One block owns plans, usage
counters, and invoice generation; others just ask billing.usage.

## Out of scope
- Raw charge/refund mechanics (that's b.payments — billing depends on it)
- Pricing-page UI (frontend block)

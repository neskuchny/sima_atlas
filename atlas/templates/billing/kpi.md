# b.billing — kpi

- KPI-1: usage metering is monotonic and never double-counts a single event
- KPI-2: plan-limit enforcement is deny-by-default — over-quota is blocked, not warned
- KPI-3: invoice total == sum(line items) exactly, to the cent (no float drift)
- KPI-4: a plan change (up/downgrade) prorates correctly within the period

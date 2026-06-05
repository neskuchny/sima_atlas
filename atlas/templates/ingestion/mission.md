# b.ingestion — mission

Take the outside world in, cleanly. Accepts events / documents from an SDK
or upload, validates shape, deduplicates, and delivers exactly-once to
storage (or a warehouse). Backpressure-aware: a slow downstream never drops
data, it queues.

## Why
Ingestion is where garbage-in happens. A single validated, dedup'd,
exactly-once intake point means every downstream block can trust what it
reads instead of re-validating.

## Out of scope
- Analytics/OLAP query layer (separate warehouse block consumes this)
- Real-time stream processing windows (a later concern)

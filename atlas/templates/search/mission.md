# b.search — mission

Find things fast. Full-text + structured-filter search over a primary
entity, ranked by relevance, paginated, with stable ordering for equal
scores. Backed by whatever the stack locks in (Postgres FTS / Meilisearch /
Elastic) behind one `search.query` contract so callers never couple to the
engine.

## Why
Search is where users judge whether a product «works». A clean contract
means the engine can be swapped (FTS → Meili) without touching callers.

## Out of scope
- Search-result UI (frontend block consumes search.query)
- Recommendation / personalization ranking (separate concern)

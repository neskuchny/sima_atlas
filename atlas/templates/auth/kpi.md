# b.auth — kpi

- KPI-1: access token verification < 5ms p99 (no network call — local verify)
- KPI-2: refresh-token rotation is single-use; a replayed refresh token is rejected AND revokes the session family
- KPI-3: password hash uses a memory-hard KDF with per-user salt; never stored or logged in plaintext
- KPI-4: RBAC check is deny-by-default — an unknown role/permission returns false

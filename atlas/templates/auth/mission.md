# b.auth — mission

Authentication and authorization for the product. Issues short-lived JWT
access tokens (15 min) backed by long-lived refresh tokens (30 day,
rotating), hashes passwords with a memory-hard KDF (argon2id / bcrypt),
manages session lifecycle (login / refresh / logout / revoke-all), and
exposes role checks (RBAC) other blocks consume before serving protected
data.

## Why
Every feature that touches a user needs to know «who is this and what may
they do». Centralising it here means no other block re-implements token
parsing or role logic — they depend on `auth.session` / `auth.rbac`.

## Out of scope
- Identity-provider SSO / OIDC federation (separate block when needed)
- UI login screens (frontend block consumes this contract)

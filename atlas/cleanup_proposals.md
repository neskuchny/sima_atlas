# Cleanup proposals

_Generated: 2026-06-19T18:31:52.630Z_  ·  _root: `.`_

Pure proposals — **nothing is applied automatically**. Each item below has
an apply-command. The apply tool MOVES files (with breadcrumb), never deletes.
Files referenced by name in any `.md` inside `atlas/` or `docs/` are skipped
on principle (operator: «может пригодиться для будущего ТЗ»).

**Summary:** stale-alive: 0 · stale-dead: 0 · stale-archived: 0 · orphan-code: 0 · dead-code-unimported: 1

## dead-code-unimported (1)

- `scripts/chat_sources/claude.mjs`
  - reason: no file imports it (import-graph), not a CLI/HTML/package entry point, no block claims it — likely dead code
  - action: move-to-archive/dead-code/<date>/scripts/chat_sources/claude.mjs
  - apply: `node scripts/apply_cleanup_proposal.mjs --id "dead-code::scripts/chat_sources/claude.mjs"`


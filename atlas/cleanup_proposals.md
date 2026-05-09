# Cleanup proposals

_Generated: 2026-05-09T20:15:57.501Z_  ·  _root: `.`_

Pure proposals — **nothing is applied automatically**. Each item below has
an apply-command. The apply tool MOVES files (with breadcrumb), never deletes.
Files referenced by name in any `.md` inside `atlas/` or `docs/` are skipped
on principle (operator: «может пригодиться для будущего ТЗ»).

**Summary:** stale-alive: 0 · stale-dead: 0 · stale-archived: 0 · orphan-code: 1

## orphan-code (1)

- `scripts/realtor_call_analytics.mjs`
  - reason: on disk, no block claims it in files.md, no .md references its name — possibly cleanable
  - action: move-to-archive/orphans/<date>/scripts/realtor_call_analytics.mjs
  - apply: `node scripts/apply_cleanup_proposal.mjs --id "orphan::scripts/realtor_call_analytics.mjs"`


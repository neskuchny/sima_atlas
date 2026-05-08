# Contributing to Sima Atlas

> Russian original preserved at [`./CONTRIBUTING.ru.md`](./CONTRIBUTING.ru.md).

Thanks for your interest in the project. Sima Atlas is open-source MIT — we welcome any contribution, from a typo fix to a new MCP integration or a new evidence-collector.

> This document is the **process**. The *what* (task lists, open invitations) lives in [README.md](README.md) and in [the article, Part 11](ТЗ/статья.md).

---

## Quick start for contributors

```bash
git clone https://github.com/neskuchny/sima_atlas
cd sima_atlas
npm install
npm run dev          # API + UI come up on http://localhost:8000/atlas_design/
```

Before your first PR, make sure the verify run is green:

```bash
npm run verify       # runs verify_all (~150s, no network)
```

---

## Repository layout

| Path | What's there |
|------|-----------|
| `atlas/` | Source of truth: graph + blocks + proposals + run_state. Plain text, git-diffable. |
| `atlas/blocks/<id>/` | Per-block contracts: `mission.md`, `kpi.md`, `acceptance.md`, `tasks.md`, `checks.log`, ... |
| `scripts/` | All executables: API server, MCP server, validators, generators, orchestrators. |
| `tests/` | Selftests + Playwright e2e. Every new block must have its own selftest in nightly. |
| `frontend/atlas_design/` | UI canvas (React + JSX with no build step, in-browser Babel). |
| `docs/` | Integrations and other operational documentation. |
| `ТЗ/` | Methodology (the article), specs, audits. |
| `.github/` | CI workflows, issue / PR templates. |

---

## What can I do?

See the **Contributing** section of the README — there are 8 concrete invitations with difficulty levels. The most common ones:

- **New MCP clients** for other IDEs → [`docs/integrations.md`](docs/integrations.md)
- **Local providers** in the LLM gateway (Ollama / vLLM / LM Studio) → `scripts/llm_gateway.mjs`
- **Block templates** (auth, payments, search) → new file under `atlas/templates/`
- **Evidence collectors** (HTTP-status, JSON-shape, snapshot-diff) → `scripts/collect_evidence.mjs`
- **UI localizations** → `frontend/atlas_design/index.html` + `views.jsx`
- **Documentation / translations** — `ТЗ/статья.md` is currently Russian-only; an English translation is welcome

If you want to start small, look at issues labelled `good first issue`.

---

## Workflow

### 1. Issue (optional, but encouraged)

Before a substantial change, open an issue or discussion to align on the approach. For obvious fixes (typos, clear bugs), a PR straight away is fine.

### 2. Branch

```bash
git checkout -b feat/short-description
# or: fix/, docs/, refactor/, test/, chore/
```

Don't push to `main` directly.

### 3. Code

- Follow the existing style. We don't have explicit rules yet — for now we go with "what's already there".
- Every new block (`atlas/blocks/<id>/`) must have:
  - the 5 required contract files (`mission/kpi/acceptance/tasks/checks.log`)
  - a selftest in `tests/`, wired into `scripts/nightly_consolidation.mjs`
- Any UI change must access payload defensively (`data.field?.[id]`) — we got bitten once by a white screen from undefined access (see R-5).
- **Don't comment the obvious.** A comment is needed only when *why* doesn't follow from *what*.

### 4. Tests

Green before PR is mandatory:

```bash
npm run verify       # all 4 groups: nightly + acceptance + cursor + mcp
```

If you change acceptance / evidence — add a scenario in the corresponding selftest.

If you change the UI — Playwright must be green (`npx playwright test`). Screenshots in `tests/playwright/screenshots/` are committed alongside the changes.

### 5. Commit message

Free-form conventional commits style:

```
<type>(<scope>) — short one-line summary

Longer explanation of *why* (not *what* — *what* is in the diff).
If it fixes a specific bug, mention the symptom, not just the solution.
If it relates to an issue, write `Fixes #123`.
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`. Scopes are at your discretion (often = `block_id` or `script-name`).

Examples of our commits live in `git log`.

### 6. Pull Request

- The PR template will prompt for what to describe.
- Link to the issue if one exists.
- CI must be green.
- Be ready for code review — we usually respond within 48 hours.

---

## Code style

We're still in "as it grew" mode; no explicit rules yet. Empirical trends in the current code:

- ES modules (`import` / `export`), not CommonJS.
- 2-space indent, single quotes, semicolons in JS.
- Paths always absolute through `path.join(ROOT, ...)`, not relative paths.
- All scripts are idempotent (a second run must not break state).
- All API routes return `200 + {ok: false, error}` instead of HTTP 4xx (to avoid CORS hiccups in the UI).

If you want to propose a formal code-style guide (ESLint, Prettier config, .editorconfig) — open an issue, let's agree on the rules, then we'll roll it out.

---

## License and authorship

Sima Atlas is MIT-licensed — your PR lands under the same license. We don't sign a CLA.

Contributor attribution is via `git log`. The maintainers list is in the README.

---

## Where to ask

- **Issues** — bugs, feature requests, specific code questions
- **Discussions** — general questions, direction discussions, ideas
- **PR comments** — discussion on a specific proposal

Maintainer — Anton Kalabukhov (Synlabs). We respond within 48 hours in most cases.

Thanks!

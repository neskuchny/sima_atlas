# Cursor IDE — live integration test

This procedure validates the bits of `b.agent-orchestrator` that **cannot**
be exercised from a headless CI:

  * `.cursor/hooks.json` `beforeShellExecution` actually fires when the
    operator types `pip install …` in Cursor's terminal
  * `afterFileEdit` writes a `cursor_edit pass` line into the right block's
    `checks.log`
  * `beforeSubmitPrompt` injects `inject_context_pack.mjs` output before
    the prompt reaches Claude

Each step takes ~30 seconds. Run the full procedure once after big changes
to `.cursor/hooks.json` or to the action scripts referenced from it.

## 0. Prerequisites

```sh
git pull origin claude/visual-component-system-N2W07
node scripts/validate_cursor_hooks.mjs   # must say OK
node tests/cursor_hooks_actions.test.mjs # must say OK (9 cases)
```

If either fails, fix that before continuing — the live test will only fail
in confusing ways.

## 1. Open the repo in Cursor

* `Cursor → Open Folder…` → select the repo root
* The operator panel should detect `.cursor/mcp.json` and offer to enable
  the MCP server. Accept.
* Open the bottom Output / Logs pane to watch hook firings.

## 2. Test `beforeShellExecution`

In the integrated terminal:

```sh
pip install neo4j
```

Expected:
* Cursor blocks the command before it runs
* A line appears in `atlas/blocks/b.agent-orchestrator/checks.log`:
  `<ts>  drift_guard  fail  drift_blocked: command "pip install neo4j" matched substring "pip install" in tech_stack.md`
* A mirror line appears in `atlas/transitions.log` with the same `drift_guard`
  prefix
* Re-typing `npm install react` is allowed (the substring isn't banned)

## 3. Test `afterFileEdit`

Pick any file from `atlas/blocks/b.docs/files.md` (e.g.
`scripts/generate_wiki.mjs`) and add a trailing comment:

```js
// live-test marker
```

Save. Expected:
* A line appears in `atlas/blocks/b.docs/checks.log`:
  `<ts>  cursor_edit  pass  ${file}  +1/-0`
* The line cites the right block (b.docs), not the first block in graph.json

Revert your edit when done.

## 4. Test `beforeSubmitPrompt`

In the chat panel, type:

```
продолжи b.docs - нужен mermaid
```

Expected (in Cursor's prompt-debugger or the conversation log):
* The actual prompt sent to Claude is prepended with the `<!-- ATLAS CONTEXT
  PACK -->` section produced by `inject_context_pack.mjs`
* The pack contains `## Block: b.docs`, the mission text, KPI, acceptance
* Token budget honored — the pack is bounded to ~12000 chars

## 5. Test the full agent run

In Cursor's chat:

```
/run-block b.smoke-sandbox
```

(Or via MCP `run_block_implementation` directly.) Expected:
* `atlas/run_state/<run_id>.json` is created
* FSM walks through `PreparingWorkspace → LaunchingAgent → Running →
  Verifying → Succeeded`
* `<run_id>.json` final state has `verifier_verdict: "pass"` (or fail/inconclusive)
* If `ATLAS_USE_WORKSPACE=1` — `~/.atlas_workspaces/<run_id>/` is created
  and a `agent_run_diff` proposal lands in `atlas/proposals/`

## 6. Test the Inspector UI live

Run the Atlas API server in a second terminal:

```sh
node scripts/atlas_api_server.mjs &
python3 -m http.server 8000 --directory "Sima (Remix)" &
```

Open `http://localhost:8000/index.html` in a browser.
* Click any block in the canvas.
* Inspector panel (right side) should show:
  - `RunStatusSection` — the run we kicked off in step 5 with FSM badge
  - `AcceptanceSection` — verdict + per-assertion drill-down
  - `ProfileHintsSection` — "warming_up" notice (until ≥5 done blocks)
  - `UserDocsLink` — link to `atlas/docs/end-user/<block>.md` (if exists)
* `ProposalsPanel` (left side) — accept/reject buttons mutate state.

## Troubleshooting

* If `pip install` is NOT blocked — `.cursor/hooks.json` is missing or invalid.
  Run `node scripts/validate_cursor_hooks.mjs` and fix any reported errors.
* If the prompt has no Atlas pack — Cursor likely uses an older API. Check
  Cursor version: needs ≥ the build that supports `beforeSubmitPrompt`.
* If the inspector shows stale data — the live polling endpoint
  (`/atlas/state` hash) hasn't picked up the change. Check that
  `atlas_api_server.mjs` is running on port 8787.

## Reporting

After running steps 1–6, paste the contents of:

```
atlas/blocks/b.agent-orchestrator/checks.log  # last ~10 lines
atlas/transitions.log                          # last ~5 lines
atlas/run_state/<latest>.json                   # the run you triggered
```

into a checks.log entry titled `cursor_live_pass` (or `cursor_live_fail`).

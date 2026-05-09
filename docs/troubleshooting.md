# Sima Atlas — Troubleshooting

> Russian original preserved at [`./troubleshooting.ru.md`](./troubleshooting.ru.md).

Real errors that operators have hit, plus tested fixes.
Look for your specific symptom; if it's not here, file an issue.

---

## 1. LLM / Claude CLI

### `Invalid API key · Fix external API key` in the LLM response

**Symptom.** The `✏ Rewrite` / `✨ Fill` / `Claude's advice` buttons return, but the modal shows "Invalid API key" (or similar), and the `npm run dev` log says:
```
[llm-gateway] claude --print exited 1 with parseable JSON; accepting (likely Windows cmd-wrapper quirk).
[llm-gateway] claude_cli failed (claude_cli error: Invalid API key · Fix external API key); trying next in cascade [...]
```

**Cause.** The system has an `ANTHROPIC_API_KEY` env var with a broken/stale key. The Claude CLI prioritizes the env key over the built-in Pro/Max session.

**Fix (Windows PowerShell).**
```powershell
# 1. Wipe the broken env var
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY',$null,'User')
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY',$null,'Process')

# 2. Re-login through the subscription
claude logout
claude
# in the interactive session: /login
# exit via /quit or Ctrl+D
```

**Fix (macOS/Linux).**
```bash
unset ANTHROPIC_API_KEY
# in ~/.zshrc, ~/.bashrc remove lines export ANTHROPIC_API_KEY=...
claude logout
claude  # /login
```

After that, restart `npm run dev`. The api log should show `using provider=claude_cli (subscription via claude CLI)` with no follow-up `failed`.

### `Failed to authenticate. API Error: 401 Invalid authentication credentials`

**Cause.** The claude CLI session has expired or been corrupted; env is already clean.

**Fix.** In a terminal:
```bash
claude
# /login
# wait for "Login successful"
# /quit
```

### `claude --print exited 1 with parseable JSON; accepting`

Not an error — a Windows cmd.exe wrapper quirk. The gateway sees a valid JSON envelope (`{result, usage}`) in stdout and accepts despite the non-zero exit code. This is normal and the fix is already built in (R-7.13).

### LLM returns an empty result / falls back to mock

**Symptom.** The `✏ Rewrite` modal opens, the textarea is empty or shows a short text "I'm ready, what would you like to work on?".

**Cause.** Either the Claude CLI failed to parse prompt + schema (rare) OR it answered conversationally instead of with JSON. The gateway:
1. R-7.37: on a failed schema-parse, wraps the raw text as `{content: text}`. You see the raw answer and can edit it by hand.
2. R-7.37b: on detection of an auth error, falls back to anthropic API → google → mock.

**What to check.** In the api log (the `npm run dev` window), look for:
- `[llm-gateway] claude_cli schema-parse failed; ... text-head=...` — claude returned non-JSON, R-7.37 wrapped raw into content
- `[llm-gateway] claude_cli failed (...); trying next in cascade [...]` — auth/rate-limit, fallback engaged

---

## 2. Agent runs (`/runs/start`)

### `spawnSync codex ENOENT` / `spawnSync cursor-agent ENOENT`

**Symptom.** You clicked `Run block → Cursor` (or Codex), the run goes to Failed:
```
run_block_implementation: codex failed → spawnSync codex ENOENT
```

**Cause.** You don't have `cursor-agent` or `codex` CLI on PATH.

**Fix.** R-7.32: the orchestrator now automatically falls back to **print-only mode** for all 3 agents. The prompt is saved to `atlas/clients/<client>/agent_invocations/<UTC>__<block>.txt`. Open it, copy the contents, and paste them into Cursor / Codex / any other agent IDE manually.

If you want a real run:
- **Cursor**: `npm install -g @cursor/cursor-agent` (if available), or use the Cursor UI by hand
- **Codex**: install the Codex CLI per their docs

### `block dir not found → atlas/blocks/<id>`

**Symptom.** The run fails immediately with this error; in `atlas/run_logs/<run_id>.log` there's only this line.

**Cause (before R-7.22).** The orchestrator was multi-tenant blind, looking under `ROOT/atlas/blocks/<id>` instead of `atlas/clients/<client>/blocks/<id>`.

**Cause (after R-7.22, before R-7.32).** The UI didn't pass `client_id` into `/runs/start` because of a race in reading `window.__SIMA_DATA_CLIENT`. In run_log: `client=(default)`.

**Fix.** Update to R-7.32+. Verify:
```bash
git log --oneline -5
# should show R-7.32 or newer
```

### The "Runs" tab is empty even though a run happened

**Cause.** `run_state/<run_id>.json` wasn't written, because the run died immediately (see the two previous items).

**Fix.** Check `atlas/run_logs/<run_id>.log` — the reason is there. Most often auth or ENOENT.

### An external Cursor run (outside the UI button) doesn't appear in "Runs"

**Symptom.** You launched Cursor IDE on a block by hand; the contracts got filled, a `cursor_run pass ...` line appeared in `checks.log`. But the "Runs" tab in the UI is empty.

**Cause.** `/runs/list` only reads `run_state/<run_id>.json` (our orchestrator). External runs don't create that file.

**Fix (planned for R-7.24).** Add a fallback source: parse `cursor_run|claude_run|codex_run` lines from `checks.log`. For now, external runs are visible only in `checks.log` itself.

---

## 3. Multi-tenant / clients

### Banner "Project `<name>` doesn't exist"

**Symptom.** You set `?client=my-product` in the URL; the banner offers to create the project.

**Fix.** R-6.1: on the first mutation (creating a block, editing a field) the client folder is created automatically. Just click `+ New module` — once it succeeds, the banner disappears.

### Block create loops with "already exists"

**Symptom.** You click `+ New module`, the log says "already exists, trying b.block-N+1" several times, and ultimately fails.

**Cause (R-7.3, R-7.11).** Stale references to deleted blocks remained in graph.json.

**Fix.** The toolbar has a `⟲ Reset client` button (R-7.4) → confirm → graph.json + blocks/ + proposals/ + acceptance_runs/ are wiped, while project.md/rules.md/tech_stack.md are preserved.

---

## 4. UI

### Right-click on a node → menu appears, but the buttons don't work

**Cause (before R-7.26).** The canvas's onMouseDown caught mousedown on the ctx-menu button BEFORE click, reset `ctxMenu=null`, and the button unmounted before onClick fired.

**Fix.** R-7.26: added `.ctx-menu` to the canvas's early-return whitelist. After pulling, all right-click menu buttons work.

### Links between blocks don't get created

**Before R-7.28.** Not implemented.
**R-7.28.** Shift+drag on a node → creates a link.
**R-7.33.** Hover a node → 4 anchor points around the edges. Drag from a point onto another node — a link without Shift.

If it still doesn't work, check that after Shift OR holding an anchor point a dashed line follows the cursor. If not — the handler didn't fire; send DevTools Console + Network output.

### The Contract tab doesn't work on a submodule

**Symptom.** You drilled into a block (drill-down), created submodule `b.X.s1`, clicked it — DetailPanel opens, but Contract is empty.

**Cause.** Submodules are stored as JSON entries inside the parent's `subsystem.json`; they have **no** dedicated `atlas/clients/<id>/blocks/<sub_id>/` folder. So mission.md / kpi.md / acceptance.md have nowhere to load from.

**What works on a submodule.** Title, layer, status, coordinates, links inside the subsystem.

**What does NOT work.** Contract files, agent runs, acceptance.

**Fix (planned for R-7.36).** A "promote to block" button — converts a submodule to a full-fledged block with its own folder and contracts.

### DetailPanel: "Block not loaded yet"

**Cause.** The UI selected a block that's neither in the outer modules nor in the active subsystem. Happens after a deletion / rename.

**Fix.** Click Sync in the toolbar, or Ctrl+R.

### Closed DetailPanel ✕ → the right side stayed as a big empty column

**Cause (before R-7.30).** The `app.no-detail` CSS class was applied only when `!selectedId`, but not when `!detailOpen`.

**Fix.** R-7.30: `app.no-detail` is now applied on either of the two conditions. The canvas expands to the full width.

### The `📖 Docs` / `✨ Claude's advice` button is cut off past the right edge

**Cause.** The top bar is overflowing; buttons get pushed into overflow with no visible scroll.

**Fix.** Open DevTools full-screen; in narrow windows use the command palette `⌘K` (or `Ctrl+K`) — it knows all the main actions including "System docs" and "Claude's advice".

### A field in the Context Rail isn't editable on a single click

**Fix (R-7.31).** Single-click activates edit. On hover — a dashed underline (visual affordance). If it still doesn't work, verify your pull is on R-7.31+.

---

## 5. Build / dev environment

### `node scripts/build_sima_design_payload.mjs` exits silently and prints nothing

**Cause (before R-7.18).** The Windows CLI-entry check was `import.meta.url === \`file://${process.argv[1]}\``, which **never matches on Windows** because of slash differences.

**Fix.** R-7.18: rewritten as `fileURLToPath(import.meta.url) === process.argv[1]` — works on both OSes. 27 scripts got this fix in one shot.

### Cache doesn't refresh, changes aren't visible in the browser

**Fix.** Hard refresh: Ctrl+F5 (Windows) / Cmd+Shift+R (macOS). Each commit of UI fixes bumps `?v=r7-XX` cache-buster, but sometimes the browser caches the HTML too.

### `git status` shows piles of CRLF warnings on Windows

**Cause.** The files were created on macOS/Linux with LF line endings, and git auto-normalizes to CRLF on Windows.

**What to do.** Ignore — Git normalizes back on commit. If it bothers you:
```bash
git config --global core.autocrlf false  # store as-is
# or
git config --global core.autocrlf input  # LF in repo, convert only on checkout
```

---

## 6. Scripts on Windows (general note)

If some `node scripts/<X>.mjs` script behaves oddly on Windows (silent, no effect, exit 0 with nothing happening), check that it's not the same CLI-entry bug from R-7.18. All 27 of our scripts were fixed in a single commit `63edbed`. If you copied a script from an older fork, change:
```diff
-if (import.meta.url === `file://${process.argv[1]}`) {
+if (fileURLToPath(import.meta.url) === process.argv[1]) {
```
And make sure `import { fileURLToPath } from 'node:url';` is present.

---

## Where to write

If your symptom isn't here, open an issue at `https://github.com/neskuchny/sima_atlas/issues` with:
- what you clicked in the UI / which command in the CLI
- what showed up in `npm run dev` (api log)
- what's in DevTools Console + Network (if UI)
- which phase (R-7.X) the current HEAD is at: `git log --oneline -1`

---

## 7. Run marked Failed because of «hard drift violation» (R-7.82, S-3)

**Symptom.** Agent run completes, verifier passes, but FSM ends in `Failed` with `summary: "drift_scan: hard violations found"`. `checks.log` shows entries like `drift_scan fail file=... rule=...`.

**Cause.** `scripts/scan_run_for_drift.mjs` enumerates files modified after run start and grep-scans them against `operator_profile/dont_use.json` rules. Hard violations (`severity: hard`) override the verifier verdict.

**What to do.**
1. Read the matched rule in `narrative.md` — it explains *why* the rule exists.
2. If the rule is correct: revert the violating change.
3. If the rule is too strict: change `severity: hard` → `soft` via `set_dont_use` MCP tool, or remove the rule entirely with the same tool. Soft violations log to `checks.log` + `narrative.md` but don't fail the run.

Inspect:
```bash
cat atlas/operator_profile/dont_use.json | jq '.entries'
node scripts/scan_run_for_drift.mjs --block <id> --since <ISO> --json
```

---

## 8. Block flipped to `desync` after I edited an upstream block (R-7.84, S-8)

**Symptom.** You edited block A. Block B (which has `depends_on: A`) now shows `status: desync` on the canvas. Its `narrative.md` has a new entry titled «### What failed and why · cascade break detected».

**Cause.** This is `cascade_verify` doing its job. After every successful run on A, it walks reverse-deps and re-runs the acceptance verifier on each. If B's contract no longer matches A's `provides`, B is marked `desync` immediately so you don't discover the break next morning during the nightly sweep.

**What to do.**
- Read the «Recommended action» section in B's `narrative.md`.
- If the break was intentional (you renamed a capability A provides): update B's `depends_on.md` + `acceptance.md`, re-run.
- If unintentional: revert A or restore the missing capability in A's `provides.md`.
- To preview without patching: `node scripts/cascade_verify.mjs <block_id> --dry-run`.

---

## 9. Token Spend widget shows $0 / no data (R-7.87, S-9)

**Symptom.** Open a block → Overview tab → Token Spend widget says «no data» or all zeros.

**Cause.** Either:
- `atlas/llm_traces/` is empty (no LLM calls yet on this fresh install)
- This block has no `run_state` window matching any traces (best-effort attribution — widget falls back to project-wide view)
- Day window too narrow (default is 30; switch to 90 in the selector)

**What to do.**
```bash
# Check trace count
ls atlas/llm_traces/*.json | wc -l

# Run the aggregator manually
node scripts/token_economics.mjs --days 90

# Per-block view
node scripts/token_economics.mjs --days 90 --block <id>
```

If `llm_traces/` is empty after running an agent, check `LLM_DEFAULT_PROVIDER` — `mock` does emit traces, but `claude_cli` traces are written only when the gateway calls it (not when `run_block_implementation` shells out to the CLI directly).

---

## 10. First `npm run dev` — UI loads but operator-profile / architecture-decisions appear empty (R-7.81)

**Symptom.** Fresh clone, first `npm run dev`, open a block → Memory tab and architecture-decisions panel are blank.

**Expected behavior.** `dev_server.mjs` auto-seeds these on startup (idempotent). Check `npm run dev` log for lines like:
```
[seed] operator_profile/lessons.json created
[seed] operator_profile/dont_use.json created
[seed] operator_profile/always_use.json created
[seed] architecture_decisions.md created
```

If these lines are absent, the seed already ran on a previous launch — the files should exist:
```bash
ls atlas/operator_profile/{lessons,dont_use,always_use}.json
ls atlas/architecture_decisions.md
```

If they're missing entirely, run manually:
```bash
node scripts/seed_operator_profile.mjs
node scripts/architecture_decisions_api.mjs ensure
```

# Sima Atlas — How to verify everything works

> Russian original preserved at [`./HOWTO_VERIFY.ru.md`](./HOWTO_VERIFY.ru.md).

This file is the single entry point for verifying PR1–PR4 on a fresh clone.

> **Windows / PowerShell users**: macOS/Linux commands (`open`, `head`, `tail`, `cat *.json | head`, `SIMA_BLOCK_ID=… node …`) don't work in PowerShell. Equivalents are in section 13 below.

## ⚠ If it falls over on the LLM — one-command diagnostics

```bash
node scripts/llm_check.mjs
```

Reports: which keys are in env, which provider is selected, sends a ping, and explains the failure (401 = bad key, 400 = bad Google key, 429 = quota).
Exit 0 — a live provider answered. Exit 2 — fallback to mock (which means the keys aren't working).

## 0. Setup

```bash
git clone https://github.com/neskuchny/sima_atlas.git
cd sima_atlas
git checkout claude/visual-component-system-N2W07
node --version   # must be >= 18 (we need built-in fetch)
```

For PR3 LLM live mode (optional):

```bash
cat > .env <<EOF
ANTHROPIC_API_KEY=sk-ant-...
# or
GOOGLE_API_KEY=...
LLM_DEFAULT_PROVIDER=anthropic   # or google
LLM_MAX_USD_PER_RUN=0.05
EOF
```

Without `.env`, everything runs through the mock provider with deterministic fixtures in `tests/llm_mocks/`.

---

## 1. One-shot — run the whole pipeline

```bash
node scripts/nightly_consolidation.mjs
```

The expected final line is `Summary: PASS (23/23)`. Full report — in `atlas/nightly_report.md`.

23 checks: ingestion queue, block contracts, no templates, files registry, dependency contracts, acceptance asserts, atlas selftest, layered bootstrap, llm gateway selftest, llm extraction eval, simulate conversation branches, validate cursor hooks, cursor hooks actions, sync context packs, agent parity, parity matrix, generate wiki/tz/roadmap, mcp smoke e2e, intelligence health.

---

## 2. Verify the visual map (spec: "multi-layered product map")

```bash
# Regenerate the bootstrap from atlas/graph.json
node scripts/generate_atlas_bootstrap_js.mjs
# Then open the UI in a browser
open "frontend/Сима - универсальный конструктор.html"  # macOS
# or
xdg-open "frontend/Сима - универсальный конструктор.html"  # Linux
```

What you should see:
- In the top tabs — the **Sima Atlas** project (not just the mock projects sima/book/idea).
- On layer 2 (Architecture), the canvas draws **6 horizontal lanes** (front / logic / ai / data / content / testing).
- Each lane has its blocks: b.ui-control (front), b.core-sync (logic), b.agent-orchestrator + b.llm-gateway (ai), b.db (data), b.docs (content), b.smoke-sandbox (testing).
- The Inspector on the right shows real mission/kpi/acceptance.
- Lifecycle buttons (Implement / Review / Done / Rollback / Broken / Mark dead) are active.

Headless check (no browser):

```bash
node tests/atlas_bootstrap.smoke.mjs
# atlas_bootstrap smoke: OK (layers=6, blocks=7, links=7)
```

---

## 3. Verify the wiki + roadmap (spec: "auto-documentation of the product")

```bash
node scripts/generate_wiki.mjs
node scripts/render_wiki_html.mjs
node scripts/rebuild_atlas_roadmap.mjs

# Open the wiki — should contain a Mermaid diagram of the graph
open atlas/wiki.html

cat atlas/roadmap.md  # topo-sort by depends_on (Level 0 → Level N)
cat atlas/WIKI.md     # sections by layers + per-block detail
```

---

## 4. Verify the sync validators (spec: "check that things are in sync")

```bash
node scripts/validate_block_contracts.mjs           # all blocks have mission/kpi/acceptance/tasks/checks
node scripts/validate_no_template_placeholders.mjs  # no "Block's key purpose…", "Auto-created…" (PR1)
node scripts/validate_files_registry.mjs            # all [alive] files in files.md exist (PR2)
node scripts/validate_dependency_contracts.mjs      # depends_on/provides are consistent
node scripts/validate_acceptance_assertions.mjs     # review/done blocks have an acceptance trace
node scripts/validate_cursor_hooks.mjs              # PR4: hooks.json — valid Cursor format
```

Each command should end with `OK` and exit 0.

---

## 5. Verify LLM extraction (spec: "auto-blocks from a dialog")

```bash
# Self-test gateway: schema, fallback, trace-write
node tests/llm_gateway.selftest.mjs
# llm_gateway.selftest: OK (4 cases)

# Golden eval over 5 reference dialogs
node tests/llm_extraction.eval.mjs
# llm_extraction.eval: OK — avg 1.00 on 5 cases (target 0.70)

# Smoke for conversation_branches: creates a new block and protects an existing one
node scripts/simulate_conversation_branches.mjs
# 6 PASS lines + simulate_conversation_branches: OK (state restored)

# Manual test: feed an arbitrary dialog
echo '{"text":"Делаем блок b.search на слое logic — полнотекстовый поиск через Postgres FTS, зависит от b.db"}' > /tmp/dialog.json
node scripts/analyze_conversation_to_atlas.mjs /tmp/dialog.json
# semantic_ingestion: applied 1 blocks (new=1, updated=0, provider=mock)

# Look at the LLM call trace
ls atlas/llm_traces/
cat atlas/llm_traces/*.json | head -30
```

If `ANTHROPIC_API_KEY` is set in `.env`, the gateway will automatically switch to Claude and the trace will show `provider: anthropic`.

---

## 6. Verify Cursor hooks actions (spec: "real observation of agent work")

```bash
# 9 case-tests across all three hook actions (observe / guard / inject)
node tests/cursor_hooks_actions.test.mjs
# cursor_hooks_actions.test: OK (9 cases)
```

Manual checks:

```bash
# 6.1. observe_file_edit maps file → block
node scripts/observe_file_edit.mjs "frontend/app_v2.jsx"
# observe_file_edit: frontend/app_v2.jsx → b.ui-control
tail -1 atlas/blocks/b.ui-control/checks.log
# 2026-... cursor_edit pass frontend/app_v2.jsx :: ...

# 6.2. guard blocks pip install
node scripts/guard_against_drift.mjs "pip install neo4j"
# ✗ guard_against_drift: drift_blocked: ...
echo "exit=$?"   # expected 1

# 6.3. guard lets npm install through
node scripts/guard_against_drift.mjs "npm install react"
# guard_against_drift: OK — "npm install react"
echo "exit=$?"   # expected 0

# 6.4. guard blocks yarn add vue (substring rule)
node scripts/guard_against_drift.mjs "yarn add vue"
# ✗ guard_against_drift: drift_blocked: ...
echo "exit=$?"   # 1

# 6.5. inject_context_pack for a specific block
SIMA_BLOCK_ID=b.docs node scripts/inject_context_pack.mjs | head -30
# Markdown: project, rules, tech_stack, block.mission, kpi, acceptance, depends_on, provides, files

# 6.6. inject_context_pack auto-detect block from prompt
node scripts/inject_context_pack.mjs "продолжи b.core-sync, добавь stack-mismatch detector" | head -5
# <!-- block: b.core-sync -->
```

---

## 7. Verify the MCP server (spec: "one context for all agents")

```bash
# Smoke MCP via stdio
node scripts/mcp_smoke_e2e.mjs
# mcp_smoke_e2e: OK

# List tools (via JSON-RPC over stdin/stdout)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node scripts/mcp_atlas_server.mjs | head -1 | python3 -m json.tool | head -30
```

To wire it into Cursor via `.cursor/mcp.json` — already done:

```bash
cat .cursor/mcp.json
# { "mcpServers": { "sima-atlas": { "command": "node", "args": ["scripts/mcp_atlas_server.mjs"], "cwd": "." } } }
```

After restarting Cursor, the following tools become available: `read_block`, `list_dependencies`, `update_block`, `sync_check`, `build_context_pack`, `ingest_chat_distillate`, `enqueue_ingestion`, etc.

---

## 8. Verify .cursor/hooks.json (spec: "agents see the product the same way")

```bash
node scripts/validate_cursor_hooks.mjs
# cursor hooks validation: OK (4 events, 4 commands)

cat .cursor/hooks.json
```

Format must be `{ version: 1, hooks: { event: [{command}] } }` with 4 events and 4 valid node commands.

---

## 9. Block status summary

```bash
node -e "
const g = JSON.parse(require('fs').readFileSync('atlas/graph.json','utf8'));
for (const b of g.blocks) {
  console.log(b.status.padEnd(7), b.layer.padEnd(8), b.id.padEnd(24), '—', b.title);
}
"
```

Expected:
```
review  ai       b.agent-orchestrator     — Agent Orchestrator
wip     logic    b.core-sync              — Sync Engine
idea    data     b.db                     — Atlas Database
wip     content  b.docs                   — Docs Builder
review  ai       b.llm-gateway            — LLM Gateway
idea    testing  b.smoke-sandbox          — Smoke Sandbox (test target)
wip     front    b.ui-control             — UI Control Plane
```

(Any block in `done` without honest acceptance evidence is a bug — see `validate_acceptance_assertions.mjs`.)

---

## 10. Paths for further work

| I want to | Command |
|---|---|
| Create a new block from CLI | `node scripts/manage_block.mjs create b.foo "Foo"` |
| Change a block's status | `node scripts/advance_block_state.mjs b.foo wip` |
| Build a context pack for a block (to feed Claude/Cursor) | `node scripts/build_context_pack.mjs b.foo` (output → `atlas/context_packs/b.foo.json`) |
| Extract blocks from a dialog | `node scripts/analyze_conversation_to_atlas.mjs <path/to/dialog.json>` |
| Nightly rebuild of everything | `node scripts/nightly_consolidation.mjs` |
| Open the current wiki | open `atlas/wiki.html` |

---

## 11. What MUST NOT work (must be correctly blocked)

```bash
# Template mission in any block → fail
echo "# b.test — mission

Ключевая цель блока и его значение для устранения рассинхрона." > /tmp/sample.md
# (mock — in reality this would happen on any write attempt via MCP)
node scripts/validate_no_template_placeholders.mjs
# Catches "Ключевая цель блока" → exit 1

# A removed alive file in files.md
git mv "frontend/app_v2.jsx" "frontend/_app_v2.jsx.bak"
node scripts/validate_files_registry.mjs
# Files registry validation FAILED:
#  ✗ b.ui-control: alive file missing → frontend/app_v2.jsx
git mv "frontend/_app_v2.jsx.bak" "frontend/app_v2.jsx"   # restore

# A forbidden command → blocked by the guard
node scripts/guard_against_drift.mjs "pip install neo4j"
# ✗ guard_against_drift: drift_blocked
```

---

## 13. Windows / PowerShell equivalents

| Linux / macOS | Windows PowerShell |
|---|---|
| `open file.html` | `start file.html` or `Invoke-Item file.html` |
| `xdg-open file.html` | `start file.html` |
| `cat file` | `Get-Content file` |
| `head -30 file` | `Get-Content file -TotalCount 30` |
| `tail -1 file` | `Get-Content file -Tail 1` |
| `cat *.json | head` | `Get-ChildItem *.json | Select-Object -First 1 | Get-Content` |
| `SIMA_BLOCK_ID=b.docs node script.mjs` | `$env:SIMA_BLOCK_ID="b.docs"; node script.mjs` |
| `LLM_DEFAULT_PROVIDER=google node …` | `$env:LLM_DEFAULT_PROVIDER="google"; node …` |
| `echo '{"text":"…"}' > /tmp/d.json` | **avoid** — `echo >` in PowerShell writes UTF-16 BOM. Use `--text` instead of a file (see below) |

### Open the UI on Windows

```powershell
# From the repo root, start a simple http server:
python -m http.server 8080

# Then open in a browser:
#   http://localhost:8080/                              ← redirects to UI
#   http://localhost:8080/Sima%20%28Remix%29/index.html ← directly
#   http://localhost:8080/atlas/wiki.html               ← Mermaid wiki
```

In the repo root there's an `index.html` redirect; in `frontend/index.html` there's an ASCII alias of the original Cyrillic-named file (Python's http.server handles URL-encoded UTF-8 paths poorly).

### Pass a dialog to analyze without a temp file

`echo > /tmp/d.json` in PowerShell writes a **UTF-16 BOM** — `JSON.parse` chokes on the first byte. So the script accepts inline:

```powershell
node scripts/analyze_conversation_to_atlas.mjs --text "Делаем блок b.search на logic — Postgres FTS, зависит от b.db"

# Or via stdin:
'{"text":"…"}' | node scripts/analyze_conversation_to_atlas.mjs --stdin
```

### Enable live LLM on Windows

Create a `.env` in the repo root (UTF-8 without BOM, any decent editor will do):

```env
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
LLM_DEFAULT_PROVIDER=anthropic
LLM_MAX_USD_PER_RUN=0.05
```

⚠ **Important**: do **not** put inline `#` comments after a value. For example, **this is bad**:

```env
LLM_DEFAULT_PROVIDER=google   # or anthropic
```

In PR4.2 the parser already handles such lines (it strips everything after `#` if the value isn't quoted), but earlier versions turned the value into `'google   # or anthropic'` and ignored the pin. If unsure — run `node scripts/llm_check.mjs` and confirm the output reads `LLM_DEFAULT_PROVIDER : "google"` with no trailing junk.

If you want to use **only** Google and not let the gateway reach into Anthropic — set `LLM_DEFAULT_PROVIDER=google` (the gateway will not cascade to anthropic, even if `ANTHROPIC_API_KEY` is also set).

Verify:
```powershell
node scripts/llm_check.mjs
```

If the exit code is 2, the gateway dropped to mock. Read the attempts carefully: 401 → bad Anthropic key, 400 "API key not valid" → bad Google key.

---

## 14. Reset / rollback

If something changed during verification (smoke added a block, etc.):

```bash
git status
git checkout -- atlas/ "frontend/atlas_bootstrap.js"
git clean -fd atlas/llm_traces/ atlas/process_runs/
```

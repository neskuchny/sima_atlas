# b.code-graph — narrative

_Per-block append-only memory log. Each agent run appends a section with
`## <ISO-timestamp> · <one-line summary>` and sub-sections `### What I tried`,
`### What worked`, `### What failed and why`, `### Decisions made`._

## 2026-06-09T20:30:00Z · block scoping decided (R-7.99)

### What I tried
Carved the «detect undeclared code dependencies» work out of `b.core-sync`
PR4 into its own block. `b.core-sync` was failing semantic verification on
exactly this — Gemini judge said the mission promises a code-side sync
detector that does not exist. Two paths considered: extend `b.core-sync`
in place (everything in one block), or pull the detector out so it lives
where its data product lives (the code graph itself).

### What worked
Pulled it out. Reasons:

- The code graph is reusable beyond drift detection — `import_graph_dead_code.mjs`
  could consume it later, the canvas could visualize «who imports whom»,
  V-1 could use it to prioritise blocks by reverse-import-fanout.
- A new block forces a clean `provides` contract (`code_graph`,
  `code_graph_validator`) instead of leaking internals into `b.core-sync`.
- The MVP is cheap because we already standardised ES modules: a 200-line
  pure-Node extractor covers `.mjs`/`.js`/`.jsx` without dependencies. We
  reach for tree-sitter only when actual non-JS files appear in `files.md`.

### What failed and why
Tree-sitter as a hard dependency was rejected for MVP — a 100 MB native
binding pulled in for one regex-equivalent task on a moonoglot codebase
violates dont_use/lightweight-by-default. Pluggable backend left as PR4.

### Decisions made
- Layer: `data` (artefact is a JSON file consumed by other blocks).
- Status starts `idea`; lifecycle walked through gates as PRs land.
- `b.core-sync` gains a `depends_on: b.code-graph: code_graph` line and
  its T4 explicitly delegates real-code-sync to this block.


## 2026-06-06T00:12:45.005Z · semantic verify · fail

### Contract-as-Arbiter judgment
- The `b.ui-control` block establishes a foundational React application for the Sima Atlas visual control plane. However, it critically fails to meet several explicit KPIs and acceptance criteria, particularly concerning correct rendering, multi-layer display, and accurate sync status. Furthermore, the essential connection to `b.agent-orchestrator` for executing block actions is not evident in the provided implementation.

### To genuinely satisfy the contract
- Address KPI-1 and A2: Ensure all JSX dependencies are correctly loaded and the `frontend/atlas_design/index.html` page renders without console errors, filling the `<div id="root">`.
- Address KPI-2 and A3: Implement logic to distribute blocks across at least 5 horizontal layers based on a `layer` field in `graph.json` data, as specified.
- Address KPI-3 and A4: Enhance sync visibility to accurately highlight `drift`/`broken` blocks with specific reasons from `syncReport.details`, beyond just file presence.
- Demonstrate the connection to `b.agent-orchestrator`: Implement and show the UI logic that triggers `pipeline_execution` for block lifecycle actions (Implement, Review, Done, Rollback, mark-dead).
- Verify the correct entry point: Ensure the primary HTML page is `frontend/Сима - универсальный конструктор.html` as per KPI-1, or update the KPI to reflect the current `frontend/atlas_design/index.html`.

## 2026-06-09T18:08:00.693Z · semantic verify · fail

### Contract-as-Arbiter judgment
- The b.ui-control block establishes a React-based visual control plane with foundational elements for displaying blocks, statuses, and managing lifecycle. However, it critically fails to meet several explicit KPIs and acceptance criteria, particularly concerning correct rendering, multi-layer display, and accurate sync status. Furthermore, the essential connection to b.agent-orchestrator for executing block actions is not evident, severely limiting its 'control plane' mission.

### To genuinely satisfy the contract
- Address rendering issues (KPI-1, A1, A2): Ensure frontend/atlas_design/index.html (or the correct entry point frontend/Сима - универсальный конструктор.html if KPI-1 is to be strictly followed) opens without console errors, and all JSX dependencies are correctly loaded, filling the <div id="root">.
- Implement multi-layer display (KPI-2, A3): Modify the canvas rendering logic in graph.jsx to draw at least 5 horizontal layers and distribute blocks according to a layer field in the graph.json data.
- Enhance sync visibility (KPI-3, A4): Update the UI to visually highlight drift/broken blocks on the canvas with specific reasons derived from syncReport.details, not just file presence.
- Establish b.agent-orchestrator connection: Implement the UI logic and API calls to trigger pipeline_execution from b.agent-orchestrator when a user initiates block lifecycle actions (Implement, Review, Done, Rollback, mark-dead).
- Verify entry point consistency: Either update KPI-1 to reflect frontend/atlas_design/index.html as the primary entry point or ensure frontend/Сима - универсальный конструктор.html is the functional entry point.

## 2026-09-22 — R-8.08: the agent's frame on the Overview panel

New `MeaningSection` at the top of Overview (above Implementation Status):
the line «Treating this as» from the executing agent's `understanding.md`,
a warning when the contract changed after it was written, the
«Assumed without asking» list, scope/variant under a disclosure, and the
block's trajectory — or, when none is declared, how to add one. Data comes
from `GET /atlas/blocks/<id>/meaning` (b.agent-orchestrator) via
`SIMA_API.meta.blockMeaning`; the panel does not parse contract files for it.

Checked in Chromium against the live API in three states — full declaration
(b.clarify), stale + incomplete + empty trajectory heading, nothing declared —
in RU and EN, no console errors. Asset versions bumped to `?v=r8-08` for the
four changed files so a cached `panels.jsx` does not hide the section.

## 2026-09-22 — R-8.09: the operator answers on the Overview panel

`MeaningSection` now carries the answer, not just the view. Awaiting →
«✓ Right — write the code» (records the confirmation and starts the
implementation with the agent that declared), «✎ Not quite» (a textarea; the
correction is recorded and the agent re-declares with it), and a quiet
«confirm without starting a run». Corrected, stale, confirmed and
not-declared states each get one line in words and one action. A start
button hides after it started a run until the gate state moves on, so one
click cannot become two runs. The summary is re-read every 5 s, so a new
declaration shows up with its buttons without re-selecting the block.

Found while wiring it: «Send to agent» posted to `/runs/start` with a raw
fetch that dropped `?client=`; it now goes through `SIMA_API.meta.startRun`
and logs what the frame gate did (started phase 1 / not started, waiting
for you).

Checked in Chromium on a disposable client: all five states, the full
correct → re-declare and confirm → implement click paths (the runs they
start were verified server-side: a `__declare` prompt containing the
correction verbatim, an implement prompt containing the confirmed frame),
and the live refresh. RU, no console errors. Manual — there is still no
automated UI test.

## 2026-09-22 — R-8.10: marker, badge, trajectory editor; the live refresh stops wiping the panel

New on the canvas: the agent's frame marker on graph nodes (from
`build_sima_design_payload.mjs`, which this block now owns), the «LLM: …»
badge in the toolbar, and the trajectory editor on Overview. The badge answers
the operator's old question «where did this text come from?»: with the
`claude` CLI installed, the gateway's subscription-first cascade answers
through the operator's Claude subscription without saying so anywhere.

Two old bugs surfaced while checking them in the browser:
- `/atlas/state` hashed only the root atlas, so a canvas on `?client=…`
  never refreshed on the client's own files. Now `?client=` is honoured.
- index.html re-mounts the whole `<App>` (new key) on every data change.
  `selectedId` was a plain useState, so any file written by an agent or the
  nightly closed the block the operator was looking at, and every useState
  below — a half-typed correction, a «saved» notice — was wiped. The
  Playwright spec caught it as 3 failures in 8 runs. Fixed without rewriting
  the mount: the selection and the open tab live on `window`, and the meaning
  section keeps its state in `useSticky` (a window-level store per block with
  a subscription, so a request that resolves after a re-mount still lands).
  The spec now changes a file mid-edit and checks the draft survives; with
  the sticky draft reverted it fails («Received ""»). 8/8 green after.

`tests/playwright/meaning_panel.spec.ts` runs against a live API on a
disposable client, clicks only actions that start no agent, and asks the OS
for a free port (a pid-derived one collided in 1 of 8 runs). It is not in the
nightly — a missing browser there would look like a skip, not a check; run it
with `npm run test:ui`. The existing `playwright.config.js` waited for
`frontend/index.html`, which no longer exists, so `npm run test:e2e` could
not start at all; fixed. The older canvas specs still point at pages that
are gone and fail on their own — left as they are.

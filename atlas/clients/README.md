# Per-client Atlas roots

Each subdirectory here is an isolated Atlas workspace for one client. The
SIMA Design front-end resolves `?client=<id>` to `atlas/clients/<id>/` and
falls back to the main `atlas/` tree when no per-client tree exists.

## Layout (mirrors the main `atlas/`)

```
atlas/clients/<id>/
  graph.json            # required — same v2 shape as atlas/graph.json
  project.md            # optional — overrides product title / goal / mission
  tech_stack.md         # optional
  blocks/<block_id>/    # optional — per-block mission/kpi/acceptance/tasks
  transitions.log       # optional — client-scoped history feed
  operator_profile/
    lessons.json        # optional — per-client lessons
  design_payload.json   # generated — written by build_sima_design_payload
                        #             when run with --client <id>
```

Anything missing falls back to the main `atlas/` defaults.

## Bootstrap a new client

```sh
ID=acme
mkdir -p atlas/clients/$ID/blocks
cp atlas/graph.json atlas/clients/$ID/graph.json   # start from current product
node scripts/build_sima_design_payload.mjs --client $ID
```

## Front-end

The SIMA Atlas Design tool (served at `/atlas_design/index.html`) reads
`?client=<id>` from the URL:

```
http://your-host/atlas_design/index.html?client=acme
```

For production deploys behind a reverse proxy, set the API base before
the loader script:

```html
<script>window.SIMA_API_BASE = 'https://api.example.com';</script>
<script src="data_loader.js"></script>
```

## Live polling

The loader polls `${API_BASE}/atlas/state` every 5 seconds. When the
hash changes, it refetches `/atlas/design-payload?client=<id>` and
dispatches a `sima-data-changed` CustomEvent. The page re-mounts the
React root with fresh data.

## Editing

For now the design tool is **read-only against the live data**. Edits
made in the UI (drag, status change, edge add) live in component state
only. Writing back to `atlas/clients/<id>/graph.json` is the next PR;
the existing Accept/Reject proposals flow + sidecol editor in the main
frontend UI is the canonical write path until then.

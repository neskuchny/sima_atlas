// SIMA Atlas Design data loader.
//
// Strategy:
//   1. If `data_static.js` already set window.SIMA_DATA — keep it as
//      offline fallback.
//   2. Try to fetch live data from the Atlas API server:
//        /atlas/design-payload[?client=<id>]   (port 8787 by default)
//      `client` is read from URL query string `?client=foo`.
//   3. If the fetch succeeds, OVERRIDE window.SIMA_DATA with the live
//      payload BEFORE App mounts.
//   4. If the fetch fails (server down, offline) — silently keep the
//      offline fallback so the design tool still renders.
//   5. After mount, set up live polling: every 5s call /atlas/state;
//      when hash changes, refetch and dispatch a `sima-data-changed`
//      CustomEvent so the React tree can re-read window.SIMA_DATA.
//
// To embed in production for a specific client:
//   <script>window.SIMA_API_BASE = 'https://api.example.com';</script>
//   <script src="data_static.js"></script>
//   <script src="data_loader.js"></script>
//   ... rest of <script src="...jsx"> tags ...
// then visit `?client=<id>` to scope the data.

(function () {
  const API_BASE = (typeof window !== 'undefined' && window.SIMA_API_BASE)
    ? String(window.SIMA_API_BASE)
    : 'http://localhost:8787';

  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const client = params.get('client') || '';

  function endpoint() {
    const qs = client ? `?client=${encodeURIComponent(client)}` : '';
    return API_BASE.replace(/\/$/, '') + '/atlas/design-payload' + qs;
  }

  let lastHash = null;

  async function fetchLive() {
    try {
      const r = await fetch(endpoint(), { cache: 'no-store' });
      // Distinguish "API up but client missing" from "API down". When
      // graph.json is missing for the requested client, we want to render
      // an empty canvas (with a banner) — NOT silently fall back to the
      // baked-in demo data, which led to «I created a project but old
      // schema is still there».
      if (!r.ok) {
        if (client && r.status >= 400) {
          window.__SIMA_DATA_CLIENT_MISSING = true;
        }
        return null;
      }
      const j = await r.json();
      if (!j || !j.ok || !j.data) {
        if (client) window.__SIMA_DATA_CLIENT_MISSING = true;
        return null;
      }
      window.__SIMA_DATA_CLIENT_MISSING = false;
      return j.data;
    } catch { return null; }
  }

  async function fetchHash() {
    try {
      const r = await fetch(API_BASE.replace(/\/$/, '') + '/atlas/state', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.hash ? j.hash : null;
    } catch { return null; }
  }

  function announce(reason) {
    try {
      window.dispatchEvent(new CustomEvent('sima-data-changed', {
        detail: { reason, generated_at: window.SIMA_DATA?._meta?.generated_at },
      }));
    } catch {}
  }

  // Initial sync load — block App mount on it ONLY for ~600ms; if API is
  // slow, fall back to static data so the tool still opens.
  window.__SIMA_DATA_BOOT_PROMISE = (async () => {
    const live = await Promise.race([
      fetchLive(),
      new Promise((res) => setTimeout(() => res(null), 600)),
    ]);
    if (live) {
      window.SIMA_DATA = live;
      window.__SIMA_DATA_SOURCE = 'live';
      window.__SIMA_DATA_CLIENT = client || 'default';
    } else if (window.__SIMA_DATA_CLIENT_MISSING && client) {
      // Phase J-3 fix: explicit «client doesn't exist on disk» state.
      // Don't fall back to data_static.js (Lensa demo) — that would
      // confuse the operator. Instead show a true empty atlas with a
      // banner inviting them to create the project.
      window.SIMA_DATA = {
        product: { codename: client, title: client, subtitle: 'Проект ещё не создан', goal: '', mission: '', quality: [], conditions: { backend: [], frontend: [], logic: [], checks: [] } },
        modules: [], edges: [], tasks: {}, moduleDocs: {}, submodules: {}, history: [], lessons: [],
        agents: [
          { id: 'claude', title: 'Claude Code', tag: 'claude-code', color: 'warm' },
          { id: 'cursor', title: 'Cursor',       tag: 'cursor',      color: 'blue' },
          { id: 'codex',  title: 'Codex',        tag: 'codex',       color: 'violet' },
          { id: 'sima',   title: 'SIMA Core',    tag: 'sima-core',   color: 'ink' },
        ],
        lanes: [],
        _meta: { generated_at: new Date().toISOString(), client_id: client, missing: true },
      };
      window.__SIMA_DATA_SOURCE = 'client_missing';
      window.__SIMA_DATA_CLIENT = client;
    } else {
      window.__SIMA_DATA_SOURCE = window.SIMA_DATA ? 'offline_fallback' : 'missing';
      // Continue trying in the background — don't block.
      fetchLive().then((late) => {
        if (late) {
          window.SIMA_DATA = late;
          window.__SIMA_DATA_SOURCE = 'live_late';
          announce('live_late');
        }
      });
    }
    lastHash = await fetchHash();
    announce('initial');
  })();

  // Live polling — picks up changes the operator makes via the Atlas
  // sidecar editor or via direct edits to atlas/graph.json on disk.
  setInterval(async () => {
    const h = await fetchHash();
    if (!h || h === lastHash) return;
    lastHash = h;
    const live = await fetchLive();
    if (live) {
      window.SIMA_DATA = live;
      window.__SIMA_DATA_SOURCE = 'live_polled';
      announce('hash_change');
    }
  }, 5000);

  // ─── Write-side API for the design UI ─────────────────────────────
  // window.SIMA_API.* methods POST to atlas_api_server which mutates
  // atlas/graph.json + per-block files. On success they trigger a
  // refetch immediately so the React tree sees the persisted state
  // (instead of waiting up to 5s for the next poll).
  async function postJson(path_, body_) {
    try {
      const r = await fetch(API_BASE.replace(/\/$/, '') + path_, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body_ || {}),
      });
      const j = await r.json().catch(() => ({}));
      return j;
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  }
  async function refresh() {
    const live = await fetchLive();
    if (live) {
      window.SIMA_DATA = live;
      window.__SIMA_DATA_SOURCE = 'live_polled';
      announce('mutation');
    }
  }
  function withClient(body_) {
    return client ? { ...body_, _client: client } : body_;
  }
  // GET helper — used by artifacts.list / artifacts.get / state probes.
  async function getJson(path_) {
    try {
      const r = await fetch(API_BASE.replace(/\/$/, '') + path_, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      return j;
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  }

  // ─── Artifacts CRUD ──────────────────────────────────────────────
  // Backed by atlas/artifacts/<id>/{index.json,body.md}, or
  // atlas/clients/<client>/artifacts/<id>/ when a client is active.
  // GET routes pick up `client` from query string; mutating routes
  // ride on withClient() body augmentation.
  const artifacts = {
    list:    async (params = {}) => {
      const qs = new URLSearchParams();
      if (params.kind)    qs.set('kind', params.kind);
      if (params.search)  qs.set('search', params.search);
      if (client)         qs.set('client', client);
      const tail = qs.toString() ? `?${qs.toString()}` : '';
      return await getJson('/api/artifacts' + tail);
    },
    get:     async (id, opts = {}) => {
      const qs = new URLSearchParams({ id });
      if (opts.withBody) qs.set('with_body', '1');
      if (client)        qs.set('client', client);
      return await getJson('/api/artifacts?' + qs.toString());
    },
    create:  async (body_)         => { return await postJson('/api/artifacts', withClient(body_)); },
    update:  async (id, patch)     => { return await postJson('/api/artifacts/' + encodeURIComponent(id), withClient(patch)); },
    insert:  async (id, body_)     => { return await postJson('/api/artifacts/' + encodeURIComponent(id) + '/insert', withClient(body_)); },
    delete:  async (id)            => {
      try {
        const qs = new URLSearchParams({ id });
        if (client) qs.set('client', client);
        const r = await fetch(API_BASE.replace(/\/$/, '') + '/api/artifacts?' + qs.toString(), { method: 'DELETE' });
        return await r.json().catch(() => ({}));
      } catch (e) { return { ok: false, error: String(e.message || e) }; }
    },
  };

  // ─── Phase F-5 — schema templates (book/idea/marketing/product) ──
  const templates = {
    list:     async ()         => await getJson('/atlas/schema-templates/list'),
    get:      async (id)       => await getJson('/atlas/schema-templates/get?id=' + encodeURIComponent(id)),
    apply:    async (template_id, prefix) => await postJson('/atlas/schema-templates/apply', { template_id, prefix }),
    snapshot: async (body_)    => await postJson('/atlas/schema-templates/snapshot', withClient(body_)),
  };

  // ─── Phase F — subsystems (drill-into-block persistence) ───────
  const subsystems = {
    list:   async ()              => await getJson('/atlas/subsystems/list'),
    get:    async (block_id)      => await getJson('/atlas/subsystems/get?block_id=' + encodeURIComponent(block_id)),
    save:   async (parent_id, body_) => await postJson('/atlas/subsystems/save', { parent_id, ...body_ }),
    delete: async (block_id)      => {
      try {
        const r = await fetch(API_BASE.replace(/\/$/, '') + '/atlas/subsystems/delete?block_id=' + encodeURIComponent(block_id), { method: 'DELETE' });
        return await r.json().catch(() => ({}));
      } catch (e) { return { ok: false, error: String(e.message || e) }; }
    },
  };

  // ─── Phase M — Sima synthesis (creates schemas itself) ─────────
  const synthesis = {
    block:   async (body_)             => await postJson('/llm/synthesize-block', body_),
    edges:   async (body_)             => await postJson('/llm/suggest-edges',    body_),
    tasks:   async (body_)             => await postJson('/llm/decompose-tasks',  body_),
    fillField:    async (body_)        => await postJson('/llm/fill-field',    body_),
    rewriteField: async (body_)        => await postJson('/llm/rewrite-field', body_),
    extract:      async (body_)        => await postJson('/api/intake/extract', body_),
    transcribe:   async (body_)        => await postJson('/api/intake/transcribe', body_),
    // Phase R-7.1 — fill-from-chat must respect the active client. Without
    // withClient(), the plan was always saved into ROOT atlas/proposals/,
    // and the client tab's «✦ Предложения» panel showed «0 в ожидании»
    // because list_proposals (after R-4) reads atlas/clients/<id>/proposals/.
    fillFromChat: async (body_)        => await postJson('/atlas/sima/fill-from-chat', withClient(body_)),
    validateBlock:    async (block_id) => await postJson('/llm/validate-block', { block_id }),
    validationLatest: async (block_id) => await getJson('/llm/validate-block/get?block_id=' + encodeURIComponent(block_id)),
    architectureReview:       async () => await postJson('/llm/architecture-review', {}),
    architectureReviewLatest: async () => await getJson('/llm/architecture-review/get'),
    patchBlockFile: async (block_id, file, content) => await postJson('/atlas/blocks/patch-file', { block_id, file, content }),
  };

  // ─── "Совет Клода" — bridge to b.llm-gateway ─────────────────────
  // Sends a free-form prompt + optional block context, returns advice.
  // context_kind picks a per-screen system prompt server-side
  // (block / block_acceptance / block_field / tz / graph_overview / etc).
  const claudeAdvice = async ({ block_id, prompt, context, context_kind }) => {
    return await postJson('/llm/advice', withClient({ block_id, prompt, context, context_kind }));
  };

  // ─── System docs / per-block files ───────────────────────────────
  const meta = {
    get:          async (file)             => await getJson('/atlas/meta?file=' + encodeURIComponent(file)),
    save:         async (file, content)    => await postJson('/atlas/meta/save', { file, content }),
    userDocsList: async ()                 => await getJson('/atlas/user-docs/list'),
    userDocGet:   async (block_id)         => await getJson('/atlas/user-docs/get?block_id=' + encodeURIComponent(block_id)),
    blockFile:    async (block_id, name)   => await getJson('/atlas/blocks/' + encodeURIComponent(block_id) + '/file?name=' + encodeURIComponent(name)),
    clientsList:   async ()                => await getJson('/atlas/clients/list'),
    clientCreate:  async (id)              => await postJson('/atlas/clients/create', { id }),
    // Phase R-4 — client-scoped so a fresh client tab doesn't see the root pile.
    proposalsList: async ()                => await getJson('/atlas/proposals/list' + (client ? `?client=${encodeURIComponent(client)}` : '')),
    activityLogTail:   async (limit = 100) => await getJson('/atlas/activity-log/tail?limit=' + limit),
    activityLogAppend: async (entry)       => await postJson('/atlas/activity-log/append', entry),
    filesList:    async (block_id, status) => {
      const qs = new URLSearchParams();
      if (block_id) qs.set('block_id', block_id);
      if (status)   qs.set('status', status);
      return await getJson('/atlas/files/list' + (qs.toString() ? '?' + qs.toString() : ''));
    },
    filesMark:    async (path_, status, block_id, reason) => await postJson('/atlas/files/mark', { path: path_, status, block_id, reason }),
    filesSyncFromBlock: async (block_id) => await postJson('/atlas/files/sync-from-block', { block_id }),
    subagentRun:  async (name, body_) => await postJson('/atlas/subagents/run', { name, ...(body_ || {}) }),
    userDocsRegenerate: async (block_id) => await postJson('/user-docs/regenerate', { block_id }),
    operatorProfile:    async ()         => await getJson('/atlas/operator-profile/get'),
    screenshotsList:    async (block_id) => await getJson('/atlas/blocks/' + encodeURIComponent(block_id) + '/screenshots'),
    screenshotCapture:  async (block_id, body_) => await postJson('/atlas/blocks/' + encodeURIComponent(block_id) + '/screenshot', body_ || {}),
    screenshotUrl:      (block_id, name = 'latest.png') => (API_BASE.replace(/\/$/, '') + '/atlas/blocks/' + encodeURIComponent(block_id) + '/screenshot-file?name=' + encodeURIComponent(name)),
    proposalAccept:async (proposal_id)     => { const r = await postJson('/proposals/accept', withClient({ proposal_id })); if (r.ok) await refresh(); return r; },
    proposalReject:async (proposal_id, reason) => await postJson('/proposals/reject', withClient({ proposal_id, reason })),
    cursorHooksStatus: async ()            => await getJson('/atlas/cursor-hooks/status'),
  };

  window.SIMA_API = {
    // Returns immediately; UI should optimistically update its local
    // state and rely on the next refresh to confirm.
    createBlock: async (body_)         => { const r = await postJson('/atlas/blocks/create', withClient(body_)); if (r.ok) await refresh(); return r; },
    // L1 — patchBlock accepts optional `if_match_updated_at` from caller.
    // 409 etag_mismatch is surfaced to the UI via {ok:false, error:'etag_mismatch', current}.
    patchBlock:  async (block_id, body_) => { const r = await postJson('/atlas/blocks/patch',  withClient({ block_id, ...body_ })); if (r.ok) await refresh(); return r; },
    deleteBlock: async (block_id, hard=false) => { const r = await postJson('/atlas/blocks/delete', withClient({ block_id, hard })); if (r.ok) await refresh(); return r; },
    addEdge:     async (body_)         => { const r = await postJson('/atlas/edges/add',    withClient(body_)); if (r.ok) await refresh(); return r; },
    deleteEdge:  async (body_)         => { const r = await postJson('/atlas/edges/delete', withClient(body_)); if (r.ok) await refresh(); return r; },
    addNote:     async (body_)         => { const r = await postJson('/atlas/notes/add',    withClient(body_)); if (r.ok) await refresh(); return r; },
    patchNote:   async (note_id, body_) => { const r = await postJson('/atlas/notes/patch',  withClient({ note_id, ...body_ })); if (r.ok) await refresh(); return r; },
    deleteNote:  async (note_id)       => { const r = await postJson('/atlas/notes/delete', withClient({ note_id })); if (r.ok) await refresh(); return r; },
    artifacts,
    meta,
    synthesis,
    subsystems,
    templates,
    claudeAdvice,
    refresh,
  };
})();

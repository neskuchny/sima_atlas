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
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !j.ok || !j.data) return null;
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
  // Backed by atlas/artifacts/<id>/{index.json,body.md}. Used by the
  // Gallery / Composer / Library / TZ exporter views.
  const artifacts = {
    list:    async (params = {}) => {
      const qs = new URLSearchParams();
      if (params.kind)    qs.set('kind', params.kind);
      if (params.search)  qs.set('search', params.search);
      const tail = qs.toString() ? `?${qs.toString()}` : '';
      return await getJson('/api/artifacts' + tail);
    },
    get:     async (id, opts = {}) => {
      const qs = new URLSearchParams({ id });
      if (opts.withBody) qs.set('with_body', '1');
      return await getJson('/api/artifacts?' + qs.toString());
    },
    create:  async (body_)         => { return await postJson('/api/artifacts', body_); },
    update:  async (id, patch)     => { return await postJson('/api/artifacts/' + encodeURIComponent(id), patch); },
    insert:  async (id, body_)     => { return await postJson('/api/artifacts/' + encodeURIComponent(id) + '/insert', body_); },
    delete:  async (id)            => {
      try {
        const r = await fetch(API_BASE.replace(/\/$/, '') + '/api/artifacts?id=' + encodeURIComponent(id), { method: 'DELETE' });
        return await r.json().catch(() => ({}));
      } catch (e) { return { ok: false, error: String(e.message || e) }; }
    },
  };

  // ─── "Совет Клода" — bridge to b.llm-gateway ─────────────────────
  // Sends a free-form prompt + optional block context, returns advice.
  // Backend route /llm/advice is expected to exist; if not, the UI
  // shows a graceful "функция готовится" message.
  const claudeAdvice = async ({ block_id, prompt, context }) => {
    return await postJson('/llm/advice', withClient({ block_id, prompt, context }));
  };

  // ─── System docs / per-block files ───────────────────────────────
  const meta = {
    get:          async (file)             => await getJson('/atlas/meta?file=' + encodeURIComponent(file)),
    save:         async (file, content)    => await postJson('/atlas/meta/save', { file, content }),
    userDocsList: async ()                 => await getJson('/atlas/user-docs/list'),
    userDocGet:   async (block_id)         => await getJson('/atlas/user-docs/get?block_id=' + encodeURIComponent(block_id)),
    blockFile:    async (block_id, name)   => await getJson('/atlas/blocks/' + encodeURIComponent(block_id) + '/file?name=' + encodeURIComponent(name)),
    proposalsList: async ()                => await getJson('/atlas/proposals/list'),
    proposalAccept:async (proposal_id)     => await postJson('/proposals/accept', { proposal_id }),
    proposalReject:async (proposal_id, reason) => await postJson('/proposals/reject', { proposal_id, reason }),
    cursorHooksStatus: async ()            => await getJson('/atlas/cursor-hooks/status'),
  };

  window.SIMA_API = {
    // Returns immediately; UI should optimistically update its local
    // state and rely on the next refresh to confirm.
    createBlock: async (body_)         => { const r = await postJson('/atlas/blocks/create', withClient(body_)); if (r.ok) await refresh(); return r; },
    patchBlock:  async (block_id, body_) => { const r = await postJson('/atlas/blocks/patch',  withClient({ block_id, ...body_ })); if (r.ok) await refresh(); return r; },
    deleteBlock: async (block_id, hard=false) => { const r = await postJson('/atlas/blocks/delete', withClient({ block_id, hard })); if (r.ok) await refresh(); return r; },
    addEdge:     async (body_)         => { const r = await postJson('/atlas/edges/add',    withClient(body_)); if (r.ok) await refresh(); return r; },
    deleteEdge:  async (body_)         => { const r = await postJson('/atlas/edges/delete', withClient(body_)); if (r.ok) await refresh(); return r; },
    addNote:     async (body_)         => { const r = await postJson('/atlas/notes/add',    withClient(body_)); if (r.ok) await refresh(); return r; },
    patchNote:   async (note_id, body_) => { const r = await postJson('/atlas/notes/patch',  withClient({ note_id, ...body_ })); if (r.ok) await refresh(); return r; },
    deleteNote:  async (note_id)       => { const r = await postJson('/atlas/notes/delete', withClient({ note_id })); if (r.ok) await refresh(); return r; },
    artifacts,
    meta,
    claudeAdvice,
    refresh,
  };
})();

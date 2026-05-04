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
})();

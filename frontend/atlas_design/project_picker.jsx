// R-7.99 (b.desktop T12) — Project Picker modal.
//
// Lists projects (bundled atlas + ~/SimaProjects/<name>/atlas), lets the
// operator create a new project, and switches ATLAS_ROOT on selection.
//
// Works only inside the Electron shell (renderer has window.sima exposed by
// extensions/desktop/preload.mjs). In a plain browser window the API is
// absent — the modal stays closed because nothing fires it.
//
// Exposes:
//   window.SIMA_PROJECT_PICKER.ProjectPickerModal — React component
//   window.SIMA_PROJECT_PICKER.subscribe(setOpenFn) — wires File→Open menu
//                                                      to open the modal

(function initProjectPicker(global) {
  const React = global.React;
  if (!React) return;
  const { useState, useEffect, useCallback } = React;

  function ProjectPickerModal({ onClose, onSwitched }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [newName, setNewName] = useState('');
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
      if (!global.sima) return;
      setLoading(true);
      try {
        const r = await global.sima.listProjects();
        setItems(r?.ok ? r.projects : []);
      } catch (e) { setError(String(e?.message || e)); }
      setLoading(false);
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const open = async (p) => {
      if (!global.sima || busy) return;
      setBusy(true); setError(null);
      try {
        const r = await global.sima.openProject(p.path);
        if (r?.ok) { onSwitched && onSwitched(p); onClose(); }
        else setError(r?.error || 'failed to open project');
      } catch (e) { setError(String(e?.message || e)); }
      setBusy(false);
    };

    const create = async () => {
      if (!global.sima || busy) return;
      const trimmed = (newName || '').trim();
      if (!trimmed) { setError('name required'); return; }
      setBusy(true); setError(null);
      try {
        const r = await global.sima.createProject(trimmed);
        if (!r?.ok) { setError(r?.error || 'failed to create'); setBusy(false); return; }
        await refresh();
        setNewName('');
        // Immediately open the just-created project for one-click flow.
        await open(r.project);
      } catch (e) { setError(String(e?.message || e)); setBusy(false); }
    };

    return (
      <div className="cmd-bar" onClick={onClose}>
        <div className="cmd-box proposals-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
          <div className="sysdocs-head">
            <div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>SIMA · PROJECT PICKER</div>
              <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>
                {loading ? 'Loading…' : `${items.length} project${items.length === 1 ? '' : 's'}`}
              </h3>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="pill" onClick={refresh} disabled={busy}>↻ Refresh</button>
              <button className="pill" onClick={onClose}>✕</button>
            </div>
          </div>

          <div className="proposals-body" style={{ padding: '4px 14px 0' }}>
            {error && (
              <div className="mono" style={{ background: '#fee2e2', color: '#b91c1c', padding: '6px 10px', borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
                {error}
              </div>
            )}
            {!loading && !items.length && (
              <div className="meta" style={{ padding: 14 }}>
                No projects yet. Create one below — it will land in <code>~/SimaProjects/</code>.
              </div>
            )}
            {items.map((p) => (
              <div key={p.path} className="proposal-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {p.name}{' '}
                    {p.bundled && <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>(repo)</span>}
                    {p.current && <span className="mono" style={{ fontSize: 10, color: '#2e7d32', marginLeft: 6 }}>· current</span>}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>{p.path}</div>
                </div>
                <button
                  className="pill primary"
                  onClick={() => open(p)}
                  disabled={busy || p.current}
                  title={p.current ? 'already open' : 'switch ATLAS_ROOT to this project'}
                >
                  {p.current ? 'open' : (busy ? '…' : 'open')}
                </button>
              </div>
            ))}
          </div>

          <div className="sysdocs-foot" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px' }}>
            <input
              className="composer-input"
              placeholder="new-project-name (a-z 0-9 . _ -)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
              style={{ flex: 1 }}
              disabled={busy}
            />
            <button className="pill primary" onClick={create} disabled={busy || !newName.trim()}>
              {busy ? 'creating…' : '+ create & open'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // App-side helper: subscribe a useState setter to the File→Open menu
  // event from main. Returns the unsubscribe function (idempotent).
  function subscribe(setOpenFn) {
    if (!global.sima || typeof global.sima.onOpenProjectPicker !== 'function') {
      return () => {}; // browser mode — no-op
    }
    return global.sima.onOpenProjectPicker(() => setOpenFn(true));
  }

  global.SIMA_PROJECT_PICKER = { ProjectPickerModal, subscribe };
})(window);

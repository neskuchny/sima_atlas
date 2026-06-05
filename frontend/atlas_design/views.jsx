// SIMA Atlas — additional views: Composer, Gallery, Library, TZ exporter.
//
// These are the four legacy features ported into the new design style.
// All four operate against `window.SIMA_API.artifacts` (artifact CRUD)
// and `window.SIMA_DATA` (read-only graph payload).
//
// Visual conventions (re-uses existing classes from styles.css):
//   .cmd-bar / .cmd-box  — modal overlay frame (Gallery, TZ export)
//   .pill                 — inline action button
//   .chip / .chips        — tag pills
//   .tab / .tabs          — tab switcher (Composer source-type tabs)
//   .mono                 — JetBrains Mono shortcut
//   .meta                 — secondary text colour
//   var(--st-*)           — status colour variables
//
// Mount points (see index.html):
//   Composer  → topbar view-tabs as 4th tab "Синтезировать"
//   Gallery   → modal opened from CommandBar / topbar pill
//   Library   → modal opened from CommandBar / topbar pill
//   TZ export → DetailPanel addendum (per-block) + modal export dialog

const { useState: useStateV, useEffect: useEffectV, useMemo: useMemoV } = React;

/* ====================== COMPOSER ====================== */
// Multi-source intake: text / file / URL / spoken-meeting transcript.
// The user pastes/uploads content → optionally tags it → publishes as
// an artifact (kind=document or kind=transcript). Artifacts then feed
// the Gallery and TZ generation.

function Composer({ onClose, onPublished, productContext, onBlocksCreated }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
  const [source, setSource] = useStateV('text');     // text | file | url | meeting
  const [title, setTitle] = useStateV('');
  const [text, setText] = useStateV('');
  const [tags, setTags] = useStateV('');             // comma-separated
  const [busy, setBusy] = useStateV(false);
  const [result, setResult] = useStateV(null);
  const [intent, setIntent] = useStateV('custom');   // K4 — type of thing being modelled
  // Phase M — synthesis post-publish flow
  const [proposals, setProposals] = useStateV([]);
  const [synthBusy, setSynthBusy] = useStateV(false);
  const [accepting, setAccepting] = useStateV({}); // by id → state
  // Phase G — extracted insights (goals / constraints / ideas / risks / terms)
  const [insights, setInsights] = useStateV(null);
  const [insightsBusy, setInsightsBusy] = useStateV(false);
  const [picked, setPicked] = useStateV({}); // key → bool, for "save as artifact" multi-select
  // Phase R-2 — fill-from-chat orchestrator result
  const [fillBusy, setFillBusy] = useStateV(false);
  const [fillResult, setFillResult] = useStateV(null);

  const sources = [
    { id: 'text',    label: t('composer.source.text', 'Text'),       hint: t('composer.source.text_hint', 'paste / note') },
    { id: 'meeting', label: t('composer.source.meeting', 'Meeting'), hint: t('composer.source.meeting_hint', 'transcript') },
    { id: 'file',    label: t('composer.source.file', 'File'),       hint: t('composer.source.file_hint', '.md / .txt') },
    { id: 'url',     label: t('composer.source.url', 'Link'),        hint: t('composer.source.url_hint', 'web source') },
  ];

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const t = await f.text();
    setText(t);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const publish = async () => {
    if (!title.trim()) { setResult({ ok: false, error: t('composer.error.no_title', 'Title is required') }); return; }
    if (!text.trim() && source !== 'url') { setResult({ ok: false, error: t('composer.error.empty', 'Content is empty') }); return; }
    setBusy(true);
    setResult(null);
    setProposals([]);
    const kind = source === 'meeting' ? 'transcript' : source === 'url' ? 'document' : 'document';
    const r = await window.SIMA_API.artifacts.create({
      kind,
      title: title.trim(),
      description: source === 'url' ? text.trim() : '',
      body: text,
      tags: tags.split(',').map(s => s.trim()).filter(Boolean),
    });
    setBusy(false);
    setResult(r);
    if (r.ok) {
      if (onPublished) onPublished(r.artifact);
      // Don't reset text yet — we need it for the synthesis flow.
    }
  };

  // Phase M — ask Sima to propose 1-3 blocks based on the artefact body.
  // K4 — intent biases the system prompt for richer non-product schemas.
  const synthesize = async () => {
    setSynthBusy(true); setProposals([]);
    const r = await window.SIMA_API.synthesis.block({
      source_text: text || (result?.artifact?.description || ''),
      product_context: productContext || null,
      count: 3,
      intent,
    });
    setSynthBusy(false);
    if (r?.ok) setProposals(r.proposals.map((p) => ({ ...p, _mock: r.mock })));
  };

  // Accept a proposal: create the block, then write its mission / kpi /
  // acceptance / depends_on / provides files.
  const accept = async (p) => {
    setAccepting((a) => ({ ...a, [p.id]: 'creating' }));
    let c;
    try {
      c = await window.SIMA_API.createBlock({
        id: p.id,
        title: p.title,
        layer: p.layer,
        status: 'idea',
      });
    } catch (e) {
      c = { ok: false, error: String(e?.message || e) };
    }
    if (!c?.ok) {
      setAccepting((a) => ({ ...a, [p.id]: `failed: ${c?.error || 'create'}` }));
      return;
    }
    setAccepting((a) => ({ ...a, [p.id]: 'writing' }));
    const writeFile = async (file, content) => {
      const r = await window.SIMA_API.synthesis.patchBlockFile(p.id, file, content);
      return r?.ok;
    };
    await writeFile('mission.md',    `# ${p.id} — mission\n\n${p.mission}\n`);
    if (p.kpi.length)        await writeFile('kpi.md',        `# ${p.id} — KPI\n\n${p.kpi.map((k) => `- ${k}`).join('\n')}\n`);
    if (p.acceptance.length) await writeFile('acceptance.md', `# ${p.id} — acceptance\n\n${p.acceptance.map((a, i) => `- [ ] **A${i+1}.** ${a}`).join('\n')}\n`);
    if (p.depends_on_capabilities.length) await writeFile('depends_on.md', `# ${p.id} — depends_on\n\n${p.depends_on_capabilities.map((d) => `- ?: ${d}`).join('\n')}\n`);
    if (p.provides_capabilities.length)   await writeFile('provides.md',   `# ${p.id} — provides\n\n${p.provides_capabilities.map((d) => `- ${d}`).join('\n')}\n`);
    setAccepting((a) => ({ ...a, [p.id]: 'accepted' }));
    setProposals((P) => P.filter((x) => x.id !== p.id));
    if (onBlocksCreated) onBlocksCreated(p);
  };

  const reject = (p) => setProposals((P) => P.filter((x) => x.id !== p.id));

  // Phase R-2 — single-button «иди и заполни всё»: extract insights +
  // fill weak fields on existing blocks + propose new blocks. Saves a
  // plan to atlas/proposals/ which the operator reviews in ✦ Предложения.
  const fillFromChat = async () => {
    setFillBusy(true); setFillResult(null);
    const r = await window.SIMA_API.synthesis.fillFromChat({
      transcript: text || (result?.artifact?.description || ''),
    });
    setFillBusy(false);
    setFillResult(r);
  };

  // Phase G — extract insights from the artefact body. Builds a panel
  // of goals/constraints/ideas/risks/terms that the operator can either
  // turn into separate artifacts or merge as tags on the current one.
  const runExtract = async () => {
    setInsightsBusy(true); setInsights(null); setPicked({});
    const r = await window.SIMA_API.synthesis.extract({
      text: text || (result?.artifact?.description || ''),
      kind: source === 'meeting' ? 'transcript' : source,
    });
    setInsightsBusy(false);
    if (r?.ok) setInsights(r);
  };

  const togglePick = (key) => setPicked((p) => ({ ...p, [key]: !p[key] }));

  const savePickedAsArtifacts = async () => {
    if (!insights) return;
    const buckets = ['goals', 'constraints', 'ideas', 'risks'];
    let created = 0, failed = 0;
    for (const bucket of buckets) {
      for (let i = 0; i < (insights[bucket] || []).length; i++) {
        const k = `${bucket}.${i}`;
        if (!picked[k]) continue;
        const itemText = insights[bucket][i];
        const r = await window.SIMA_API.artifacts.create({
          kind: bucket === 'ideas' ? 'note' : 'document',
          title: itemText.slice(0, 60) + (itemText.length > 60 ? '…' : ''),
          description: `${t('composer.extract.from', 'Extracted from')} «${title || 'untitled'}»`,
          body: itemText,
          tags: [bucket, ...(insights.terms || []).slice(0, 3)],
          sourceProjectId: result?.artifact?.id,
        });
        if (r?.ok) created++; else failed++;
      }
    }
    setResult({ ok: true, _extracted: { created, failed } });
    setPicked({});
  };

  // Tag suggestions from extracted terms — clicking a chip appends to
  // the tags input.
  const addTagFromTerm = (term) => {
    const cur = tags.split(',').map((s) => s.trim()).filter(Boolean);
    if (cur.includes(term)) return;
    setTags([...cur, term].join(', '));
  };

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        <div className="composer-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>{t('composer.kicker', 'SIMA · SYNTHESIZER')}</div>
            <h2 style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 22, margin: '4px 0 4px' }}>
              {t('composer.headline', 'Drop any source here — Sima extracts the meaning')}
            </h2>
            <div className="meta" style={{ fontSize: 12.5 }}>
              {t('composer.subline', 'Note, meeting transcript, file or link → artifact visible to gallery and blocks.')}
            </div>
          </div>
          {onClose && <button className="pill" onClick={onClose} title={t('composer.close', 'Close')}>✕</button>}
        </div>

        <div className="tabs" style={{ marginTop: 14 }}>
          {sources.map(s => (
            <button key={s.id} className={source === s.id ? 'active' : ''} onClick={() => setSource(s.id)}>
              {s.label}<span className="ct">{s.hint}</span>
            </button>
          ))}
        </div>

        {/* K4 — intent picker. What kind of thing are we modelling? */}
        <div className="composer-intent">
          <span className="meta" style={{ fontSize: 11.5 }}>{t('composer.intent_label', 'Type:')}</span>
          {[
            { id: 'product',   label: t('composer.intent.product', 'Product') },
            { id: 'book',      label: t('composer.intent.book', 'Book') },
            { id: 'idea',      label: t('composer.intent.idea', 'Idea') },
            { id: 'marketing', label: t('composer.intent.marketing', 'Marketing') },
            { id: 'custom',    label: t('composer.intent.custom', 'Custom') },
          ].map((k) => (
            <button
              key={k.id}
              className={`intent-pill ${intent === k.id ? 'active' : ''}`}
              onClick={() => setIntent(k.id)}
              title={`${t('composer.intent_title_prefix', 'Sima will interpret the source as ')}${k.label.toLowerCase()}`}
            >{k.label}</button>
          ))}
          <span className="meta" style={{ fontSize: 11, marginLeft: 'auto' }}>
            {t('composer.intent_hint', 'affects «Sima will propose blocks»')}
          </span>
        </div>

        <div className="composer-body">
          <input
            className="composer-input"
            placeholder={t('composer.title_placeholder', 'Artifact title')}
            value={title}
            onChange={e => setTitle(e.target.value)}
          />

          {source === 'file' && (
            <div className="composer-file">
              <input type="file" accept=".md,.txt,.json,.csv" onChange={onFile} />
              <span className="meta" style={{ fontSize: 11.5 }}>{t('composer.file_support', 'Supports: markdown / txt / json / csv')}</span>
            </div>
          )}

          {source === 'url' && (
            <input
              className="composer-input"
              placeholder="https://example.com/source"
              value={text}
              onChange={e => setText(e.target.value)}
            />
          )}

          {(source === 'text' || source === 'meeting' || source === 'file') && (
            <textarea
              className="composer-textarea"
              placeholder={source === 'meeting'
                ? t('composer.textarea.meeting', 'Paste the meeting transcript. Sima will find key goals, constraints, ideas and save as an artifact.')
                : t('composer.textarea.text', 'Text / file content…')}
              value={text}
              onChange={e => setText(e.target.value)}
              rows={12}
            />
          )}

          <input
            className="composer-input"
            placeholder={t('composer.tags_placeholder', 'Comma-separated tags — e.g. product, marketing, idea')}
            value={tags}
            onChange={e => setTags(e.target.value)}
          />

          <div className="composer-actions">
            <button className="pill primary" onClick={publish} disabled={busy}>
              {busy ? t('composer.publishing', 'Publishing…') : t('composer.publish', '＋ Publish as artifact')}
            </button>
            <span className="meta" style={{ fontSize: 11.5 }}>
              {t('composer.publish_hint', 'The artifact will appear in the gallery and can be attached to any block.')}
            </span>
          </div>

          {result && (
            <div className={`composer-result ${result.ok ? 'ok' : 'fail'}`}>
              {result.ok
                ? <>{t('composer.published_prefix', '✓ Published as')} <span className="mono">{result.artifact.id}</span> — «{result.artifact.title}»</>
                : <>✗ {result.error}</>}
            </div>
          )}

          {/* Phase M — Sima synthesis */}
          {result?.ok && text && (
            <div className="synthesis-cta">
              <button className="pill primary" onClick={fillFromChat} disabled={fillBusy} title={t('composer.fill_title', 'One click: extract insights + fill weak fields of existing blocks + propose new blocks. Plan saved to ✦ Proposals for review.')}>
                {fillBusy ? t('composer.fill_busy', '✦ Sima is following the plan…') : t('composer.fill_btn', '✦ Sima — fill from this chat')}
              </button>
              <button className="pill" onClick={synthesize} disabled={synthBusy}>
                {synthBusy ? t('composer.synth_busy', 'thinking…') : t('composer.synth_only', '＋ new blocks only')}
              </button>
              <button className="pill" onClick={runExtract} disabled={insightsBusy}>
                {insightsBusy ? t('composer.extract_busy', 'extracting…') : t('composer.extract_only', '◔ insights only')}
              </button>
              <span className="meta" style={{ fontSize: 11.5 }}>
                {t('composer.steps_hint', 'Big button — for «just go fill everything». Smaller ones — separate steps.')}
              </span>
            </div>
          )}
          {fillResult && (
            <div className={`composer-result ${fillResult.ok ? 'ok' : 'fail'}`} style={{ marginTop: 8 }}>
              {fillResult.ok && fillResult.plan ? (
                <>
                  ✓ {fillResult.mock ? t('composer.fill.demo', '(demo mode) ') : ''}{t('composer.fill.filled', 'blocks filled:')} <strong>{fillResult.plan.summary.filled_blocks_count}</strong>
                  /{fillResult.plan.summary.target_blocks_count}{' '}
                  ({fillResult.plan.summary.total_fields_filled} {t('composer.fill.fields', 'fields);')}
                  {' '}{t('composer.fill.proposed', 'new proposed:')} <strong>{fillResult.plan.summary.proposed_new_blocks}</strong>;
                  {' '}{t('composer.fill.ambiguities', 'ambiguities:')} {fillResult.plan.summary.ambiguities}.
                  <div className="meta" style={{ fontSize: 11, marginTop: 4 }}>
                    {t('composer.fill.plan_saved_pre', 'Plan saved to')} <code>{fillResult.plan.saved_at || `atlas/proposals/${fillResult.plan.id}.json`}</code> {t('composer.fill.plan_saved_post', '— open')} <strong>{t('composer.fill.proposals_link', '✦ Proposals')}</strong> {t('composer.fill.plan_saved_end', 'to accept/reject.')}
                  </div>
                </>
              ) : (
                <>✗ {fillResult.error || t('composer.fill.failed', 'failed')}</>
              )}
            </div>
          )}

          {/* Phase G — extracted insights panel */}
          {insights && (
            <div className="insights-panel">
              {insights.mock && (
                <div className="composer-result fail" style={{ marginBottom: 8 }}>
                  {t('composer.insights.demo', 'Demo mode: set ANTHROPIC_API_KEY for real extraction.')}
                </div>
              )}
              {insights.summary && (
                <div className="insights-summary">
                  <div className="meta" style={{ fontSize: 10.5, marginBottom: 2 }}>{t('composer.insights.summary_label', 'SIMA SUMMARIZES')}</div>
                  {insights.summary}
                </div>
              )}
              {insights.terms && insights.terms.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="meta" style={{ fontSize: 10.5, marginBottom: 4 }}>{t('composer.insights.terms_label', 'TERMS — click to add as tags')}</div>
                  <div className="chips">
                    {insights.terms.map((t) => (
                      <span
                        key={t}
                        className={`chip clickable ${tags.split(',').map(s=>s.trim()).includes(t) ? 'on' : ''}`}
                        onClick={() => addTagFromTerm(t)}
                      >{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {[
                { k: 'goals', label: t('composer.insights.goals', 'Goals'), icon: '◎' },
                { k: 'constraints', label: t('composer.insights.constraints', 'Constraints'), icon: '⊗' },
                { k: 'ideas', label: t('composer.insights.ideas', 'Ideas'), icon: '✦' },
                { k: 'risks', label: t('composer.insights.risks', 'Risks'), icon: '⚠' },
              ].map(({ k, label, icon }) => {
                const items = insights[k] || [];
                if (!items.length) return null;
                return (
                  <div key={k} className="insights-group">
                    <div className="insights-group-head">
                      <span className="mono" style={{ fontSize: 11 }}>{icon} {label.toUpperCase()}</span>
                      <span className="meta" style={{ fontSize: 11 }}>{items.length}</span>
                    </div>
                    <ul className="insights-list">
                      {items.map((it, i) => {
                        const key = `${k}.${i}`;
                        return (
                          <li key={key} className={picked[key] ? 'picked' : ''} onClick={() => togglePick(key)}>
                            <span className="insights-check">{picked[key] ? '☑' : '☐'}</span>
                            <span>{it}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
              {Object.values(picked).some(Boolean) && (
                <div className="insights-actions">
                  <button className="pill primary" onClick={savePickedAsArtifacts}>
                    {t('composer.insights.save', '💾 Save selected as artifacts')}
                  </button>
                  <span className="meta" style={{ fontSize: 11.5 }}>
                    {t('composer.insights.save_hint', 'Each selected item becomes a separate artifact (kind=document for goals/constraints/risks, note for ideas).')}
                  </span>
                </div>
              )}
              {result?._extracted && (
                <div className={`composer-result ${result._extracted.failed ? 'fail' : 'ok'}`} style={{ marginTop: 6 }}>
                  {t('composer.insights.created_prefix', '✓ artifacts created:')} {result._extracted.created}
                  {result._extracted.failed > 0 && <>{t('composer.insights.errors', '; errors:')} {result._extracted.failed}</>}
                </div>
              )}
            </div>
          )}
          {proposals.length > 0 && (
            <div className="synthesis-list">
              {proposals[0]?._mock && (
                <div className="composer-result fail" style={{ marginBottom: 8 }}>
                  {t('composer.proposals.demo', 'Demo mode: set ANTHROPIC_API_KEY so Sima generates real proposals.')}
                </div>
              )}
              {proposals.map((p) => (
                <div key={p.id} className="synth-card">
                  <div className="synth-card-head">
                    <span className="mono" style={{ fontSize: 11 }}>{p.id}</span>
                    <span className="gallery-kind">{p.layer}</span>
                  </div>
                  <div className="synth-title">{p.title}</div>
                  <div className="synth-mission">{p.mission}</div>
                  {p.kpi.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div className="meta" style={{ fontSize: 10.5, marginBottom: 2 }}>KPI</div>
                      <div className="chips">{p.kpi.slice(0, 4).map((k, i) => <span key={i} className="chip">{k}</span>)}</div>
                    </div>
                  )}
                  {p.acceptance.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div className="meta" style={{ fontSize: 10.5, marginBottom: 2 }}>ACCEPTANCE</div>
                      <ul className="synth-list-md">
                        {p.acceptance.slice(0, 4).map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                  {(p.provides_capabilities.length > 0 || p.depends_on_capabilities.length > 0) && (
                    <div className="synth-caps">
                      {p.provides_capabilities.length > 0 && <span><span className="meta">{t('composer.proposals.gives', 'gives:')}</span> {p.provides_capabilities.slice(0, 4).join(', ')}</span>}
                      {p.depends_on_capabilities.length > 0 && <span><span className="meta">{t('composer.proposals.depends', 'depends on:')}</span> {p.depends_on_capabilities.slice(0, 4).join(', ')}</span>}
                    </div>
                  )}
                  {p.rationale && <div className="meta" style={{ fontSize: 11, marginTop: 6 }}>{p.rationale}</div>}
                  <div className="synth-actions">
                    <button className="pill primary" onClick={() => accept(p)} disabled={!!accepting[p.id]}>
                      {accepting[p.id] === 'creating' ? t('composer.proposals.creating', 'creating…') :
                        accepting[p.id] === 'writing' ? t('composer.proposals.writing', 'writing files…') :
                        accepting[p.id]?.startsWith('failed') ? t('composer.proposals.failed', 'error') :
                        t('composer.proposals.accept', '＋ Accept and create block')}
                    </button>
                    <button className="pill" onClick={() => reject(p)} disabled={!!accepting[p.id]}>
                      {t('composer.proposals.skip', '✗ Skip')}
                    </button>
                    {accepting[p.id]?.startsWith('failed') && (
                      <span className="meta" style={{ fontSize: 11, color: 'var(--st-fail)' }}>{accepting[p.id]}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================== GALLERY ====================== */
// Browse / search / delete / insert artifacts.
// Modal frame: re-uses .cmd-bar / .cmd-box scaffolding for consistent feel.

function Gallery({ onClose, onPick }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
  const [items, setItems] = useStateV([]);
  const [filter, setFilter] = useStateV('all');     // all | block | tz | document | transcript | note
  const [q, setQ] = useStateV('');
  const [loading, setLoading] = useStateV(true);
  const [selected, setSelected] = useStateV(null);  // artifact id

  const refresh = async () => {
    setLoading(true);
    const r = await window.SIMA_API.artifacts.list({ kind: filter === 'all' ? undefined : filter, search: q || undefined });
    setItems(r?.ok ? r.artifacts : []);
    setLoading(false);
  };
  useEffectV(() => { refresh(); }, [filter]);

  const filtered = useMemoV(() => {
    if (!q) return items;
    const ql = q.toLowerCase();
    return items.filter(a =>
      (a.title || '').toLowerCase().includes(ql) ||
      (a.description || '').toLowerCase().includes(ql) ||
      (a.tags || []).some(t => t.toLowerCase().includes(ql))
    );
  }, [items, q]);

  const onDelete = async (id) => {
    if (!window.confirm(t('gallery.delete_confirm', 'Delete artifact?'))) return;
    await window.SIMA_API.artifacts.delete(id);
    setItems(I => I.filter(x => x.id !== id));
    if (selected === id) setSelected(null);
  };

  const onInsert = async (a) => {
    const r = await window.SIMA_API.artifacts.insert(a.id, { project_id: 'main' });
    if (r?.ok && onPick) onPick(a);
    if (r?.ok) onClose && onClose();
  };

  const filters = [
    { id: 'all',        label: t('gallery.filter.all', 'All') },
    { id: 'block',      label: t('gallery.filter.block', 'Blocks') },
    { id: 'tz',         label: t('gallery.filter.tz', 'Specs') },
    { id: 'document',   label: t('gallery.filter.document', 'Documents') },
    { id: 'transcript', label: t('gallery.filter.transcript', 'Transcripts') },
    { id: 'map',        label: t('gallery.filter.map', 'Maps') },
    { id: 'note',       label: t('gallery.filter.note', 'Notes') },
  ];

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box gallery-box" onClick={e => e.stopPropagation()}>
        <div className="gallery-head">
          <input
            className="gallery-search"
            placeholder={t('gallery.search_placeholder', 'Search by title / tags / description…')}
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
          />
          <div className="gallery-filters">
            {filters.map(f => (
              <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="gallery-grid">
          {loading && <div className="meta" style={{ padding: 14 }}>{t('gallery.loading', 'Loading…')}</div>}
          {!loading && !filtered.length && (
            <div className="meta" style={{ padding: 14 }}>
              {t('gallery.empty', 'No artifacts found. Open «Synthesize» in the header to add the first one.')}
            </div>
          )}
          {filtered.map(a => (
            <div key={a.id} className={`gallery-card ${selected === a.id ? 'selected' : ''}`} onClick={() => setSelected(a.id === selected ? null : a.id)}>
              <div className="gallery-card-head">
                <span className={`gallery-kind kind-${a.kind}`}>{a.kind}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>
                  {(a.createdAt || '').slice(0, 10)}
                </span>
              </div>
              <div className="gallery-title">{a.title}</div>
              {a.description && <div className="gallery-desc">{a.description}</div>}
              {a.tags && a.tags.length > 0 && (
                <div className="chips" style={{ marginTop: 6 }}>
                  {a.tags.slice(0, 4).map(t => <span key={t} className="chip">{t}</span>)}
                </div>
              )}
              {selected === a.id && (
                <div className="gallery-actions" onClick={e => e.stopPropagation()}>
                  <button className="pill primary" onClick={() => onInsert(a)}>{t('gallery.attach', '＋ Attach to project')}</button>
                  <button className="pill" onClick={() => onDelete(a.id)} style={{ color: 'var(--st-fail)' }}>{t('gallery.delete', '✕ Delete')}</button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="gallery-foot">
          <span className="meta">{filtered.length} {(window.__SIMA_LOCALE === 'ru') ? pluralize(filtered.length, 'артефакт', 'артефакта', 'артефактов') : t('gallery.artifacts_label', 'artifacts')}</span>
          <button className="pill" onClick={onClose}>{t('gallery.close', 'Close')}</button>
        </div>
      </div>
    </div>
  );
}

/* ====================== LIBRARY ====================== */
// Saved blocks browser — shows artifacts with kind=block grouped by
// blockType, optionally filtered by current module's layer.

function Library({ data, currentModuleId, onClose, onPick }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
  const [items, setItems] = useStateV([]);
  const [q, setQ] = useStateV('');
  const [loading, setLoading] = useStateV(true);

  useEffectV(() => {
    (async () => {
      setLoading(true);
      const r = await window.SIMA_API.artifacts.list({ kind: 'block' });
      setItems(r?.ok ? r.artifacts : []);
      setLoading(false);
    })();
  }, []);

  const moduleLayer = currentModuleId ? data.modules.find(m => m.id === currentModuleId)?.layer : null;

  const filtered = useMemoV(() => {
    let out = items;
    if (moduleLayer) out = out.filter(a => !a.blockLayer || a.blockLayer === moduleLayer);
    if (q) {
      const ql = q.toLowerCase();
      out = out.filter(a => (a.title || '').toLowerCase().includes(ql) || (a.tags || []).some(t => t.toLowerCase().includes(ql)));
    }
    return out;
  }, [items, q, moduleLayer]);

  const grouped = useMemoV(() => {
    const m = new Map();
    for (const a of filtered) {
      const k = a.blockType || 'general';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(a);
    }
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box library-box" onClick={e => e.stopPropagation()}>
        <div className="library-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>{t('library.title', 'BLOCK LIBRARY')}</div>
            <h3 style={{ margin: 0, fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 18 }}>
              {t('library.subtitle', 'Ready-made blocks you can drop into the project')}
              {moduleLayer && <span className="meta" style={{ fontStyle: 'normal', fontSize: 12, marginLeft: 8 }}>{t('library.layer_filter', '· filter by layer')} <span className="mono">{moduleLayer}</span></span>}
            </h3>
          </div>
          <input
            className="gallery-search"
            placeholder={t('library.search', 'Search…')}
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
            style={{ maxWidth: 280 }}
          />
        </div>
        <div className="library-body">
          {loading && <div className="meta" style={{ padding: 14 }}>{t('library.loading', 'Loading…')}</div>}
          {!loading && !grouped.length && (
            <div className="meta" style={{ padding: 14 }}>
              {t('library.empty', 'No saved blocks yet. Save any schema block as an artifact — it will appear here.')}
            </div>
          )}
          {grouped.map(([type, list]) => (
            <div key={type} className="library-group">
              <div className="library-group-head">
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.08em' }}>
                  {type.toUpperCase()}
                </span>
                <span className="meta" style={{ fontSize: 11 }}>{list.length}</span>
              </div>
              <div className="library-grid">
                {list.map(a => (
                  <div key={a.id} className="library-card" onClick={() => onPick && onPick(a)}>
                    <div className="library-card-title">{a.title}</div>
                    {a.description && <div className="library-card-desc">{a.description}</div>}
                    {a.tags && (
                      <div className="chips" style={{ marginTop: 6 }}>
                        {a.tags.slice(0, 3).map(t => <span key={t} className="chip">{t}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="gallery-foot">
          <span className="meta">{filtered.length} {(window.__SIMA_LOCALE === 'ru') ? pluralize(filtered.length, 'блок', 'блока', 'блоков') : t('library.blocks_label', 'blocks')}</span>
          <button className="pill" onClick={onClose}>{t('library.close', 'Close')}</button>
        </div>
      </div>
    </div>
  );
}

/* ====================== TZ EXPORTER ====================== */
// Generate a TZ for the selected block + offer export to coding agents.
// Reads the block's mission/kpi/acceptance/depends_on/provides via the
// existing /atlas/payload endpoint that serves SIMA_BOOTSTRAP, then
// renders a markdown TZ in-place. Save-as-artifact stores it for reuse.

function TZExporter({ data, moduleId, onClose, onSendToAgent, onClaudeAdvice }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
  const m = data.modules.find(x => x.id === moduleId);
  const tasks = data.tasks[moduleId] || [];
  const [busy, setBusy] = useStateV(false);
  const [saved, setSaved] = useStateV(null);

  const tzMd = useMemoV(() => {
    if (!m) return '';
    const docs = data.moduleDocs?.[moduleId] || {};
    const lines = [
      `# ${t('tz.title_prefix', 'Spec:')} ${m.title}`,
      ``,
      `**${t('tz.layer', 'Layer:')}** ${m.layer}  ·  **${t('tz.status', 'Status:')}** ${m.status}  ·  **${t('tz.priority', 'Priority:')}** P${m.priority}`,
      ``,
      `## ${t('tz.why', 'Why')}`,
      docs.why || docs.short || t('tz.not_set', '_not set_'),
      ``,
      `## ${t('tz.logic', 'Logic')}`,
      docs.logic || t('tz.not_set', '_not set_'),
      ``,
    ];
    if (tasks.length) {
      lines.push(`## ${t('tz.decomposition', 'Decomposition')}`);
      for (const tk of tasks) {
        lines.push(`- **${tk.id}** · ${tk.title}${tk.note ? ` _(${tk.note})_` : ''}`);
      }
      lines.push('');
    }
    const inEdges = data.edges.filter(e => e.to === moduleId);
    const outEdges = data.edges.filter(e => e.from === moduleId);
    if (inEdges.length || outEdges.length) {
      lines.push(`## ${t('tz.connections', 'Connections')}`);
      if (inEdges.length) {
        lines.push(`### ${t('tz.incoming', 'Incoming')}`);
        for (const e of inEdges) {
          const o = data.modules.find(x => x.id === e.from);
          lines.push(`- ← **${o?.title || e.from}** · ${e.kind}${e.label ? ' · ' + e.label : ''}`);
        }
      }
      if (outEdges.length) {
        lines.push(`### ${t('tz.outgoing', 'Outgoing')}`);
        for (const e of outEdges) {
          const o = data.modules.find(x => x.id === e.to);
          lines.push(`- → **${o?.title || e.to}** · ${e.kind}${e.label ? ' · ' + e.label : ''}`);
        }
      }
      lines.push('');
    }
    lines.push(`## ${t('tz.acceptance', 'Acceptance')}`);
    lines.push(t('tz.acceptance_note', 'Readiness criteria — see acceptance.md in the block dir.'));
    return lines.join('\n');
  }, [moduleId]);

  const saveAsArtifact = async () => {
    setBusy(true);
    const r = await window.SIMA_API.artifacts.create({
      kind: 'tz',
      title: `${t('tz.title_prefix', 'Spec:')} ${m.title}`,
      description: `${t('tz.from_block', 'Generated from block')} ${moduleId}`,
      body: tzMd,
      tags: ['tz', m.layer, moduleId],
      sourceBlockId: moduleId,
    });
    setBusy(false);
    setSaved(r);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(tzMd).then(
      () => setSaved({ ok: true, _copied: true }),
      () => setSaved({ ok: false, error: t('tz.clipboard_denied', 'clipboard denied') })
    );
  };

  if (!m) return null;

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box tz-box" onClick={e => e.stopPropagation()}>
        <div className="tz-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>{t('tz.kicker_prefix', 'SPEC ·')} {moduleId}</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>{m.title}</h3>
          </div>
          <button className="pill" onClick={onClose} title={t('tz.close', 'Close')}>✕</button>
        </div>

        <div className="tz-body">
          <pre className="tz-preview">{tzMd}</pre>
        </div>

        <div className="tz-actions">
          <div className="tz-actions-row">
            <span className="meta" style={{ fontSize: 11.5 }}>{t('tz.send_label', 'Send to agent (with this spec as context):')}</span>
            <button className="pill" onClick={() => onSendToAgent && onSendToAgent('claude', m)}>Claude Code</button>
            <button className="pill" onClick={() => onSendToAgent && onSendToAgent('cursor', m)}>Cursor</button>
            <button className="pill" onClick={() => onSendToAgent && onSendToAgent('codex', m)}>Codex</button>
          </div>
          <div className="tz-actions-row">
            <button className="pill" onClick={copyToClipboard}>{t('tz.copy_md', '⧉ Copy markdown')}</button>
            <button className="pill primary" onClick={saveAsArtifact} disabled={busy}>
              {busy ? t('tz.saving', 'Saving…') : t('tz.save_artifact', '💾 Save as artifact')}
            </button>
            {onClaudeAdvice && (
              <button className="pill" onClick={() => onClaudeAdvice(m, {
                kind: 'tz',
                context: { tz_md: tzMd.slice(0, 4000) },
              })}>{t('tz.sima_compress', '✨ Sima will compress spec')}</button>
            )}
          </div>
          {saved && (
            <div className={`composer-result ${saved.ok ? 'ok' : 'fail'}`}>
              {saved._copied ? t('tz.copied', '✓ Copied to clipboard') : saved.ok
                ? <>{t('tz.saved_prefix', '✓ Saved as')} <span className="mono">{saved.artifact.id}</span></>
                : <>✗ {saved.error}</>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================== SYSTEM DOCS ======================
   Read-only modal that surfaces the auto-generated artefacts living in
   atlas/ — Roadmap, Wiki (mermaid), end-user tutorials. These were
   produced by the existing toolchain (generate_wiki, render_wiki_html,
   rebuild_atlas_roadmap, generate_user_docs); the new design just
   exposes them.
*/
function SystemDocs({ onClose }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
  const [tab, setTab] = useStateV('roadmap');
  const [content, setContent] = useStateV('');
  const [draft, setDraft] = useStateV('');
  const [editing, setEditing] = useStateV(false);
  const [saveMsg, setSaveMsg] = useStateV(null);
  const [docs, setDocs] = useStateV([]);
  const [openDocFor, setOpenDocFor] = useStateV(null);
  const [docContent, setDocContent] = useStateV('');
  const [meta, setMeta] = useStateV(null);
  // Phase O-4: operator profile tab data
  const [profile, setProfile] = useStateV(null);
  // R-7.92 (S-9.1) — global token-economics tab (project-wide, no block filter)
  const [economics, setEconomics] = useStateV(null);
  const [econDays, setEconDays] = useStateV(30);
  // R-7.93 — V-1 autonomous runs · S-7 change-sets · S-12 cleanup proposals
  const [autoRun, setAutoRun] = useStateV(null);
  const [changeSets, setChangeSets] = useStateV(null);
  const [cleanup, setCleanup] = useStateV(null);

  const EDITABLE = new Set(['project.md', 'rules.md', 'tech_stack.md']);
  const tabToFile = (t) => ({
    roadmap: 'roadmap.md', wiki: 'wiki.html', 'wiki-md': 'WIKI.md',
    project: 'project.md', rules: 'rules.md', stack: 'tech_stack.md',
  }[t]);

  useEffectV(() => {
    let alive = true;
    (async () => {
      setContent(''); setDraft(''); setMeta(null); setEditing(false); setSaveMsg(null);
      const file = tabToFile(tab);
      if (file && tab !== 'docs') {
        const r = await window.SIMA_API.meta.get(file);
        if (alive && r?.ok) { setContent(r.content || ''); setDraft(r.content || ''); setMeta(r); }
      } else if (tab === 'docs') {
        const r = await window.SIMA_API.meta.userDocsList();
        if (alive && r?.ok) setDocs(r.docs || []);
      } else if (tab === 'profile') {
        const r = await window.SIMA_API.meta.operatorProfile();
        if (alive && r?.ok) setProfile(r.profile || null);
      } else if (tab === 'economics') {
        const r = await window.SIMA_API.meta.tokenEconomics({ days: econDays });
        if (alive && r?.ok) setEconomics(r);
      } else if (tab === 'autonomous') {
        const r = await window.SIMA_API.meta.autonomousRuns();
        if (alive && r?.ok) setAutoRun(r);
      } else if (tab === 'changesets') {
        const r = await window.SIMA_API.meta.changeSets();
        if (alive && r?.ok) setChangeSets(r.change_sets || []);
      } else if (tab === 'cleanup') {
        const r = await window.SIMA_API.meta.cleanupProposals();
        if (alive && r?.ok) setCleanup(r);
      }
    })();
    return () => { alive = false; };
  }, [tab, econDays]);

  const saveMeta = async () => {
    const file = tabToFile(tab);
    if (!EDITABLE.has(file)) return;
    setSaveMsg(null);
    const r = await window.SIMA_API.meta.save(file, draft);
    if (r?.ok) {
      setContent(draft);
      setEditing(false);
      setSaveMsg({ kind: 'ok', text: `${t('sysdocs.save_ok_prefix', '✓ saved (')}${r.bytes}${t('sysdocs.save_ok_suffix', ' bytes)')}` });
      setTimeout(() => setSaveMsg(null), 2400);
    } else {
      setSaveMsg({ kind: 'fail', text: r?.error || t('sysdocs.save_failed', 'save failed') });
    }
  };

  useEffectV(() => {
    let alive = true;
    if (!openDocFor) { setDocContent(''); return; }
    (async () => {
      const r = await window.SIMA_API.meta.userDocGet(openDocFor);
      if (alive) setDocContent(r?.ok ? r.content : `${t('sysdocs.doc_not_generated', '# Not generated\n\nRun generate_user_docs')} ${openDocFor}`);
    })();
    return () => { alive = false; };
  }, [openDocFor]);

  const tabs = [
    { id: 'profile',  label: t('sysdocs.tab.profile', 'Profile'), special: 'profile' },
    { id: 'economics', label: t('sysdocs.tab.economics', '💰 Economics'), special: 'economics' },
    { id: 'autonomous', label: t('sysdocs.tab.autonomous', '🤖 Autonomous'), special: 'autonomous' },
    { id: 'changesets', label: t('sysdocs.tab.changesets', '🔀 Change-sets'), special: 'changesets' },
    { id: 'cleanup',  label: t('sysdocs.tab.cleanup', '🧹 Cleanup'), special: 'cleanup' },
    { id: 'roadmap',  label: t('sysdocs.tab.roadmap', 'Roadmap') },
    { id: 'wiki',     label: t('sysdocs.tab.wiki', 'Wiki (mermaid)') },
    { id: 'wiki-md',  label: t('sysdocs.tab.wiki_md', 'WIKI.md') },
    { id: 'docs',     label: t('sysdocs.tab.docs', 'For the user') },
    { id: 'project',  label: t('sysdocs.tab.project', 'project.md'), editable: true },
    { id: 'rules',    label: t('sysdocs.tab.rules', 'rules.md'), editable: true },
    { id: 'stack',    label: t('sysdocs.tab.stack', 'tech_stack.md'), editable: true },
  ];
  const isEditableTab = !!tabs.find((t) => t.id === tab && t.editable);

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box sysdocs-box" onClick={e => e.stopPropagation()}>
        <div className="sysdocs-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>{t('sysdocs.title', 'SYSTEM DOCS')}</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>
              {t('sysdocs.subtitle', 'Auto-generated + editable Atlas artifacts')}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {isEditableTab && !editing && content !== null && (
              <button className="pill" onClick={() => setEditing(true)}>{t('sysdocs.edit', '✎ Edit')}</button>
            )}
            {isEditableTab && editing && (
              <>
                <button className="pill primary" onClick={saveMeta}>{t('sysdocs.save', '💾 Save')}</button>
                <button className="pill" onClick={() => { setDraft(content); setEditing(false); setSaveMsg(null); }}>{t('sysdocs.cancel', 'Cancel')}</button>
              </>
            )}
            <button className="pill" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="tabs sysdocs-tabs">
          {tabs.map(t => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); setOpenDocFor(null); }}>
              {t.label}{t.editable && <span className="ct">✎</span>}
            </button>
          ))}
        </div>
        {saveMsg && (
          <div className={`composer-result ${saveMsg.kind}`} style={{ margin: '8px 18px 0' }}>{saveMsg.text}</div>
        )}
        <div className="sysdocs-body">
          {tab === 'wiki' && (
            content
              ? <iframe className="sysdocs-iframe" srcDoc={content} title="wiki" />
              : <div className="meta" style={{ padding: 14 }}>{t('sysdocs.wiki_missing', 'wiki.html not found. Run node scripts/render_wiki_html.mjs.')}</div>
          )}
          {(tab === 'roadmap' || tab === 'wiki-md') && (
            content
              ? <div className="sysdocs-md contract-body md" dangerouslySetInnerHTML={{ __html: (window.marked?.parse?.(content) ?? content) }} />
              : <div className="meta" style={{ padding: 14 }}>{t('sysdocs.file_missing', 'file not found or empty')}</div>
          )}
          {isEditableTab && !editing && (
            content
              ? <div className="sysdocs-md contract-body md" dangerouslySetInnerHTML={{ __html: (window.marked?.parse?.(content) ?? content) }} />
              : <div className="meta" style={{ padding: 14 }}>{t('sysdocs.empty', 'empty')}</div>
          )}
          {isEditableTab && editing && (
            <textarea className="sysdocs-editor" value={draft} onChange={e => setDraft(e.target.value)} rows={26} />
          )}
          {tab === 'docs' && !openDocFor && (
            <div className="sysdocs-list">
              {!docs.length && <div className="meta" style={{ padding: 14 }}>
                {t('sysdocs.docs_empty', 'Not generated yet. In DetailPanel press «Generate user guide» for a block, or run node scripts/generate_user_docs.mjs <block_id>.')}
              </div>}
              {docs.map(d => (
                <div key={d.block_id} className="sysdocs-list-row" onClick={() => setOpenDocFor(d.block_id)}>
                  <span className="mono" style={{ fontSize: 12 }}>{d.block_id}</span>
                  <span className="meta" style={{ fontSize: 11 }}>{(d.bytes/1024).toFixed(1)} {t('sysdocs.docs.kb', 'KB')} · {String(d.mtime).slice(0, 16).replace('T', ' ')}</span>
                  <span className="meta">→</span>
                </div>
              ))}
            </div>
          )}
          {tab === 'profile' && (
            <div className="profile-body">
              {!profile && <div className="meta" style={{ padding: 14 }}>{t('sysdocs.profile.empty', 'Profile not generated. Run node scripts/aggregate_operator_profile.mjs.')}</div>}
              {profile && (
                <>
                  <div className="acc-counts mono" style={{ marginBottom: 12 }}>
                    <span className="acc-pill">{profile._status || 'ready'}</span>
                    {profile.updated_at && <span className="acc-pill">{t('sysdocs.profile.updated', 'updated')} {String(profile.updated_at).slice(0, 16).replace('T', ' ')}</span>}
                    <span className="acc-pill">operator: {profile.operator_id || 'default'}</span>
                  </div>
                  {profile._status === 'warming_up' && (
                    <div className="lesson" style={{ marginBottom: 12 }}>
                      {t('sysdocs.profile.warming_pre', 'Sima is still gathering data about you. Need')}{' '}
                      <strong>{(profile._min_data?.done_required || 5) - (profile._min_data?.done_transitions || 0)}</strong> {t('sysdocs.profile.warming_done', 'more done blocks and')}{' '}
                      <strong>{(profile._min_data?.invocations_required || 10) - (profile._min_data?.invocations || 0)}</strong> {t('sysdocs.profile.warming_runs', 'agent runs for the profile to be ready. Collected so far:')} {profile._preview?.total_traces} {t('sysdocs.profile.warming_traces', 'LLM traces ·')} {profile._preview?.total_proposals} {t('sysdocs.profile.warming_props', 'proposals.')}
                    </div>
                  )}
                  {Array.isArray(profile.tech_stack_history) && profile.tech_stack_history.length > 0 && (
                    <div className="profile-section">
                      <h3>{t('sysdocs.profile.stack', 'Stack you usually use')}</h3>
                      <div className="chips">
                        {profile.tech_stack_history.slice(0, 12).map((tk, i) => (
                          <span key={i} className="chip">{tk.value || tk} {tk.count ? <span className="meta">×{tk.count}</span> : null}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(profile.dont_use) && profile.dont_use.length > 0 && (
                    <div className="profile-section">
                      <h3>{t('sysdocs.profile.dont_use', "Don't-use (Sima won't propose)")}</h3>
                      <div className="chips">
                        {profile.dont_use.slice(0, 12).map((tk, i) => (
                          <span key={i} className="chip" style={{ borderColor: 'var(--st-fail)', color: 'var(--st-fail)' }}>
                            ✕ {tk.value || tk} {tk.reason ? <span className="meta">— {tk.reason}</span> : null}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(profile.lesson) && profile.lesson.length > 0 && (
                    <div className="profile-section">
                      <h3>{t('sysdocs.profile.lessons', 'Lessons from recent runs')}</h3>
                      <ul className="profile-lessons">
                        {profile.lesson.slice(0, 10).map((l, i) => (
                          <li key={i}>
                            {l.summary || l.note || JSON.stringify(l).slice(0, 200)}
                            {l.block && <span className="meta" style={{ fontSize: 10.5, marginLeft: 6 }}>· {l.block}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="profile-section">
                    <h3>{t('sysdocs.profile.raw', 'Raw data')}</h3>
                    <pre className="sysdocs-md" style={{ fontSize: 11 }}>{JSON.stringify(profile, null, 2)}</pre>
                  </div>
                  <div className="meta" style={{ fontSize: 11, marginTop: 10, padding: '0 18px' }}>
                    {t('sysdocs.profile.note', 'Sima uses this profile to bias «✨ Claude advice» (graph_overview / gallery) toward your preferences.')}
                  </div>
                </>
              )}
            </div>
          )}
          {tab === 'economics' && (
            <div className="econ-body">
              <div className="econ-head">
                <div className="acc-counts mono">
                  <span className="acc-pill">{t('sysdocs.economics.title', 'project-wide token spend')}</span>
                </div>
                <select value={econDays} onChange={(e) => setEconDays(Number(e.target.value))} className="econ-days">
                  <option value={7}>{t('sysdocs.economics.d7', 'last 7d')}</option>
                  <option value={30}>{t('sysdocs.economics.d30', 'last 30d')}</option>
                  <option value={90}>{t('sysdocs.economics.d90', 'last 90d')}</option>
                </select>
              </div>
              {!economics && <div className="meta" style={{ padding: 14 }}>{t('sysdocs.economics.loading', 'Loading…')}</div>}
              {economics && economics.totals && (() => {
                const fmtUsd = (n) => '$' + (Number(n) || 0).toFixed(4);
                const fmtTok = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n || 0);
                const tot = economics.totals;
                const daily = economics.daily || [];
                const maxDay = Math.max(1e-9, ...daily.map(d => d.cost_usd_equivalent || 0));
                return (
                  <>
                    {/* totals */}
                    <div className="econ-grid">
                      <div className="econ-tot"><div className="econ-num">{fmtUsd(tot.cost_usd_equivalent)}</div><div className="econ-lbl">{t('sysdocs.economics.equiv', 'equivalent (Haiku 4.5 list)')}</div></div>
                      <div className="econ-tot"><div className="econ-num">{fmtUsd(tot.cost_usd_actual)}</div><div className="econ-lbl">{t('sysdocs.economics.actual', 'actually charged')}</div></div>
                      <div className="econ-tot"><div className="econ-num">{fmtTok(tot.input_tokens + tot.output_tokens)}</div><div className="econ-lbl">{t('sysdocs.economics.tokens', 'tokens · {n} traces').replace('{n}', tot.trace_count)}</div></div>
                    </div>
                    {/* daily sparkline */}
                    {daily.length > 0 && (
                      <div className="profile-section">
                        <h3>{t('sysdocs.economics.daily', 'Daily spend (equivalent)')}</h3>
                        <div className="econ-spark" title={t('sysdocs.economics.spark_hint', 'cost_usd_equivalent per day')}>
                          {daily.map((d, i) => (
                            <div key={i} className="econ-spark-bar-wrap" title={`${d.key}: ${fmtUsd(d.cost_usd_equivalent)} · ${d.count} calls`}>
                              <div className="econ-spark-bar" style={{ height: `${Math.max(2, (d.cost_usd_equivalent / maxDay) * 100)}%` }} />
                            </div>
                          ))}
                        </div>
                        <div className="econ-spark-axis"><span>{daily[0]?.key}</span><span>{daily[daily.length - 1]?.key}</span></div>
                      </div>
                    )}
                    {/* top ops */}
                    {(economics.top_ops || []).length > 0 && (
                      <div className="profile-section">
                        <h3>{t('sysdocs.economics.top_ops', 'Top ops by cost')}</h3>
                        {economics.top_ops.slice(0, 8).map((o, i) => (
                          <div key={i} className="econ-row"><span className="econ-row-key">{o.key}</span><span className="econ-row-val">{fmtUsd(o.cost_usd_equivalent)} · {o.count} calls</span></div>
                        ))}
                      </div>
                    )}
                    {/* top blocks */}
                    {(economics.top_blocks || []).length > 0 && (
                      <div className="profile-section">
                        <h3>{t('sysdocs.economics.top_blocks', 'Top blocks by cost')}</h3>
                        {economics.top_blocks.slice(0, 8).map((b, i) => (
                          <div key={i} className="econ-row"><span className="econ-row-key">{b.key}</span><span className="econ-row-val">{fmtUsd(b.cost_usd_equivalent)} · {b.count} calls</span></div>
                        ))}
                      </div>
                    )}
                    {/* by provider */}
                    {(economics.by_provider || []).length > 0 && (
                      <div className="profile-section">
                        <h3>{t('sysdocs.economics.by_provider', 'By provider')}</h3>
                        {economics.by_provider.map((p, i) => (
                          <div key={i} className="econ-row"><span className="econ-row-key">{p.key}</span><span className="econ-row-val">{fmtUsd(p.cost_usd_actual)} actual / {fmtUsd(p.cost_usd_equivalent)} equiv · {p.count} calls</span></div>
                        ))}
                      </div>
                    )}
                    <div className="meta" style={{ fontSize: 11, marginTop: 10, padding: '0 4px' }}>
                      {t('sysdocs.economics.note', 'cost_usd_equivalent = what this would cost on Anthropic Haiku 4.5 list price — stable «shadow bill» across providers, visible even when you run on a subscription.')}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          {tab === 'autonomous' && (
            <div className="econ-body">
              <div className="acc-counts mono" style={{ marginBottom: 12 }}>
                <span className="acc-pill">{t('sysdocs.autonomous.title', 'autonomous loop (V-1)')}</span>
              </div>
              {!autoRun && <div className="meta" style={{ padding: 14 }}>{t('sysdocs.autonomous.loading', 'Loading…')}</div>}
              {autoRun && !autoRun.latest && (
                <div className="lesson" style={{ marginBottom: 12 }}>
                  {t('sysdocs.autonomous.none', 'No autonomous runs yet. Try a safe dry-run:')} <code>npm run loop</code>{' '}
                  {t('sysdocs.autonomous.none2', '· then print-only:')} <code>npm run loop:run</code>{' '}
                  {t('sysdocs.autonomous.none3', '· or real:')} <code>npm run loop:overnight</code>.
                </div>
              )}
              {autoRun && autoRun.latest && (
                <>
                  <div className="profile-section">
                    <h3>{t('sysdocs.autonomous.latest', 'Latest run')} <span className="meta" style={{ fontSize: 11 }}>{autoRun.latest.name.replace('.md', '')}</span></h3>
                    <pre className="sysdocs-md" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{autoRun.latest.content}</pre>
                  </div>
                  {autoRun.recent && autoRun.recent.length > 1 && (
                    <div className="profile-section">
                      <h3>{t('sysdocs.autonomous.recent', 'Recent runs')}</h3>
                      {autoRun.recent.map((r, i) => (
                        <div key={i} className="econ-row"><span className="econ-row-key">{r.replace('.md', '')}</span></div>
                      ))}
                    </div>
                  )}
                  <div className="meta" style={{ fontSize: 11, marginTop: 10, padding: '0 4px' }}>
                    {t('sysdocs.autonomous.note', 'V-1 walks the graph, runs a fresh agent on the next runnable block, verifies, and advances only if green (no regression). Default print-only — pass --agent claude for real autonomy. Schedule overnight via cron (see scripts/agent_loop_daemon.mjs header).')}
                  </div>
                </>
              )}
            </div>
          )}
          {tab === 'changesets' && (
            <div className="econ-body">
              <div className="acc-counts mono" style={{ marginBottom: 12 }}>
                <span className="acc-pill">{t('sysdocs.changesets.title', 'transactional change-sets (S-7)')}</span>
              </div>
              {!changeSets && <div className="meta" style={{ padding: 14 }}>{t('sysdocs.changesets.loading', 'Loading…')}</div>}
              {changeSets && changeSets.length === 0 && (
                <div className="lesson">{t('sysdocs.changesets.none', 'No change-sets. Group blocks touched by one cross-cutting change:')} <code>node scripts/change_set.mjs create --intent "..." --block b.x --block b.y</code></div>
              )}
              {changeSets && changeSets.map((cs) => (
                <div key={cs.id} className="profile-section cs-card">
                  <h3>
                    <span className={`cs-state cs-${cs.state}`}>{cs.state}</span> {cs.intent}
                  </h3>
                  <div className="meta" style={{ fontSize: 11, marginBottom: 6 }}>{cs.id} · {(cs.blocks || []).length} {t('sysdocs.changesets.blocks', 'block(s) touched by this transaction')}</div>
                  <div className="chips">
                    {(cs.blocks || []).map((b, i) => <span key={i} className="chip">{b}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === 'cleanup' && (
            <div className="econ-body">
              <div className="acc-counts mono" style={{ marginBottom: 12 }}>
                <span className="acc-pill">{t('sysdocs.cleanup.title', 'housekeeping proposals (S-12)')}</span>
                {cleanup && cleanup.generated_at && <span className="acc-pill">{t('sysdocs.cleanup.generated', 'swept')} {String(cleanup.generated_at).slice(0, 16).replace('T', ' ')}</span>}
              </div>
              {!cleanup && <div className="meta" style={{ padding: 14 }}>{t('sysdocs.cleanup.loading', 'Loading…')}</div>}
              {cleanup && (cleanup.proposals || []).length === 0 && (
                <div className="lesson">{t('sysdocs.cleanup.clean', '✓ Workspace is clean — no cleanup proposals. Re-sweep:')} <code>node scripts/housekeeping_sweeper.mjs</code></div>
              )}
              {cleanup && (cleanup.proposals || []).length > 0 && (() => {
                const grouped = {};
                for (const p of cleanup.proposals) (grouped[p.kind] = grouped[p.kind] || []).push(p);
                return Object.entries(grouped).map(([kind, list]) => (
                  <div key={kind} className="profile-section">
                    <h3>{kind} <span className="meta" style={{ fontSize: 11 }}>({list.length})</span></h3>
                    {list.slice(0, 20).map((p, i) => (
                      <div key={i} className="cleanup-row">
                        <div className="cleanup-file">{p.file}</div>
                        <div className="cleanup-reason meta">{p.reason}</div>
                        <code className="cleanup-cmd">{p.apply_command}</code>
                      </div>
                    ))}
                  </div>
                ));
              })()}
              <div className="meta" style={{ fontSize: 11, marginTop: 10, padding: '0 4px' }}>
                {t('sysdocs.cleanup.note', 'Proposals only — nothing is applied automatically. The apply tool MOVES files (with breadcrumb), never deletes. Run the apply-command for any you approve.')}
              </div>
            </div>
          )}
          {tab === 'docs' && openDocFor && (
            <>
              <div className="sysdocs-back-bar">
                <button className="pill" onClick={() => setOpenDocFor(null)}>{t('sysdocs.docs.back', '← list')}</button>
                <span className="mono" style={{ fontSize: 12 }}>{openDocFor}.md</span>
              </div>
              <div className="sysdocs-md contract-body md" dangerouslySetInnerHTML={{ __html: (window.marked?.parse?.(docContent || '') ?? docContent) }} />
            </>
          )}
        </div>
        {meta && meta.mtime && (
          <div className="sysdocs-foot">
            <span className="meta" style={{ fontSize: 11 }}>{t('sysdocs.foot_updated', 'updated:')} {String(meta.mtime).slice(0, 16).replace('T', ' ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ====================== PROPOSALS ======================
   Modal listing pending proposals (block_update + others) so the operator
   can accept/reject them. Backend endpoints live in atlas_api_server.mjs:
   /atlas/proposals/list (read), /proposals/accept, /proposals/reject.
*/
function ProposalsPanel({ onClose, onAfterAction }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
  const [items, setItems] = useStateV([]);
  const [loading, setLoading] = useStateV(true);
  const [busy, setBusy] = useStateV({});
  const [reason, setReason] = useStateV('');

  const refresh = async () => {
    setLoading(true);
    const r = await window.SIMA_API.meta.proposalsList();
    setItems(r?.ok ? r.items.filter((i) => !i.resolved && !i.accepted_at && !i.rejected_at) : []);
    setLoading(false);
  };
  useEffectV(() => { refresh(); }, []);

  const act = async (id, kind) => {
    setBusy((b) => ({ ...b, [id]: kind }));
    const r = kind === 'accept'
      ? await window.SIMA_API.meta.proposalAccept(id)
      : await window.SIMA_API.meta.proposalReject(id, reason || t('proposals.reject_default', 'rejected from UI'));
    setBusy((b) => { const c = { ...b }; delete c[id]; return c; });
    if (r?.ok) {
      onAfterAction && onAfterAction(kind, id);
      await refresh();
    }
  };

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box proposals-box" onClick={e => e.stopPropagation()}>
        <div className="sysdocs-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>{t('proposals.title', 'SIMA PROPOSALS')}</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>
              {loading ? t('proposals.loading', 'Loading…') : `${items.length} ${t('proposals.pending_suffix', 'pending')}`}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="pill" onClick={refresh}>{t('proposals.refresh', '↻ Refresh')}</button>
            <button className="pill" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="proposals-body">
          {!loading && !items.length && <div className="meta" style={{ padding: 14 }}>
            {t('proposals.empty', 'No open proposals. Sima adds them automatically based on chat distillates, sync-check, and other processes.')}
          </div>}
          {items.map((p) => (
            <div key={p.id} className="proposal-card">
              <div className="proposal-card-head">
                <span className="mono" style={{ fontSize: 10.5 }}>{p.kind}</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                  {p.block_id} · conf {((p.source?.confidence || 0) * 100).toFixed(0)}% · {p.source?.provider}
                </span>
              </div>
              {p.diff_summary && <div style={{ fontSize: 12.5, marginTop: 4 }}>{p.diff_summary}</div>}
              {p.proposed && (
                <pre className="proposal-diff">{
                  Object.entries(p.proposed).map(([k, v]) => `+ ${k}: ${typeof v === 'string' ? v : JSON.stringify(v).slice(0, 140)}`).join('\n')
                }</pre>
              )}
              <div className="proposal-actions">
                <button className="pill primary" disabled={!!busy[p.id]} onClick={() => act(p.id, 'accept')}>
                  {busy[p.id] === 'accept' ? t('proposals.applying', 'applying…') : t('proposals.accept', '✓ accept')}
                </button>
                <button className="pill" disabled={!!busy[p.id]} onClick={() => act(p.id, 'reject')}>
                  {busy[p.id] === 'reject' ? t('proposals.rejecting', 'rejecting…') : t('proposals.reject', '✗ reject')}
                </button>
              </div>
            </div>
          ))}
        </div>
        {items.length > 0 && (
          <div className="sysdocs-foot">
            <input
              className="composer-input"
              placeholder={t('proposals.reason_placeholder', 'Rejection reason (default)')}
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{ maxWidth: 360 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ====================== SCHEMA TEMPLATES (Phase F-5) ======================
   Pre-baked schemas (book / idea / marketing / product) — pick one,
   choose a prefix, click Apply → backend creates all blocks + edges
   atomically. Used to bootstrap a new product / project quickly.
*/
function TemplatesPanel({ onClose, onApplied }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
  const [items, setItems] = useStateV([]);
  const [loading, setLoading] = useStateV(true);
  const [picked, setPicked] = useStateV(null);
  const [prefix, setPrefix] = useStateV('');
  const [busy, setBusy] = useStateV(false);
  const [result, setResult] = useStateV(null);
  // K3 — snapshot current graph as new template
  const [snapMode, setSnapMode] = useStateV(false);
  const [snapId, setSnapId] = useStateV('');
  const [snapTitle, setSnapTitle] = useStateV('');
  const [snapDesc, setSnapDesc] = useStateV('');
  const [snapBusy, setSnapBusy] = useStateV(false);
  const [snapResult, setSnapResult] = useStateV(null);

  const refresh = async () => {
    const r = await window.SIMA_API.templates.list();
    if (r?.ok) setItems(r.templates || []);
  };
  const doSnapshot = async () => {
    if (!snapId.trim()) { setSnapResult({ ok: false, error: t('templates.snap_id_required', 'specify id') }); return; }
    setSnapBusy(true); setSnapResult(null);
    const r = await window.SIMA_API.templates.snapshot({
      template_id: snapId.trim(),
      title: snapTitle.trim() || snapId.trim(),
      description: snapDesc.trim() || undefined,
      overwrite: snapResult?.error?.includes('exists') ? true : undefined,
    });
    setSnapBusy(false);
    setSnapResult(r);
    if (r?.ok) {
      await refresh();
      setSnapMode(false); setSnapId(''); setSnapTitle(''); setSnapDesc('');
    }
  };

  useEffectV(() => {
    let alive = true;
    (async () => {
      await refresh();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line
  }, []);

  const apply = async () => {
    if (!picked) return;
    setBusy(true); setResult(null);
    const r = await window.SIMA_API.templates.apply(picked.id, prefix.trim() || picked.id);
    setBusy(false);
    setResult(r);
    if (r?.ok && onApplied) onApplied(r);
  };

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box templates-box" onClick={e => e.stopPropagation()}>
        <div className="sysdocs-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>{t('templates.title', 'SCHEMA TEMPLATES')}</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>
              {t('templates.subtitle', 'Ready-made skeletons — or save your graph as a template')}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="pill" onClick={() => setSnapMode((s) => !s)} title={t('templates.snapshot_title', 'Save the entire current graph as a new template')}>
              {snapMode ? t('templates.snapshot_cancel', '✕ Cancel') : t('templates.snapshot_btn', '＋ Snapshot graph')}
            </button>
            <button className="pill" onClick={onClose}>✕</button>
          </div>
        </div>
        {snapMode && (
          <div className="snap-form">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="composer-input"
                placeholder={t('templates.snap_id', 'template id (a-z0-9-)')}
                value={snapId}
                onChange={(e) => setSnapId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                style={{ maxWidth: 220 }}
              />
              <input
                className="composer-input"
                placeholder={t('templates.snap_title', 'Title (visible in templates gallery)')}
                value={snapTitle}
                onChange={(e) => setSnapTitle(e.target.value)}
                style={{ flex: 1, minWidth: 220 }}
              />
            </div>
            <input
              className="composer-input"
              placeholder={t('templates.snap_desc', 'Short description — what is this template for')}
              value={snapDesc}
              onChange={(e) => setSnapDesc(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="pill primary" onClick={doSnapshot} disabled={snapBusy || !snapId.trim()}>
                {snapBusy ? t('templates.snap_busy', 'snapshotting…') : t('templates.snap_save', '💾 Save as template')}
              </button>
              <span className="meta" style={{ fontSize: 11.5 }}>
                {t('templates.snap_hint', 'Counts all live blocks of the current graph + their mission/kpi/acceptance + edges.')}
              </span>
              {snapResult && (
                <span className={`composer-result ${snapResult.ok ? 'ok' : 'fail'}`} style={{ padding: '4px 10px' }}>
                  {snapResult.ok
                    ? <>{t('templates.snap_created', '✓ created:')} {snapResult.blocks_count} {t('templates.snap_blocks', 'blocks,')} {snapResult.edges_count} {t('templates.snap_edges', 'edges')}</>
                    : <>✗ {snapResult.error}{snapResult.error?.includes('exists') ? ` ${t('templates.snap_overwrite_hint', '(click again to overwrite)')}` : ''}</>}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="templates-body">
          {loading && <div className="meta" style={{ padding: 14 }}>{t('templates.loading', 'Loading…')}</div>}
          {!loading && !items.length && <div className="meta" style={{ padding: 14 }}>
            {t('templates.empty', 'No templates found. Drop JSON files into atlas/schema_templates/.')}
          </div>}
          {!loading && items.map((tpl) => (
            <div
              key={tpl.id}
              className={`template-card ${picked?.id === tpl.id ? 'picked' : ''}`}
              onClick={() => setPicked(tpl)}
            >
              <div className="template-card-head">
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{tpl.id}</span>
                <span className="meta" style={{ fontSize: 11 }}>{tpl.blocks_count} {t('templates.blocks_count', 'blocks')}</span>
              </div>
              <div className="template-title">{tpl.title}</div>
              <div className="template-desc">{tpl.description}</div>
            </div>
          ))}
        </div>
        {picked && (
          <div className="templates-foot">
            <span className="meta" style={{ fontSize: 12 }}>{t('templates.prefix_label', 'ID prefix:')}</span>
            <input
              className="composer-input"
              placeholder={picked.id}
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.replace(/[^a-z0-9-]/g, ''))}
              style={{ maxWidth: 180 }}
            />
            <span className="meta mono" style={{ fontSize: 10.5 }}>
              {t('templates.prefix_hint_pre', 'blocks will get id b.')}{(prefix || picked.id)}{t('templates.prefix_hint_post', '-<suffix>')}
            </span>
            <button className="pill primary" onClick={apply} disabled={busy}>
              {busy ? t('templates.applying', 'applying…') : t('templates.apply', '＋ Apply template')}
            </button>
            {result && (
              <span className={`composer-result ${result.ok ? 'ok' : 'fail'}`} style={{ padding: '4px 10px' }}>
                {result.ok
                  ? <>{t('templates.apply_created', '✓ created')} {result.created.length}{result.skipped.length ? `, ${t('templates.apply_skipped', 'skipped')} ${result.skipped.length}` : ''}</>
                  : <>✗ {result.error}</>}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ====================== SYNC REPORT (Phase O-1) ======================
   Replaces the editorial «1 рассинхрон» mock animation with a real
   structured drift report: each block classified ✓ ok / ⚠ drift /
   ✗ broken with the actual reason, plus per-validator pass/fail.
   Combines schema-syncer (deterministic validators) + verifier --all
   (LLM-judge mission vs reality).
*/
function SyncReportPanel({ onClose, onJumpToBlock, autoVerifier = false }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
  const [busy, setBusy] = useStateV(false);
  const [withVerifier, setWithVerifier] = useStateV(autoVerifier);
  const [report, setReport] = useStateV(null);     // schema-syncer result
  const [verifier, setVerifier] = useStateV(null); // verifier --all result
  const [tab, setTab] = useStateV('overview');     // overview | validators | blocks
  const [error, setError] = useStateV(null);

  const run = async () => {
    setBusy(true); setError(null); setReport(null); setVerifier(null);
    try {
      const r1 = await window.SIMA_API.meta.subagentRun('schema-syncer');
      setReport(r1.result || r1);
      if (withVerifier) {
        const r2 = await window.SIMA_API.meta.subagentRun('verifier');
        setVerifier(r2.result || r2);
      }
    } catch (e) {
      setError(String(e.message || e));
    }
    setBusy(false);
  };

  // Phase P-2.2: when invoked from «Ревью продукта», auto-run on mount
  // with LLM-judge already on. The flag pre-checked from the prop;
  // we kick off `run` as soon as the modal mounts.
  useEffectV(() => {
    if (autoVerifier) run();
    // eslint-disable-next-line
  }, []);

  // Combined per-block status: deterministic verdict from schema-syncer
  // (drift_blocks / broken_blocks lists), enriched with LLM-judge verdict
  // from verifier when available.
  const combined = (() => {
    if (!report) return null;
    const broken = new Set((report.broken_blocks || []).map((b) => b.block_id));
    const drift  = new Set((report.drift_blocks  || []).map((b) => b.block_id));
    const reasons = {};
    for (const b of (report.broken_blocks || [])) reasons[b.block_id] = { kind: 'broken', reason: b.reason };
    for (const b of (report.drift_blocks  || [])) reasons[b.block_id] = { kind: 'drift',  reason: b.reason };
    const llmByBlock = {};
    if (verifier?.blocks) {
      for (const v of verifier.blocks) {
        llmByBlock[v.block_id] = {
          verdict: v.verdict,
          summary: v.validation?.summary || '',
          violations: v.validation?.violations || [],
        };
        // Promote LLM-only finds: if not flagged by deterministic but LLM says broken/drift
        if (v.verdict === 'broken' && !broken.has(v.block_id)) {
          broken.add(v.block_id);
          reasons[v.block_id] = { kind: 'broken', reason: 'LLM: ' + (v.validation?.summary || 'mission mismatch') };
        } else if (v.verdict === 'drift' && !drift.has(v.block_id) && !broken.has(v.block_id)) {
          drift.add(v.block_id);
          reasons[v.block_id] = { kind: 'drift', reason: 'LLM: ' + (v.validation?.summary || 'partial alignment') };
        }
      }
    }
    return { broken: [...broken], drift: [...drift], reasons, llm: llmByBlock };
  })();

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box sync-report-box" onClick={(e) => e.stopPropagation()}>
        <div className="sysdocs-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>{t('sync.title', 'SYNC REPORT')}</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>
              {t('sync.subtitle', 'What\'s synced, drifting, or broken')}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label className="meta" style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={withVerifier} onChange={(e) => setWithVerifier(e.target.checked)} />
              {t('sync.with_llm', '+ LLM judge (slower)')}
            </label>
            <button className="pill primary" onClick={run} disabled={busy}>{busy ? t('sync.computing', 'computing…') : t('sync.run', '▶ run')}</button>
            <button className="pill" onClick={onClose}>✕</button>
          </div>
        </div>
        {error && <div className="composer-result fail" style={{ margin: '8px 18px 0' }}>{error}</div>}
        {!report && !busy && (
          <div className="meta" style={{ padding: '20px 18px', fontSize: 13 }}>
            {t('sync.intro', 'Press ▶ run for Sima to execute 9 validators across all blocks and produce a structured drift report. Enable the LLM judge to additionally check that implementation matches mission / KPI / acceptance / conditions of each block.')}
          </div>
        )}
        {busy && <div className="meta" style={{ padding: 14 }}>{withVerifier ? t('sync.busy_with_llm', 'Running validators + LLM judge (may take 10-60s)…') : t('sync.busy', 'Running validators…')}</div>}
        {report && (
          <>
            <div className="acc-summary" style={{ margin: '14px 18px 0' }}>
              <div className="acc-counts mono">
                <span className="acc-pill ok">✓ {t('sync.ok', 'ok')} {report.summary?.ok ?? 0}</span>
                <span className="acc-pill" style={{ background: 'rgba(220, 150, 60, 0.18)', color: '#7a4a00' }}>⚠ {t('sync.drift', 'drift')} {combined?.drift.length ?? 0}</span>
                <span className="acc-pill bad">✗ {t('sync.broken', 'broken')} {combined?.broken.length ?? 0}</span>
                <span className="acc-pill mono">{t('sync.validators', 'validators')} {report.summary?.validators_pass}/{report.summary?.validators_total}</span>
                <span className="acc-pill mono">{report.duration_ms}ms</span>
              </div>
            </div>
            <div className="tabs" style={{ padding: '12px 18px 0' }}>
              <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>{t('sync.tab.overview', 'Overview')}</button>
              <button className={tab === 'blocks' ? 'active' : ''} onClick={() => setTab('blocks')}>{t('sync.tab.blocks', 'By blocks')}</button>
              <button className={tab === 'validators' ? 'active' : ''} onClick={() => setTab('validators')}>{t('sync.tab.validators', 'Validators')}</button>
            </div>
            <div className="sync-report-body">
              {tab === 'overview' && (
                <>
                  {combined?.broken.length === 0 && combined?.drift.length === 0 && (
                    <div className="lesson good" style={{ marginTop: 0 }}>
                      <div className="verdict">{t('sync.all_synced', '✓ all in sync')}</div>
                      {t('sync.all_passed_prefix', 'All')} {report.summary?.total_blocks} {t('sync.all_passed_suffix', 'blocks passed.')}
                      {!withVerifier && t('sync.all_passed_hint', ' Enable the LLM judge to additionally verify meaning (mission vs implementation).')}
                    </div>
                  )}
                  {combined?.broken.length > 0 && (
                    <>
                      <h3 style={{ color: 'var(--st-fail)' }}>{t('sync.broken_heading', '✗ Broken')} ({combined.broken.length})</h3>
                      {combined.broken.map((bid) => (
                        <div key={bid} className="sync-block-row v-bad" onClick={() => onJumpToBlock?.(bid)}>
                          <span className="mono" style={{ flex: 1 }}>{bid}</span>
                          <span className="meta" style={{ fontSize: 11.5 }}>{combined.reasons[bid]?.reason}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {combined?.drift.length > 0 && (
                    <>
                      <h3 style={{ color: '#7a4a00' }}>{t('sync.drift_heading', '⚠ Drift')} ({combined.drift.length})</h3>
                      {combined.drift.map((bid) => (
                        <div key={bid} className="sync-block-row v-warn" onClick={() => onJumpToBlock?.(bid)}>
                          <span className="mono" style={{ flex: 1 }}>{bid}</span>
                          <span className="meta" style={{ fontSize: 11.5 }}>{combined.reasons[bid]?.reason}</span>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
              {tab === 'blocks' && (
                <>
                  {!verifier && (
                    <div className="meta" style={{ marginBottom: 10 }}>
                      {t('sync.enable_llm_hint', 'Enable «+ LLM judge» to get mission-vs-implementation per block here.')}
                    </div>
                  )}
                  {verifier?.blocks?.length > 0 && verifier.blocks.map((b) => {
                    const cls = b.verdict === 'aligned' ? 'ok' : b.verdict === 'broken' ? 'bad' : 'warn';
                    return (
                      <div key={b.block_id} className={`sync-block-card v-${cls}`} onClick={() => onJumpToBlock?.(b.block_id)}>
                        <div className="sync-block-card-head">
                          <span className="mono" style={{ flex: 1 }}>{b.block_id}</span>
                          <span className={`acc-pill ${cls === 'ok' ? 'ok' : cls === 'bad' ? 'bad' : 'skip'}`}>{b.verdict}</span>
                        </div>
                        {b.validation?.summary && <div style={{ fontSize: 12.5, marginTop: 4 }}>{b.validation.summary}</div>}
                        {b.validation?.violations?.length > 0 && (
                          <ul className="sync-violations">
                            {b.validation.violations.slice(0, 5).map((v, i) => (
                              <li key={i}><span className="mono">[{v.kind}]</span> <span style={{ color: v.severity === 'high' ? 'var(--st-fail)' : v.severity === 'med' ? '#7a4a00' : 'var(--ink-3)' }}>{v.evidence}</span></li>
                            ))}
                          </ul>
                        )}
                        {b.acceptance?.verdict && (
                          <div className="meta" style={{ fontSize: 11, marginTop: 4 }}>
                            acceptance: {b.acceptance.verdict}
                            {b.acceptance.counts && ` (${b.acceptance.counts.pass}/${(b.acceptance.counts.pass||0)+(b.acceptance.counts.fail||0)+(b.acceptance.counts.skipped||0)})`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
              {tab === 'validators' && (
                <div className="sync-validators-list">
                  {report.validators.map((v) => (
                    <div key={v.name} className={`sync-block-row v-${v.ok ? 'ok' : 'bad'}`}>
                      <span className="mono" style={{ minWidth: 200 }}>{v.ok ? '✓' : '✗'} {v.name}</span>
                      <span className="meta" style={{ fontSize: 11.5, flex: 1 }}>{v.summary || `exit ${v.exit}`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ====================== ARCHITECTURE REVIEW (Phase Q-3) ============
   Whole-product architectural review. Per-block N1 catches local
   alignment issues; this surfaces SYSTEMIC concerns: stack consistency
   across blocks, scalability under stated load, multi-tenant fit,
   data-flow gaps, security between blocks, redundant blocks, missing
   blocks. Persisted to atlas/architecture_reviews/_latest.json.
*/
function ArchReviewPanel({ onClose, onJumpToBlock }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
  const [latest, setLatest] = useStateV(null);
  const [busy, setBusy] = useStateV(false);
  const [error, setError] = useStateV(null);

  const loadLatest = async () => {
    const r = await window.SIMA_API.synthesis.architectureReviewLatest();
    if (r?.ok) setLatest(r);
  };
  useEffectV(() => { loadLatest(); /* eslint-disable-next-line */ }, []);

  const run = async () => {
    setBusy(true); setError(null);
    const r = await window.SIMA_API.synthesis.architectureReview();
    setBusy(false);
    if (!r?.ok) { setError(r?.error || 'failed'); return; }
    setLatest(r);
  };

  const verdictClass = latest?.verdict === 'aligned' ? 'ok' : latest?.verdict === 'broken' ? 'bad' : 'warn';
  const verdictLabel = {
    aligned: t('arch.verdict_aligned', '✓ architecture is consistent'),
    drift:   t('arch.verdict_drift', '⚠ concerns found'),
    broken:  t('arch.verdict_broken', '✗ serious problems'),
  }[latest?.verdict] || latest?.verdict;

  const KIND_LABEL = {
    stack_consistency: t('arch.kind.stack_consistency', 'Inconsistent stack'),
    scalability:       t('arch.kind.scalability', 'Scalability'),
    multi_tenant:      t('arch.kind.multi_tenant', 'Multi-tenant'),
    data_flow:         t('arch.kind.data_flow', 'Data flow'),
    security:          t('arch.kind.security', 'Security'),
    missing_block:     t('arch.kind.missing_block', 'Missing block'),
    redundancy:        t('arch.kind.redundancy', 'Redundancy'),
    condition:         t('arch.kind.condition', 'Project condition'),
  };

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box arch-review-box" onClick={(e) => e.stopPropagation()}>
        <div className="sysdocs-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>{t('arch.title', 'ARCHITECTURE · WHOLE PRODUCT')}</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>
              {t('arch.subtitle', 'Framework consistency, scale, data flow')}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="pill primary" onClick={run} disabled={busy}>{busy ? t('arch.analyzing', 'analyzing…') : t('arch.run', '▶ run')}</button>
            <button className="pill" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="sync-report-body">
          {error && <div className="composer-result fail">{error}</div>}
          {!latest && !busy && (
            <div className="meta" style={{ padding: 14, fontSize: 13 }}>
              {t('arch.description', 'Sima will read project.md + rules.md + tech_stack.md + each block\'s mission + edges — and surface system-level concerns: stack consistency, scale under load, multi-tenant fit, data flow, security, redundancy, missing blocks. This is separate from per-block validation — that\'s local, this is systemic.')}
            </div>
          )}
          {busy && <div className="meta" style={{ padding: 14 }}>{t('arch.analyzing_long', 'LLM analyzing architecture (10–60s)…')}</div>}
          {latest && (
            <>
              <div className={`acc-summary acc-${verdictClass}`}>
                <div className="acc-verdict">{verdictLabel}</div>
                {latest.summary && <div style={{ fontSize: 13, marginTop: 6 }}>{latest.summary}</div>}
                <div className="acc-counts mono" style={{ marginTop: 8 }}>
                  {latest.concerns?.length > 0 && <span className="acc-pill bad">concerns {latest.concerns.length}</span>}
                  {latest.strengths?.length > 0 && <span className="acc-pill ok">strengths {latest.strengths.length}</span>}
                  {latest.block_count && <span className="acc-pill mono">blocks {latest.block_count}</span>}
                  {latest.checked_at && <span className="acc-pill mono">{String(latest.checked_at).slice(0, 16).replace('T', ' ')}</span>}
                  {latest.mock && <span className="acc-pill" style={{ background: 'var(--card-2)' }}>demo</span>}
                </div>
              </div>
              {latest.concerns?.length > 0 && (
                <>
                  <h3>{t('arch.concerns', 'Concerns')}</h3>
                  <div className="arch-cards">
                    {latest.concerns.map((c, i) => (
                      <div key={i} className={`arch-card sev-${c.severity || 'low'}`}>
                        <div className="arch-card-head">
                          <div className="arch-card-kind">{KIND_LABEL[c.kind] || c.kind}</div>
                          <span className={`val-sev sev-${c.severity || 'low'}`}>{c.severity || 'low'}</span>
                        </div>
                        <div className="arch-card-body">
                          <div className="arch-section">
                            <div className="arch-section-label">{t('arch.what_wrong', 'what\'s wrong')}</div>
                            <div className="arch-section-text">{c.evidence}</div>
                          </div>
                          {c.fix && (
                            <div className="arch-section arch-fix">
                              <div className="arch-section-label">{t('arch.how_fix', 'how to fix')}</div>
                              <div className="arch-section-text">{c.fix}</div>
                            </div>
                          )}
                          {c.blocks?.length > 0 && (
                            <div className="arch-section">
                              <div className="arch-section-label">{t('arch.affects_blocks', 'affects blocks')}</div>
                              <div className="arch-blocks-row">
                                {c.blocks.map((b) => (
                                  <span key={b} className="arch-block-chip mono" onClick={(e) => { e.stopPropagation(); onJumpToBlock?.(b); }}>{b}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {latest.strengths?.length > 0 && (
                <>
                  <h3>{t('arch.strengths', 'Strengths')}</h3>
                  <div className="arch-strengths">
                    {latest.strengths.map((s, i) => (
                      <div key={i} className="arch-strength-row">
                        <span className="arch-strength-mark">✓</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================== SUBAGENTS (Phase N-3) ======================
   Three Cursor-style subagents callable from one panel:
     schema-syncer — drift report on the whole atlas
     verifier      — acceptance + LLM-validator combined
     wiki-builder  — regenerate WIKI / wiki.html / roadmap / auto_tz
   Same scripts are MCP-callable via sima-atlas server (subagent_*).
*/
function SubagentsPanel({ onClose, currentBlockId }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
  const [results, setResults] = useStateV({}); // { name: result }
  const [busy, setBusy] = useStateV({});

  const run = async (name, body) => {
    setBusy((b) => ({ ...b, [name]: true }));
    const r = await window.SIMA_API.meta.subagentRun(name, body);
    setBusy((b) => { const c = { ...b }; delete c[name]; return c; });
    setResults((R) => ({ ...R, [name]: r }));
  };

  const renderResult = (name) => {
    const r = results[name];
    if (!r) return null;
    const result = r.result || r;
    return (
      <div className={`composer-result ${r.ok ? 'ok' : 'fail'}`} style={{ marginTop: 8 }}>
        {name === 'schema-syncer' && result.summary && (
          <>
            <strong>{result.summary.ok}/{result.summary.total_blocks}</strong> ok ·
            <strong style={{ color: result.summary.broken ? 'var(--st-fail)' : 'inherit', marginLeft: 6 }}>{result.summary.broken}</strong> broken ·
            <strong style={{ color: result.summary.drift ? 'var(--st-progress)' : 'inherit', marginLeft: 6 }}>{result.summary.drift}</strong> drift ·
            validators {result.summary.validators_pass}/{result.summary.validators_total}
            {result.broken_blocks?.length > 0 && (
              <ul style={{ margin: '6px 0 0 18px', fontSize: 11.5 }}>
                {result.broken_blocks.map((b, i) => <li key={i}>✗ <span className="mono">{b.block_id}</span> — {b.reason}</li>)}
              </ul>
            )}
            {result.drift_blocks?.length > 0 && (
              <ul style={{ margin: '6px 0 0 18px', fontSize: 11.5 }}>
                {result.drift_blocks.map((b, i) => <li key={i}>⚠ <span className="mono">{b.block_id}</span> — {b.reason}</li>)}
              </ul>
            )}
          </>
        )}
        {name === 'verifier' && (result.verdict || result.block_count) && (
          <>
            {result.block_count
              ? <>verifier (all): <strong>{result.aligned}</strong> aligned · <strong>{result.drift}</strong> drift · <strong>{result.broken}</strong> broken / {result.block_count} blocks</>
              : <>{result.block_id}: <strong>{result.verdict}</strong>{result.validation?.summary && ` — ${result.validation.summary}`}</>}
          </>
        )}
        {name === 'wiki-builder' && result.steps && (
          <>
            <strong>{result.steps.filter(s => s.ok).length}/{result.steps.length}</strong> steps in {result.duration_ms}ms
            <ul style={{ margin: '6px 0 0 18px', fontSize: 11 }}>
              {result.steps.map((s, i) => <li key={i}>{s.ok ? '✓' : '✗'} {s.name}</li>)}
            </ul>
          </>
        )}
        {!r.ok && r.error && <div style={{ marginTop: 4 }}>{r.error}</div>}
      </div>
    );
  };

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box subagents-box" onClick={(e) => e.stopPropagation()}>
        <div className="sysdocs-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>{t('subagents.title', 'SUBAGENTS')}</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>
              {t('subagents.subtitle', 'The same scripts wired to Cursor / MCP — now at your fingertips')}
            </h3>
          </div>
          <button className="pill" onClick={onClose}>✕</button>
        </div>
        <div className="subagents-body">
          <div className="subagent-card">
            <div className="subagent-card-head">
              <div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>schema-syncer · b.core-sync</div>
                <h4 style={{ margin: '2px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 16 }}>
                  {t('subagents.schema.title', 'Full drift report across the graph')}
                </h4>
              </div>
              <button className="pill primary" onClick={() => run('schema-syncer')} disabled={!!busy['schema-syncer']}>
                {busy['schema-syncer'] ? t('subagents.busy', 'running…') : t('subagents.run', '▶ run')}
              </button>
            </div>
            <div className="meta" style={{ fontSize: 12, marginTop: 6 }}>
              {t('subagents.schema.desc_pre', 'Runs 9 validators (rules / tech_stack / dependency contracts / acceptance / cursor-hooks / agent parity / parity matrix / placeholders / projects). Returns')} <code>ok / drift / broken</code> {t('subagents.schema.desc_post', 'breakdown with the reason for each block.')}
            </div>
            {renderResult('schema-syncer')}
          </div>

          <div className="subagent-card">
            <div className="subagent-card-head">
              <div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>verifier · b.acceptance-verifier-loop</div>
                <h4 style={{ margin: '2px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 16 }}>
                  {t('subagents.verifier.title', 'Acceptance + LLM judge (mission vs implementation)')}
                </h4>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {currentBlockId && currentBlockId.startsWith('b.') && (
                  <button className="pill" onClick={() => run('verifier', { block_id: currentBlockId })} disabled={!!busy['verifier']}>
                    {busy['verifier'] ? t('subagents.busy', 'running…') : `▶ ${currentBlockId}`}
                  </button>
                )}
                <button className="pill primary" onClick={() => run('verifier')} disabled={!!busy['verifier']}>
                  {busy['verifier'] ? t('subagents.busy', 'running…') : t('subagents.run_all', '▶ all blocks')}
                </button>
              </div>
            </div>
            <div className="meta" style={{ fontSize: 12, marginTop: 6 }}>
              {t('subagents.verifier.desc_pre', 'Runs')} <code>verify_block_acceptance.mjs</code> {t('subagents.verifier.desc_mid', '+')} <code>validateBlock</code> {t('subagents.verifier.desc_post', 'LLM judge, merges into one verdict')} <code>aligned / drift / broken</code>.
            </div>
            {renderResult('verifier')}
          </div>

          <div className="subagent-card">
            <div className="subagent-card-head">
              <div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>wiki-builder · b.docs</div>
                <h4 style={{ margin: '2px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 16 }}>
                  {t('subagents.wiki.title', 'Rebuild WIKI / wiki.html / roadmap / auto_tz')}
                </h4>
              </div>
              <button className="pill primary" onClick={() => run('wiki-builder')} disabled={!!busy['wiki-builder']}>
                {busy['wiki-builder'] ? t('subagents.busy', 'running…') : t('subagents.rebuild', '▶ rebuild')}
              </button>
            </div>
            <div className="meta" style={{ fontSize: 12, marginTop: 6 }}>
              {t('subagents.wiki.desc', 'Idempotent — safe to call after every block edit.')}
            </div>
            {renderResult('wiki-builder')}
          </div>
        </div>
        <div className="sysdocs-foot">
          <span className="meta" style={{ fontSize: 11 }}>
            {t('subagents.foot_pre', 'The same subagents are available to Cursor via')} <code>.cursor/agents.json</code> {t('subagents.foot_mid', 'and to MCP clients as')} <code>subagent_*</code> {t('subagents.foot_post', 'tools.')}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ====================== HELPERS ====================== */
function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

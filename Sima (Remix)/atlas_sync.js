// atlas_sync.js — lightweight Atlas state + sync checks for architecture blocks
(function initAtlasSync(global){
  const STORAGE_KEY = 'sima.atlas.v1';

  function nowIso(){ return new Date().toISOString(); }

  function buildDefaultAtlas(arch){
    const blocks = {};
    (arch?.blocks || []).forEach((b) => {
      blocks[b.id] = {
        id: b.id,
        title: b.title,
        mission: b.note || '',
        stack: 'react',
        tasks: [
          { id: 't1', title: 'Уточнить миссию блока', done: false },
          { id: 't2', title: 'Зафиксировать контракты depends/provides', done: false },
        ],
        kpi: [
          { id: 'k1', title: 'Есть минимум 1 пройденная проверка', passed: false },
        ],
        checks: [],
        dependsOn: [],
        provides: [],
        files: [],
      };
    });
    return {
      version: 1,
      updatedAt: nowIso(),
      techStack: ['react', 'typescript'],
      rules: ['single-source-of-truth', 'no-dead-files-in-active-flow'],
      blocks,
      filesRegistry: {},
    };
  }

  function loadAtlas(projectId, arch){
    const key = STORAGE_KEY + '.' + projectId;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const existingIds = new Set(Object.keys(parsed.blocks || {}));
        (arch?.blocks || []).forEach((b) => {
          if (!existingIds.has(b.id)) {
            parsed.blocks[b.id] = {
              id: b.id, title: b.title, mission: b.note || '', stack: 'react',
              tasks: [], kpi: [], checks: [], dependsOn: [], provides: [], files: [],
            };
          }
        });
        return parsed;
      }
    } catch (e) {}
    return buildDefaultAtlas(arch);
  }

  function saveAtlas(projectId, atlas){
    const key = STORAGE_KEY + '.' + projectId;
    const payload = { ...atlas, updatedAt: nowIso() };
    localStorage.setItem(key, JSON.stringify(payload));
    return payload;
  }

  function blockProgress(block){
    const tasksTotal = block.tasks.length;
    const tasksDone = block.tasks.filter(t => t.done).length;
    const kpiTotal = block.kpi.length;
    const kpiPassed = block.kpi.filter(k => k.passed).length;
    return { tasksDone, tasksTotal, kpiPassed, kpiTotal };
  }



  const TRANSITIONS = {
    idea: ['wip'],
    wip: ['review', 'broken'],
    review: ['done', 'wip', 'broken'],
    done: ['wip'],
    broken: ['wip'],
  };

  function canTransition(from, to){
    return (TRANSITIONS[from] || []).includes(to);
  }

  function transitionBlock(atlas, blockId, to, meta = {}){
    const block = ensureBlock(atlas, blockId);
    const from = block.status || 'idea';
    if (!canTransition(from, to)) {
      return { ok:false, error:`invalid transition ${from} -> ${to}` };
    }
    block.status = to;
    atlas.transitions = atlas.transitions || [];
    atlas.transitions.push({ at: nowIso(), blockId, from, to, ...meta });
    return { ok:true, from, to };
  }

  function ensureBlock(atlas, blockId, fallbackTitle=''){
    atlas.blocks = atlas.blocks || {};
    if (!atlas.blocks[blockId]) {
      atlas.blocks[blockId] = {
        id: blockId,
        title: fallbackTitle || blockId,
        mission: '', stack: 'react', tasks: [], kpi: [], checks: [], dependsOn: [], provides: [], files: []
      };
    }
    return atlas.blocks[blockId];
  }

  function logCheck(atlas, blockId, check){
    const block = ensureBlock(atlas, blockId);
    block.checks = block.checks || [];
    block.checks.push({ at: nowIso(), ...check });
    return atlas;
  }

  function renderFilesMd(atlas, blockId){
    const block = ensureBlock(atlas, blockId);
    const rows = (block.files || []).map((f) => {
      const meta = atlas.filesRegistry?.[f] || {};
      const status = meta.status || 'unknown';
      const reason = meta.reason ? ` — ${meta.reason}` : '';
      return `- ${f} [${status}]${reason}`;
    });
    return `# ${blockId} — files

${rows.length ? rows.join('\n') : '- none'}\n`;
  }

  function refreshBlockFilesMd(atlas, blockId){
    const block = ensureBlock(atlas, blockId);
    block.filesMd = renderFilesMd(atlas, blockId);
    return block.filesMd;
  }

  function markFileStatus(atlas, filePath, status, reason='', blockId=null){
    atlas.filesRegistry = atlas.filesRegistry || {};
    atlas.filesRegistry[filePath] = { status, reason, blockId, at: nowIso() };
    if (blockId) {
      const block = ensureBlock(atlas, blockId);
      block.files = Array.from(new Set([...(block.files||[]), filePath]));
      refreshBlockFilesMd(atlas, blockId);
    }
    return atlas;
  }

  function buildContextPack(atlas, arch, blockId){
    const graph = Object.fromEntries((arch.blocks||[]).map(b => [b.id, b]));
    const target = atlas.blocks?.[blockId];
    if (!target) return null;
    const deps = (target.dependsOn || []).map(id => ({ id, block: atlas.blocks[id] || null, arch: graph[id] || null }));
    return {
      generatedAt: nowIso(),
      project: { rules: atlas.rules || [], techStack: atlas.techStack || [] },
      block: target,
      dependencies: deps,
    };
  }


  function hasPassingCheck(block, kind){
    return (block.checks || []).some(c => c.kind === kind && c.result === 'pass');
  }

  function validateDependencyContracts(atlas, block){
    const issues = [];
    (block.dependsOn || []).forEach((depId) => {
      const dep = atlas.blocks?.[depId];
      if (!dep) { issues.push(`Зависимость ${depId} не описана в atlas`); return; }
      const provided = new Set(dep.provides || []);
      const required = block.requires || [];
      required.forEach((r) => {
        if (!provided.has(r)) issues.push(`depends/provides mismatch: ${depId} не даёт ${r}`);
      });
    });
    return issues;
  }

  function validateFilesRegistry(atlas, block){
    const issues = [];
    const reg = atlas.filesRegistry || {};
    (block.files || []).forEach((f) => {
      const entry = reg[f];
      if (!entry) issues.push(`Файл ${f} не зарегистрирован в filesRegistry`);
      else if (entry.status === 'dead') issues.push(`Файл ${f} помечен dead, но привязан к активному блоку`);
    });
    return issues;
  }

  function syncCheck(atlas, arch){
    const byId = Object.fromEntries((arch.blocks || []).map(b => [b.id, b]));
    const report = { at: nowIso(), total: 0, synchronized: 0, drift: 0, broken: 0, details: [] };
    Object.values(atlas.blocks || {}).forEach((block) => {
      report.total += 1;
      const issues = [];
      if (!byId[block.id]) issues.push('Блок отсутствует на схеме');
      if (block.stack && !atlas.techStack.includes(block.stack)) issues.push(`Stack mismatch: ${block.stack}`);
      const p = blockProgress(block);
      if (p.tasksTotal > 0 && p.tasksDone === 0) issues.push('Нет выполненных задач');
      if (p.kpiTotal > 0 && p.kpiPassed === 0) issues.push('Нет пройденных KPI');
      issues.push(...validateDependencyContracts(atlas, block));
      issues.push(...validateFilesRegistry(atlas, block));
      if ((block.kpi || []).length && !hasPassingCheck(block, 'kpi')) issues.push('Нет check kind=kpi со статусом pass');
      if ((block.acceptance || []).length && !hasPassingCheck(block, 'acceptance')) issues.push('Нет check kind=acceptance со статусом pass');
      if (issues.length === 0) {
        report.synchronized += 1;
      } else if (issues.some(i => i.includes('mismatch') || i.includes('отсутствует'))) {
        report.broken += 1;
        report.details.push({ blockId: block.id, status: 'broken', issues });
      } else {
        report.drift += 1;
        report.details.push({ blockId: block.id, status: 'drift', issues });
      }
    });
    atlas.lastSyncReport = report;
    return report;
  }


  function runSyncWithChecks(atlas, arch, meta = {}){
    const report = syncCheck(atlas, arch);
    const detailsById = Object.fromEntries((report.details || []).map(d => [d.blockId, d]));
    Object.keys(atlas.blocks || {}).forEach((blockId) => {
      const detail = detailsById[blockId];
      const result = detail ? 'fail' : 'pass';
      const note = detail?.issues?.[0] || `sync ok (${meta.source || 'runtime'})`;
      logCheck(atlas, blockId, { kind:'sync', result, note, source: meta.source || 'runtime' });
    });
    return report;
  }

  global.SIMA_ATLAS_CORE = {
    loadAtlas, saveAtlas, syncCheck, blockProgress,
    ensureBlock, logCheck, markFileStatus, buildContextPack,
    renderFilesMd, refreshBlockFilesMd,
    validateDependencyContracts, validateFilesRegistry,
    canTransition, transitionBlock,
    runSyncWithChecks
  };
})(window);

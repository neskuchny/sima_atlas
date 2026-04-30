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
      (block.dependsOn || []).forEach((depId) => {
        if (!atlas.blocks[depId]) issues.push(`Зависимость ${depId} не описана в atlas`);
      });
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
    return report;
  }

  global.SIMA_ATLAS_CORE = { loadAtlas, saveAtlas, syncCheck, blockProgress };
})(window);

#!/usr/bin/env node
// Phase R-7.45 — миграция legacy subsystem JSON → real blocks с parent_block_id.
//
// До R-7.40 «провалиться внутрь блока» сохраняло synthetic-граф в
// atlas/subsystems/<parent_id>.json (или atlas/clients/<id>/subsystems/...).
// Эти модули не были настоящими блоками: не имели mission.md, не попадали
// в context-pack, не запускались агентами. R-7.40 заменил их на реальные
// блоки с полем parent_block_id; drill-view фильтрует по parent_block_id.
//
// Этот скрипт переносит legacy-данные:
//   1. Читает subsystems/*.json
//   2. Для каждого модуля внутри — создаёт настоящий блок в graph.json
//      (createBlock из atlas_blocks_api), либо патчит уже существующий,
//      проставляя parent_block_id и layer
//   3. Для каждого edge — добавляет depends_on от src к dst (если оба
//      модуля мигрированы)
//   4. Переименовывает source-файл в `<id>.json.legacy_backup` (если
//      не --keep-source) — данные не теряются, drill-view их игнорирует
//
// Запуск:
//   node scripts/migrate_subsystems_to_blocks.mjs
//   node scripts/migrate_subsystems_to_blocks.mjs --client=my-saas
//   node scripts/migrate_subsystems_to_blocks.mjs --dry-run
//   node scripts/migrate_subsystems_to_blocks.mjs --keep-source
//
// Идемпотентен: повторный прогон ничего не ломает (skip уже-мигрированных).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlock, addEdge, patchBlock } from './atlas_blocks_api.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS_ROOT = path.join(ROOT, 'atlas');
const CLIENTS_ROOT = path.join(ATLAS_ROOT, 'clients');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const KEEP_SOURCE = args.includes('--keep-source');
const ONLY_CLIENT = (args.find((a) => a.startsWith('--client=')) || '').split('=')[1] || null;

function log(...a) { console.log('[migrate]', ...a); }
function warn(...a) { console.warn('[migrate][warn]', ...a); }

function listAtlasRoots() {
  const roots = [];
  if (!ONLY_CLIENT || ONLY_CLIENT === 'main') {
    roots.push({ label: 'main', root: ATLAS_ROOT });
  }
  if (fs.existsSync(CLIENTS_ROOT)) {
    for (const entry of fs.readdirSync(CLIENTS_ROOT)) {
      const dir = path.join(CLIENTS_ROOT, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      if (ONLY_CLIENT && ONLY_CLIENT !== entry) continue;
      if (fs.existsSync(path.join(dir, 'graph.json'))) {
        roots.push({ label: entry, root: dir });
      }
    }
  }
  return roots;
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function migrateRoot({ label, root }) {
  const subsDir = path.join(root, 'subsystems');
  if (!fs.existsSync(subsDir)) {
    log(`[${label}] no subsystems/ — skip`);
    return { label, files: 0, modules_created: 0, modules_patched: 0, edges_added: 0, skipped: 0 };
  }
  const files = fs.readdirSync(subsDir).filter((f) => f.endsWith('.json'));
  if (!files.length) {
    log(`[${label}] subsystems/ empty — skip`);
    return { label, files: 0, modules_created: 0, modules_patched: 0, edges_added: 0, skipped: 0 };
  }

  const graphPath = path.join(root, 'graph.json');
  const graph = readJsonSafe(graphPath);
  if (!graph) {
    warn(`[${label}] graph.json missing/corrupt — skip`);
    return { label, files: 0, modules_created: 0, modules_patched: 0, edges_added: 0, skipped: files.length };
  }
  const blockIds = new Set((graph.blocks || []).map((b) => b.id));
  const blockById = new Map((graph.blocks || []).map((b) => [b.id, b]));

  const stats = { label, files: 0, modules_created: 0, modules_patched: 0, edges_added: 0, skipped: 0 };

  for (const file of files) {
    const subPath = path.join(subsDir, file);
    const sub = readJsonSafe(subPath);
    if (!sub || !sub.parent_id) {
      warn(`[${label}] ${file} corrupt or missing parent_id — skip`);
      stats.skipped += 1;
      continue;
    }
    const parentId = sub.parent_id;
    if (!blockIds.has(parentId)) {
      warn(`[${label}] ${file} parent ${parentId} not in graph — skip`);
      stats.skipped += 1;
      continue;
    }
    stats.files += 1;
    log(`[${label}] migrating ${file} (parent=${parentId}, modules=${(sub.modules || []).length}, edges=${(sub.edges || []).length})`);

    const migratedModuleIds = new Set();
    for (const m of sub.modules || []) {
      const mid = String(m.id);
      if (blockIds.has(mid)) {
        const existing = blockById.get(mid);
        if (existing.parent_block_id === parentId) {
          log(`  · ${mid} — already migrated (parent=${parentId})`);
          migratedModuleIds.add(mid);
          continue;
        }
        if (existing.parent_block_id && existing.parent_block_id !== parentId) {
          warn(`  · ${mid} — parent_block_id conflict (existing=${existing.parent_block_id}, sub=${parentId}) — skip`);
          continue;
        }
        if (DRY_RUN) {
          log(`  · ${mid} — would patch parent_block_id=${parentId}, layer=${m.layer || 'logic'}`);
        } else {
          // patchBlock не умеет parent_block_id — пишем напрямую в graph.json.
          existing.parent_block_id = parentId;
          if (m.layer && existing.layer !== m.layer) existing.layer = m.layer;
          existing.updated_at = new Date().toISOString();
          fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2) + '\n', 'utf8');
        }
        stats.modules_patched += 1;
        migratedModuleIds.add(mid);
        continue;
      }

      // Block doesn't exist — create it.
      if (DRY_RUN) {
        log(`  · ${mid} — would create (title="${m.title || mid}", layer=${m.layer || 'logic'}, parent=${parentId})`);
        stats.modules_created += 1;
        migratedModuleIds.add(mid);
        continue;
      }
      try {
        createBlock({
          atlas_root: root,
          body: {
            id: mid,
            title: m.title || mid,
            layer: m.layer || 'logic',
            status: m.status || 'idea',
            x: Number(m.x) || 0,
            y: Number(m.y) || 0,
            size: m.size || 'md',
            parent_block_id: parentId,
          },
        });
        // refresh graph snapshot since createBlock mutated graph.json on disk
        const fresh = readJsonSafe(graphPath);
        if (fresh) {
          (fresh.blocks || []).forEach((b) => {
            blockIds.add(b.id);
            blockById.set(b.id, b);
          });
        }
        stats.modules_created += 1;
        migratedModuleIds.add(mid);
        log(`  · ${mid} — created`);
      } catch (e) {
        warn(`  · ${mid} — createBlock failed: ${e.message}`);
      }
    }

    // Migrate edges (only if both endpoints survived migration)
    for (const e of sub.edges || []) {
      if (!migratedModuleIds.has(String(e.from)) || !migratedModuleIds.has(String(e.to))) continue;
      if (DRY_RUN) {
        log(`  → edge ${e.from} → ${e.to} would be added`);
        stats.edges_added += 1;
        continue;
      }
      try {
        addEdge({
          atlas_root: root,
          body: {
            from: e.from,
            to: e.to,
            capability: e.label || undefined,
          },
        });
        stats.edges_added += 1;
        log(`  → edge ${e.from} → ${e.to} added`);
      } catch (err) {
        warn(`  → edge ${e.from} → ${e.to} failed: ${err.message}`);
      }
    }

    // Rename source file so legacy code path doesn't pick it up again.
    if (!DRY_RUN && !KEEP_SOURCE) {
      const backup = subPath + '.legacy_backup';
      fs.renameSync(subPath, backup);
      log(`  ✓ ${file} → ${path.basename(backup)}`);
    } else if (DRY_RUN) {
      log(`  ✓ ${file} would be renamed to ${file}.legacy_backup`);
    }
  }

  return stats;
}

function main() {
  const roots = listAtlasRoots();
  if (!roots.length) {
    console.error('no atlas roots found' + (ONLY_CLIENT ? ` (filter --client=${ONLY_CLIENT})` : ''));
    process.exit(1);
  }
  log(`scanning ${roots.length} atlas root(s): ${roots.map((r) => r.label).join(', ')}`);
  if (DRY_RUN) log('DRY RUN — no changes will be written');
  if (KEEP_SOURCE) log('KEEP_SOURCE — legacy JSON files will not be renamed');

  const all = roots.map(migrateRoot);
  console.log('\n=== migration summary ===');
  let totalFiles = 0, totalCreated = 0, totalPatched = 0, totalEdges = 0, totalSkipped = 0;
  for (const s of all) {
    console.log(`  ${s.label.padEnd(20)} files=${s.files}  created=${s.modules_created}  patched=${s.modules_patched}  edges=${s.edges_added}  skipped=${s.skipped}`);
    totalFiles += s.files; totalCreated += s.modules_created; totalPatched += s.modules_patched;
    totalEdges += s.edges_added; totalSkipped += s.skipped;
  }
  console.log(`  ${'TOTAL'.padEnd(20)} files=${totalFiles}  created=${totalCreated}  patched=${totalPatched}  edges=${totalEdges}  skipped=${totalSkipped}`);
  if (DRY_RUN) console.log('\n(dry-run — re-run without --dry-run to apply)');
}

main();

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const shared = `# Sima Atlas Agent Contract\n\n1. Перед работой по блоку прочитай:\n   - /atlas/project.md\n   - /atlas/rules.md\n   - /atlas/tech_stack.md\n   - /atlas/context_packs/<block_id>.json (или собери через scripts/build_context_pack.mjs)\n2. Не менять файлы вне владельца-блока без явного обоснования в checks/decisions.\n3. После изменений обновить trace:\n   - checks.log (pass/fail + note)\n   - при необходимости patterns.md / decisions.log\n4. Для агентного доступа использовать MCP tools:\n   - read_block, list_dependencies, update_block, sync_check, build_context_pack, ingest_chat_distillate\n`;

const agents = `${shared}\n## AGENTS.md specific\n- Для Codex/CLI работай через deterministic context-pack и не используй чат как источник правды.\n`;
const claude = `${shared}\n## CLAUDE.md specific\n- Запускать задачи с привязкой к block_id и проверять acceptance/kpi перед переводом в done.\n`;

fs.writeFileSync(path.join(root, 'AGENTS.md'), agents, 'utf8');
fs.writeFileSync(path.join(root, 'CLAUDE.md'), claude, 'utf8');
console.log('Generated AGENTS.md and CLAUDE.md');

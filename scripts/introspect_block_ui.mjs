#!/usr/bin/env node
// PR-1 (b.user-docs-generator): light-weight JSX/HTML introspector.
//
// Walks the alive JSX/HTML files registered in atlas/blocks/<id>/files.md,
// extracts user-facing UI elements (buttons, inputs, textareas, forms,
// links/routes, fetch calls) via regex matching and returns a structured
// summary that PR-2 (LLM tutorial writer) will turn into "press +, fill
// name, hit Enter" markdown.
//
// We use regex deliberately (no esprima/babel-traverse dependency): the
// extracted features are all surface-level token patterns that don't need
// AST-level accuracy. The tradeoff: JSX inside template literals or JSX
// that's heavily template-spliced may be missed — that's fine for an
// 80%-coverage tool whose output a human (or a downstream LLM) reviews.
//
// API:
//   import { introspectBlock } from './introspect_block_ui.mjs';
//   const r = introspectBlock('b.ui-control');
//   r → { block_id, files_scanned: [...], buttons, inputs, textareas, forms,
//          routes, fetches, warnings }
//
// CLI:
//   node scripts/introspect_block_ui.mjs <block_id> [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');

const UI_EXTENSIONS = new Set(['.jsx', '.tsx', '.js', '.ts', '.html', '.htm']);

function parseFilesMd(filesText) {
  const out = [];
  for (const line of filesText.split(/\r?\n/)) {
    const m = line.match(/^- (.+?)\s*\[(alive|archived|dead|pending)\]/i);
    if (!m) continue;
    if (m[2].toLowerCase() !== 'alive') continue;
    out.push(m[1].trim());
  }
  return out;
}

function uiPathsFor(blockId, atlasRoot) {
  const root = atlasRoot || ATLAS;
  const filesMdPath = path.join(root, 'blocks', blockId, 'files.md');
  if (!fs.existsSync(filesMdPath)) return [];
  const all = parseFilesMd(fs.readFileSync(filesMdPath, 'utf8'));
  // Restrict to UI-shaped extensions; resolve absolute paths from repo root
  // (parent of atlas/) so we read actual JSX content.
  const repoRoot = path.dirname(root);
  return all
    .filter((p) => UI_EXTENSIONS.has(path.extname(p).toLowerCase()))
    .map((p) => path.resolve(repoRoot, p))
    .filter((p) => fs.existsSync(p));
}

function lineOf(text, idx) {
  // Convert character offset → 1-based line number
  let line = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === '\n') line += 1;
  return line;
}

function unquote(s) {
  if (typeof s !== 'string') return s;
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  if (t.startsWith('`') && t.endsWith('`')) return t.slice(1, -1);
  return t;
}

function attr(tag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([^}]+)\\})`);
  const m = tag.match(re);
  if (!m) return null;
  return m[1] ?? m[2] ?? (m[3] ? `{${m[3]}}` : null);
}

function compactWhitespace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

// Brace-aware scanner: starting at `<TAG` opening, walk forward respecting
// `{...}` nesting and string literals to find the real `>` that ends the tag.
// Returns { tagText: '<button ...>', endIdx } or null on malformed input.
function findOpeningTagEnd(src, startIdx, tagName) {
  // startIdx points at '<'. We need to skip 1 + tagName.length chars first.
  let i = startIdx + 1 + tagName.length;
  let braceDepth = 0;
  let str = null; // null | "'" | '"' | '`'
  while (i < src.length) {
    const ch = src[i];
    if (str) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === str) str = null;
      i += 1; continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { str = ch; i += 1; continue; }
    if (ch === '{') { braceDepth += 1; i += 1; continue; }
    if (ch === '}') { braceDepth = Math.max(0, braceDepth - 1); i += 1; continue; }
    if (braceDepth === 0 && ch === '>') return { tagText: src.slice(startIdx, i + 1), endIdx: i };
    if (braceDepth === 0 && ch === '/' && src[i + 1] === '>') return { tagText: src.slice(startIdx, i + 2), endIdx: i + 1, selfClosed: true };
    i += 1;
  }
  return null;
}

// Find the matching </TAG> respecting nested same-name tags.
function findClosingTag(src, startIdx, tagName) {
  const open = new RegExp(`<${tagName}\\b`, 'g');
  const close = new RegExp(`</${tagName}\\s*>`, 'g');
  let depth = 1;
  let i = startIdx;
  while (i < src.length) {
    open.lastIndex = i;
    close.lastIndex = i;
    const o = open.exec(src);
    const c = close.exec(src);
    if (!c) return null;
    if (o && o.index < c.index) { depth += 1; i = o.index + tagName.length + 1; continue; }
    depth -= 1;
    if (depth === 0) return { closeStart: c.index, closeEnd: c.index + c[0].length };
    i = c.index + c[0].length;
  }
  return null;
}

function summarizeHandler(s) {
  if (!s) return null;
  const inner = s.replace(/^\{|\}$/g, '').trim();
  return compactWhitespace(inner).slice(0, 160);
}

function cleanLabel(rawInner) {
  // Strip nested tags (icons, spans) AND JSX expressions (`{...}`) so what's
  // left is just the readable text. Brace-aware to avoid swallowing closing
  // tags that share `>` with content.
  let out = '';
  let depth = 0;
  let str = null;
  let inTag = false;
  for (let i = 0; i < rawInner.length; i++) {
    const ch = rawInner[i];
    if (str) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === str) str = null;
      continue;
    }
    if (depth === 0 && (ch === "'" || ch === '"' || ch === '`')) { str = ch; continue; }
    if (ch === '{') { depth += 1; continue; }
    if (ch === '}') { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    if (ch === '<') { inTag = true; continue; }
    if (ch === '>') { inTag = false; continue; }
    if (inTag) continue;
    out += ch;
  }
  return compactWhitespace(out).slice(0, 80);
}

// Buttons: <button ...>label</button>. Brace-aware scan handles JSX
// expressions like onClick={() => fn(...)} that contain `>` inside
// arrow-function bodies — naive `[^>]*` would mis-parse those.
function findButtons(src) {
  const out = [];
  const reOpen = /<button\b/g;
  let m;
  while ((m = reOpen.exec(src)) !== null) {
    const startIdx = m.index;
    const tagInfo = findOpeningTagEnd(src, startIdx, 'button');
    if (!tagInfo) continue;
    const tag = tagInfo.tagText;
    let label = '';
    if (!tagInfo.selfClosed) {
      const close = findClosingTag(src, tagInfo.endIdx + 1, 'button');
      if (close) {
        const inner = src.slice(tagInfo.endIdx + 1, close.closeStart);
        label = cleanLabel(inner);
      }
    }
    out.push({
      label,
      on_click: summarizeHandler(attr(tag, 'onClick')),
      type: 'button',
      offset: startIdx,
    });
    reOpen.lastIndex = tagInfo.endIdx + 1;
  }
  return out;
}

// Inputs: <input ... /> or <input ...>
function findInputs(src) {
  const out = [];
  const re = /<input\b/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const tagInfo = findOpeningTagEnd(src, m.index, 'input');
    if (!tagInfo) continue;
    out.push({
      type: attr(tagInfo.tagText, 'type') || 'text',
      placeholder: attr(tagInfo.tagText, 'placeholder') || null,
      name: attr(tagInfo.tagText, 'name') || null,
      required: /\brequired\b/.test(tagInfo.tagText),
      offset: m.index,
    });
    re.lastIndex = tagInfo.endIdx + 1;
  }
  return out;
}

function findTextareas(src) {
  const out = [];
  const re = /<textarea\b/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const tagInfo = findOpeningTagEnd(src, m.index, 'textarea');
    if (!tagInfo) continue;
    out.push({
      placeholder: attr(tagInfo.tagText, 'placeholder') || null,
      name: attr(tagInfo.tagText, 'name') || null,
      rows: attr(tagInfo.tagText, 'rows') || null,
      offset: m.index,
    });
    re.lastIndex = tagInfo.endIdx + 1;
  }
  return out;
}

function findForms(src) {
  const out = [];
  const re = /<form\b/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const tagInfo = findOpeningTagEnd(src, m.index, 'form');
    if (!tagInfo) continue;
    out.push({
      on_submit: summarizeHandler(attr(tagInfo.tagText, 'onSubmit')),
      action: attr(tagInfo.tagText, 'action') || null,
      method: attr(tagInfo.tagText, 'method') || null,
      offset: m.index,
    });
    re.lastIndex = tagInfo.endIdx + 1;
  }
  return out;
}

// Links / routes:
//  <Link to="/x">label</Link>
//  <NavLink to="/x">...</NavLink>
//  <a href="/x">label</a>
//  <Route path="/x" element={<Foo/>}/>
function findLinksAndRoutes(src) {
  const links = [];
  const routes = [];
  for (const tagName of ['Link', 'NavLink', 'a']) {
    const reOpen = new RegExp(`<${tagName}\\b`, 'g');
    let m;
    while ((m = reOpen.exec(src)) !== null) {
      const startIdx = m.index;
      const tagInfo = findOpeningTagEnd(src, startIdx, tagName);
      if (!tagInfo) continue;
      const target = attr(tagInfo.tagText, tagName === 'a' ? 'href' : 'to');
      if (!target) { reOpen.lastIndex = tagInfo.endIdx + 1; continue; }
      let label = '';
      if (!tagInfo.selfClosed) {
        const close = findClosingTag(src, tagInfo.endIdx + 1, tagName);
        if (close) label = cleanLabel(src.slice(tagInfo.endIdx + 1, close.closeStart));
      }
      links.push({ kind: tagName, target, label, offset: startIdx });
      reOpen.lastIndex = tagInfo.endIdx + 1;
    }
  }
  const reRoute = /<Route\b/g;
  let m;
  while ((m = reRoute.exec(src)) !== null) {
    const tagInfo = findOpeningTagEnd(src, m.index, 'Route');
    if (!tagInfo) continue;
    const p = attr(tagInfo.tagText, 'path');
    if (p) routes.push({
      path: p,
      element: attr(tagInfo.tagText, 'element') || attr(tagInfo.tagText, 'component') || null,
      offset: m.index,
    });
    reRoute.lastIndex = tagInfo.endIdx + 1;
  }
  return { links, routes };
}

// fetch('url', {method: 'POST', ...}) and fetch(`/api/${x}`)
function findFetches(src) {
  const out = [];
  const re = /\bfetch\s*\(\s*([`'"][^`'"]*[`'"])(?:\s*,\s*\{([^}]*)\})?/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const url = unquote(m[1]);
    const opts = m[2] || '';
    const method = (opts.match(/method\s*:\s*['"]([A-Z]+)['"]/) || [])[1] || 'GET';
    out.push({ url, method, offset: m.index });
  }
  return out;
}

function annotate(items, file, src) {
  return items.map((it) => {
    const { offset, ...rest } = it;
    return { ...rest, file, line: lineOf(src, offset) };
  });
}

export function introspectBlock(blockId, opts = {}) {
  const paths = uiPathsFor(blockId, opts.atlas_root);
  const result = {
    block_id: blockId,
    files_scanned: [],
    buttons: [], inputs: [], textareas: [], forms: [],
    links: [], routes: [], fetches: [],
    warnings: [],
  };
  if (!paths.length) {
    result.warnings.push('no UI files (jsx/tsx/js/ts/html) registered as alive in files.md');
    return result;
  }
  const repoRoot = path.dirname(opts.atlas_root || ATLAS);
  for (const abs of paths) {
    const rel = path.relative(repoRoot, abs);
    let src; try { src = fs.readFileSync(abs, 'utf8'); }
    catch (e) { result.warnings.push(`unreadable: ${rel}: ${e.message}`); continue; }
    result.files_scanned.push(rel);
    result.buttons.push(...annotate(findButtons(src), rel, src));
    result.inputs.push(...annotate(findInputs(src), rel, src));
    result.textareas.push(...annotate(findTextareas(src), rel, src));
    result.forms.push(...annotate(findForms(src), rel, src));
    const { links, routes } = findLinksAndRoutes(src);
    result.links.push(...annotate(links, rel, src));
    result.routes.push(...annotate(routes, rel, src));
    result.fetches.push(...annotate(findFetches(src), rel, src));
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const blockId = argv.find((a) => !a.startsWith('--'));
  if (!blockId) {
    console.error('Usage: node scripts/introspect_block_ui.mjs <block_id> [--json]');
    process.exit(1);
  }
  const r = introspectBlock(blockId);
  if (argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`${blockId}: scanned ${r.files_scanned.length} files`);
    console.log(`  buttons:   ${r.buttons.length}`);
    console.log(`  inputs:    ${r.inputs.length}`);
    console.log(`  textareas: ${r.textareas.length}`);
    console.log(`  forms:     ${r.forms.length}`);
    console.log(`  links:     ${r.links.length}`);
    console.log(`  routes:    ${r.routes.length}`);
    console.log(`  fetches:   ${r.fetches.length}`);
    if (r.warnings.length) console.log(`  warnings:  ${r.warnings.length}`);
  }
}

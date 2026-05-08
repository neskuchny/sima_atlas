#!/usr/bin/env node
// Selftest for scripts/atlas_artifacts_api.mjs.
//
// 6 test groups in tmp atlas:
//  1. createArtifact writes index.json + body.md, returns meta with id
//  2. createArtifact rejects invalid kind, missing title
//  3. listArtifacts filters by kind + search; sorts newest first
//  4. getArtifact with withBody=true returns body string
//  5. updateArtifact patches title/tags/body; updatedAt advances
//  6. insertArtifactToProject + deleteArtifact round-trip

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  listArtifacts, getArtifact, createArtifact, updateArtifact,
  deleteArtifact, insertArtifactToProject,
} from '../scripts/atlas_artifacts_api.mjs';

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-api-'));
const atlas = path.join(tmp, 'atlas');
fs.mkdirSync(atlas, { recursive: true });

try {
  // ─── Group 1: create writes index.json + body.md
  let firstId;
  {
    const r = createArtifact({ root: atlas, body: {
      kind: 'block', title: 'Auth Block',
      description: 'OAuth + sessions',
      tags: ['auth', 'security'],
      body: '# Auth\nOAuth flow…',
      blockType: 'subschema', blockLayer: 'logic',
    }});
    check('group1:ok', r.ok);
    check('group1:has id', typeof r.artifact.id === 'string' && r.artifact.id.startsWith('art-'));
    firstId = r.artifact.id;
    const adir = path.join(atlas, 'artifacts', firstId);
    check('group1:index.json', fs.existsSync(path.join(adir, 'index.json')));
    check('group1:body.md', fs.existsSync(path.join(adir, 'body.md')));
    const meta = JSON.parse(fs.readFileSync(path.join(adir, 'index.json'), 'utf8'));
    check('group1:title persisted', meta.title === 'Auth Block');
    check('group1:tags persisted', Array.isArray(meta.tags) && meta.tags.length === 2);
    check('group1:createdAt set', typeof meta.createdAt === 'string');
  }

  // ─── Group 2: rejects bad input
  {
    let threw = false;
    try { createArtifact({ root: atlas, body: { kind: 'bogus', title: 'X' } }); } catch { threw = true; }
    check('group2:invalid kind rejected', threw);
    threw = false;
    try { createArtifact({ root: atlas, body: { kind: 'block' } }); } catch { threw = true; }
    check('group2:missing title rejected', threw);
  }

  // ─── Group 3: list filters + sort
  {
    // Add a second one, different kind
    // Sleep a moment so createdAt differs
    const before = Date.now();
    while (Date.now() - before < 5) {} // tiny spin
    createArtifact({ root: atlas, body: {
      kind: 'tz', title: 'Landing TZ', tags: ['marketing'],
    }});
    const all = listArtifacts({ root: atlas });
    check('group3:list returns 2', all.length === 2);
    check('group3:newest first', all[0].kind === 'tz');
    const blocks = listArtifacts({ root: atlas, kind: 'block' });
    check('group3:filter by kind', blocks.length === 1 && blocks[0].kind === 'block');
    const matches = listArtifacts({ root: atlas, search: 'auth' });
    check('group3:filter by search', matches.length === 1 && /Auth/i.test(matches[0].title));
    const none = listArtifacts({ root: atlas, search: '__no_match__' });
    check('group3:no matches', none.length === 0);
  }

  // ─── Group 4: getArtifact with body
  {
    const meta = getArtifact(firstId, { root: atlas });
    check('group4:get returns meta', meta && meta.id === firstId);
    check('group4:meta has no body by default', meta.body === undefined);
    const full = getArtifact(firstId, { root: atlas, withBody: true });
    check('group4:full has body', typeof full.body === 'string' && full.body.includes('OAuth flow'));
  }

  // ─── Group 5: update patches + bumps updatedAt
  {
    const before = getArtifact(firstId, { root: atlas });
    const wait = Date.now();
    while (Date.now() - wait < 5) {}
    const r = updateArtifact(firstId, {
      title: 'Auth Block v2',
      tags: ['auth', 'oauth', 'pkce'],
      body: '# Auth v2\nPKCE flow…',
    }, { root: atlas });
    check('group5:update ok', r.ok);
    check('group5:title patched', r.artifact.title === 'Auth Block v2');
    check('group5:tags patched', r.artifact.tags.includes('pkce'));
    check('group5:updatedAt advanced', r.artifact.updatedAt !== before.updatedAt);
    const full = getArtifact(firstId, { root: atlas, withBody: true });
    check('group5:body patched', /PKCE/.test(full.body));
  }

  // ─── Group 5b: per-client namespace isolation (Phase J-1)
  {
    const a = createArtifact({ root: atlas, client_id: 'acme', body: {
      kind: 'note', title: 'Acme Note', body: '# acme', tags: ['acme'],
    }});
    check('group5b:acme create ok', a.ok);
    check('group5b:acme path', fs.existsSync(path.join(atlas, 'clients', 'acme', 'artifacts', a.artifact.id, 'index.json')));
    // Default namespace doesn't see it
    const defaultList = listArtifacts({ root: atlas, search: 'Acme Note' });
    check('group5b:default ns isolated', defaultList.length === 0);
    const acmeList = listArtifacts({ root: atlas, client_id: 'acme', search: 'Acme Note' });
    check('group5b:acme ns sees it', acmeList.length === 1);
    // Update + delete also scoped
    const upd = updateArtifact(a.artifact.id, { title: 'Acme Renamed' }, { root: atlas, client_id: 'acme' });
    check('group5b:scoped update ok', upd.ok && upd.artifact.title === 'Acme Renamed');
    const del = deleteArtifact(a.artifact.id, { root: atlas, client_id: 'acme' });
    check('group5b:scoped delete ok', del.ok && del.removed === 1);
    // Reject malformed client_id (path traversal guard)
    const badNs = listArtifacts({ root: atlas, client_id: '../../etc' });
    check('group5b:bad client falls back to default', Array.isArray(badNs));
  }

  // ─── Group 6: insert + delete
  {
    const ins = insertArtifactToProject(firstId, { project_id: 'lensa', root: atlas });
    check('group6:insert ok', ins.ok && ins.usedIn.includes('lensa'));
    const ins2 = insertArtifactToProject(firstId, { project_id: 'lensa', root: atlas });
    check('group6:insert idempotent', ins2.usedIn.length === 1);
    const del = deleteArtifact(firstId, { root: atlas });
    check('group6:delete ok', del.ok && del.removed === 1);
    check('group6:dir gone', !fs.existsSync(path.join(atlas, 'artifacts', firstId)));
    check('group6:list reduces', listArtifacts({ root: atlas }).length === 1);
    const del2 = deleteArtifact(firstId, { root: atlas });
    check('group6:delete idempotent', del2.ok && del2.removed === 0);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('atlas_artifacts_api.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('atlas_artifacts_api.selftest: OK (7 test groups, all assertions green)');

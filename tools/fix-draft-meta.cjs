#!/usr/bin/env node
// 对已存在的 draft 直接写 metadata（用 .zenodo.json 原文，不改字段）。
// 用法： node tools/fix-draft-meta.cjs <draft_id> [--publish]
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const TOK = process.env.ZENODO_TOKEN;
const depId = process.argv[2];
const DO_PUBLISH = process.argv.includes('--publish');
if (!TOK) { console.error('ZENODO_TOKEN 未设置'); process.exit(1); }
if (!depId) { console.error('用法: node tools/fix-draft-meta.cjs <draft_id> [--publish]'); process.exit(1); }

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, '.zenodo.json'), 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function req(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      Authorization: 'Bearer ' + TOK, Accept: 'application/json', 'User-Agent': UA,
    };
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers, timeout: 120000 }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch {}
        resolve({ status: res.statusCode, body: b, json: j });
      });
    });
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('timeout')));
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  console.log('draft =', depId);
  console.log('metadata keys:', Object.keys(meta).join(', '));

  const put = await req('PUT', `https://zenodo.org/api/deposit/depositions/${depId}`, { metadata: meta });
  if (put.status !== 200) {
    console.error('[FAIL] 写 metadata →', put.status);
    console.error(put.body.slice(0, 800));
    process.exit(2);
  }
  const m = put.json.metadata || {};
  console.log('version      =', m.version);
  console.log('creators     =', JSON.stringify(m.creators));
  console.log('contributors =', JSON.stringify(m.contributors));
  console.log('desc len     =', (m.description || '').length);
  console.log('notes len    =', (m.notes || '').length);
  console.log('files        =', (put.json.files || []).map(f => f.filename + ' (' + f.filesize + ' B)').join(', '));

  if (!DO_PUBLISH) { console.log('\n未发布（加 --publish 才发）'); return; }

  const pub = await req('POST', `https://zenodo.org/api/deposit/depositions/${depId}/actions/publish`, {});
  if (pub.status !== 202 && pub.status !== 200) {
    console.error('[FAIL] 发布 →', pub.status);
    console.error(pub.body.slice(0, 800));
    process.exit(2);
  }
  console.log('\n==== 已发布 ====');
  console.log('record  :', pub.json.id);
  console.log('DOI     :', pub.json.doi);
  console.log('version :', pub.json.metadata?.version);
  console.log('published:', pub.json.metadata?.publication_date);
})();

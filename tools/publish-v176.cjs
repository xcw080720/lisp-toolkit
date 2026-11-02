#!/usr/bin/env node
// 发布 v1.7.6：在 concept 23618044 下创建新版本，上传 zip，设置 metadata，发布。
//
// 安全约定：
//   · token 只从 $env:ZENODO_TOKEN 读，不写文件、不打印、不进日志
//   · 每一步失败就停，不做半套
//   · 发布是不可逆动作，所以 --dry 只走到「draft 就绪、文件传完、metadata 设好」为止
//
// 用法：
//   $env:ZENODO_TOKEN = '...'
//   node tools/publish-v176.cjs --dry      # 只到 draft，不发布
//   node tools/publish-v176.cjs            # 真发布
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const TOK = process.env.ZENODO_TOKEN;
if (!TOK) { console.error('ZENODO_TOKEN 未设置'); process.exit(1); }

const DRY = process.argv.includes('--dry');
const BASE = 'https://zenodo.org/api';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, '.zenodo.json'), 'utf8'));
const ver = meta.version;

// 找到最新 record id（用于 newversion）
function req(method, url, opts = {}, hop = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = {
      Authorization: 'Bearer ' + TOK,
      Accept: 'application/json',
      'User-Agent': UA,
      ...(opts.headers || {}),
    };
    if (opts.json) headers['Content-Type'] = 'application/json';
    const data = opts.body ? (opts.json ? JSON.stringify(opts.body) : opts.body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const r = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method, headers, timeout: 120000,
    }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => {
        // concept 端点会 302 到最新 record，跟一下
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hop < 3) {
          const next = new URL(res.headers.location, u).toString();
          resolve(req(method, next, opts, hop + 1));
          return;
        }
        let parsed = null;
        try { parsed = JSON.parse(b); } catch { /* 非 JSON（例如 HTML 错误页） */ }
        resolve({ status: res.statusCode, body: b, json: parsed });
      });
    });
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('timeout')));
    if (data) r.write(data);
    r.end();
  });
}

function die(step, r) {
  console.error(`\n[FAIL] ${step} → HTTP ${r.status}`);
  console.error((r.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400));
  process.exit(2);
}

(async () => {
  const zipName = `lisp-toolkit-data-v${ver}.zip`;
  const zipPath = path.join(ROOT, 'archive-zips', `lisp-toolkit-${ver}.zip`);
  if (!fs.existsSync(zipPath)) { console.error('找不到 zip：' + zipPath); process.exit(1); }
  const zipBuf = fs.readFileSync(zipPath);
  console.log(`zip: ${zipName}  ${zipBuf.length} B  sha256 ${require('crypto').createHash('sha256').update(zipBuf).digest('hex').slice(0, 16)}…`);

  // 1) 找当前最新 record
  console.log('\n[1] 读概念记录的最新版');
  const parent = await req('GET', `${BASE}/records/23618044`);
  if (parent.status !== 200) die('读 concept', parent);
  const latestId = (String(parent.json.links?.latest || '').match(/(\d+)/) || [])[1];
  if (!latestId) { console.error('拿不到 latest id'); process.exit(2); }
  console.log('    latest record =', latestId);

  // 2) 建新版本
  console.log('\n[2] 创建新版本 draft');
  const nv = await req('POST', `${BASE}/deposit/depositions/${latestId}/actions/newversion`, { json: true, body: {} });
  if (nv.status !== 201 && nv.status !== 200) die('newversion', nv);
  const draftUrl = nv.json?.links?.latest_draft;
  if (!draftUrl) die('newversion 无 latest_draft', nv);
  const depId = (draftUrl.match(/(\d+)$/) || [])[1];
  console.log('    draft deposition =', depId);

  // 3) 读 draft
  const dep = await req('GET', `${BASE}/deposit/depositions/${depId}`);
  if (dep.status !== 200) die('读 draft', dep);
  const files = dep.json.files || [];
  console.log('    draft 现有文件:', files.map(f => f.filename).join(', ') || '(空)');

  // 4) 删旧文件
  console.log('\n[3] 清空旧文件');
  for (const f of files) {
    const d = await req('DELETE', f.links.self);
    console.log('    -', f.filename, '→', d.status);
    if (d.status >= 300) die('删文件 ' + f.filename, d);
  }

  // 5) 上传（新版 bucket 优先，退回旧 files 端点）
  console.log('\n[4] 上传新 zip');
  const bucket = dep.json.links?.bucket;
  let up;
  if (bucket) {
    up = await req('PUT', `${bucket}/${zipName}`, {
      headers: { 'Content-Type': 'application/octet-stream' }, body: zipBuf,
    });
  } else {
    const boundary = '----dsh' + Date.now();
    const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${zipName}"\r\nContent-Type: application/zip\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([Buffer.from(head, 'utf8'), zipBuf, Buffer.from(tail, 'utf8')]);
    up = await req('POST', `${BASE}/deposit/depositions/${depId}/files`, {
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body,
    });
  }
  if (up.status !== 201 && up.status !== 200) die('上传', up);
  console.log('    uploaded:', up.json?.key || up.json?.filename || '(ok)');

  // 6) metadata
  console.log('\n[5] 写 metadata');
  const md = { ...meta };
  delete md.upload_type;               // 新版用 resource_type
  const payload = { metadata: { ...md, resource_type: { id: 'dataset' } } };
  const put = await req('PUT', `${BASE}/deposit/depositions/${depId}`, { json: true, body: payload });
  if (put.status !== 200) die('写 metadata', put);
  console.log('    version =', put.json.metadata?.version, '| contributors =', JSON.stringify(put.json.metadata?.contributors));

  if (DRY) {
    console.log('\n--dry：已停在发布前。draft id =', depId);
    console.log('预览：' + (dep.json.links?.html || '').replace('/draft', ''));
    return;
  }

  // 7) 发布
  console.log('\n[6] 发布');
  const pub = await req('POST', `${BASE}/deposit/depositions/${depId}/actions/publish`, { json: true, body: {} });
  if (pub.status !== 202 && pub.status !== 200) die('发布', pub);
  console.log('\n==== 已发布 ====');
  console.log('record :', pub.json.id);
  console.log('DOI    :', pub.json.doi);
  console.log('version:', pub.json.metadata?.version);
  console.log('file   :', (pub.json.files || []).map(f => f.filename).join(', '));
})();

#!/usr/bin/env node
// 只验证 token 是否有效，不做任何写操作。token 从环境变量读，不打印。
'use strict';
const https = require('https');

const tok = process.env.ZENODO_TOKEN;
if (!tok) { console.error('ZENODO_TOKEN 未设置'); process.exit(1); }
console.log('token length:', tok.length);

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' },
      timeout: 20000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

(async () => {
  try {
    const r = await get('https://zenodo.org/api/deposit/depositions?size=1');
    console.log('status:', r.status);
    if (r.status === 200) {
      const j = JSON.parse(r.body);
      console.log('depositions visible:', Array.isArray(j) ? j.length : '(unknown)');
      console.log('TOKEN OK');
    } else {
      console.log('body head:', r.body.slice(0, 300));
      console.log('TOKEN REJECTED');
      process.exitCode = 2;
    }
  } catch (e) {
    console.log('network error:', e.message);
    process.exitCode = 3;
  }
})();

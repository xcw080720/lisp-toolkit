// 篡改B：从 floors 里删掉 "scale-js/impl.js"（impls 不动）→ impls/floors 应不一致
// 用法: node tmp/fixer3/tamperB.cjs [--restore]
'use strict';
const fs = require('fs'), path = require('path');
const p = path.join(__dirname, '..', '..', 'mutation-floors.json');
const bak = path.join(__dirname, 'mutation-floors.postfix.bak');
if (process.argv.includes('--restore')) {
  fs.copyFileSync(bak, p);
  console.log('[tamperB] 已从备份恢复:', fs.statSync(p).size, 'bytes');
  process.exit(0);
}
const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
delete cfg.floors['scale-js/impl.js'];
fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
const back = JSON.parse(fs.readFileSync(p, 'utf8'));
console.log('[tamperB] floors 键:', JSON.stringify(Object.keys(back.floors)));
console.log('[tamperB] impls    :', JSON.stringify(back.impls));
console.log('[tamperB] criteria_sha256 未动:', JSON.stringify(back.criteria_sha256));

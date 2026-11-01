// 篡改D（补充）：在 floors 里加一个 impls 之外的孤儿键 → 差集应报“仅 floors 有”
// 用法: node tmp/fixer3/tamperD.cjs [--restore]
'use strict';
const fs = require('fs'), path = require('path');
const p = path.join(__dirname, '..', '..', 'mutation-floors.json');
const bak = path.join(__dirname, 'mutation-floors.postfix.bak');
if (process.argv.includes('--restore')) {
  fs.copyFileSync(bak, p);
  console.log('[tamperD] 已从备份恢复:', fs.statSync(p).size, 'bytes');
  process.exit(0);
}
const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
cfg.floors['ghost/impl.js'] = 60;
fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
const back = JSON.parse(fs.readFileSync(p, 'utf8'));
console.log('[tamperD] floors 键:', JSON.stringify(Object.keys(back.floors)));
console.log('[tamperD] impls    :', JSON.stringify(back.impls));

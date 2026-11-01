// 篡改A：把 criteria_sha256 里 check-closure.cjs 的值改一个字符（末位 8 -> 7）
// 用法: node tmp/fixer3/tamperA.cjs [--restore]
'use strict';
const fs = require('fs'), path = require('path');
const p = path.join(__dirname, '..', '..', 'mutation-floors.json');
const bak = path.join(__dirname, 'mutation-floors.postfix.bak');
if (process.argv.includes('--restore')) {
  fs.copyFileSync(bak, p);
  console.log('[tamperA] 已从备份恢复:', fs.statSync(p).size, 'bytes');
  process.exit(0);
}
const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
const old = cfg.criteria_sha256['check-closure.cjs'];
cfg.criteria_sha256['check-closure.cjs'] = old.slice(0, -1) + (old.endsWith('8') ? '7' : '8');
fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
const back = JSON.parse(fs.readFileSync(p, 'utf8'));
console.log('[tamperA] check-closure.cjs 记录值:', old, '->', back.criteria_sha256['check-closure.cjs']);
console.log('[tamperA] 实际文件 sha256        : ' + require('crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', '..', 'check-closure.cjs'))).digest('hex'));
console.log('[tamperA] check-scale.cjs 记录值未动:', back.criteria_sha256['check-scale.cjs']);
console.log('[tamperA] impls 未动:', JSON.stringify(back.impls), ' floors 未动:', JSON.stringify(back.floors));

// gate.cjs —— 变异门禁：判据强度不许退步
// 用法: node gate.cjs [--max 40]
//
// 读 mutation-floors.json 里的地板分，逐个跑 mutate.cjs，
// 低于地板 → 退出码 1（说明判据变弱了，或实现里长了新盲区）。
//
// 地板只能手动上调，不许下调。要下调必须在提交信息里写清理由。
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MAX = arg('--max', '40');

const here = __dirname;
const cfgPath = path.join(here, 'mutation-floors.json');
if (!fs.existsSync(cfgPath)) { console.error('[gate] 找不到 mutation-floors.json'); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

let bad = 0, rows = [];
for (const [rel, floor] of Object.entries(cfg.floors)) {
  const impl = path.join(here, 'runs', rel);
  if (!fs.existsSync(impl)) { console.log('[skip] 找不到 ' + rel); continue; }
  const r = spawnSync(process.execPath, [path.join(here, 'mutate.cjs'), '--impl', impl, '--max', MAX, '--json'],
    { encoding: 'utf8', timeout: 900000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('GATE_JSON '));
  if (!line) { console.log('[FAIL] ' + rel + ' 变异测试没跑完'); bad++; continue; }
  const j = JSON.parse(line.slice('GATE_JSON '.length));
  const pass = j.baselineGreen && j.score >= floor;
  rows.push({ rel, score: j.score, floor, green: j.baselineGreen, killed: j.killed, total: j.total, pass });
  if (!pass) bad++;
}

console.log('');
console.log('实现'.padEnd(26) + '基线'.padEnd(8) + '得分'.padEnd(8) + '地板'.padEnd(8) + '结论');
for (const r of rows) {
  console.log(
    r.rel.padEnd(26) +
    (r.green ? '绿' : '红').padEnd(8) +
    (r.score + '%').padEnd(8) +
    (r.floor + '%').padEnd(8) +
    (r.pass ? 'PASS  (' + r.killed + '/' + r.total + ' 杀死)' : 'FAIL  ← 判据强度退步')
  );
}

console.log('');
if (bad) { console.log('[gate] ' + bad + ' 项未达地板。地板只能上调，不许下调。'); process.exitCode = 1; }
else console.log('[gate] 全部达到地板分。');

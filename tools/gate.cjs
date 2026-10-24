// tools/gate.cjs —— 变异门禁：判据强度不许退步（通用版）
//
//   node tools/gate.cjs --config mutation-floors.json [--max-offset 0]
//
// 配置文件格式：
// {
//   "sample": 30,
//   "arms": [
//     { "label": "arm-a", "impl": "runs/arm-a/impl.lisp", "checker": "check.cjs", "floor": 83.3 },
//     { "label": "arm-b", "impl": "runs/arm-b/impl.js",   "checker": "check.cjs", "floor": 64.7 }
//   ]
// }
//
// 规则：
//   · 地板与抽样数绑定：sample 与前次不同 → 必须重测地板
//   · 地板只能上调；下调必须在提交信息里写理由
//   · 基线不全绿 → 拒绝计分
//   · 路径相对于配置文件所在目录
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const cfgPath = arg('--config', 'mutation-floors.json');
if (!fs.existsSync(cfgPath)) { console.error('[gate] 找不到配置: ' + cfgPath); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const root = path.dirname(path.resolve(cfgPath));
const mutate = path.join(__dirname, 'mutate.cjs');

const rows = [];
let bad = 0;
for (const arm of cfg.arms) {
  const impl = path.resolve(root, arm.impl);
  const checker = path.resolve(root, arm.checker);
  if (!fs.existsSync(impl)) { rows.push({ ...arm, skip: '找不到实现' }); bad++; continue; }
  if (!fs.existsSync(checker)) { rows.push({ ...arm, skip: '找不到判据' }); bad++; continue; }
  const r = spawnSync(process.execPath, [mutate, '--impl', impl, '--checker', checker,
    '--max', String(cfg.sample), '--json'], { encoding: 'utf8', timeout: 1800000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('GATE_JSON '));
  if (!line) { rows.push({ ...arm, skip: '变异没跑完' }); bad++; continue; }
  const j = JSON.parse(line.slice('GATE_JSON '.length));
  const pass = j.baselineGreen && j.score >= arm.floor;
  rows.push({ ...arm, ...j, pass });
  if (!pass) bad++;
}

console.log('');
console.log('抽样 ' + cfg.sample + '  判据 ' + (cfg.arms[0] ? path.basename(cfg.arms[0].checker) : '-'));
console.log('');
console.log('臂'.padEnd(18) + '基线'.padEnd(6) + '得分'.padEnd(9) + '地板'.padEnd(9) + '结论');
for (const r of rows) {
  if (r.skip) { console.log(String(r.label).padEnd(18) + '-'.padEnd(6) + '-'.padEnd(9) + '-'.padEnd(9) + r.skip); continue; }
  console.log(
    String(r.label).padEnd(18) +
    (r.baselineGreen ? '绿' : '红').padEnd(6) +
    (r.score + '%').padEnd(9) +
    (r.floor + '%').padEnd(9) +
    (r.pass ? 'PASS  (' + r.killed + '/' + r.total + ' 杀死)' : 'FAIL  ← 判据强度退步')
  );
}
console.log('');
if (bad) { console.log('[gate] ' + bad + ' 项未通过。地板只能上调，不许下调。'); process.exitCode = 1; }
else console.log('[gate] 全部达到地板分。');

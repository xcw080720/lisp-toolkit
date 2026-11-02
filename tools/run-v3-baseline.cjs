#!/usr/bin/env node
// 跑 v3-full 十格基线，保存原始 stdout、退出码与耗时。
// 目的：v3-baseline.json 里的 floors 是「记录」，这里产出「实测原始数据」——
// 有原始输出才谈得上复核，只有分数表只能是候选。
//
// 用法： node tools/run-v3-baseline.cjs [--only js|cl] [--out DIR]
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = path.join(__dirname, '..', 'experiments', 'timetable-ab');
const argv = process.argv.slice(2);
const only = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1] : null; })();
const outDir = (() => {
  const i = argv.indexOf('--out');
  return i >= 0 ? path.resolve(argv[i + 1]) : path.join(HERE, 'baseline-v17');
})();

const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'v3-baseline.json'), 'utf8'));
const impls = cfg.impls.filter(p => !only || (only === 'js' ? p.endsWith('.js') : p.endsWith('.lisp')));

fs.mkdirSync(path.join(outDir, 'raw'), { recursive: true });
const env = { ...process.env, SBCL_WSL: process.env.SBCL_WSL || 'kali-linux' };

const rows = [];
const t0 = Date.now();
for (const rel of impls) {
  const impl = path.join(HERE, 'runs', rel);
  const name = rel.replace(/[\\/]/g, '__').replace(/\.(js|lisp)$/, '');
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(HERE, 'check-v4.cjs'), '--impl', impl], {
    encoding: 'utf8', env, timeout: 600000,
  });
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  const out = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(path.join(outDir, 'raw', name + '.out'), out, 'utf8');

  const m = out.match(/(\d+)\s*\/\s*(\d+)\s*通过（fail=(\d+)\s+crash=(\d+)）/);
  const pass = m ? Number(m[1]) : -1;
  const total = m ? Number(m[2]) : -1;
  const fail = m ? Number(m[3]) : -1;
  const crash = m ? Number(m[4]) : -1;
  const floor = cfg.floors[rel];
  const redIds = [...out.matchAll(/^#(\d+)\s+FAIL/mg)].map(x => '#' + x[1]).join(' ');

  rows.push({ rel, pass, total, fail, crash, floor, secs, exit: r.status, redIds });
  console.log(
    `${rel.padEnd(32)} ${String(pass + '/' + total).padEnd(8)} floor=${String(floor).padEnd(3)} ` +
    `${secs}s  exit=${r.status}  ${pass >= floor ? 'OK' : 'BELOW FLOOR'}  ${redIds}`
  );
}

// 写 TSV
const tsv = ['impl\tpass\ttotal\tfail\tcrash\tfloor\texit\tsecs\tred_ids'];
for (const x of rows) {
  tsv.push([x.rel, x.pass, x.total, x.fail, x.crash, x.floor, x.exit, x.secs, x.redIds].join('\t'));
}
fs.writeFileSync(path.join(outDir, 'results.tsv'), tsv.join('\n') + '\n', 'utf8');

// 写 json 汇总
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  node: process.version,
  sbcl_wsl: env.SBCL_WSL,
  total_secs: ((Date.now() - t0) / 1000).toFixed(1),
  rows,
}, null, 2) + '\n', 'utf8');

const below = rows.filter(x => !(x.pass >= x.floor));
console.log(`\n总耗时 ${((Date.now() - t0) / 1000).toFixed(1)} s；${rows.length} 格；低于地板 ${below.length} 格`);
if (below.length) process.exitCode = 1;

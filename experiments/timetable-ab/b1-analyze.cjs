// b1-analyze.cjs —— 加 n 实验的区间分析（预注册 §四 P4 指定口径）
// 用法: node b1-analyze.cjs [--iters 20000] [--seed 20261101]
//
// 只做预注册写死的四组比较，不新增、不挑选：
//   A) JS inline / CL inline   （语言，inline 方案）
//   B) JS table  / CL macro    （语言，抽象方案）
//   C) CL inline / CL macro    （方案，CL）
//   D) JS inline / JS table    （方案，JS）
// 统计量：两臂各自的中位数之比；bootstrap 2 万次，95% 百分位区间。
// 判读规则在预注册里写死：区间是否含 1.0。
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');

const HERE = __dirname, RUNS = path.join(HERE, 'runs');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? +argv[i + 1] : d; };
const sarg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? String(argv[i + 1]) : d; }; // 前缀等字符串参数不能用数值版
const ITERS = arg('--iters', 20000), SEED = arg('--seed', 20261101);

let s = SEED >>> 0 || 1;
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const median = (a) => { const b = [...a].sort((x, y) => x - y), n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const ARMS = (() => {
  const cl = sarg('--cl-prefix', 'v4');   // v4 = 32768 轮；v5 = 65536 轮（修订 C）
  const js = sarg('--js-prefix', 'v4');
  return [cl + '-cl-macro', cl + '-cl-inline', js + '-js-table', js + '-js-inline'];
})();
const data = {};
for (const arm of ARMS) {
  const ext = arm.includes('cl') ? '.lisp' : '.js';
  const cells = [];
  for (let n = 1; n <= 9; n++) {
    const f = path.join(RUNS, arm + '-r' + n, 'impl' + ext);
    if (!fs.existsSync(f)) continue;
    const m = spawnSync(process.execPath, [path.join(HERE, 'metric.cjs'), f], { encoding: 'utf8', timeout: 120000 });
    const out = m.stdout || '';
    // metric.cjs 会另打一行 `JSON: [...]`，优先用它
    let c = 0;
    const jl = out.split('\n').find((l) => l.trim().startsWith('JSON:'));
    if (jl) { try { c = JSON.parse(jl.trim().slice(5))[0].chars; } catch { c = 0; } }
    if (!c) { // 退回本地口径：非空白非注释字符
      const t = fs.readFileSync(f, 'utf8');
      c = t.split('\n').filter((l) => !/^\s*(;|\/\/)/.test(l)).join('').replace(/\s+/g, '').length;
    }
    cells.push(c);
  }
  data[arm] = cells;
}

console.log('=== 每臂样本（非空白非注释字符）===');
console.log('arm'.padEnd(16) + 'n'.padStart(3) + '  median'.padStart(9) + '   mean'.padStart(9) + '   min–max');
for (const arm of ARMS) {
  const a = data[arm];
  if (!a.length) { console.log(arm.padEnd(16) + '0   （无数据）'); continue; }
  console.log(arm.padEnd(16) + String(a.length).padStart(3) + String(median(a)).padStart(9) + '   ' +
    mean(a).toFixed(0).padStart(7) + '   ' + Math.min(...a) + '–' + Math.max(...a));
}

const [CL_MACRO, CL_INLINE, JS_TABLE, JS_INLINE] = ARMS;
const COMPARE = [
  ['A 语言·inline', JS_INLINE, CL_INLINE],
  ['B 语言·抽象',   JS_TABLE,  CL_MACRO],
  ['C 方案·CL',     CL_INLINE, CL_MACRO],
  ['D 方案·JS',     JS_INLINE, JS_TABLE]
];

console.log('');
console.log('=== 四组比值（中位数之比；bootstrap 95% 区间）===');
const rows = [];
for (const [label, num, den] of COMPARE) {
  const A = data[num], B = data[den];
  if (A.length < 2 || B.length < 2) { console.log(label.padEnd(14) + '样本不足（' + A.length + ' vs ' + B.length + '）'); continue; }
  const obs = median(A) / median(B);
  const bs = [];
  for (let i = 0; i < ITERS; i++) {
    const a = Array.from({ length: A.length }, () => pick(A));
    const b = Array.from({ length: B.length }, () => pick(B));
    bs.push(median(a) / median(b));
  }
  bs.sort((x, y) => x - y);
  const lo = bs[Math.floor(ITERS * 0.025)], hi = bs[Math.floor(ITERS * 0.975)];
  const inc1 = lo <= 1 && hi >= 1;
  rows.push({ label, num, den, obs, lo, hi, inc1 });
  console.log(label.padEnd(14) + obs.toFixed(3) + '×  [' + lo.toFixed(3) + ', ' + hi.toFixed(3) + ']  ' +
    (inc1 ? '含 1.0 → 不可判' : (obs > 1 ? '不含 1.0，上偏' : '不含 1.0，下偏')));
}

console.log('');
console.log('=== 预注册判读（§二）===');
for (const r of rows) {
  const verdict = r.inc1 ? '区间含 1.0 → 语言/方案差异在本批数据上不可判'
    : (r.obs > 1 ? '区间不含 1.0 且偏大 → 分子那一侧更冗长（' + r.num + ' > ' + r.den + '）'
                 : '区间不含 1.0 且偏小 → 分子那一侧更省（' + r.num + ' < ' + r.den + '）');
  console.log(r.label + '：' + verdict);
}

fs.writeFileSync(path.join(HERE, 'v4-ratios.tsv'),
  ['comparison\tnumerator\tdenominator\tn_num\tn_den\tmedian_ratio\tci_lo\tci_hi\tincludes_1']
    .concat(rows.map((r) => [r.label, r.num, r.den, data[r.num].length, data[r.den].length,
      r.obs.toFixed(4), r.lo.toFixed(4), r.hi.toFixed(4), r.inc1].join('\t'))).join('\n') + '\n', 'utf8');
console.log('');
console.log('已写 v4-ratios.tsv（seed=' + SEED + ', iters=' + ITERS + '）');

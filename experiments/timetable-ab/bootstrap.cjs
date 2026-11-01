// bootstrap.cjs — 对 81 个 run 的 chars 做 bootstrap 区间（零成本项②）
// 目的不是证明语言差异，而是量化"数据缺口有多大"：
// results.tsv 里 ops_from_log 只有 2 行有值，其余 79 行缺失，
// 因此无法按任务规模分层，只能对"混杂分布"取区间 —— 这个区间就是缺口的宽度。
// 用法: node bootstrap.cjs [--iters 10000] [--seed 20261031]
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const ITERS = getArg('--iters', 10000);
const SEED = getArg('--seed', 20261031);

// xorshift32，保证可复现
let s = SEED >>> 0 || 1;
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };

const DEDUP = args.includes('--dedup');
const rowsAll = fs.readFileSync(path.join(__dirname, 'results.tsv'), 'utf8')
  .trim().split(/\r?\n/).slice(1)
  .map((l) => {
    const c = l.split('\t');
    return { run: c[0], lang: c[1], chars: +c[6], ops: c[9] === '' ? null : +c[9] };
  })
  .filter((r) => Number.isFinite(r.chars) && r.chars > 0);

// 伪重复：同一份产物被多次登记（同 lang 同 chars 值）。
// --dedup 时每个 (lang, chars) 只保留一条，n 变成"独立产物数"。
const seen = new Set();
const rows = DEDUP
  ? rowsAll.filter((r) => { const k = r.lang + '|' + r.chars; if (seen.has(k)) return false; seen.add(k); return true; })
  : rowsAll;
if (DEDUP) console.log('== DEDUP 模式：' + rowsAll.length + ' 行 → ' + rows.length + ' 个独立产物 ==\n');

const median = (a) => { const b = [...a].sort((x, y) => x - y); const n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

function bootCI(arr, stat) {
  const out = [];
  for (let i = 0; i < ITERS; i++) {
    const bs = new Array(arr.length);
    for (let j = 0; j < arr.length; j++) bs[j] = pick(arr);
    out.push(stat(bs));
  }
  out.sort((a, b) => a - b);
  return [out[Math.floor(ITERS * 0.025)], out[Math.floor(ITERS * 0.975)]];
}

const byLang = {};
for (const r of rows) (byLang[r.lang] ||= []).push(r.chars);

const cl = byLang['common-lisp'] || [];
const js = byLang['javascript'] || [];

console.log('=== 每条语言的 chars 中位数与 95% bootstrap 区间 ===');
console.log('lang'.padEnd(14) + 'n'.padStart(4) + '  median'.padStart(10) + '   [2.5%, 97.5%]');
for (const [lang, arr] of Object.entries(byLang).sort((a, b) => b[1].length - a[1].length)) {
  const ci = arr.length > 2 ? bootCI(arr, median) : [NaN, NaN];
  console.log(lang.padEnd(14) + String(arr.length).padStart(4) + String(median(arr)).padStart(10) + '   [' + Math.round(ci[0]) + ', ' + Math.round(ci[1]) + ']');
}

if (cl.length > 2 && js.length > 2) {
  const obs = median(cl) - median(js);
  const diffs = [];
  for (let i = 0; i < ITERS; i++) {
    const a = Array.from({ length: cl.length }, () => pick(cl));
    const b = Array.from({ length: js.length }, () => pick(js));
    diffs.push(median(a) - median(b));
  }
  diffs.sort((x, y) => x - y);
  const lo = diffs[Math.floor(ITERS * 0.025)], hi = diffs[Math.floor(ITERS * 0.975)];
  const crossesZero = lo <= 0 && hi >= 0;
  console.log('');
  console.log('=== CL − JS（中位数差） ===');
  console.log('观测差 = ' + Math.round(obs) + ' chars');
  console.log('95% CI = [' + Math.round(lo) + ', ' + Math.round(hi) + ']');
  console.log('跨零? ' + (crossesZero ? 'YES → 在混杂分布下不可判' : 'NO'));
  console.log('相对差 = ' + ((obs / median(js)) * 100).toFixed(1) + '%（以 JS 中位数为基）');
}

console.log('');
console.log('=== 口径警告（必须写进报告） ===');
const withOps = rows.filter((r) => r.ops !== null).length;
console.log('results.tsv 中 ops_from_log 有效的行数: ' + withOps + ' / ' + rows.length);
console.log('因此以上区间混合了不同任务规模与不同轮次，它量化的是「数据缺口」，不是「语言效应」。');
console.log('要做语言效应，必须先补齐 ops 分层（或按 op 数配对）。');

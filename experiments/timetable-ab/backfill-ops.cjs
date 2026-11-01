// backfill-ops.cjs — 回填 results.tsv 的 ops_from_log
// 来源优先级：
//   1) log.txt 里最后一个 `#<N> <opname>` → op 总数（置信度高，且带每步 diff）
//   2) impl 源码里数 op 定义（CL: (defop…；JS: 注册表条目）
// 两侧都有且不一致 → 标 LOW 并写进 note
// 用法: node backfill-ops.cjs [--apply]
'use strict';
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const RUNS = path.join(__dirname, 'runs');
const TSV = path.join(__dirname, 'results.tsv');

const CL_DEFOP = /^\s*\(defop[-\w]*\s+/gm;
const JS_REG = /^\s{2}[A-Za-z_][\w]*:\s*\{\s*$/gm;

function opsFromLog(file) {
  if (!fs.existsSync(file)) return null;
  const t = fs.readFileSync(file, 'utf8');
  const nums = [...t.matchAll(/^[^\n]*?\|\s*#(\d+)\s+([A-Za-z_][\w-]*)/gm)].map((m) => +m[1]);
  if (!nums.length) return null;
  return { ops: Math.max(...nums), diffs: [...t.matchAll(/本步diff=\+(\d+)\/−(0|[0-9]+)/g)].map((m) => +m[1]) };
}

function opsFromImpl(file, lang) {
  if (!fs.existsSync(file)) return null;
  const t = fs.readFileSync(file, 'utf8');
  if (lang === 'common-lisp') return (t.match(CL_DEFOP) || []).length || null;
  if (lang === 'javascript') return (t.match(JS_REG) || []).length || null;
  return null; // 其余语言样本各 1 个，留 null 不猜
}

const lines = fs.readFileSync(TSV, 'utf8').trim().split(/\r?\n/);
const head = lines[0].split('\t');
const iRun = head.indexOf('run'), iLang = head.indexOf('lang'), iOps = head.indexOf('ops_from_log'), iNote = head.indexOf('note');

const out = [lines[0]];
const report = [];
for (const line of lines.slice(1)) {
  const c = line.split('\t');
  if (c.length < head.length) { out.push(line); continue; }
  const run = c[iRun], lang = c[iLang];
  const dir = path.join(RUNS, run);
  const logFile = path.join(dir, 'log.txt');
  const implFile = fs.existsSync(dir)
    ? (fs.readdirSync(dir).find((f) => /^impl\./.test(f)) || null)
    : null;

  const fromLog = opsFromLog(logFile);
  const fromImpl = implFile ? opsFromImpl(path.join(dir, implFile), lang) : null;

  let ops = null, source = '', conf = '';
  if (fromLog && fromImpl && fromLog.ops === fromImpl) { ops = fromLog.ops; source = 'log+impl'; conf = 'HIGH'; }
  else if (fromLog && fromImpl && fromLog.ops !== fromImpl) { ops = fromLog.ops; source = 'log'; conf = 'LOW'; }
  else if (fromLog) { ops = fromLog.ops; source = 'log'; conf = 'HIGH'; }
  else if (fromImpl) { ops = fromImpl; source = 'impl'; conf = 'MED'; }
  else { source = 'none'; conf = 'NA'; }

  if (ops !== null) c[iOps] = String(ops);
  if (conf === 'LOW') {
    c[iNote] = (c[iNote] ? c[iNote] + '; ' : '') + `ops: log=${fromLog.ops} vs impl=${fromImpl}（取 log）`;
  }
  report.push({ run, lang, ops, source, conf, impl: fromImpl, log: fromLog ? fromLog.ops : null, diffs: fromLog ? fromLog.diffs.length : 0 });
  out.push(c.join('\t'));
}

// 汇总
const sum = {};
for (const r of report) { const k = r.lang + '|' + r.conf; sum[k] = (sum[k] || 0) + 1; }
console.log('run'.padEnd(20) + 'lang'.padEnd(14) + 'ops'.padStart(5) + '  src'.padEnd(10) + 'conf'.padEnd(6) + 'diffs');
for (const r of report) {
  console.log(r.run.padEnd(20) + r.lang.padEnd(14) + String(r.ops ?? '-').padStart(5) + '  ' + r.source.padEnd(10) + r.conf.padEnd(6) + (r.diffs || ''));
}
console.log('\n=== 按语言 × 置信度 ===');
Object.entries(sum).sort().forEach(([k, v]) => console.log('  ' + k + '  x' + v));

if (APPLY) {
  fs.writeFileSync(TSV, out.join('\n') + '\n', 'utf8');
  console.log('\n已写回 results.tsv（--apply）');
} else {
  console.log('\n（dry run，加 --apply 才写回）');
}

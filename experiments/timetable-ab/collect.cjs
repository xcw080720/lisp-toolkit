// collect.cjs — 扫 runs/ 生成 results.tsv
// 字段定义见 RESULTS-SCHEMA.md。只填"能从文件里客观取到"的列；
// 需要人读的列（first_pass / rework_rounds / silent_failures）留空，不猜。
// 用法: node experiments/timetable-ab/collect.cjs [--out results.tsv]
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const RUNS = path.join(ROOT, 'runs');
const METRIC = path.join(ROOT, 'metric.cjs');

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const OUT = outIdx >= 0 ? argv[outIdx + 1] : path.join(ROOT, 'results.tsv');

const EXTS = ['.lisp', '.js', '.cjs', '.mjs', '.java', '.jl', '.rs', '.py', '.cpp', '.c', '.cc', '.cxx'];
const LANG = {
  '.lisp': 'common-lisp', '.js': 'javascript', '.cjs': 'javascript', '.mjs': 'javascript',
  '.java': 'java', '.jl': 'julia', '.rs': 'rust', '.py': 'python',
  '.cpp': 'cpp', '.c': 'cpp', '.cc': 'cpp', '.cxx': 'cpp'
};

const COLS = [
  'run', 'lang', 'impl', 'bytes', 'lines', 'code_lines', 'chars',
  'log', 'log_lines', 'ops_from_log', 'checks_in_log', 'first_green',
  'first_pass', 'rework_rounds', 'silent_failures', 'status', 'note'
];

// 辅助文件：不是被测实现，绝不能当 impl 计入（fanout-* 曾被误取 client.js）
const AUX = /^(client|tests?|schema|decls|validate|opsText|readme|log)\b/i;

function pickImpl(dir) {
  const files = fs.readdirSync(dir).filter((f) => EXTS.includes(path.extname(f).toLowerCase()));
  if (!files.length) return null;
  const cand = files.filter((f) => !AUX.test(f));
  if (!cand.length) return null;
  // 优先级：impl.* > emit.* > 其余（排序后取第一个，保证确定性）
  const rank = (f) => (/^impl\./i.test(f) ? 0 : /^emit\./i.test(f) ? 1 : 2);
  return cand.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))[0];
}

function measure(file) {
  const r = spawnSync(process.execPath, [METRIC, file], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const line = r.stdout.split('\n').filter((l) => l.startsWith('JSON: ')).pop();
  if (!line) return null;
  const rows = JSON.parse(line.slice(6));
  return rows && rows[0] ? rows[0] : null;
}

function parseLog(p) {
  if (!fs.existsSync(p)) return { log: 'no', log_lines: 0, ops_from_log: '', checks_in_log: 0, first_green: '' };
  const txt = fs.readFileSync(p, 'utf8');
  const lines = txt.split('\n').filter((l) => l.trim());
  // ops：从 --ops "a,b,c" 里取最长的一份
  let ops = 0;
  const re = /--ops\s+"([^"]+)"/g;
  let m;
  while ((m = re.exec(txt))) {
    const n = m[1].split(',').map((s) => s.trim()).filter(Boolean).length;
    if (n > ops) ops = n;
  }
  // 判据脚本名去重
  const checks = new Set();
  const re2 = /check-[a-z0-9-]+\.cjs/gi;
  while ((m = re2.exec(txt))) checks.add(m[0].toLowerCase());
  const firstGreen = /全绿|0 failed|passed/.test(txt) ? 'yes' : 'no';
  return { log: 'yes', log_lines: lines.length, ops_from_log: ops || '', checks_in_log: checks.size, first_green: firstGreen };
}

const rows = [];
let skipped = 0;
for (const name of fs.readdirSync(RUNS).sort()) {
  const dir = path.join(RUNS, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  const impl = pickImpl(dir);
  if (!impl) { skipped++; continue; }
  const full = path.join(dir, impl);
  const m = measure(full);
  if (!m) { skipped++; continue; }
  const lg = parseLog(path.join(dir, 'log.txt'));
  rows.push({
    run: name,
    lang: LANG[path.extname(impl).toLowerCase()] || 'other',
    impl,
    bytes: m.bytes,
    lines: m.lines,
    code_lines: m.codeLines,
    chars: m.chars,
    log: lg.log,
    log_lines: lg.log_lines,
    ops_from_log: lg.ops_from_log,
    checks_in_log: lg.checks_in_log,
    first_green: lg.first_green,
    first_pass: '', rework_rounds: '', silent_failures: '',
    status: 'auto', note: ''
  });
}

const tsv = [COLS.join('\t')]
  .concat(rows.map((r) => COLS.map((c) => (r[c] === '' ? '' : r[c])).join('\t')))
  .join('\n') + '\n';
fs.writeFileSync(OUT, tsv, 'utf8');

const byLang = {};
for (const r of rows) byLang[r.lang] = (byLang[r.lang] || 0) + 1;
console.log('rows=' + rows.length + ' skipped=' + skipped + ' -> ' + OUT);
console.log('by lang: ' + JSON.stringify(byLang));
const withLog = rows.filter((r) => r.log === 'yes').length;
const withOps = rows.filter((r) => r.ops_from_log !== '').length;
console.log('with log=' + withLog + '  with ops_from_log=' + withOps);
console.log('--- first 6 ---');
console.log(COLS.join('\t'));
for (const r of rows.slice(0, 6)) console.log(COLS.map((c) => r[c]).join('\t'));

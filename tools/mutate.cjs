// tools/mutate.cjs —— 变异测试：给判据打分（通用版）
//
//   node tools/mutate.cjs --impl impl.js --checker check.cjs [--max 30] [--json]
//
// 判据脚本的接口约定：
//   node <checker> --impl <mutant file>
//   stdout 里出现 `[FAIL] #<编号>` 视为该条判据失败（编号可含小数点，如 15.5）
//
// 杀死判定 = 变异体引入了基线没有的新失败。
// 基线本来就有红判据时不会误报 100%——这一点是这套工具最容易写错的地方。
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const impl = arg('--impl');
const checker = arg('--checker');
const MAX = Number(arg('--max', '40'));
const AS_JSON = argv.includes('--json');
if (!impl || !checker) {
  console.error('usage: node mutate.cjs --impl <file> --checker <checker.cjs> [--max N] [--json]');
  process.exit(2);
}
if (!fs.existsSync(impl)) { console.error('[mutate] 找不到实现: ' + impl); process.exit(2); }
if (!fs.existsSync(checker)) { console.error('[mutate] 找不到判据: ' + checker); process.exit(2); }

const isLisp = /\.lisp$/i.test(impl);
const src = fs.readFileSync(impl, 'utf8');
const lines = src.split('\n');

const RULES_JS = [
  { name: '<  → <=', re: /([^<>=!])<(?![=])/g, sub: '$1<=', skip: (l) => /for\s*\(/.test(l) },
  { name: '>  → >=', re: /([^<>=-])>(?![=])/g, sub: '$1>=', skip: (l) => /=>|for\s*\(/.test(l) },
  { name: '=== → !==', re: /===/g, sub: '!==', skip: () => false },
  { name: '!== → ===', re: /!==/g, sub: '===', skip: () => false },
  { name: '&& → ||', re: /&&/g, sub: '||', skip: () => false },
  { name: 'Math.min → Math.max', re: /Math\.min/g, sub: 'Math.max', skip: () => false },
  { name: 'Math.max → Math.min', re: /Math\.max/g, sub: 'Math.min', skip: () => false },
  { name: '+ 1 → + 2', re: /\+ 1\b/g, sub: '+ 2', skip: () => false },
  { name: '删一行', re: null, sub: null, skip: () => false }
];
const RULES_LISP = [
  { name: '(< → (<=', re: /\(< /g, sub: '(<= ', skip: () => false },
  { name: '(> → (>=', re: /\(> /g, sub: '(>= ', skip: () => false },
  { name: '(<= → (<', re: /\(<= /g, sub: '(< ', skip: () => false },
  { name: '(>= → (>', re: /\(>= /g, sub: '(> ', skip: () => false },
  { name: '(= → (/=', re: /\(= /g, sub: '(/= ', skip: () => false },
  { name: 'and → or', re: /\(and /g, sub: '(or ', skip: () => false },
  { name: 'or → and', re: /\(or /g, sub: '(and ', skip: () => false },
  { name: 'min → max', re: /\(min /g, sub: '(max ', skip: () => false },
  { name: 'max → min', re: /\(max /g, sub: '(min ', skip: () => false },
  { name: '删一行', re: null, sub: null, skip: () => false }
];
const RULES = isLisp ? RULES_LISP : RULES_JS;

const cands = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  if (isLisp && line.trim().startsWith(';')) continue;
  if (!isLisp && line.trim().startsWith('//')) continue;
  for (const r of RULES) {
    if (r.re === null) {
      if (isLisp && /^\s*\((defun|defmacro|defstruct|defvar|defparameter)/.test(line)) continue;
      if (!isLisp && /^\s*(function|const\s+\w+\s*=\s*\(|module\.exports)/.test(line)) continue;
      cands.push({ line: i + 1, rule: r.name, before: line.trim(),
        patch: (ls) => { const c = ls.slice(); c.splice(i, 1); return c.join('\n'); } });
      continue;
    }
    if (r.skip(line)) continue;
    r.re.lastIndex = 0;
    if (!r.re.test(line)) continue;
    r.re.lastIndex = 0;
    const after = line.replace(r.re, r.sub);
    if (after === line) continue;
    cands.push({ line: i + 1, rule: r.name, before: line.trim(),
      patch: (ls) => { const c = ls.slice(); c[i] = after; return c.join('\n'); } });
  }
}

let picked = cands;
if (cands.length > MAX) {
  const step = cands.length / MAX;
  picked = [];
  for (let k = 0; k < MAX; k++) picked.push(cands[Math.floor(k * step)]);
}

const failIds = (s) => [...String(s).matchAll(/\[FAIL\] #([\d.]+)/g)].map((m) => m[1]);
function runChecker(file) {
  const r = spawnSync(process.execPath, [checker, '--impl', file], { encoding: 'utf8', timeout: 180000 });
  return (r.stdout || '') + (r.stderr || '');
}

const baseOut = runChecker(impl);
const BASE_FAILS = new Set(failIds(baseOut));
const baseScore = baseOut.match(/--\s*(\d+) passed,\s*(\d+) failed/);
if (!AS_JSON) {
  console.log('候选 ' + cands.length + '，抽样 ' + picked.length + '，实现 ' + path.basename(impl));
  if (BASE_FAILS.size) console.log('⚠ 基线不绿（#' + [...BASE_FAILS].join(', #') + '）→ 按"新增失败"判杀死');
  else console.log('基线全绿：' + (baseScore ? baseScore[0] : '?(判据没输出比分)'));
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-'));
let killed = 0, invalid = 0, survived = [];

picked.forEach((m, n) => {
  const f = path.join(tmpDir, 'm' + n + (isLisp ? '.lisp' : '.js'));
  fs.writeFileSync(f, m.patch(lines), 'utf8');
  if (!isLisp) {
    const chk = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (chk.status !== 0) { invalid++; return; }
  }
  const out = runChecker(f);
  if (!/--\s*\d+ passed,\s*\d+ failed/.test(out)) { invalid++; return; }
  const fresh = failIds(out).filter((id) => !BASE_FAILS.has(id));
  if (fresh.length) killed++;
  else survived.push(m);
});

const total = killed + survived.length;
const score = total ? (100 * killed / total) : 0;
if (!AS_JSON) {
  console.log('');
  console.log('可用变异 ' + total + '（语法无效 ' + invalid + '）');
  console.log('杀死 ' + killed + '，存活 ' + survived.length);
  console.log('变异得分 = ' + score.toFixed(1) + '%');
  if (survived.length) {
    console.log('');
    console.log('=== 存活变异（判据看不见的错）===');
    for (const s of survived.slice(0, 40)) console.log('  L' + s.line + '  [' + s.rule + ']  ' + s.before.slice(0, 84));
    if (survived.length > 40) console.log('  …还有 ' + (survived.length - 40) + ' 条');
  }
}
console.log('GATE_JSON ' + JSON.stringify({
  impl: path.basename(impl),
  baselineGreen: BASE_FAILS.size === 0,
  total, killed, survived: survived.length, invalid, score: Number(score.toFixed(1))
}));

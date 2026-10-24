// mutate.cjs —— 变异测试：给判据打分
// 用法: node mutate.cjs --impl <实现> [--max 80] [--seed 7]
//
// 做法：对实现做"单点变异"（改一个运算符 / 一个常量 / 删一行），
// 逐个喂给 check-scale.cjs。
//   · 判据变红  = 该变异被"杀死"（判据看得见这个错）
//   · 判据仍绿  = 该变异"存活"（← 这就是判据的真实盲区，逐条列出来）
//
// 输出：变异得分 = 杀死数 / 存活数 + 杀死数，以及每一只存活变异的位置与原句。
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const impl = arg('--impl');
const MAX = Number(arg('--max', '80'));
if (!impl) { console.log('usage: node mutate.cjs --impl <file> [--max N]'); process.exit(2); }

const isLisp = /\.lisp$/i.test(impl);
const src = fs.readFileSync(impl, 'utf8');
const lines = src.split('\n');

// ---------- 变异规则（单点，尽量语义化） ----------
const RULES_JS = [
  { name: '<  → <=',   re: /([^<>=!])<(?![=])/g, sub: '$1<=', skip: (l) => /for\s*\(/.test(l) },
  { name: '>  → >=',   re: /([^<>=-])>(?![=])/g, sub: '$1>=', skip: (l) => /=>|for\s*\(/.test(l) },
  { name: '=== → !==', re: /===/g, sub: '!==', skip: () => false },
  { name: '!== → ===', re: /!==/g, sub: '===', skip: () => false },
  { name: '&& → ||',   re: /&&/g, sub: '||', skip: () => false },
  { name: 'Math.min → Math.max', re: /Math\.min/g, sub: 'Math.max', skip: () => false },
  { name: 'Math.max → Math.min', re: /Math\.max/g, sub: 'Math.min', skip: () => false },
  { name: '+ 1 → + 2', re: /\+ 1\b/g, sub: '+ 2', skip: () => false },
  { name: '|| 1 → || 2', re: /\|\| 1\b/g, sub: '|| 2', skip: () => false },
  { name: '删一行（非空非注释）', re: null, sub: null, skip: () => false }
];
const RULES_LISP = [
  { name: '(< → (<=',   re: /\(< /g, sub: '(<= ', skip: () => false },
  { name: '(> → (>=',   re: /\(> /g, sub: '(>= ', skip: () => false },
  { name: '(<= → (<',   re: /\(<= /g, sub: '(< ', skip: () => false },
  { name: '(>= → (>',   re: /\(>= /g, sub: '(> ', skip: () => false },
  { name: '= → /=' ,    re: /\(= /g, sub: '(/= ', skip: () => false },
  { name: 'and → or',   re: /\(and /g, sub: '(or ', skip: () => false },
  { name: 'or → and',   re: /\(or /g, sub: '(and ', skip: () => false },
  { name: '1+ → 2+',    re: /\(1\+ /g, sub: '(2+ ', skip: () => false },
  { name: 'min → max',  re: /\(min /g, sub: '(max ', skip: () => false },
  { name: 'max → min',  re: /\(max /g, sub: '(min ', skip: () => false },
  { name: '删一行（非空非注释）', re: null, sub: null, skip: () => false }
];
const RULES = isLisp ? RULES_LISP : RULES_JS;

// ---------- 生成候选变异 ----------
const cands = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  if (isLisp && line.trim().startsWith(';')) continue;
  if (!isLisp && line.trim().startsWith('//')) continue;

  for (const r of RULES) {
    if (r.re === null) {
      // 删一行：跳过 defmacro/defun/function 声明行，避免全废
      if (isLisp && /^\s*\((defun|defmacro|defstruct|defvar|defparameter)/.test(line)) continue;
      if (!isLisp && /^\s*(function|const\s+\w+\s*=\s*\(|module\.exports)/.test(line)) continue;
      cands.push({ line: i + 1, rule: r.name, before: line.trim(), after: '<删除>', patch: (ls) => { const c = ls.slice(); c.splice(i, 1); return c.join('\n'); } });
      continue;
    }
    if (r.skip(line)) continue;
    r.re.lastIndex = 0;
    if (!r.re.test(line)) continue;
    r.re.lastIndex = 0;
    const after = line.replace(r.re, r.sub);
    if (after === line) continue;
    cands.push({
      line: i + 1, rule: r.name, before: line.trim(), after: after.trim(),
      patch: (ls) => { const c = ls.slice(); c[i] = after; return c.join('\n'); }
    });
  }
}

// 抽样（确定性：按行号均匀取）
let picked = cands;
if (cands.length > MAX) {
  const step = cands.length / MAX;
  picked = [];
  for (let k = 0; k < MAX; k++) picked.push(cands[Math.floor(k * step)]);
}

console.log('候选变异 ' + cands.length + ' 个，抽样 ' + picked.length + ' 个，实现 ' + impl);

// 基线必须先探明：如果实现本来就红，就不能用"有没有红"来判定杀死
function failIds(stdout) {
  return [...stdout.matchAll(/\[FAIL\] #([\d.]+)/g)].map((m) => m[1]);
}
const ONLY_PRE = arg('--only');
const baseRun = spawnSync(process.execPath, [path.join(__dirname, 'check-scale.cjs'), '--impl', impl, ...(ONLY_PRE ? ['--only', ONLY_PRE] : [])], { encoding: 'utf8', timeout: 180000 });
const baseOut = baseRun.stdout || '';
const BASE_FAILS = new Set(failIds(baseOut));
const baseScore = baseOut.match(/--\s*(\d+) passed,\s*(\d+) failed/);
if (BASE_FAILS.size) {
  console.log('⚠ 基线不绿：' + baseScore[0]);
  console.log('  基线就失败的判据：#' + [...BASE_FAILS].join(', #'));
  console.log('  → 杀死判定改为「变异引入了基线没有的新失败」，否则会误判 100%');
} else {
  console.log('基线全绿：' + baseScore[0]);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-'));
const checker = path.join(__dirname, 'check-scale.cjs');
// 只跑指定编号（用于"前 k 条判据"的扫描）；不传则全跑
const ONLY_IDS = arg('--only') || null;
const onlyArgs = ONLY_IDS ? ['--only', ONLY_IDS] : [];
let killed = 0, survived = [], invalid = 0;

for (let n = 0; n < picked.length; n++) {
  const m = picked[n];
  const ext = isLisp ? '.lisp' : '.js';
  const f = path.join(tmpDir, 'm' + n + ext);
  fs.writeFileSync(f, m.patch(lines), 'utf8');

  // 语法闸门：坏掉的变异不算"存活"，单独计
  if (!isLisp) {
    const chk = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (chk.status !== 0) { invalid++; continue; }
  }

  const r = spawnSync(process.execPath, [checker, '--impl', f, ...onlyArgs], { encoding: 'utf8', timeout: 120000 });
  const out = r.stdout || '';
  const mm = out.match(/--\s*(\d+) passed,\s*(\d+) failed/);
  if (!mm) { invalid++; continue; }
  const newFails = failIds(out).filter((id) => !BASE_FAILS.has(id));
  if (newFails.length) killed++;
  else survived.push({ ...m, newFails });
}

const total = killed + survived.length;
const score = total ? (100 * killed / total) : 0;
console.log('');
console.log('可用变异 ' + total + '（语法无效 ' + invalid + '）');
console.log('杀死 ' + killed + '，存活 ' + survived.length);
console.log('变异得分 = ' + score.toFixed(1) + '%');
if (argv.includes('--json')) {
  console.log('GATE_JSON ' + JSON.stringify({
    impl: path.basename(impl),
    baselineGreen: BASE_FAILS.size === 0,
    total, killed, survived: survived.length, score: Number(score.toFixed(1))
  }));
}

if (survived.length) {
  console.log('');
  console.log('=== 存活变异（判据看不见的错）===');
  for (const s of survived.slice(0, 40)) {
    console.log('  L' + s.line + '  [' + s.rule + ']  ' + s.before.slice(0, 88));
  }
  if (survived.length > 40) console.log('  …还有 ' + (survived.length - 40) + ' 条');
}

// gen-closure-mutants.cjs —— 重放 12 条变异，做「36 条绿 / 补丁判据红」的证据表（覆盖 K1–K7）
// 用法: node gen-closure-mutants.cjs            （生成 + 跑全部）
//       node gen-closure-mutants.cjs --gen      （只生成文件）
//
// 为什么要有这一步：变异得分只说「有几个存活」，说不出「该不该补」。
// 判定一条存活变异值不值得补判据，唯一证据是：**它现在 36 条全绿，而补的那条红。**
// 顺带也把「等价变异」钉死 —— 补丁判据在它身上必须仍然绿（否则说明判据在咬实现偏好）。
'use strict';
const fs = require('fs'), crypto = require('crypto'), path = require('path'), { spawnSync } = require('child_process');

const HERE = __dirname;
const RUNS = path.join(HERE, 'runs');
const OUT = path.join(RUNS, 'closure-mutants');
const isLisp = /\.lisp$/.test;

// 每条：源实现、行号（1 起）、改法、对应补丁判据、归类
const MUTANTS = [
  // --- scale-js（mutate.cjs --max 30 抽样命中 5 条 ＋ shift 钳位 1 条）---
  { id: 'js-L1',   impl: 'scale-js/impl.js',   line: 1,   kind: 'delete', key: null,
    label: "'use strict'; 删掉", expect: 'equivalent', why: '指令序言，删掉不改变任何解析后状态' },
  { id: 'js-L30',  impl: 'scale-js/impl.js',   line: 30,  kind: 'delete', key: 'K1',
    label: 'tag: COERCE.tag(c.tag) 删掉', expect: 'gap', why: 'add 带的 tag 不再落进状态' },
  { id: 'js-L99',  impl: 'scale-js/impl.js',   line: 99,  kind: 'delete', key: 'K6',
    label: 'c.periodTo = Math.max(...) 删掉', expect: 'gap', why: 'move 里 periodTo 的唯一赋值处，删掉后 periodTo 保留旧值 → 合法输入即倒挂' },
  { id: 'js-L157', impl: 'scale-js/impl.js',   line: 157, kind: 'gt2ge', key: 'K2',
    label: 'if (nf > nt) → >=', expect: 'gap', why: '只剩一节时 trim 被跳过' },
  { id: 'js-L216', impl: 'scale-js/impl.js',   line: 216, kind: 'delete', key: 'K3',
    label: 'return targets.length 删掉', expect: 'gap', why: 'untag 的计数回不到 n' },
  { id: 'js-L187', impl: 'scale-js/impl.js',   line: 187, kind: 'unclamp-js', key: 'K7',
    label: 'shift 的 Math.max(1, ...) 钳位去掉', expect: 'gap', why: 'shift 不再夹在 ≥1：1..2 平移 -3 得 -2..-1' },
  // --- scale-lisp（同上 5 条 ＋ shift 钳位 1 条）---
  { id: 'cl-L127', impl: 'scale-lisp/impl.lisp', line: 127, kind: 'lt2le', key: null,
    label: '(< code 32) → (<= code 32)', expect: 'equivalent', why: '空格被转义成 \\u0020，解析后字符串相同' },
  { id: 'cl-L200', impl: 'scale-lisp/impl.lisp', line: 200, kind: 'delete', key: 'K4',
    label: ':location (str (cget al "location")) 删掉', expect: 'gap', why: 'add 给的 location 丢失' },
  { id: 'cl-L282', impl: 'scale-lisp/impl.lisp', line: 282, kind: 'max2min', key: 'K5',
    label: '(max 1 pfrom) → (min 1 pfrom)', expect: 'gap', why: 'add 把 periodFrom 一律压成 1' },
  { id: 'cl-L427', impl: 'scale-lisp/impl.lisp', line: 427, kind: 'and2or', key: null,
    label: '(and msg (string/= msg "")) → or', expect: 'unobservable', why: '没有任何 op 会返回空串 msg' },
  { id: 'cl-L444', impl: 'scale-lisp/impl.lisp', line: 444, kind: 'delete', key: null,
    label: '(finish-output) 删掉', expect: 'unchecked',
    why: '该行是顶层表单、在 main 之前执行，flush 的是空缓冲；"SBCL 退出仍 flush" 这个理由未被检验，不算等价' },
  { id: 'cl-L380', impl: 'scale-lisp/impl.lisp', line: 380, kind: 'unclamp-cl', key: 'K7',
    label: 'shift 的 (max 1 ...) 钳位去掉', expect: 'gap', why: 'shift 不再夹在 ≥1：1..2 平移 -3 得 -2..-1' }
];

function patch(lines, m) {
  const i = m.line - 1, out = lines.slice();
  const src = out[i];
  switch (m.kind) {
    case 'delete': out.splice(i, 1); break;
    case 'gt2ge':  out[i] = src.replace('nf > nt', 'nf >= nt'); break;
    case 'lt2le':  out[i] = src.replace('(< code 32)', '(<= code 32)'); break;
    case 'max2min':out[i] = src.replace('(max 1 (course-pfrom c))', '(min 1 (course-pfrom c))'); break;
    case 'and2or': out[i] = src.replace('(and msg', '(or msg'); break;
    // shift 的 ≥1 夹紧：只去掉 Math.max(1, ...) / (max 1 ...) 这层钳位，其余不动
    case 'unclamp-js': out[i] = src.replace('Math.max(1, c.periodFrom + p.delta)', '(c.periodFrom + p.delta)'); break;
    case 'unclamp-cl': out[i] = src.replace('(max 1 (+ (course-pfrom c) d))', '(+ (course-pfrom c) d)'); break;
    default: throw new Error('unknown kind ' + m.kind);
  }
  if (out[i] === src && m.kind !== 'delete') throw new Error(m.id + ' 补丁没匹配上');
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
const made = [];
for (const m of MUTANTS) {
  const srcPath = path.join(RUNS, m.impl);
  const lines = fs.readFileSync(srcPath, 'utf8').split('\n');
  const ext = path.extname(m.impl);
  const file = path.join(OUT, m.id + ext);
  fs.writeFileSync(file, patch(lines, m).join('\n'), 'utf8');
  made.push({ ...m, file });
}
console.log('生成 ' + made.length + ' 个变异文件 → ' + path.relative(HERE, OUT));
if (process.argv.includes('--gen')) process.exit(0);

// ---- 证据表：36 条 vs 补丁判据 ----
const env = { ...process.env, SBCL_WSL: process.env.SBCL_WSL || 'kali-linux' };
const rows = [];
for (const m of made) {
  const scale = spawnSync(process.execPath, [path.join(HERE, 'check-scale.cjs'), '--impl', m.file], { encoding: 'utf8', env, timeout: 600000 });
  const sOut = scale.stdout || '';
  const sm = sOut.match(/--\s*(\d+) passed,\s*(\d+) failed/);
  const clo = spawnSync(process.execPath, [path.join(HERE, 'check-closure.cjs'), '--impl', m.file], { encoding: 'utf8', env, timeout: 600000 });
  const cOut = clo.stdout || '';
  const cm = cOut.match(/--\s*(\d+) passed,\s*(\d+) failed/);
  const failedIds = [...cOut.matchAll(/\[FAIL\] (K\d)/g)].map((x) => x[1]);
  rows.push({
    id: m.id, expect: m.expect, key: m.key, label: m.label,
    scale: sm ? sm[1] + '/' + (+sm[1] + +sm[2]) : 'ERR',
    closure: cm ? cm[1] + '/' + (+cm[1] + +cm[2]) : 'ERR',
    failedIds: failedIds.join(',')
  });
}

console.log('');
console.log('变异'.padEnd(9) + '归类'.padEnd(13) + '36条'.padEnd(9) + '补丁判据'.padEnd(10) + '补丁里红的');
for (const r of rows) {
  console.log(r.id.padEnd(9) + r.expect.padEnd(13) + r.scale.padEnd(9) + r.closure.padEnd(10) + (r.failedIds || '—'));
}
const tsvPath = path.join(HERE, 'closure-matrix.tsv');
fs.writeFileSync(tsvPath,
  ['mutant\texpect\tkey\tscale36\tclosure\tclosure_failed\tlabel']
    .concat(rows.map((r) => [r.id, r.expect, r.key || '', r.scale, r.closure, r.failedIds, r.label].join('\t')))
    .join('\n') + '\n', 'utf8');
// 证据表本身是可再生的，所以要留存证：对 tsv 内容做 sha256，写进同目录的 .sha256
// （sha256sum 格式，`sha256sum -c closure-matrix.sha256` 可直接校验）。
const digest = crypto.createHash('sha256').update(fs.readFileSync(tsvPath)).digest('hex');
fs.writeFileSync(path.join(HERE, 'closure-matrix.sha256'), digest + '  closure-matrix.tsv\n', 'utf8');
console.log('');
console.log('证据表已写入 closure-matrix.tsv');
console.log('存证已写入 closure-matrix.sha256：' + digest);

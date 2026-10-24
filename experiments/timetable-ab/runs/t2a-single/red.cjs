'use strict';
// red.cjs —— 逐条证明 verify.cjs 能红：把某个 op 的 (defop "...") 表单用 #| ... |# 注释掉，
// 重跑 verify.cjs，要求"恰好这一条失败、其余 8 条仍绿"。
// 用法：node red.cjs [--impl impl.lisp]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const impl = path.resolve(arg('--impl', path.join(__dirname, 'impl.lisp')));
const text = fs.readFileSync(impl, 'utf8');

// {(defop "sortBy" ...)} -> B1 ...
const MAP = [
  ['sortBy', 'B1'], ['shiftAll', 'B2'], ['filterDay', 'B3'],
  ['countByTeacher', 'C1'], ['countByDay', 'C2'], ['busiestDay', 'C3'],
  ['conflictOf', 'D1'], ['sameTeacher', 'D2'], ['sameName', 'D3'],
];

// 括号配平（跳过字符串与 ; 注释），返回表单的结束下标（含）
function formSpan(src, start) {
  let depth = 0, i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ';') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '"') { i++; while (i < src.length && src[i] !== '"') { if (src[i] === '\\') i++; i++; } i++; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return i; }
    i++;
  }
  throw new Error('括号不配平 @' + start);
}

function disableOp(src, name) {
  const key = '(defop "' + name + '"';
  const at = src.indexOf(key);
  if (at < 0) throw new Error('找不到 ' + key);
  const end = formSpan(src, at);
  return src.slice(0, at) + '#|' + src.slice(at, end + 1) + '|#' + src.slice(end + 1);
}

function parse(out) {
  const ok = new Set(), bad = new Set();
  for (const line of (out || '').split(/\r?\n/)) {
    let m = /^\[ok  \] #(\S+)/.exec(line);
    if (m) ok.add(m[1]);
    m = /^\[FAIL\] #(\S+)/.exec(line);
    if (m) bad.add(m[1]);
  }
  return { ok, bad };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'red2a-'));
let fail = 0;
for (const [op, id] of MAP) {
  const f = path.join(tmp, 'impl.' + op + '.lisp');
  fs.writeFileSync(f, disableOp(text, op));
  const r = spawnSync(process.execPath, [path.join(__dirname, 'verify.cjs'), '--impl', f],
    { encoding: 'utf8', timeout: 180000 });
  const { ok, bad } = parse(r.stdout);
  const redOk = bad.has(id) && ok.size === 8;
  if (!redOk) fail++;
  console.log((redOk ? '[red-ok  ] ' : '[red-BAD ] ') + op.padEnd(15) +
    ' → 期望 #' + id + ' 失败；实际 失败={' + [...bad].join(',') + '} 通过=' + ok.size);
}
console.log('-- ' + (MAP.length - fail) + '/' + MAP.length + ' 条已证明能红');
process.exitCode = fail ? 1 : 0;

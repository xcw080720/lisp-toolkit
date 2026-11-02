// check-hygiene.cjs —— 进程级判据集（2026-11-01）
// 用法: node check-hygiene.cjs --impl <impl.lisp|impl.js> [--only H1,H2]
//
// 为什么单独一个文件：check-v4.cjs 判的是「输出内容对不对」，本文件判的是
// 「这个进程的输出形态对不对」——末尾字节、行尾空白、是否随工作目录变化。
// 后者需要跨两次调用比对，和内容判据不是一个机制，硬塞进去会把冻结文件搅乱。
//
// 两条判据的 spec 依据（tasks/v3-full.spec.md）：
//    H1  L61 「空课表时 #state 之后没有任何行。行尾不得有空格，用 \n 结尾。」
//    H2  L124「不得依赖当前工作目录」
//
// 踩过的坑（必须保留在文件里）：H1 第一次写成 /[ \t]$/，
// 对 NBSP（U+00A0，UTF-8 C2 A0）尾空完全漏检。现用 \s 并加字节白名单复核。
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const impl = arg('--impl');
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
if (!impl) { console.log('usage: node check-hygiene.cjs --impl <file> [--only H1,H2]'); process.exit(2); }

const ABS = path.resolve(impl);
const isLisp = /\.lisp$/i.test(ABS);

// 一组覆盖四种输出形态的命令：空表、有内容、错误、--dry
const CMDS = [
  ['count'],
  ['add a t1 r1 1 1 2'],
  ['add a - - 1 1 2'],
  ['add a t1 r1 1 1 2', 'add b t2 r2 2 3 4'],
  ['add abcdefghijkl t r 1 1 2'],
  ['del ghost'],
  ['--dry add a t1 r1 1 1 2'],
  ['add a t1 r1 1 1 2', 'swapTeacher a a'],
];

function run(cwd, cmds) {
  if (isLisp) {
    const w = (p) => '/mnt/' + p[0].toLowerCase() + p.slice(2).replace(/\\/g, '/');
    const r = spawnSync('wsl', ['-d', process.env.SBCL_WSL || 'kali-linux', '-u', 'root', '--', 'bash', '-lc',
      `cd ${w(cwd)} && sbcl --script ${w(ABS)} ${cmds.map((c) => `'${c}'`).join(' ')} 2>/dev/null`],
      { encoding: 'buffer', timeout: 120000 });
    return r.stdout || Buffer.alloc(0);
  }
  const r = spawnSync(process.execPath, [ABS, ...cmds], { cwd, timeout: 60000 });
  return r.stdout || Buffer.alloc(0);
}

// ---- H1：行尾卫生 ----
// 末尾必须是恰好一个 LF；任何行的行尾不得有空白字符（含 NBSP / 全角空格）
function checkH1(buf) {
  const bad = [];
  if (buf.length === 0) return ['EMPTY_OUTPUT'];
  if (buf[buf.length - 1] !== 0x0a) bad.push('MISSING_FINAL_LF');
  if (buf.length >= 2 && buf[buf.length - 2] === 0x0a) bad.push('EXTRA_BLANK_AT_END');

  const text = buf.toString('utf8');
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    if (i === lines.length - 1) return; // 最后一个空段
    const lbytes = Buffer.from(l, 'utf8');
    if (lbytes.length === 0) return;

    // —— 行尾 ——
    const tail = lbytes;
    const last2 = tail.slice(-2), last3 = tail.slice(-3);
    const isNbsp = last2.length === 2 && last2[0] === 0xc2 && last2[1] === 0xa0;
    const isIdeo = last3.length === 3 && last3[0] === 0xe3 && last3[1] === 0x80 && last3[2] === 0x80;
    const isSpace = tail[tail.length - 1] === 0x20;
    const isTab = tail[tail.length - 1] === 0x09;
    if (isSpace || isTab || isNbsp || isIdeo) bad.push(`TRAILING_WS line ${i + 1}`);
    if (/\s$/.test(l) && !(isSpace || isTab || isNbsp || isIdeo)) bad.push(`TRAILING_UNICODE_WS line ${i + 1}`);

    // —— 行首（2026-11-01 补：此前只查行尾，v4 的 trim() 会吃掉行首，两边同时失明）——
    const head2 = lbytes.slice(0, 2), head3 = lbytes.slice(0, 3);
    const hNbsp = head2.length === 2 && head2[0] === 0xc2 && head2[1] === 0xa0;
    const hIdeo = head3.length === 3 && head3[0] === 0xe3 && head3[1] === 0x80 && head3[2] === 0x80;
    const hSpace = lbytes[0] === 0x20;
    const hTab = lbytes[0] === 0x09;
    if (hSpace || hTab || hNbsp || hIdeo) bad.push(`LEADING_WS line ${i + 1}`);
  });
  return [...new Set(bad)];
}

// ---- H2：不依赖 cwd ----
function checkH2(dirA, dirB) {
  const bad = [];
  for (const cmds of CMDS) {
    const a = run(dirA, cmds);
    const b = run(dirB, cmds);
    if (!a.equals(b)) bad.push(`CWD_DEPENDENT: ${cmds.join(' ')}`);
  }
  return [...new Set(bad)];
}

// ---- 执行 ----
const dirA = os.tmpdir();
const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'hyg-'));
const dirC = path.join(path.dirname(ABS)); // 第三个：实现自己所在目录

const results = [];
if (!ONLY.length || ONLY.includes('H1')) {
  const bad = [];
  for (const cmds of CMDS) bad.push(...checkH1(run(dirA, cmds)));
  const uniq = [...new Set(bad)];
  results.push({ id: 'H1', name: '行尾卫生（L61）', ok: uniq.length === 0, detail: uniq });
}
if (!ONLY.length || ONLY.includes('H2')) {
  const uniq = [...new Set([...checkH2(dirA, dirB), ...checkH2(dirA, dirC)])];
  results.push({ id: 'H2', name: '不依赖 cwd（L124）', ok: uniq.length === 0, detail: uniq });
}

let pass = 0;
for (const r of results) {
  if (r.ok) { pass++; console.log(`[ok  ] ${r.id} ${r.name}`); }
  else console.log(`[FAIL] ${r.id} ${r.name} → ${r.detail.slice(0, 3).join(' | ')}`);
}
console.log(`-- ${pass} passed, ${results.length - pass} failed`);
try { fs.rmSync(dirB, { recursive: true, force: true }); } catch {}
process.exit(pass === results.length ? 0 : 1);

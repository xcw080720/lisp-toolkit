// check-static.cjs —— 静态判据集（2026-11-01）
// 用法: node check-static.cjs --impl <impl.lisp|impl.js> [--only S1,S2]
//
// 为什么是静态的：L93 禁止事项写的是「违反即作废」，指的是**这份产物做了什么**，
// 不是它输出什么。文件 IO 可以完全不改变 stdout（已实测：变异体读了一个文件，
// 输出逐字节相同，74/80 判据一条没动），所以动态判据永远抓不到它，只能扫源码。
//
// 判据依据（tasks/v3-full.spec.md L93–97）：
//    S1  读写任何文件
//    S2  任何 JSON / 序列化 / 反序列化（JS 侧 JSON.parse/stringify；CL 侧无同等物，跳过）
//
// 诚实声明：静态扫描会漏（动态拼字符串、间接调用），也可能会误报（注释里的同名词）。
// 它证明的是「没有明显的文件 IO」，不是「绝对没有」。这条边界写在文件里，不藏。
'use strict';
const fs = require('fs');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const impl = arg('--impl');
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
if (!impl) { console.log('usage: node check-static.cjs --impl <file> [--only S1,S2]'); process.exit(2); }

const isLisp = /\.lisp$/i.test(impl);
const src = fs.readFileSync(impl, 'utf8');

// 去注释后再扫，避免注释里的同名词误报
function stripComments(text, lisp) {
  if (lisp) {
    return text.replace(/;.*$/gm, '')          // 行注释
               .replace(/#\|[\s\S]*?\|#/g, ''); // 块注释
  }
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
             .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const body = stripComments(src, isLisp);

// ---- S1：文件读写 ----
const JS_IO = [
  /\brequire\s*\(\s*['"]fs['"]\s*\)/,
  /\brequire\s*\(\s*['"]node:fs['"]\s*\)/,
  /\brequire\s*\(\s*['"]path['"]\s*\)/,
  /\brequire\s*\(\s*['"]os['"]\s*\)/,
  /\bfs\s*\.\s*(readFile|readFileSync|writeFile|writeFileSync|open|openSync|createReadStream|createWriteStream|appendFile)/,
  /\bprocess\s*\.\s*(cwd|chdir)\s*\(/,   // cwd 依赖另由 H2 动态测，这里只提示不判失败（见下）
];
const CL_IO = [
  /\(\s*(with-open-file|open|probe-file|directory|delete-file|rename-file|file-write-date)\b/,
  /\(\s*require\s*['"]?(sb-posix|uiop|asdf)/,
];

// ---- S2：JSON 序列化 ----
const JS_JSON = [/\bJSON\s*\.\s*(parse|stringify)\s*\(/];
const CL_JSON = [];

function scan(rules) {
  const hits = [];
  for (const re of rules) {
    const m = body.match(re);
    if (m) hits.push(m[0].replace(/\s+/g, ' '));
  }
  return [...new Set(hits)];
}

const results = [];

if (!ONLY.length || ONLY.includes('S1')) {
  const hits = scan(isLisp ? CL_IO : JS_IO);
  results.push({ id: 'S1', name: '禁止文件 IO（L94）', ok: hits.length === 0, detail: hits });
}

if (!ONLY.length || ONLY.includes('S2')) {
  const hits = scan(isLisp ? CL_JSON : JS_JSON);
  results.push({ id: 'S2', name: '禁止 JSON 序列化（L95）', ok: hits.length === 0, detail: hits });
}

let pass = 0;
for (const r of results) {
  if (r.ok) { pass++; console.log(`[ok  ] ${r.id} ${r.name}`); }
  else console.log(`[FAIL] ${r.id} ${r.name} → ${r.detail.slice(0, 3).join(' | ')}`);
}
console.log(`-- ${pass} passed, ${results.length - pass} failed`);
process.exit(pass === results.length ? 0 : 1);

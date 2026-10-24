// check-parens.cjs — 载入前的静态检查：括号平衡 + 字符串/注释跳过
// 用法： node check-parens.cjs impl.lisp
'use strict';
const fs = require('fs');
const path = process.argv[2];
const src = fs.readFileSync(path, 'utf8');
let depth = 0, inStr = false, esc = false, inComment = false, line = 1;
const stack = [];
for (let k = 0; k < src.length; k++) {
  const ch = src[k];
  if (ch === '\n') { line++; inComment = false; continue; }
  if (inComment) continue;
  if (inStr) {
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = false; }
    continue;
  }
  if (ch === '"') { inStr = true; continue; }
  if (ch === '#' && src[k + 1] === '\\') {
    k += 2;                                                   // 落在字符字面量本身
    while (k + 1 < src.length && /[A-Za-z0-9]/.test(src[k + 1])) k++;  // #\Space 这类
    continue;                                                 // for 的 k++ 把它送过去
  }
  if (ch === ';') { inComment = true; continue; }
  if (ch === '(') { depth++; stack.push(line); continue; }
  if (ch === ')') {
    depth--;
    stack.pop();
    if (depth < 0) { console.log(`[FAIL] 多余的右括号，行 ${line}`); process.exit(1); }
  }
}
if (depth !== 0) {
  console.log(`[FAIL] 未闭合的括号 ${depth} 个，最近的起点行：${stack.slice(-depth).join(', ')}`);
  process.exit(1);
}
console.log('[ok] 括号平衡');

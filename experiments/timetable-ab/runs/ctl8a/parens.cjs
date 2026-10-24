'use strict';
// 极简 Lisp 括号平衡检查：懂字符串、; 行注释、#\X 字符字面量
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let depth = 0, inStr = false, i = 0, lastStart = 0;
const lineOf = (pos) => src.slice(0, pos).split('\n').length;
const colOf = (pos) => pos - src.lastIndexOf('\n', pos - 1);
for (; i < src.length; i++) {
  const c = src[i];
  if (inStr) {
    if (c === '\\') { i++; continue; }
    if (c === '"') { inStr = false; }
    continue;
  }
  if (c === '"') { inStr = true; continue; }
  if (c === ';') { while (i < src.length && src[i] !== '\n') i++; continue; }
  if (c === '#' && src[i + 1] === '\\') {
    // 字符字面量：#\ 后面可能是 " ( ) 或名字
    i += 2;
    while (i + 1 < src.length && /[A-Za-z0-9-]/.test(src[i + 1])) i++;
    continue;
  }
  if (c === '(') {
    if (depth === 0) lastStart = i;
    depth++;
  }
  if (c === ')') {
    depth--;
    if (depth < 0) { console.log('EXTRA ) at line ' + lineOf(i) + ' col ' + colOf(i)); process.exit(1); }
    if (depth === 0 && process.env.V) console.log('  form closed at line ' + lineOf(i));
  }
}
if (inStr) console.log('UNTERMINATED string');
if (depth !== 0) console.log('  last open form starts at line ' + lineOf(lastStart));
console.log(depth === 0 && !inStr ? 'BALANCED' : 'UNBALANCED depth=' + depth);
process.exit(depth === 0 && !inStr ? 0 : 1);

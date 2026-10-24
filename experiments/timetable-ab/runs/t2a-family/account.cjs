// account.cjs — 从成品文件里量每个块的真实行数（括号配平法），给记账用
'use strict';
const fs = require('fs');
const f = process.argv[2] || 'impl.lisp';
const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);

function span(start) {                       // start 为 0-based 行号，返回 [start, end]（0-based，含）
  let depth = 0, started = false;
  for (let i = start; i < lines.length; i++) {
    const s = lines[i];
    let inStr = false;
    for (let k = 0; k < s.length; k++) {
      const ch = s[k];
      if (ch === '\\') { k++; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === ';') break;                 // 行内注释
      if (ch === '(') { depth++; started = true; }
      else if (ch === ')') { depth--; }
    }
    if (started && depth <= 0) return [start, i];
  }
  return [start, lines.length - 1];
}

const rows = [];
lines.forEach((l, i) => {
  const m = l.match(/^\((defop-family|defop-[a-z-]+|defop) /);
  if (m) rows.push({ kind: m[1], start: i, ...{} });
});
for (const r of rows) {
  const [s, e] = span(r.start);
  r.end = e; r.n = e - s + 1;
  const head = lines[s].trim();
  r.head = head.length > 52 ? head.slice(0, 52) + '…' : head;
}
const w = (n) => String(n).padStart(3);
console.log('kind                 lines  L(start-end)  head');
for (const r of rows) {
  console.log(r.kind.padEnd(20) + w(r.n) + '  ' + ('L' + (r.start + 1) + '-' + (r.end + 1)).padEnd(13) + r.head);
}
console.log('-- 文件总行数 ' + lines.filter((x, i) => !(i === lines.length - 1 && x === '')).length);

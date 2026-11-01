// probe-semicolon.cjs — 检查 metric.cjs 的"剥行注释"是否误伤字符串内的分号
// 逻辑：逐行找第一个 ;，如果它前面未转义的双引号个数为奇数，说明这个 ; 在字符串里，
// metric 会把字符串后半截当注释剥掉 → 字符数被少算。
'use strict';
const fs = require('fs');

function analyze(file) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let bad = 0, badLines = 0;
  const detail = [];
  for (const l of lines) {
    const i = l.indexOf(';');
    if (i < 0) continue;
    let q = 0;
    for (let k = 0; k < i; k++) {
      if (l[k] === '"' && l[k - 1] !== '\\') q++;
    }
    if (q % 2 === 1) {
      bad += l.slice(i).replace(/\s+/g, '').length;
      badLines++;
      detail.push(l.trim().slice(0, 70));
    }
  }
  return { bad, badLines, detail };
}

const targets = [
  'runs/v3-cl-macro-r1/impl.lisp', 'runs/v3-cl-macro-r2/impl.lisp', 'runs/v3-cl-macro-r3/impl.lisp',
  'runs/v3-cl-inline-r1/impl.lisp', 'runs/v3-cl-inline-r2/impl.lisp', 'runs/v3-cl-inline-r3/impl.lisp',
  'runs/evo-cl-macro-b1/impl.lisp', 'runs/evo-cl-macro-b2/impl.lisp', 'runs/evo-cl-macro-b3/impl.lisp',
  'runs/evo-cl-inline-b1/impl.lisp', 'runs/evo-cl-inline-b2/impl.lisp', 'runs/evo-cl-inline-b3/impl.lisp',
  'runs/maint-cl-macro/impl.lisp', 'runs/maint-cl-inline/impl.lisp', 'ref-cl.lisp',
];

console.log('文件'.padEnd(34) + '误剥字符'.padStart(9) + '误剥行'.padStart(7));
let tot = 0, affected = 0;
for (const f of targets) {
  if (!fs.existsSync(f)) { console.log(f.padEnd(34) + '  (缺)'); continue; }
  const r = analyze(f);
  tot += r.bad;
  if (r.bad > 0) affected++;
  console.log(f.padEnd(34) + String(r.bad).padStart(9) + String(r.badLines).padStart(7));
  if (r.bad > 0) r.detail.slice(0, 2).forEach((d) => console.log('      > ' + d));
}
console.log('\n合计误剥字符 = ' + tot + '，受影响文件 = ' + affected + ' / ' + targets.length);

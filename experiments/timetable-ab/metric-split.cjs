// metric-split.cjs — 把实现拆成 io / core 两栏，回答"1.93× 里有多少是库，多少是语言"
// 规则：优先用文件里的分节标记切出 I/O 段（各语言实现都留了标记）；
//       没有标记的实现退化为关键词行匹配，并在 method 列标注 kw（可信度低）。
// 用法: node metric-split.cjs
'use strict';
const fs = require('fs');
const path = require('path');

const RUNS = path.join(__dirname, 'runs');

// 每个实现：io 段的行区间（1-based, 闭区间）或 null（走关键词兜底）
const PLAN = {
  'scale-lisp/impl.lisp': { io: [[6, 167]], note: '§1 JSON 读 + §2 JSON 写' },
  'scale-js/impl.js': { kw: true, note: '内置 JSON，无 io 段；按关键词取' },
  'f-java/impl.java': { io: [[7, 137]], note: 'JSON READ/WRITE BEGIN..END' },
  'f-julia/impl.jl': { io: [[5, 271]], note: 'JSON 值类型/读/写' },
  'f-cpp/impl.cpp': { io: [[15, 234]], note: 'JSON 值/解析器/序列化' },
  'f-rust/impl.rs': { kw: true, note: '无分节标记，关键词兜底' },
  'f-python/impl.py': { kw: true, note: '无分节标记，关键词兜底' },
};

const KW = /(json|parse|serial|escape|readfile|read_to_string|read_text|slurp|spit|ifstream|open\(|println|console\.log|print\(|format!|fmt\.)/i;

function chars(lines) {
  const s = lines
    .map((l) => {
      // 逐行剥行注释（; // # 三种；对这批实现够用）
      let x = l;
      for (const m of [';', '//']) { const i = x.indexOf(m); if (i >= 0) x = x.slice(0, i); }
      const h = x.indexOf('#');
      if (h >= 0 && !/^\s*#\s*\[/.test(x)) x = x.slice(0, h);
      return x;
    })
    .join('\n');
  return s.replace(/\s+/g, '').length;
}

const rows = [];
for (const [rel, plan] of Object.entries(PLAN)) {
  const f = path.join(RUNS, rel);
  if (!fs.existsSync(f)) { console.error('missing', rel); continue; }
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const total = chars(lines);
  let ioChars = 0, method = 'mark';
  if (plan.io) {
    const picked = [];
    for (const [a, b] of plan.io) picked.push(...lines.slice(a - 1, b));
    ioChars = chars(picked);
  } else {
    method = 'kw';
    ioChars = chars(lines.filter((l) => KW.test(l)));
  }
  rows.push({ rel, total, io: ioChars, core: total - ioChars, method, note: plan.note });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('实现', 26) + pad('总字符', 9) + pad('io', 8) + pad('core', 9) + pad('io%', 7) + 'method');
for (const r of rows.sort((a, b) => a.total - b.total)) {
  console.log(pad(r.rel, 26) + pad(r.total, 9) + pad(r.io, 8) + pad(r.core, 9) + pad(((r.io / r.total) * 100).toFixed(1), 7) + r.method);
}
const js = rows.find((r) => r.rel.startsWith('scale-js'));
const cl = rows.find((r) => r.rel.startsWith('scale-lisp'));
if (js && cl) {
  console.log('');
  console.log('CL 总/JS 总      = ' + (cl.total / js.total).toFixed(2) + 'x');
  console.log('CL core/JS 总    = ' + (cl.core / js.total).toFixed(2) + 'x');
  console.log('CL core/JS core  = ' + (cl.core / js.core).toFixed(2) + 'x');
}

// metric.cjs —— 用"非空白字符"重算各臂的实现体积（去掉注释与空白）
// 用法: node metric.cjs <file> [<file> ...]
// 输出: 物理行 / 非空非注释行 / 非空白非注释字符
'use strict';
const fs = require('fs'), path = require('path');

function langOf(f) {
  const e = path.extname(f).toLowerCase();
  if (e === '.lisp') return 'lisp';
  if (e === '.js' || e === '.cjs' || e === '.mjs') return 'js';
  if (e === '.java') return 'java';
  if (e === '.jl') return 'julia';
  if (e === '.rs') return 'rust';
  if (e === '.py') return 'python';                       // 2026-10-24 补：原先落到 other，注释按 JS 规则剥，Python 的 # 没剥
  if (e === '.cpp' || e === '.cc' || e === '.cxx' || e === '.c' || e === '.h') return 'cpp';
  return 'other';
}

// 极简注释剥离：只处理行注释与块注释，不处理字符串内的 ; // /* #（对这几个实现足够，且对三语言一视同仁）
function stripComments(src, lang) {
  let s = src;
  if (lang === 'lisp') {
    // 逐行：第一个 ; 之后丢弃（不处理字符串内的分号，但这些实现里很少）
    s = s.split('\n').map((l) => { const i = l.indexOf(';'); return i >= 0 ? l.slice(0, i) : l; }).join('\n');
  } else if (lang === 'python') {
    // Python：逐行剥 #（同样不处理字符串内的 #；三引号块注释未处理，实测这些实现里没有）
    s = s.split('\n').map((l) => { const i = l.indexOf('#'); return i >= 0 ? l.slice(0, i) : l; }).join('\n');
  } else {
    s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');        // 块注释
    s = s.split('\n').map((l) => { const i = l.indexOf('//'); return i >= 0 ? l.slice(0, i) : l; }).join('\n');
  }
  return s;
}

function measure(f) {
  const raw = fs.readFileSync(f, 'utf8');
  const lang = langOf(f);
  const noComment = stripComments(raw, lang);
  const lines = raw.split('\n');
  const codeLines = noComment.split('\n').filter((l) => l.trim().length > 0);
  const chars = noComment.replace(/\s+/g, '');
  return {
    file: f,
    lang,
    lines: lines.length,
    codeLines: codeLines.length,
    chars: chars.length,
    bytes: Buffer.byteLength(raw, 'utf8')
  };
}

const files = process.argv.slice(2);
if (!files.length) { console.log('usage: node metric.cjs <file> [...]'); process.exit(2); }

const rows = files.map(measure);
const w = (s, n) => String(s).padEnd(n);
console.log(w('文件', 46) + w('语言', 8) + w('物理行', 8) + w('代码行', 8) + w('字符', 9));
for (const r of rows) {
  console.log(w(r.file.replace(/^.*[\\/]/, ''), 46) + w(r.lang, 8) + w(r.lines, 8) + w(r.codeLines, 8) + w(r.chars, 9));
}
console.log('\nJSON: ' + JSON.stringify(rows));

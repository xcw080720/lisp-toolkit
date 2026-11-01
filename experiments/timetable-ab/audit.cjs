// audit.cjs — 全量取证审计：每个 run 目录的证据完整性与文件健康度
// 用法: node audit.cjs [--tsv out.tsv]
// 检查项：prompt.txt / impl.* / log.txt 是否存在；impl 字节数、非 ASCII、CRLF、括号平衡(Lisp)
'use strict';
const fs = require('fs');
const path = require('path');

const RUNS = path.join(__dirname, 'runs');
const dirs = fs.readdirSync(RUNS).filter((d) => fs.statSync(path.join(RUNS, d)).isDirectory()).sort();

const IMPL_EXT = ['.lisp', '.js', '.cjs', '.mjs', '.java', '.jl', '.rs', '.py', '.cpp'];
const rows = [];

for (const d of dirs) {
  const dir = path.join(RUNS, d);
  const files = fs.readdirSync(dir);
  const impl = files.find((f) => IMPL_EXT.includes(path.extname(f).toLowerCase()));
  const hasPrompt = files.includes('prompt.txt');
  const hasLog = files.includes('log.txt');

  let bytes = 0, nonascii = 0, crlf = 0, parenOk = null;
  if (impl) {
    const buf = fs.readFileSync(path.join(dir, impl));
    bytes = buf.length;
    for (const b of buf) if (b > 127) nonascii++;
    const txt = buf.toString('utf8');
    crlf = (txt.match(/\r\n/g) || []).length;
    if (path.extname(impl).toLowerCase() === '.lisp') {
      // 粗算括号平衡（剥字符串与注释后）
      let depth = 0, inStr = false, ok = true;
      for (let i = 0; i < txt.length; i++) {
        const c = txt[i];
        if (c === '"' && txt[i - 1] !== '\\') inStr = !inStr;
        if (inStr) continue;
        if (c === ';') { while (i < txt.length && txt[i] !== '\n') i++; continue; }
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth < 0) ok = false; }
      }
      parenOk = ok && depth === 0;
    }
  }

  rows.push({ run: d, impl: impl || '-', hasPrompt, hasLog, bytes, nonascii, crlf, parenOk });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('run', 24) + pad('impl', 12) + pad('prompt', 8) + pad('log', 6) + pad('bytes', 8) + pad('nonASCII', 10) + pad('CRLF', 6) + 'paren');
for (const r of rows) {
  console.log(
    pad(r.run, 24) + pad(r.impl, 12) + pad(r.hasPrompt ? 'Y' : 'N', 8) + pad(r.hasLog ? 'Y' : 'N', 6) +
    pad(r.bytes, 8) + pad(r.nonascii, 10) + pad(r.crlf, 6) +
    (r.parenOk === null ? '-' : r.parenOk ? 'ok' : 'BAD')
  );
}

const missPrompt = rows.filter((r) => !r.hasPrompt).length;
const missLog = rows.filter((r) => !r.hasLog).length;
const noImpl = rows.filter((r) => r.impl === '-').length;
const nonasciiFiles = rows.filter((r) => r.nonascii > 0).length;
const crlfFiles = rows.filter((r) => r.crlf > 0).length;
const badParen = rows.filter((r) => r.parenOk === false).length;

console.log('\n=== 汇总 ===');
console.log('run 总数            = ' + rows.length);
console.log('缺 prompt.txt       = ' + missPrompt);
console.log('缺 log.txt          = ' + missLog);
console.log('缺 impl             = ' + noImpl);
console.log('含非 ASCII 字节     = ' + nonasciiFiles);
console.log('含 CRLF 行          = ' + crlfFiles);
console.log('括号不平衡(Lisp)    = ' + badParen);

const i = process.argv.indexOf('--tsv');
if (i >= 0 && process.argv[i + 1]) {
  const head = 'run\timpl\thas_prompt\thas_log\tbytes\tnonascii\tcrlf\tparen_ok\n';
  const body = rows.map((r) => [r.run, r.impl, r.hasPrompt ? 'Y' : 'N', r.hasLog ? 'Y' : 'N', r.bytes, r.nonascii, r.crlf, r.parenOk === null ? '-' : r.parenOk ? 'ok' : 'BAD'].join('\t')).join('\n');
  fs.writeFileSync(process.argv[i + 1], head + body + '\n', 'utf8');
  console.log('TSV 已写: ' + process.argv[i + 1]);
}

// q.mjs — 往常驻 SBCL 会话送 form，读回打印值。
// 用法：node q.mjs --f forms.lisp   （从文件送，避开 PowerShell 改引号）
//       node q.mjs "<form>"
import fs from 'node:fs';

let form;
if (process.argv[2] === '--f') form = fs.readFileSync(process.argv[3], 'utf8');
else form = process.argv[2];
const seq = 'Q' + Date.now() + '_' + Math.floor(Math.random() * 1000);
fs.appendFileSync('inbox.txt', seq + '\t' + form.replace(/\n/g, '\\n') + '\n');
const t0 = Date.now();
const head = '<<' + seq + '>>\n';
const tail = '<<end ' + seq + '>>';
while (Date.now() - t0 < 40000) {
  const s = fs.readFileSync('outbox.txt', 'utf8');
  const i = s.indexOf(head);
  const j = s.indexOf(tail);
  if (i >= 0 && j > i) {
    process.stdout.write(s.slice(i + head.length, j));
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 100));
}
console.log('<<no-result>>');
process.exit(1);

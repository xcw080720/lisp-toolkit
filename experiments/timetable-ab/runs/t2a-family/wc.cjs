// wc.cjs — 统一行数口径：按 \r?\n 切，丢掉末尾空元素（= 编辑器/read 工具的口径）
const fs = require('fs');
for (const f of process.argv.slice(2)) {
  const s = fs.readFileSync(f, 'utf8');
  const lines = s.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  console.log(String(lines.length).padStart(5) + '  ' + f);
}

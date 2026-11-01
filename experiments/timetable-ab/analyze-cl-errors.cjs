// analyze-cl-errors.cjs —— CL 十二格的错误分布（错误分类 + 失败判据）
// 用法: node analyze-cl-errors.cjs [--prefix v5] [--json]
//
// 为什么要有它：第一轮只看"过没过"，看不出"怎么坏的"。而错误形态决定下一步：
//   · 读到文件尾 / 括号不配平  → 生成端问题（写作纪律），与抽象方案无关
//   · 未绑定变量 / 未定义函数  → 语义层写漏
//   · 只挂 2 条判据            → 判据层的边界没覆盖
// 这三种错需要的修法完全不同，混在一个"失败率"里就没法动手。
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');

const HERE = __dirname, RUNS = path.join(HERE, 'runs');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? String(argv[i + 1]) : d; };
const PREFIX = arg('--prefix', 'v5');
const ASJSON = argv.includes('--json');

// Windows → WSL 路径
const toWsl = (p) => '/mnt/' + p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (m, d) => d.toLowerCase());

// SBCL 错误 → 类别。顺序重要：先判读取期，再判符号未定义，最后兜底。
const CLASSES = [
  [/READ error during LOAD/i, null],                 // 下面单独细分：end of file → A，其余 → B
  [/UNDEFINED-FUNCTION/i, 'C 未定义函数（调用了一个不是函数的符号）'],
  [/The variable [\w:*+-]+ is unbound|has no value/i, 'C 未绑定变量'],
  [/TYPE-ERROR|is not of type/i, 'D 类型错误'],
  [/Unhandled/i, 'E 其它运行时错误']
];
function classify(text) {
  if (/READ error during LOAD/i.test(text)) {
    return /end of file/i.test(text) ? 'A 读到文件尾（括号不配平）' : 'B 读取期语法错误';
  }
  for (const [re, name] of CLASSES) { if (name && re.test(text)) return name; }
  return text.trim() ? 'F 未分类' : 'F 未分类';
}
// 抽出错处的具体符号名，便于备忘录里说清"错在哪"
function culprit(text) {
  const f = text.match(/The function ([\w:*+<>=!?\/-]+) is undefined/i);
  if (f) return f[1];
  const v = text.match(/The variable ([\w:*+<>=!?\/-]+) is (?:unbound|undefined)|variable ([\w:*+<>=!?\/-]+) has no value/i);
  if (v) return v[1] || v[2];
  return '';
}

const rows = [];
for (const scheme of ['macro', 'inline']) {
  const arm = PREFIX + '-cl-' + scheme;
  for (let n = 1; n <= 6; n++) {
    const file = path.join(RUNS, arm + '-r' + n, 'impl.lisp');
    if (!fs.existsSync(file)) { rows.push({ arm, run: 'r' + n, state: 'missing' }); continue; }
    // 1) 能不能加载/运行（单条最简命令）
    const r = spawnSync('wsl', ['-d', 'kali-linux', '-u', 'root', '--', 'sbcl', '--script',
      toWsl(path.resolve(file)), 'count'], { encoding: 'utf8', timeout: 180000 });
    const stderr = (r.stderr || '') + (r.stdout || '');
    const crashed = r.status !== 0 || /Unhandled|READ error/i.test(stderr);
    // 2) 判据结果（分母必须显式：15-op 用 --upto 36）
    const c = spawnSync(process.execPath, [path.join(HERE, 'check-v3.cjs'), '--impl', file, '--upto', '36'],
      { encoding: 'utf8', timeout: 300000 });
    const out = c.stdout || '';
    const m = out.match(/(\d+)\/(\d+) 通过（fail=(\d+) crash=(\d+)）/);
    const pass = m ? +m[1] : null, fail = m ? +m[3] : null, crash = m ? +m[4] : null;
    const failIds = [...out.matchAll(/#(\d+)\s+FAIL/g)].map((x) => x[1]);
    const firstErr = (stderr.match(/(?:READ error[\s\S]{0,180}|Unhandled[\s\S]{0,180}|error[^\n]{0,120})/i) || [''])[0]
      .replace(/\s+/g, ' ').trim().slice(0, 140);
    rows.push({
      arm, run: 'r' + n, pass, fail, crash,
      state: crashed ? 'crash' : (pass === 36 ? 'green' : 'partial'),
      cls: crashed ? classify(stderr) : (pass === 36 ? '—' : 'G 可加载但判据不过'),
      failIds: failIds.join(','),
      culprit: crashed ? culprit(stderr) : '',
      firstErr
    });
  }
}

if (ASJSON) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }

console.log('=== ' + PREFIX + ' CL 十二格 ===');
console.log('格'.padEnd(18) + '判定'.padEnd(9) + '通过'.padEnd(7) + '错误类别 / 失败判据');
for (const r of rows) {
  if (r.state === 'missing') { console.log((r.arm + '/' + r.run).padEnd(18) + '缺失'); continue; }
  const detail = r.cls === 'G 可加载但判据不过' ? ('失败判据 #' + r.failIds) : r.cls;
  console.log((r.arm + '/' + r.run).padEnd(18) + r.state.padEnd(9) + (r.pass + '/36').padEnd(7) + detail);
}

const tally = {};
for (const r of rows) if (r.state !== 'missing') tally[r.cls] = (tally[r.cls] || 0) + 1;
console.log('');
console.log('=== 分布 ===');
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(2) + ' × ' + k);

const failTally = {};
for (const r of rows) if (r.failIds) for (const id of r.failIds.split(',')) failTally[id] = (failTally[id] || 0) + 1;
if (Object.keys(failTally).length) {
  console.log('');
  console.log('=== 失败判据分布（只统计可加载的格）===');
  for (const [k, v] of Object.entries(failTally).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(2) + ' × #' + k);
}

// 落盘
const tsv = ['arm\trun\tstate\tpass\tfail\tcrash\tclass\tfail_ids\tfirst_error']
  .concat(rows.filter((r) => r.state !== 'missing')
    .map((r) => [r.arm, r.run, r.state, r.pass, r.fail, r.crash, r.cls, r.failIds, r.firstErr].join('\t')))
  .join('\n') + '\n';
fs.writeFileSync(path.join(HERE, 'cl-error-profile.tsv'), tsv, 'utf8');
console.log('\n已写 cl-error-profile.tsv');


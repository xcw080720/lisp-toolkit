// red.cjs — 逐条证明 verify.cjs 的 9 条判据"能红"：每条判据配一个定点变异。
// 用法： node red.cjs [--impl impl.lisp]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const impl = arg('--impl', 'impl.lisp');
const src = fs.readFileSync(impl, 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'red-'));
const env = { ...process.env };

const CASES = [
  { id: 1, op: 'sortBy', note: '排序键从 day 改成反向 day',
    from: '(< (course-day a) (course-day b))', to: '(> (course-day a) (course-day b))' },
  { id: 2, op: 'shiftAll', note: 'delta 默认值 1 → 0（不平移）',
    from: '(num (fld op "delta") 1)', to: '(num (fld op "delta") 0)' },
  { id: 3, op: 'filterDay', note: '保留条件取反（/= → =）',
    from: '(/= (course-day c) d)', to: '(= (course-day c) d)' },
  { id: 4, op: 'countByTeacher', note: '按 teacher 计数 → 按 day 计数',
    from: '(funcall bump (course-teacher c))', to: '(funcall bump (course-day c))' },
  { id: 5, op: 'countByDay', note: '按 day 计数 → 按 location 计数',
    from: '(funcall bump (course-day c))', to: '(funcall bump (course-location c))' },
  { id: 6, op: 'busiestDay', note: '取最忙 → 取最闲（#\'> → #\'<）',
    from: "(car (funcall rows #'> #'cdr))", to: "(car (funcall rows #'< #'cdr))" },
  { id: 7, op: 'conflictOf', note: '同天判定 day=self → day=9（放过别天）',
    from: '(/= (course-day c) (course-day self))', to: '(/= (course-day c) 9)' },
  { id: 8, op: 'sameTeacher', note: '同老师判定 → 同名判定',
    from: '(string/= (course-teacher c) (course-teacher self))',
    to: '(string/= (course-name c) (course-name self))' },
  { id: 9, op: 'sameName', note: '守卫 (when self) → (when nil)（永不填集合）',
    from: '(when self', to: '(when nil' },
];

let bad = 0;
console.log('-- 逐条变红：每行 = 一条判据 × 一个定点变异');
for (const c of CASES) {
  const hits = src.split(c.from).length - 1;
  if (hits === 0) { console.log('[MISS] #' + c.id + ' 变异点不存在：' + c.from); bad++; continue; }
  const dir = fs.mkdtempSync(path.join(tmp, 'm' + c.id + '-'));
  const mutant = path.join(dir, 'impl.lisp');
  fs.writeFileSync(mutant, src.split(c.from).join(c.to));
  const r = spawnSync(process.execPath, ['verify.cjs', '--impl', mutant, '--only', String(c.id)],
    { cwd: __dirname, encoding: 'utf8', env });
  const out = (r.stdout || '') + (r.stderr || '');
  const failed = /1 failed/.test(out);
  console.log((failed ? '[red ] ' : '[LIVE] ') + '#' + c.id + ' ' + c.op + ' — ' + c.note +
    '（变异点 ' + hits + ' 处）');
  if (!failed) { bad++; console.log(out.trim().split('\n').map((l) => '        ' + l).join('\n')); }
  // 变异后还应至少有一条别的判据不受影响，证明变异是定点的而非"整个文件跑挂"
  if (c.id === 1) {
    const other = spawnSync(process.execPath, ['verify.cjs', '--impl', mutant, '--only', '2'],
      { cwd: __dirname, encoding: 'utf8', env });
    const stillGreen = /1 passed, 0 failed/.test((other.stdout || '') + (other.stderr || ''));
    console.log((stillGreen ? '[ok  ] ' : '[WARN] ') + '     交叉确认：#2 在该变异下仍绿（变异是定点的）');
    if (!stillGreen) bad++;
  }
}
console.log(bad ? '-- ' + bad + ' 条没变红' : '-- 9/9 都能红');
process.exitCode = bad ? 1 : 0;

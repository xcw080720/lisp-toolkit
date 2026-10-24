// verify.cjs — t2a-family 臂：形状 B/C/D 九个新 op 的不变量（每条都能红）
// 用法： node verify.cjs [--impl impl.lisp] [--only 4,5,6]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const impl = arg('--impl', 'impl.lisp');
const only = arg('--only');
const sbcl = process.env.SBCL || 'sbcl';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-'));

const C = (o = {}) => ({ name: 'X', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, ...o });
const find = (o, n) => (o && o.courses || []).find((c) => c.name === n);
const names = (o) => (o && o.courses || []).map((c) => c.name).join(',');
// 形状 D 的集合走新开的 result 通道
const setOf = (o, op) => {
  const hit = (o && o.result || []).find((r) => r.op === op);
  return hit ? hit.set : null;
};
const hasLog = (o, ...pats) => {
  const s = (o && o.log || []).join(' | ');
  const miss = pats.filter((p) => !s.includes(p));
  return miss.length ? '日志缺「' + miss.join('」「') + '」，实际：' + s : true;
};

function run(input) {
  const f = path.join(tmp, 'in.json');
  fs.writeFileSync(f, JSON.stringify(input));
  const r = spawnSync(sbcl, ['--script', impl, f], { encoding: 'utf8', timeout: 60000 });
  try { return JSON.parse((r.stdout || '').trim()); } catch { return null; }
}

const T = [];
const add = (id, shape, name, input, check) => T.push({ id, shape, name, input, check });

// ---- 形状 B：整表操作 ----
add(1, 'B', 'sortBy-orders-by-day-period',
  { courses: [C({ name: 'B', day: 4 }), C({ name: 'A', day: 2, periodFrom: 5, periodTo: 6 }),
              C({ name: 'C', day: 2, periodFrom: 3, periodTo: 4 })],
    ops: [{ op: 'sortBy' }] },
  (o) => names(o) === 'C,A,B' ? true : '期望 C,A,B，得到 ' + names(o));

add(2, 'B', 'shiftAll-moves every period by delta',
  { courses: [C({ name: 'A', periodFrom: 2, periodTo: 3 }), C({ name: 'B', periodFrom: 1, periodTo: 1, day: 2 })],
    ops: [{ op: 'shiftAll' }] },
  (o) => {
    const a = find(o, 'A'), b = find(o, 'B');
    if (!a || !b) return '课程丢了';
    if (a.periodFrom !== 3 || a.periodTo !== 4) return 'A 未 +1（得到 ' + a.periodFrom + '-' + a.periodTo + '）';
    if (b.periodFrom !== 2 || b.periodTo !== 2) return 'B 未 +1（得到 ' + b.periodFrom + '-' + b.periodTo + '）';
    return o.n === 2 ? true : 'n 应为 2，得到 ' + o.n;
  });

add(3, 'B', 'filterDay-keeps only that day',
  { courses: [C({ name: 'A', day: 3 }), C({ name: 'B', day: 3 }), C({ name: 'C', day: 4 })],
    ops: [{ op: 'filterDay', day: 3 }] },
  (o) => {
    if (names(o) !== 'A,B') return '应只剩 A,B，得到 ' + names(o);
    return o.n === 1 ? true : '删掉门数应为 1，得到 ' + o.n;
  });

// ---- 形状 C：只读统计（不改数据，只报数）----
add(4, 'C', 'countByTeacher-counts per teacher',
  { courses: [C({ name: 'A', teacher: '数学' }), C({ name: 'B', teacher: '数学' }),
              C({ name: 'C', teacher: '数学' }), C({ name: 'D', teacher: '英语' }),
              C({ name: 'E', teacher: '英语' })],
    ops: [{ op: 'countByTeacher' }] },
  (o) => {
    const r = hasLog(o, '数学 3 门', '英语 2 门');
    if (r !== true) return r;
    const t = (o.log || []).join(' ').match(/数学 (\d+) 门/);
    return t && t[1] === '3' ? true : '数学 计数错';
  });

add(5, 'C', 'countByDay-counts per weekday',
  { courses: [C({ name: 'A', day: 2 }), C({ name: 'B', day: 2 }), C({ name: 'C', day: 2 }), C({ name: 'D', day: 5 })],
    ops: [{ op: 'countByDay' }] },
  (o) => hasLog(o, '周2 3 门', '周5 1 门'));

add(6, 'C', 'busiestDay-picks the fullest day',
  { courses: [C({ name: 'A', day: 2 }), C({ name: 'B', day: 2 }), C({ name: 'C', day: 2 }),
              C({ name: 'D', day: 5 }), C({ name: 'E', day: 5 })],
    ops: [{ op: 'busiestDay' }] },
  (o) => hasLog(o, '周2', '3 门'));

// ---- 形状 D：交叉引用（全表扫描 + 返回集合）----
add(7, 'D', 'conflictOf-returns overlapping courses',
  { courses: [C({ name: 'A', day: 1, periodFrom: 1, periodTo: 2 }),
              C({ name: 'B', day: 1, periodFrom: 2, periodTo: 3 }),
              C({ name: 'C', day: 2, periodFrom: 1, periodTo: 2 }),
              C({ name: 'D', day: 1, periodFrom: 5, periodTo: 6 })],
    ops: [{ op: 'conflictOf', match: 'A' }] },
  (o) => {
    const s = setOf(o, 'conflictOf');
    if (!s) return 'result 通道没有 conflictOf 的集合';
    return JSON.stringify(s) === JSON.stringify(['B']) ? true : '期望 ["B"]，得到 ' + JSON.stringify(s);
  });

add(8, 'D', 'sameTeacher-returns siblings',
  { courses: [C({ name: 'A', teacher: '张' }), C({ name: 'B', teacher: '张', day: 3 }),
              C({ name: 'C', teacher: '李' })],
    ops: [{ op: 'sameTeacher', match: 'A' }] },
  (o) => {
    const s = setOf(o, 'sameTeacher');
    if (!s) return 'result 通道没有 sameTeacher 的集合';
    return JSON.stringify(s) === JSON.stringify(['B']) ? true : '期望 ["B"]，得到 ' + JSON.stringify(s);
  });

add(9, 'D', 'sameName-returns other days of the same course',
  { courses: [C({ name: '高数', day: 1 }), C({ name: '高数', day: 4 }), C({ name: '英语', day: 2 })],
    ops: [{ op: 'sameName', match: '高数' }] },
  (o) => {
    const s = setOf(o, 'sameName');
    if (!s) return 'result 通道没有 sameName 的集合';
    return JSON.stringify(s) === JSON.stringify(['高数']) ? true : '期望 ["高数"]，得到 ' + JSON.stringify(s);
  });

// ---- 执行 ----
const want = only ? new Set(only.split(',').map((s) => s.trim())) : null;
let pass = 0, fail = 0;
for (const t of T) {
  if (want && !want.has(String(t.id))) continue;
  const o = run(t.input);
  let r;
  try { r = o ? t.check(o) : 'stdout 非 JSON'; } catch (e) { r = '检查器异常: ' + e.message; }
  if (r === true) { pass++; console.log('[ok  ] #' + t.id + ' ' + t.shape + ' ' + t.name); }
  else { fail++; console.log('[FAIL] #' + t.id + ' ' + t.shape + ' ' + t.name + '  — ' + r); }
}
console.log('-- ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

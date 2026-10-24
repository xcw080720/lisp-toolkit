'use strict';
// verify.cjs —— t2a 单臂（单 defop 宏）：新增 9 个 op 的 9 条不变量。
//   形状 B（整表）：sortBy / shiftAll / filterDay
//   形状 C（只读）：countByTeacher / countByDay / busiestDay  —— 只看 results 里的值，且 n 必须为 0
//   形状 D（交叉）：conflictOf / sameTeacher / sameName      —— 返回集合（课程对象）
// 用法：node verify.cjs [--impl impl.lisp] [--only B1,C3]
// 每条都能红：red.cjs 把对应 defop 注释掉后重跑，要求恰好该条失败。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const impl = path.resolve(arg('--impl', path.join(__dirname, 'impl.lisp')));
const only = arg('--only');
const sbcl = process.env.SBCL || 'sbcl';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2a-'));
const inFile = path.join(tmp, 'in.json');

function run(input) {
  fs.writeFileSync(inFile, JSON.stringify(input));
  const r = spawnSync(sbcl, ['--script', impl, inFile], { encoding: 'utf8', timeout: 60000 });
  try { return JSON.parse((r.stdout || '').trim()); } catch { return null; }
}

const C = (o = {}) => ({ name: 'X', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, ...o });
const names = (o) => (o && o.courses ? o.courses.map((c) => c.name).join(',') : '?');
const get = (o, n) => ((o && o.courses) || []).find((c) => c.name === n);
const rv = (o, op) => {
  const e = o && (o.results || []).find((x) => x.op === op);
  return e ? e.value : undefined;
};
const rvNames = (o, op) => (Array.isArray(rv(o, op)) ? rv(o, op).map((c) => c.name).join(',') : typeof rv(o, op));

const T = [];
const add = (id, name, input, check) => T.push({ id, name, input, check });

// ---------------- 形状 B ----------------
add('B1', 'sortBy 按 day,periodFrom 多键排序', {
  courses: [C({ name: 'B', day: 4, periodFrom: 1, periodTo: 2 }),
            C({ name: 'A', day: 2, periodFrom: 3, periodTo: 4 }),
            C({ name: 'C', day: 2, periodFrom: 1, periodTo: 2 })],
  ops: [{ op: 'sortBy', by: 'day,periodFrom' }],
}, (o) => {
  const order = o && o.courses ? o.courses.map((c) => c.name).join('') : '?';
  if (order !== 'CAB') return '顺序=' + order + '（应为 CAB）';
  if (o.n !== 2) return 'n=' + o.n + '（应为 2）';
  return true;
});

add('B2', 'shiftAll 全体节次 +1', {
  courses: [C({ name: 'A', periodFrom: 2, periodTo: 3 }), C({ name: 'B', periodFrom: 1, periodTo: 1 })],
  ops: [{ op: 'shiftAll', delta: 1 }],
}, (o) => {
  if (!o) return 'stdout 非 JSON';
  if (o.n !== 2) return 'n=' + o.n + '（应为 2）';
  const a = get(o, 'A'), b = get(o, 'B');
  if (!a || a.periodFrom !== 3 || a.periodTo !== 4) return 'A=' + JSON.stringify(a);
  if (!b || b.periodFrom !== 2 || b.periodTo !== 2) return 'B=' + JSON.stringify(b);
  return true;
});

add('B3', 'filterDay 只留某天，删掉的计数正确', {
  courses: [C({ name: 'A', day: 1 }), C({ name: 'B', day: 2 }), C({ name: 'C', day: 1 })],
  ops: [{ op: 'filterDay', day: 1 }],
}, (o) => (o && names(o) === 'A,C' && o.n === 1) ? true : '剩=' + names(o) + ' n=' + (o && o.n));

// ---------------- 形状 C ----------------
add('C1', 'countByTeacher 返回不同老师数，且不改数据', {
  courses: [C({ name: 'A', teacher: '王' }), C({ name: 'B', teacher: '王' }),
            C({ name: 'C', teacher: '李' }), C({ name: 'D', teacher: '' })],
  ops: [{ op: 'countByTeacher' }],
}, (o) => {
  if (!o) return 'stdout 非 JSON';
  if (rv(o, 'countByTeacher') !== 2) return 'value=' + rv(o, 'countByTeacher') + '（应为 2）';
  if (o.n !== 0) return 'n=' + o.n + '（只读 op 必须 0）';
  if (o.courses.length !== 4) return '课程数被改了';
  return true;
});

add('C2', 'countByDay 返回有课的天数', {
  courses: [C({ name: 'A', day: 1 }), C({ name: 'B', day: 1 }), C({ name: 'C', day: 3 })],
  ops: [{ op: 'countByDay' }],
}, (o) => {
  if (!o) return 'stdout 非 JSON';
  if (rv(o, 'countByDay') !== 2) return 'value=' + rv(o, 'countByDay') + '（应为 2）';
  if (o.n !== 0) return 'n=' + o.n + '（只读 op 必须 0）';
  return true;
});

add('C3', 'busiestDay 返回课最多的一天', {
  courses: [C({ name: 'A', day: 3 }), C({ name: 'B', day: 3 }), C({ name: 'C', day: 1 })],
  ops: [{ op: 'busiestDay' }],
}, (o) => {
  if (!o) return 'stdout 非 JSON';
  if (rv(o, 'busiestDay') !== 3) return 'value=' + rv(o, 'busiestDay') + '（应为 3）';
  if (o.n !== 0) return 'n=' + o.n + '（只读 op 必须 0）';
  return true;
});

// ---------------- 形状 D ----------------
add('D1', 'conflictOf 只返回真正时间冲突的课', {
  courses: [C({ name: 'A', day: 1, periodFrom: 1, periodTo: 2 }),
            C({ name: 'B', day: 1, periodFrom: 3, periodTo: 4 }),   // 同天不重叠
            C({ name: 'C', day: 1, periodFrom: 2, periodTo: 3 }),   // 边界重叠 → 冲突
            C({ name: 'D', day: 3, periodFrom: 1, periodTo: 2 })],  // 不同天
  ops: [{ op: 'conflictOf', match: 'A' }],
}, (o) => {
  if (!o) return 'stdout 非 JSON';
  const got = rvNames(o, 'conflictOf');
  if (got !== 'C') return '结果=' + got + '（应恰好是 C）';
  if (o.n !== 0) return 'n=' + o.n + '（查询 op 必须 0）';
  return true;
});

add('D2', 'sameTeacher 返回同老师的整组课', {
  courses: [C({ name: 'A', teacher: '王', day: 1 }), C({ name: 'B', teacher: '王', day: 2 }),
            C({ name: 'C', teacher: '李', day: 3 })],
  ops: [{ op: 'sameTeacher', match: 'A' }],
}, (o) => {
  if (!o) return 'stdout 非 JSON';
  const got = rvNames(o, 'sameTeacher');
  if (got !== 'A,B') return '结果=' + got + '（应为 A,B）';
  return true;
});

add('D3', 'sameName 返回同名的整组课', {
  courses: [C({ name: '高数', teacher: '赵', day: 1 }), C({ name: '高数', teacher: '钱', day: 2 }),
            C({ name: '英语', teacher: '孙', day: 3 })],
  ops: [{ op: 'sameName', match: '高数' }],
}, (o) => {
  if (!o) return 'stdout 非 JSON';
  const got = rvNames(o, 'sameName');
  if (got !== '高数,高数') return '结果=' + got + '（应为 高数,高数）';
  return true;
});

// ---------------- 执行 ----------------
const want = only ? new Set(only.split(',').map((s) => s.trim())) : null;
let pass = 0, fail = 0;
for (const t of T) {
  if (want && !want.has(String(t.id)) && !want.has(t.name)) continue;
  const o = run(t.input);
  let r;
  try { r = o ? t.check(o) : 'stdout 非 JSON'; } catch (e) { r = '检查器异常: ' + e.message; }
  if (r === true) { pass++; console.log('[ok  ] #' + t.id + ' ' + t.name); }
  else { fail++; console.log('[FAIL] #' + t.id + ' ' + t.name + '  — ' + r); }
}
console.log('-- ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

// verify.cjs —— iter-js 臂自带的 3 条新不变量（D1/D2/D3）
// 用法： node verify.cjs [impl.js]
// 与 check-scale.cjs 同款：只喂 JSON 输入、只看输出状态，不比对文案细节（D3 例外，它本身就是文案契约）
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');

const ARGV = process.argv.slice(2);
const impl = ARGV.find((a) => !a.startsWith('--')) || 'impl.js';
const ONLY = ARGV.find((a) => a.startsWith('--only='));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-'));
const C = (o = {}) => ({ name: 'X', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, ...o });

function run(input) {
  const f = path.join(tmp, 'in.json');
  fs.writeFileSync(f, JSON.stringify(input));
  const r = spawnSync(process.execPath, [impl, f], { encoding: 'utf8', timeout: 30000 });
  try { return JSON.parse((r.stdout || '').trim()); } catch { return null; }
}

const T = [];
const add = (id, name, input, check) => T.push({ id, name, input, check });
const names = (o) => (o.courses || []).map((c) => c.name).join('|');
const find = (o, nm) => (o.courses || []).find((c) => c.name === nm);

/* ---- D1：add 同名课自动加序号 ---- */
add('D1', 'add-dup-autonumber',
  { courses: [],
    ops: [{ op: 'add', course: C({ name: '高数' }) },
          { op: 'add', course: C({ name: '高数' }) },
          { op: 'add', course: C({ name: '高数' }) }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    if (o.courses.length !== 3) return '课程数 ' + o.courses.length;
    return names(o) === '高数|高数(2)|高数(3)' ? true : '得到 ' + names(o);
  });

/* ---- D2：edit 只给一端时保持 periodFrom <= periodTo ---- */
add('D2', 'edit-one-end-keeps-order',
  { courses: [C({ name: '高数', periodFrom: 1, periodTo: 2 })],
    ops: [{ op: 'edit', match: '高数', set: { periodFrom: 9 } }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const c = find(o, '高数');
    if (!c) return '课程不见了';
    if (c.periodFrom > c.periodTo) return 'periodFrom(' + c.periodFrom + ') > periodTo(' + c.periodTo + ')';
    if (!(c.periodTo >= 9)) return 'periodTo 未抬到 ≥9（得到 ' + c.periodTo + '）';
    return true;
  });

/* ---- D3：缺字段的 op 在日志里以 [skip] 开头，其余照跑 ---- */
add('D3', 'batch-skip-marked',
  { courses: [C({ name: 'A' })],
    ops: [{ op: 'tag', match: 'A', tag: 'exam' },
          { op: 'move', match: 'A', day: 2 },          // 缺 periodFrom/periodTo → 应跳过
          { op: 'rename', match: 'A', to: 'B' }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    if (o.log.length !== 3) return '日志条数 ' + o.log.length + ': ' + JSON.stringify(o.log);
    if (!/^\[skip\]/.test(o.log[1])) return 'log[1] 不以 [skip] 开头：' + o.log[1];
    if (/^\[skip\]/.test(o.log[0]) || /^\[skip\]/.test(o.log[2])) return '其余两条被误标 [skip]';
    if (/^\[skip\]/.test(o.log[0])) return 'log[0] 误标';
    const c = find(o, 'B');
    if (!c || c.tag !== 'exam') return '其余两条没照跑：' + JSON.stringify(o.courses);
    if (c.day !== 1) return '被跳过的 move 竟然生效了（day=' + c.day + '）';
    return true;
  });

/* ---- 执行 ---- */
const only = ONLY ? new Set(ONLY.slice(7).split(',').map((s) => s.trim())) : null;
let pass = 0, fail = 0;
for (const t of T) {
  if (only && !only.has(t.id) && !only.has(t.name)) continue;
  const o = run(t.input);
  let r;
  try { r = o ? t.check(o) : 'stdout 非 JSON'; } catch (e) { r = '检查器异常: ' + e.message; }
  if (r === true) { pass++; console.log('[ok  ] ' + t.id + ' ' + t.name); }
  else { fail++; console.log('[FAIL] ' + t.id + ' ' + t.name + '  — ' + r); }
}
console.log('-- ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

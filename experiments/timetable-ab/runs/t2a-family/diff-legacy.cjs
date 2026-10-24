// diff-legacy.cjs — 行为不许变：同一批老 op 负载，基线 impl.base.lisp vs 新 impl.lisp
// 逐字节比较（新臂多出来的 "result" 键先剥掉）。
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const sbcl = process.env.SBCL || 'sbcl';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'df-'));
const C = (o = {}) => ({ name: 'X', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, ...o });

function run(impl, input) {
  const f = path.join(tmp, 'in.json');
  fs.writeFileSync(f, JSON.stringify(input));
  const r = spawnSync(sbcl, ['--script', impl, f], { encoding: 'utf8', timeout: 60000 });
  try { return JSON.parse((r.stdout || '').trim()); } catch { return { __parse_error: (r.stdout || '') + (r.stderr || '') }; }
}
const norm = (o) => {
  const c = JSON.parse(JSON.stringify(o));
  delete c.result;
  // 名册本身必须增长（新 op 要可被发现），这里只比较"名册以外的"行为
  c.log = (c.log || []).map((l) => l.replace(/（可用 [^）]*）/, '（可用 <ROSTER>）'));
  return JSON.stringify(c);
};
const roster = (o) => {
  const l = ((o && o.log) || []).find((x) => x.includes('可用')) || '';
  const m = l.match(/（可用 ([^）]*)）/);
  return m ? m[1].split(' / ') : [];
};

const P = [
  ['add + 默认 weeks', { courses: [], ops: [{ op: 'add', course: C({ name: '线代', day: 3 }) }] }],
  ['add 夹取 day', { courses: [], ops: [{ op: 'add', course: C({ name: '体育', day: 0 }) }] }],
  ['add 带 weeks/tag', { courses: [], ops: [{ op: 'add', course: C({ name: 'A', weeks: { type: 'odd', from: 1, to: 15 }, tag: 'x' }) }] }],
  ['del 命中/未命中', { courses: [C({ name: '高数' }), C({ name: '高数补', day: 2 })], ops: [{ op: 'del', match: '高数' }, { op: 'del', match: '物理' }] }],
  ['edit 全键', { courses: [C({ name: 'A' })], ops: [{ op: 'edit', match: 'A', set: { name: 'B', teacher: '张', location: 'L', day: 9, periodFrom: 5, periodTo: 6, weeks: { type: 'all' }, tag: 't' } }] }],
  ['edit 只改 periodTo', { courses: [C({ name: 'A', periodFrom: 3, periodTo: 5 })], ops: [{ op: 'edit', match: 'A', set: { periodTo: 9 } }] }],
  ['move 缺字段', { courses: [C({ name: 'A' })], ops: [{ op: 'move', match: 'A', day: 4 }] }],
  ['move 完整', { courses: [C({ name: 'A' })], ops: [{ op: 'move', match: 'A', day: 4, periodFrom: 3, periodTo: 5 }] }],
  ['swap 成功/失败', { courses: [C({ name: 'A' }), C({ name: 'B', day: 4, periodFrom: 5, periodTo: 6 })], ops: [{ op: 'swap', match: 'A', with: 'B' }, { op: 'swap', match: 'A', with: 'A' }] }],
  ['rename/trim/shift/tag', { courses: [C({ name: '高数', periodFrom: 1, periodTo: 4 })], ops: [{ op: 'rename', match: '高数', to: '高等数学' }, { op: 'trim', match: '高等数学', from: 2, to: 3 }, { op: 'shift', match: '高等数学', delta: 2 }, { op: 'tag', match: '高等数学', tag: 'exam' }] }],
  ['untag + duplicate + clear', { courses: [C({ name: 'A', tag: 'exam', day: 3 }), C({ name: 'B', day: 4 })], ops: [{ op: 'untag', tag: 'exam' }, { op: 'duplicate', match: 'B', day: 5 }, { op: 'clear', day: 4 }] }],
  ['sort + swapDay + stats', { courses: [C({ name: 'B', day: 4 }), C({ name: 'A', day: 2 }), C({ name: 'C', day: 2, periodFrom: 3, periodTo: 4 })], ops: [{ op: 'sort' }, { op: 'swapDay', a: 1, b: 2 }, { op: 'stats' }] }],
  ['未知 op 整批拒绝', { courses: [C({ name: 'A' })], ops: [{ op: 'del', match: 'A' }, { op: 'nope' }] }],
  ['空 ops', { courses: [C({ name: 'A' })], ops: [] }],
];

let bad = 0, rosterChecked = 0;
for (const [name, input] of P) {
  const A = run('impl.base.lisp', input), B = run('impl.lisp', input);
  const a = norm(A), b = norm(B);
  const same = a === b;
  if (!same) bad++;
  console.log((same ? '[same] ' : '[DIFF] ') + name);
  if (!same) { console.log('   base: ' + a.slice(0, 300)); console.log('   new : ' + b.slice(0, 300)); }
  const rb = roster(A), rn = roster(B);
  if (rb.length) {
    rosterChecked++;
    const missing = rb.filter((x) => !rn.includes(x));
    const isPrefix = rn.slice(0, rb.length).join('/') === rb.join('/');
    const okRoster = missing.length === 0 && isPrefix;
    if (!okRoster) bad++;
    console.log((okRoster ? '[ok  ] ' : '[FAIL] ') + '名册：老 ' + rb.length + ' 个全部保留且为前缀，新 ' + rn.length +
      ' 个（+ ' + rn.slice(rb.length).join(',') + '）');
  }
}
console.log(rosterChecked ? '' : '');
console.log(bad ? '-- ' + bad + ' 处行为不同' : '-- 14/14 负载逐字节相同（老 15 个 op 行为不变；名册按设计增长）');
process.exitCode = bad ? 1 : 0;

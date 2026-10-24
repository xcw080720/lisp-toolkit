'use strict';
// 判据看不见的边角输入：手工喂给 impl，看数据通道会不会被打穿
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sanity-'));
const C = (o = {}) => ({ name: 'X', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, ...o });
const cases = [
  ['空 ops', { courses: [C({ name: 'A' })], ops: [] }],
  ['swap 自己匹配自己', { courses: [C({ name: 'S' })], ops: [{ op: 'swap', match: 'S', with: 'S' }] }],
  ['weeks list 带浮点', { courses: [C({ name: 'L', weeks: { type: 'list', list: [1.5, 2, 3] } })], ops: [{ op: 'del', match: 'zzz' }] }],
  ['控制字符名', { courses: [C({ name: 'a\u0001b\tc' })], ops: [{ op: 'del', match: 'zzz' }] }],
  ['代理对入参 \\uD83D\\uDC0B', { courses: [C({ name: 'a\uD83D\uDC0B' })], ops: [{ op: 'del', match: 'zzz' }] }],
  ['op 名缺失', { courses: [C({ name: 'A' })], ops: [{ }] }],
  ['move 全字段带浮点', { courses: [C({ name: 'M', day: 1 })], ops: [{ op: 'move', match: 'M', day: 2.5, periodFrom: 3.7, periodTo: 2 }] }],
  ['edit 只给 periodTo 更小', { courses: [C({ name: 'R', periodFrom: 6, periodTo: 8 })], ops: [{ op: 'edit', match: 'R', set: { periodTo: 2 } }] }],
  ['del 空课表', { courses: [], ops: [{ op: 'del', match: 'x' }] }],
  ['两层 op 连做', { courses: [C({ name: 'A' })], ops: [{ op: 'add', course: C({ name: 'B', day: 9 }) }, { op: 'del', match: 'A' }] }],
];
for (const [label, input] of cases) {
  const f = path.join(tmp, 'i.json');
  fs.writeFileSync(f, JSON.stringify(input));
  const r = spawnSync(process.env.SBCL, ['--script', 'impl.lisp', f], { encoding: 'utf8' });
  const out = (r.stdout || '').trim();
  let verdict = 'stdout 非 JSON';
  if (out) {
    try { const o = JSON.parse(out); verdict = 'JSON ok  n=' + o.n + '  课程=' + (o.courses || []).map((c) => c.name).join('|'); }
    catch (e) { verdict = 'JSON PARSE FAIL: ' + e.message; }
  }
  console.log('[' + label + '] ' + verdict);
  if (r.status !== 0) console.log('   status=' + r.status + ' stderr=' + (r.stderr || '').trim().split('\n')[0]);
  if (!out) console.log('   (stdout 空)');
}

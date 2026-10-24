// probe.cjs —— 自写不变量：只测 check-scale 没喂过的输入（入口级）
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-'));
const impl = 'impl.lisp';
function run(input) {
  const f = path.join(tmp, 'i.json');
  fs.writeFileSync(f, JSON.stringify(input));
  const r = spawnSync(process.env.SBCL, ['--script', impl, f], { encoding: 'utf8' });
  if (r.status !== 0) return { ERR: r.stderr };
  try { return JSON.parse(r.stdout.trim()); } catch { return { BADSTDOUT: r.stdout }; }
}
let pass = 0, fail = 0;
const ck = (l, c, x) => (c ? (pass++, console.log('[ok  ] ' + l)) : (fail++, console.log('[FAIL] ' + l + ' :: ' + JSON.stringify(x))));
const C = (o = {}) => ({ name: 'X', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, ...o });

let o = run({ courses: [C({ name: '高数' })], ops: [{ op: 'del', match: '高数' }, { op: 'nope' }] });
ck('未知 op 在中间 → 整批拒绝、课表原样、n=0、log 1 条', o.n === 0 && o.courses.length === 1 && o.log.length === 1 && o.opsText === '', o);

o = run({ courses: [], ops: [] });
ck('空 ops → opsText ""、n=0、log=[]', o.opsText === '' && o.n === 0 && o.log.length === 0, o);

o = run({ courses: [C({ name: 'A' })], ops: [{ op: 'move', match: 'A', day: 99, periodFrom: 0, periodTo: 3 }] });
ck('move 越界被夹：day=7、periodFrom=1', o.courses[0].day === 7 && o.courses[0].periodFrom === 1, o);

o = run({ courses: [C({ name: '同名', day: 1 }), C({ name: '同名2', day: 2 }), C({ name: 'X', day: 3 })], ops: [{ op: 'swap', match: '同名', with: 'X' }] });
const dayOf = {}; (o.courses || []).forEach((c) => (dayOf[c.name] = c.day));
ck('swap 一侧多命中 → 不执行、day 不变', o.n === 0 && dayOf['同名'] === 1 && dayOf['同名2'] === 2 && dayOf['X'] === 3, o);

o = run({ courses: [C({ name: 'Q' })], ops: [{ op: 'add', course: C({ name: 'W', day: 2 }) }, { op: 'del', match: 'Q' }] });
ck('opsText 两个 op 都在', String(o.opsText).includes('W') && String(o.opsText).includes('Q'), o.opsText);
ck('日志编号连续 1) 2)', o.log.length === 2 && o.log[0].startsWith('1) ') && o.log[1].startsWith('2) '), o.log);
ck('n = 2', o.n === 2, o.n);

o = run({ courses: [C({ name: 'E', weeks: { type: 'odd' } })], ops: [{ op: 'stats' }] });
ck('未实现 op（stats）→ 整批拒绝且点名', o.opsText === '' && o.n === 0 && /stats/.test(o.log[0]), o);

o = run({ courses: [C({ name: '深度🐋', teacher: '张' })], ops: [{ op: 'add', course: C({ name: '🐋🐋', weeks: { type: 'list', list: [2, 4, 6] } }) }] });
ck('emoji + 嵌套数组往返', o.courses.length === 2 && o.courses[0].name === '深度🐋' && JSON.stringify(o.courses[1].weeks.list) === '[2,4,6]', o);

o = run({ courses: [C({ name: '负', day: -3, periodFrom: -1, periodTo: -2 })], ops: [] });
ck('负数全部夹紧且不倒挂', o.courses[0].day === 1 && o.courses[0].periodFrom === 1 && o.courses[0].periodTo >= 1, o);

o = run({ courses: [C({ name: 'R', periodFrom: 6, periodTo: 8 })], ops: [{ op: 'edit', match: 'R', set: { periodTo: 2 } }] });
ck('edit 后不倒挂', o.courses[0].periodFrom <= o.courses[0].periodTo, o);

o = run({ courses: [C({ name: 'S' })], ops: [{ op: 'edit', match: 'S', set: { day: 3, periodFrom: 5, periodTo: 6 } }] });
ck('edit 真的改节次（不是只写日志）', o.courses[0].day === 3 && o.courses[0].periodFrom === 5 && o.courses[0].periodTo === 6, o);

console.log('-- ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

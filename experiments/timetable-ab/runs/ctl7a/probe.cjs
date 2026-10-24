// probe.cjs — 自写不变量：判据之外的"现在到底发生了什么"（lisp-repl 技能：REPL 让你问真值）
// 用法： node probe.cjs impl.lisp
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const impl = process.argv[2] || 'impl.lisp';
const sbcl = process.env.SBCL || 'sbcl';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-'));

const C = (o = {}) => ({ name: 'X', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, ...o });
function run(input) {
  const f = path.join(tmp, 'in.json');
  fs.writeFileSync(f, JSON.stringify(input));
  const r = spawnSync(sbcl, ['--script', impl, f], { encoding: 'utf8', timeout: 30000 });
  let out = null, err = (r.stderr || '').trim();
  try { out = JSON.parse((r.stdout || '').trim()); } catch { /* 留 null */ }
  return { out, err, raw: r.stdout || '' };
}
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('[ok  ] ' + name); }
  else { fail++; console.log('[FAIL] ' + name + '  — ' + detail); }
}

// P1 浮点字段不得以 Lisp 字面量泄漏（判据 #21 只测了被夹紧的 day，这里测"能活下来的浮点"）
{
  const { out, raw } = run({ courses: [], ops: [{ op: 'add', course: C({ name: 'f', weeks: { type: 'range', from: 1, to: 16.5 } }) }] });
  check('P1 浮点未被写成 16.5d0', out && out.courses[0].weeks.to === 16.5 && !/d0/.test(raw), 'raw=' + raw.trim());
}
// P2 布尔与 null 必须原样往返
{
  const { out } = run({ courses: [C({ name: 'b', tag: null })], ops: [{ op: 'edit', match: 'b', set: { flag: true, other: null } }] });
  check('P2 true/null 往返', out && out.courses[0].flag === true && out.courses[0].other === null, JSON.stringify(out && out.courses[0]));
}
// P3 edit 只给 periodTo 且小于原 periodFrom → 不得倒挂
{
  const { out } = run({ courses: [C({ name: 'r', periodFrom: 6, periodTo: 8 })], ops: [{ op: 'edit', match: 'r', set: { periodTo: 2 } }] });
  const c = out && out.courses[0];
  check('P3 不倒挂且都 ≥1', c && c.periodFrom >= 1 && c.periodTo >= 1 && c.periodFrom <= c.periodTo, JSON.stringify(c));
}
// P4 swap 多匹配 → 整批拒绝（n=0，不交换）
{
  const { out } = run({ courses: [C({ name: '同名', day: 1 }), C({ name: '同名2', day: 2 }), C({ name: 'X', day: 3 })], ops: [{ op: 'swap', match: '同名', with: 'X' }] });
  const a = out && out.courses.find((c) => c.name === '同名');
  check('P4 swap 多匹配拒绝', out && out.n === 0 && a.day === 1, JSON.stringify(out && out.log));
}
// P5 空 ops → opsText:"" n:0 log:[]
{
  const { out } = run({ courses: [C({ name: 'z' })], ops: [] });
  check('P5 空 ops 契约', out && out.opsText === '' && out.n === 0 && out.log.length === 0 && out.courses.length === 1, JSON.stringify(out));
}
// P6 空 weeks{} 不得变成 null（变异测试抓过的第二个真 bug 形状）
{
  const { out } = run({ courses: [C({ name: 'e', weeks: {} })], ops: [{ op: 'stats' }] });
  check('P6 空对象不塌成 null', out && out.courses[0].weeks && typeof out.courses[0].weeks === 'object' && !Array.isArray(out.courses[0].weeks), JSON.stringify(out && out.courses[0]));
}
// P7 多 op 的日志编号必须连续 1)2)3)
{
  const { out } = run({ courses: [], ops: [{ op: 'add', course: C({ name: 'a' }) }, { op: 'add', course: C({ name: 'b' }) }, { op: 'del', match: 'a' }] });
  const logs = out ? out.log : [];
  check('P7 日志编号连续', logs.length === 3 && /^1\) /.test(logs[0]) && /^2\) /.test(logs[1]) && /^3\) /.test(logs[2]), JSON.stringify(logs));
}
// P8 未知 op 即使排在最后也整批拒绝（结构事实：整包拒绝，一条都不执行）
{
  const { out } = run({ courses: [C({ name: 'k', day: 1 })], ops: [{ op: 'add', course: C({ name: 'new', day: 2 }) }, { op: 'nope' }] });
  check('P8 整批拒绝且课表原样', out && out.n === 0 && out.courses.length === 1 && out.courses[0].name === 'k' && out.log.length === 1, JSON.stringify(out));
}
// P9 缺 weeks 的 add → range 1..16；给了 weeks → 不覆盖
{
  const a = run({ courses: [], ops: [{ op: 'add', course: C({ name: 'w1' }) }] });
  const b = run({ courses: [], ops: [{ op: 'add', course: C({ name: 'w2', weeks: { type: 'odd' } }) }] });
  check('P9 默认 weeks 只在缺失时补', a.out && a.out.courses[0].weeks.to === 16 && b.out && b.out.courses[0].weeks.type === 'odd', JSON.stringify([a.out && a.out.courses[0].weeks, b.out && b.out.courses[0].weeks]));
}
// P10 move 三件套齐 → 生效；缺一件 → 不动且 n 不变
{
  const full = run({ courses: [C({ name: 'm', day: 1, periodFrom: 1, periodTo: 2 })], ops: [{ op: 'move', match: 'm', day: 5, periodFrom: 3, periodTo: 4 }] });
  const part = run({ courses: [C({ name: 'm', day: 1 })], ops: [{ op: 'move', match: 'm', day: 5, periodFrom: 3 }] });
  const c1 = full.out && full.out.courses[0], c2 = part.out && part.out.courses[0];
  check('P10 move 全/缺 两态', c1 && c1.day === 5 && c1.periodFrom === 3 && c1.periodTo === 4 && full.out.n === 1 && c2 && c2.day === 1 && part.out.n === 0, JSON.stringify([c1, c2]));
}

console.log('-- ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

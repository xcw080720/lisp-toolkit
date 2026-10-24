// selfcheck.cjs — 自写不变量（不属于 check-scale.cjs，只在本 run 目录里用）
// 动机（skills/handoff 六、mutation-testing）：既有三组判据只覆盖 5 op 的单点行为，
// 对「多条 op 的顺序 / 日志编号连续 / n 累加 / 整包拒绝不留半截 / 空 ops」零覆盖。
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const i = argv.indexOf('--impl');
const impl = i >= 0 ? argv[i + 1] : 'impl.lisp';
const sbcl = process.env.SBCL || 'sbcl';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'self-'));

const C = (o = {}) => ({ name: 'X', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, ...o });
const find = (out, name) => (out.courses || []).find((c) => c.name === name);

function run(input) {
  const f = path.join(tmp, 'in.json');
  fs.writeFileSync(f, JSON.stringify(input));
  const r = spawnSync(sbcl, ['--script', impl, f], { encoding: 'utf8', timeout: 30000 });
  return { raw: r.stdout, err: r.stderr, status: r.status };
}
function json(input) {
  const r = run(input);
  let o = null;
  try { o = JSON.parse(r.raw.trim()); } catch { o = null; }
  return { o, ...r };
}

const t = [];
const a = (name, fn) => t.push({ name, fn });

// S1 多条 op 顺序执行 + 日志编号连续 + n 累加
a('multi-op-order-and-log-numbering', () => {
  const { o } = json({
    courses: [C({ name: '甲' }), C({ name: '乙', day: 2 }), C({ name: '丙', day: 3 })],
    ops: [{ op: 'add', course: C({ name: '丁', day: 4 }) },
          { op: 'del', match: '乙' },
          { op: 'edit', match: '丙', set: { day: 5 } },
          { op: 'move', match: '甲', day: 2, periodFrom: 3, periodTo: 4 }],
  });
  if (!o) return 'stdout 非 JSON';
  if (o.n !== 4) return 'n 应为 1+1+1+1=4，得到 ' + o.n;
  if ((o.courses || []).length !== 3) return '课数应为 3（+丁 -乙），得到 ' + (o.courses || []).length;
  if (find(o, '乙')) return 'del 未删掉乙';
  if (!find(o, '丙') || find(o, '丙').day !== 5) return 'edit 未改丙';
  if (!find(o, '甲') || find(o, '甲').periodFrom !== 3) return 'move 未改甲';
  const nums = (o.log || []).map((l) => parseInt(String(l), 10));
  const want = nums.map((_, k) => k + 1);
  if (JSON.stringify(nums) !== JSON.stringify(want)) return '日志编号不连续：' + JSON.stringify(o.log);
  return true;
});

// S2 整包拒绝时，前面的合法 op 一条都不许生效（结构性事实）
a('reject-keeps-state-pristine', () => {
  const { o } = json({
    courses: [C({ name: '甲' }), C({ name: '乙', day: 2 })],
    ops: [{ op: 'add', course: C({ name: '丙', day: 3 }) }, { op: 'boom' }],
  });
  if (!o) return 'stdout 非 JSON';
  if (o.n !== 0) return '整包拒绝时 n 应为 0，得到 ' + o.n;
  if (find(o, '丙')) return '整包拒绝时 add 竟然生效了';
  if ((o.courses || []).length !== 2) return '整包拒绝时课表应原样，得到 ' + (o.courses || []).length;
  if (o.opsText !== '') return '整包拒绝时 opsText 应为空，得到 ' + JSON.stringify(o.opsText);
  return true;
});

// S3 空 ops：opsText ""，n 0，log 空数组（不是 null）
a('empty-ops-shape', () => {
  const { o } = json({ courses: [C({ name: '甲' })], ops: [] });
  if (!o) return 'stdout 非 JSON';
  if (o.opsText !== '') return '空 ops 的 opsText 应为 ""';
  if (o.n !== 0) return '空 ops 的 n 应为 0';
  if (!Array.isArray(o.log) || o.log.length !== 0) return '空 ops 的 log 应为 []，得到 ' + JSON.stringify(o.log);
  return true;
});

// S4 swap 任一侧 0 命中 → 不执行、n 不变
a('swap-zero-hit-noop', () => {
  const { o } = json({ courses: [C({ name: 'A', day: 1 })], ops: [{ op: 'swap', match: 'A', with: '不存在' }] });
  if (!o) return 'stdout 非 JSON';
  if (o.n !== 0) return '一侧 0 命中时 n 应为 0，得到 ' + o.n;
  if (find(o, 'A').day !== 1) return '一侧 0 命中时不该动 A';
  return true;
});

// S5 n 是「条数」不是「op 数」：del 命中 3 门 → 3
a('n-counts-rows-not-ops', () => {
  const { o } = json({
    courses: [C({ name: 'q1' }), C({ name: 'q2', day: 2 }), C({ name: 'q3', day: 3 }), C({ name: 'z', day: 4 })],
    ops: [{ op: 'del', match: 'q' }],
  });
  if (!o) return 'stdout 非 JSON';
  if (o.n !== 3) return '删 3 条 n 应为 3，得到 ' + o.n;
  if ((o.courses || []).length !== 1) return '应只剩 1 门';
  return true;
});

// S6 边界：输出里不许出现内部标签
a('no-tag-leak', () => {
  const { raw } = run({
    courses: [C({ name: 'M', weeks: { type: 'odd' } }), C({ name: 'N', weeks: {} })],
    ops: [{ op: 'stats' }],
  });
  if (/obj/i.test(raw)) return 'stdout 里出现内部标签: ' + raw.slice(0, 120);
  return true;
});

// S7 edit 改 weeks 也走同一通道（嵌套对象往返）
a('edit-weeks-roundtrip', () => {
  const { o } = json({ courses: [C({ name: 'W', weeks: { type: 'odd' } })],
                       ops: [{ op: 'edit', match: 'W', set: { weeks: { type: 'list', list: [2, 4] } } }] });
  if (!o) return 'stdout 非 JSON';
  const c = find(o, 'W');
  if (!c || !c.weeks) return 'weeks 丢失';
  if (c.weeks.type !== 'list') return 'weeks.type 未改：' + c.weeks.type;
  if (JSON.stringify(c.weeks.list) !== '[2,4]') return 'weeks.list 未往返：' + JSON.stringify(c.weeks.list);
  return true;
});

// S8 stats 的时段数是所有课跨度之和
a('stats-slots-sum', () => {
  const { o } = json({ courses: [C({ name: 'A', periodFrom: 1, periodTo: 4 }),
                                 C({ name: 'B', day: 2, periodFrom: 1, periodTo: 2 })],
                       ops: [{ op: 'stats' }] });
  if (!o) return 'stdout 非 JSON';
  if (!(o.log || []).some((l) => String(l).includes('6'))) return '应为 4+2=6 个时段：' + JSON.stringify(o.log);
  return true;
});

// S9 输出必须是单行 JSON + 结尾换行
a('single-line-output', () => {
  const { raw, status } = run({ courses: [C({ name: '甲' })], ops: [{ op: 'stats' }] });
  if (status !== 0) return '退出码非 0：' + status;
  const lines = raw.split('\n').filter((x) => x.length);
  if (lines.length !== 1) return '应只输出一行，得到 ' + lines.length + ' 行';
  if (!raw.endsWith('\n')) return '结尾没有换行';
  return true;
});

// S10 move 的夹紧：day 0 → 1，periodFrom -3 → 1，且不倒挂
a('move-clamps', () => {
  const { o } = json({ courses: [C({ name: 'K', day: 5, periodFrom: 5, periodTo: 6 })],
                       ops: [{ op: 'move', match: 'K', day: 0, periodFrom: -3, periodTo: 2 }] });
  if (!o) return 'stdout 非 JSON';
  const c = find(o, 'K');
  if (!c) return 'K 丢了';
  if (c.day !== 1) return 'day 未夹到 1：' + c.day;
  if (c.periodFrom !== 1) return 'periodFrom 未夹到 1：' + c.periodFrom;
  if (c.periodFrom > c.periodTo) return '倒挂：' + c.periodFrom + '>' + c.periodTo;
  return true;
});

let pass = 0, fail = 0;
for (const { name, fn } of t) {
  let r;
  try { r = fn(); } catch (e) { r = '自检异常: ' + e.message; }
  if (r === true) { pass++; console.log('[ok  ] ' + name); }
  else { fail++; console.log('[FAIL] ' + name + '  — ' + r); }
}
console.log('-- selfcheck: ' + pass + ' passed, ' + fail + ' failed  (' + impl + ')');
process.exitCode = fail ? 1 : 0;

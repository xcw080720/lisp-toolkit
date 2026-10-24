// verify.cjs — iter-cl 臂的「新增不变量」检查器（每个需求一条，逐条能红）
// 用法: node verify.cjs [--only D1,D2,D3]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');

const IMPL = path.join(__dirname, 'impl.lisp');
const sbcl = process.env.SBCL || 'sbcl';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-'));

const C = (o = {}) => ({ name: 'X', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, ...o });
const find = (out, name) => (out.courses || []).find((c) => c.name === name);
const names = (out) => (out.courses || []).map((c) => c.name).join('|');

function run(input) {
  const f = path.join(tmp, 'in.json');
  fs.writeFileSync(f, JSON.stringify(input));
  const r = spawnSync(sbcl, ['--script', IMPL, f], { encoding: 'utf8', timeout: 30000 });
  try { return JSON.parse((r.stdout || '').trim()); } catch { return null; }
}

const T = [];
const add = (id, name, input, check) => T.push({ id, name, input, check });

// ===== D1：同名课自动加序号 =====
// 连加三次同名课 → 高数 / 高数(2) / 高数(3)
add('D1', 'add-dup-name-suffix',
  { courses: [], ops: [
      { op: 'add', course: C({ name: '高数' }) },
      { op: 'add', course: C({ name: '高数', day: 2 }) },
      { op: 'add', course: C({ name: '高数', day: 3 }) }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const got = names(o);
    if (find(o, '高数') == null) return '缺少「高数」本体';
    if (find(o, '高数(2)') == null) return '第二条同名课未变成「高数(2)」，实际：' + got;
    if (find(o, '高数(3)') == null) return '第三条同名课未变成「高数(3)」，实际：' + got;
    if (o.n !== 3) return 'n 应为 3，得到 ' + o.n;
    return true;
  });

// ===== D2：edit 的节次一致性（只给一端时不得把 pfrom > pto） =====
// 规格点名两个方向：只给 periodFrom / 只给 periodTo。仍算一条不变量。
add('D2', 'edit-one-sided-keeps-order',
  { courses: [C({ name: 'A', day: 1, periodFrom: 1, periodTo: 2 }),
              C({ name: 'B', day: 2, periodFrom: 5, periodTo: 6 })],
    ops: [{ op: 'edit', match: 'A', set: { periodFrom: 9 } },
          { op: 'edit', match: 'B', set: { periodTo: 3 } }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const a = find(o, 'A');
    if (!a) return '课程 A 不见了';
    if (a.periodFrom !== 9) return 'periodFrom 未改成 9（得到 ' + a.periodFrom + '）';
    if (!(a.periodTo >= 9)) return 'periodTo 未抬到 ≥9（得到 ' + a.periodTo + '）';
    if (a.periodFrom > a.periodTo) return 'A 节次倒挂：' + a.periodFrom + ' > ' + a.periodTo;
    const b = find(o, 'B');
    if (!b) return '课程 B 不见了';
    // 规格只要求「保持 pfrom <= pto」：B 的 pto=3 会被抬到 pfrom=5，这正是合规行为
    if (b.periodTo < b.periodFrom) return 'B 节次倒挂：' + b.periodFrom + ' > ' + b.periodTo;
    if (b.periodFrom !== 5) return 'B 的 periodFrom 不该被改（得到 ' + b.periodFrom + '）';
    return true;
  });

// ===== D3：整批执行，缺字段的 op 只降级为 [skip] 日志行 =====
// 一批 3 个 op（中间缺字段）：log[1] 以 [skip] 开头，其余两条正常执行、正常编号。
add('D3', 'batch-skip-line-prefix',
  { courses: [C({ name: 'A', day: 1 })],
    ops: [{ op: 'add', course: C({ name: '新1', day: 2 }) },
          { op: 'move', match: 'A', day: 4 },            // 缺 periodFrom / periodTo
          { op: 'add', course: C({ name: '新2', day: 3 }) }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    if (o.log.length !== 3) return '应有 3 行日志（含 skip），得到 ' + o.log.length + '：' + JSON.stringify(o.log);
    if (!/^\[skip\]/.test(o.log[1])) return 'log[1] 未以 [skip] 开头：' + JSON.stringify(o.log[1]);
    if (!/^\d+\) /.test(o.log[0])) return 'log[0] 编号被破坏：' + JSON.stringify(o.log[0]);
    if (!/^\d+\) /.test(o.log[2])) return 'log[2] 编号被破坏：' + JSON.stringify(o.log[2]);
    if (find(o, '新1') == null || find(o, '新2') == null) return '其余 op 未照旧执行：' + names(o);
    const a = find(o, 'A');
    if (!a || a.day !== 1) return '缺字段的 move 竟然生效了（A.day=' + (a && a.day) + '）';
    if (o.n !== 2) return 'n 应只计成功的 2 条，得到 ' + o.n;
    return true;
  });

// ---- 执行 ----
const argv = process.argv.slice(2);
const oi = argv.indexOf('--only');
const want = oi >= 0 ? new Set(argv[oi + 1].split(',').map((s) => s.trim())) : null;

let pass = 0, fail = 0;
for (const t of T) {
  if (want && !want.has(t.id) && !want.has(t.name)) continue;
  const o = run(t.input);
  let r;
  try { r = t.check(o); } catch (e) { r = '检查器异常: ' + e.message; }
  if (r === true) { pass++; console.log('[ok  ] ' + t.id + ' ' + t.name); }
  else { fail++; console.log('[FAIL] ' + t.id + ' ' + t.name + '  — ' + r); }
}
console.log('-- ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

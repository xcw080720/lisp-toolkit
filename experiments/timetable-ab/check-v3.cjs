// check-v3.cjs — v3 协议的不变量检查器（纯文本契约，无 I/O）
// 用法: node check-v3.cjs --impl <impl.lisp|impl.js> --upto 36 [--only 3,7] [--json]
//
// ★ 本文件里装着**两个契约**（2026-11-01 查清并标注）：
//     · 判据 1–36  → `tasks/v3.spec.md`，15 个 op。这是 v3 十二格与加 n 实验的口径。
//     · 判据 37–56 → 30-op 变体（swapTeacher / copyLoc / copyTo / truncate / keep /
//       renameTeacher / dedupe / compress / compact / mirror / absorb / promote /
//       purge / --dry …），这些 op 在 v3.spec.md 里**一条都没有**，只有 ref-js-30.js 实现。
//
//   因此：**对任何 15-op 实现，判据 37–56 必然全红**（不是实现缺陷，是另一个契约的要求）。
//   不带 --upto 直接跑会得到形如 `36/56 通过` 的分母，那个数**不能当质量指标**——
//   6/6 个 JS inline 格、v3 的历史产物、参考实现，全都是一样的结果。
//
//   用法约束：必须显式给 --upto（或 --only）声明分母，否则直接报错退出。
//   v1.6.1（2026-11-01）：#31/#32 已写进 tasks/v3.spec.md §4.1，全 36 条均为合规判据；
//   此前的 --exclude-out-of-spec 开关已删除（保留它等于允许重新剔掉合规判据）。
//   历史口径：v3 报告与 CLAIMS.md 里的「36 条」一律指 `--upto 36`。
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const impl = arg('--impl');
const only = arg('--only');
const asJson = argv.includes('--json');
// v1.6.1（2026-11-01）：#31（未知命令）/ #32（空命令串）已写进 tasks/v3.spec.md §4.1，
// 因此它们**是**合规判据，36 条一条不剔。旧开关 --exclude-out-of-spec 已删除：
// 留着它等于允许把合规判据重新剔出去，那正是这一版要关掉的缺口。
if (!impl) { console.log('usage: node check-v3.cjs --impl X --upto 36 [--only 3,7] [--json]'); process.exit(2); }
if (!only && !arg('--upto')) {
  console.log('[拒绝执行] 必须显式声明分母：本文件含两个契约（1–36 = v3 15-op；37–56 = 30-op 变体）。');
  console.log('  15-op 实现请用：--upto 36      30-op 实现请用：--upto 56');
  console.log('  不带分母跑出的 `x/56` 不是质量指标，见本文件头部注释。');
  process.exit(2);
}
if (!fs.existsSync(impl)) { console.log('[FAIL] 文件不存在: ' + impl); process.exit(2); }

const ext = path.extname(impl).toLowerCase();
const isLisp = ext === '.lisp';
const isJs = ['.js', '.cjs', '.mjs'].includes(ext);

// Windows → WSL 路径（C:\a\b → /mnt/c/a/b）
const toWsl = (p) => '/mnt/' + p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (m, d) => d.toLowerCase());
// sbcl 位置：SBCL_WSL=<distro> 时走 WSL；否则用本地 sbcl（SBCL 可覆盖路径）
const WSL_DISTRO = process.env.SBCL_WSL || '';
const SBCL_BIN = process.env.SBCL || 'sbcl';

function runImpl(cmds) {
  let r;
  if (isLisp) {
    if (WSL_DISTRO) {
      r = spawnSync('wsl', ['-d', WSL_DISTRO, '-u', 'root', '--', SBCL_BIN, '--script', toWsl(path.resolve(impl)), ...cmds],
        { encoding: 'utf8', timeout: 180000 });
    } else {
      r = spawnSync(SBCL_BIN, ['--script', impl, ...cmds], { encoding: 'utf8', timeout: 120000 });
    }
  } else if (isJs) r = spawnSync(process.execPath, [impl, ...cmds], { encoding: 'utf8', timeout: 120000 });
  else { console.log('[FAIL] 只支持 .lisp / .js'); process.exit(2); }
  const out = (r.stdout || '').replace(/\r\n/g, '\n');
  const err = (r.stderr || '').replace(/\r\n/g, '\n');
  // 规范化：去每行首尾空白、去空行
  const norm = (s) => s.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  return { code: r.status, out: norm(out), stderr: norm(err), crashed: r.status !== 0 || norm(out).length === 0 };
}

// 期望矩阵：{ id, desc, cmds, expect }  expect 为规范化后的完整输出行数组
const T = [];
const add = (id, desc, cmds, expect) => T.push({ id, desc, cmds, expect });

// —— 1–6：add 与基本状态 ——
add(1, 'add 单条 → ok + state 一行', ['add math t1 r1 1 1 2'],
  ['ok add 1', '#state', 'math|t1|r1|1|1-2']);
add(2, 'add 两条不冲突', ['add math t1 r1 1 1 2', 'add phys t2 r2 1 3 4'],
  ['ok add 1', 'ok add 1', '#state', 'math|t1|r1|1|1-2', 'phys|t2|r2|1|3-4']);
add(3, 'add 重名 → DUP 且状态不变', ['add math t1 r1 1 1 2', 'add math t9 r9 2 1 2'],
  ['ok add 1', 'err DUP', '#state', 'math|t1|r1|1|1-2']);
add(4, 'add 时间重叠 → CONFLICT（端点相接也算）', ['add math t1 r1 1 1 2', 'add phys t2 r2 1 2 3'],
  ['ok add 1', 'err CONFLICT', '#state', 'math|t1|r1|1|1-2']);
add(5, 'add 参数不足 → BADARG', ['add math t1 r1 1 1'],
  ['err BADARG', '#state']);
add(6, 'add 参数越界（day=8）→ BADARG', ['add math t1 r1 8 1 2'],
  ['err BADARG', '#state']);

// —— 7–12：del / edit / move / rename ——
add(7, 'del 存在', ['add math t1 r1 1 1 2', 'del math'],
  ['ok add 1', 'ok del 1', '#state']);
add(8, 'del 不存在 → NOTFOUND', ['del ghost'], ['err NOTFOUND', '#state']);
add(9, 'edit 改教师与地点', ['add math t1 r1 1 1 2', 'edit math t9 r9'],
  ['ok add 1', 'ok edit 1', '#state', 'math|t9|r9|1|1-2']);
add(10, 'edit 不存在 → NOTFOUND', ['edit ghost t1 r1'], ['err NOTFOUND', '#state']);
add(11, 'move 到空时间段', ['add math t1 r1 1 1 2', 'move math 2 5 6'],
  ['ok add 1', 'ok move 1', '#state', 'math|t1|r1|2|5-6']);
add(12, 'move 撞已有课程 → CONFLICT', ['add a t r 1 1 2', 'add b t r 2 1 2', 'move a 2 1 2'],
  ['ok add 1', 'ok add 1', 'err CONFLICT', '#state', 'a|t|r|1|1-2', 'b|t|r|2|1-2']);

// —— 13–17：swap / rename / duplicate ——
add(13, 'swap 两门课对调时间', ['add a t r 1 1 2', 'add b t r 2 3 4', 'swap a b'],
  ['ok add 1', 'ok add 1', 'ok swap 2', '#state', 'a|t|r|2|3-4', 'b|t|r|1|1-2']);
add(14, 'rename 成功', ['add a t r 1 1 2', 'rename a z'],
  ['ok add 1', 'ok rename 1', '#state', 'z|t|r|1|1-2']);
add(15, 'rename 撞名 → DUP', ['add a t r 1 1 2', 'add b t r 2 1 2', 'rename a b'],
  ['ok add 1', 'ok add 1', 'err DUP', '#state', 'a|t|r|1|1-2', 'b|t|r|2|1-2']);
add(16, 'duplicate 复制到新名（同名时间）', ['add a t r 1 1 2', 'duplicate a a2'],
  ['ok add 1', 'ok duplicate 1', '#state', 'a|t|r|1|1-2', 'a2|t|r|1|1-2']);
add(17, 'duplicate 撞名 → DUP', ['add a t r 1 1 2', 'add b t r 2 1 2', 'duplicate a b'],
  ['ok add 1', 'ok add 1', 'err DUP', '#state', 'a|t|r|1|1-2', 'b|t|r|2|1-2']);

// —— 18–22：trim / clear / shift / copy / merge ——
add(18, 'trim 把该天课程 to 截到指定值', ['add a t r 1 1 4', 'add b t r 1 5 6', 'trim 1 3'],
  ['ok add 1', 'ok add 1', 'ok trim 1', '#state', 'a|t|r|1|1-3', 'b|t|r|1|5-6']);
add(19, 'trim 对已短的课程无影响', ['add a t r 1 1 2', 'trim 1 3'],
  ['ok add 1', 'ok trim 0', '#state', 'a|t|r|1|1-2']);
add(20, 'clear 删除该天全部', ['add a t r 1 1 2', 'add b t r 2 1 2', 'clear 1'],
  ['ok add 1', 'ok add 1', 'ok clear 1', '#state', 'b|t|r|2|1-2']);
add(21, 'shift 全体后移一天', ['add a t r 1 1 2', 'shift 1 1'],
  ['ok add 1', 'ok shift 1', '#state', 'a|t|r|2|1-2']);
add(22, 'shift 越界 → BADARG 且不得部分生效', ['add a t r 7 1 2', 'shift 7 1'],
  ['ok add 1', 'err BADARG', '#state', 'a|t|r|7|1-2']);

add(23, 'copy 复制到另一天（名字加 _2）', ['add a t r 1 1 2', 'copy a 3'],
  ['ok add 1', 'ok copy 1', '#state', 'a|t|r|1|1-2', 'a_2|t|r|3|1-2']);
add(24, 'merge 并入并删除 b', ['add a t1 r1 1 1 2', 'add b t2 r2 2 1 2', 'merge a b'],
  ['ok add 1', 'ok add 1', 'ok merge 2', '#state', 'a|t2|r2|1|1-2']);
add(25, 'merge 目标不存在 → NOTFOUND', ['add a t r 1 1 2', 'merge a ghost'],
  ['ok add 1', 'err NOTFOUND', '#state', 'a|t|r|1|1-2']);

// —— 26–29：sort / filter / count ——
add(26, 'sort 后 #state 按名排序', ['add z t r 1 1 2', 'add a t r 2 1 2', 'sort'],
  ['ok add 1', 'ok add 1', 'ok sort 0', '#state', 'a|t|r|2|1-2', 'z|t|r|1|1-2']);
add(27, 'filter 统计某天', ['add a t r 1 1 2', 'add b t r 1 3 4', 'add c t r 2 1 2', 'filter 1'],
  ['ok add 1', 'ok add 1', 'ok add 1', 'ok filter 2', '#state', 'a|t|r|1|1-2', 'b|t|r|1|3-4', 'c|t|r|2|1-2']);
add(28, 'count 空课表', ['count'], ['ok count 0', '#state']);
add(29, 'count 三门', ['add a t r 1 1 2', 'add b t r 2 1 2', 'add c t r 3 1 2', 'count'],
  ['ok add 1', 'ok add 1', 'ok add 1', 'ok count 3', '#state', 'a|t|r|1|1-2', 'b|t|r|2|1-2', 'c|t|r|3|1-2']);

// —— 30–36：边界与组合 ——
add(30, 'LIMIT：第 21 门 → LIMIT', [
  ...Array.from({ length: 20 }, (_, i) => `add c${i} t r ${(i % 7) + 1} ${(i % 10) + 1} ${(i % 10) + 1}`),
  'add c20 t r 7 12 12'],
  [...Array.from({ length: 20 }, () => 'ok add 1'), 'err LIMIT', '#state',
  ...Array.from({ length: 20 }, (_, i) => `c${i}|t|r|${(i % 7) + 1}|${(i % 10) + 1}-${(i % 10) + 1}`)
    .sort((x, y) => { const a = x.split('|')[0], b = y.split('|')[0]; return a < b ? -1 : a > b ? 1 : 0; })]);
add(31, '未知命令 → BADARG', ['frobnicate a b'], ['err BADARG', '#state']);
add(32, '空命令串 → BADARG', [''], ['err BADARG', '#state']);
add(33, 'to < from → BADARG', ['add a t r 1 5 3'], ['err BADARG', '#state']);
add(34, '同一天不冲突但跨天可重叠', ['add a t r 1 1 2', 'add b t r 2 1 2'],
  ['ok add 1', 'ok add 1', '#state', 'a|t|r|1|1-2', 'b|t|r|2|1-2']);
add(35, '删后再加同名 → 成功', ['add a t r 1 1 2', 'del a', 'add a t2 r2 3 1 2'],
  ['ok add 1', 'ok del 1', 'ok add 1', '#state', 'a|t2|r2|3|1-2']);
add(36, '混合序列 12 条命令', [
  'add a t r 1 1 2', 'add b t r 1 3 4', 'edit a t9 r9', 'rename b bb',
  'duplicate a a2', 'swap a bb', 'move a2 5 1 2', 'count', 'filter 1', 'clear 1', 'count', 'sort'],
  ['ok add 1', 'ok add 1', 'ok edit 1', 'ok rename 1', 'ok duplicate 1', 'ok swap 2',
    'ok move 1', 'ok count 3', 'ok filter 2', 'ok clear 2', 'ok count 1', 'ok sort 0',
    '#state', 'a2|t9|r9|5|1-2']);

// —— 37–51：增量规格 op 16–30（tasks/v3-increment.spec.md）——
add(37, 'swapTeacher 交换教师', ['add a t1 r1 1 1 2', 'add b t2 r2 2 1 2', 'swapTeacher a b'],
  ['ok add 1', 'ok add 1', 'ok swapTeacher 2', '#state', 'a|t2|r1|1|1-2', 'b|t1|r2|2|1-2']);
add(38, 'swapLoc 交换地点', ['add a t1 r1 1 1 2', 'add b t2 r2 2 1 2', 'swapLoc a b'],
  ['ok add 1', 'ok add 1', 'ok swapLoc 2', '#state', 'a|t1|r2|1|1-2', 'b|t2|r1|2|1-2']);
add(39, 'copyTo 复制到指定时间（name_3）', ['add a t r 1 1 2', 'copyTo a 3 5 6'],
  ['ok add 1', 'ok copyTo 1', '#state', 'a|t|r|1|1-2', 'a_3|t|r|3|5-6']);
add(40, 'truncate 该天只保留字典序最小', ['add b t r 1 1 2', 'add a t r 1 3 4', 'truncate 1'],
  ['ok add 1', 'ok add 1', 'ok truncate 1', '#state', 'a|t|r|1|3-4']);
add(41, 'keep 该天只留前 n 门', ['add a t r 1 1 2', 'add b t r 1 3 4', 'add c t r 1 5 6', 'keep 1 2'],
  ['ok add 1', 'ok add 1', 'ok add 1', 'ok keep 1', '#state', 'a|t|r|1|1-2', 'b|t|r|1|3-4']);
add(42, 'renameTeacher 全表改教师', ['add a t1 r 1 1 2', 'add b t1 r 2 1 2', 'renameTeacher t1 t9'],
  ['ok add 1', 'ok add 1', 'ok renameTeacher 2', '#state', 'a|t9|r|1|1-2', 'b|t9|r|2|1-2']);
add(43, 'renameLoc 全表改地点', ['add a t r1 1 1 2', 'renameLoc r1 r9'],
  ['ok add 1', 'ok renameLoc 1', '#state', 'a|t|r9|1|1-2']);
add(44, 'dedupe 删完全重复（留字典序最小）', ['add a t r 1 1 2', 'duplicate a b', 'dedupe'],
  ['ok add 1', 'ok duplicate 1', 'ok dedupe 1', '#state', 'a|t|r|1|1-2']);
add(45, 'compress 该天重排为连续时段', ['add a t r 1 3 4', 'add b t r 1 7 8', 'compress 1'],
  ['ok add 1', 'ok add 1', 'ok compress 2', '#state', 'a|t|r|1|1-2', 'b|t|r|1|2-3']);
add(46, 'compact 每天都 compress', ['add a t r 1 5 6', 'compact'],
  ['ok add 1', 'ok compact 1', '#state', 'a|t|r|1|1-2']);
add(47, 'mirror 整天空复制到另一天', ['add a t r 1 1 2', 'mirror 1 3'],
  ['ok add 1', 'ok mirror 1', '#state', 'a|t|r|1|1-2', 'a_m|t|r|3|1-2']);
add(48, 'absorb 并入但保留 b', ['add a t1 r1 1 1 2', 'add b t2 r2 2 1 2', 'absorb a b'],
  ['ok add 1', 'ok add 1', 'ok absorb 2', '#state', 'a|t2|r2|1|1-2', 'b|t2|r2|2|1-2']);
add(49, 'swapDays 两天所有课互换', ['add a t r 1 1 2', 'add b t r 2 3 4', 'swapDays 1 2'],
  ['ok add 1', 'ok add 1', 'ok swapDays 2', '#state', 'a|t|r|2|1-2', 'b|t|r|1|3-4']);
add(50, 'promote 移到第一个空时段', ['add a t r 1 3 4', 'promote a'],
  ['ok add 1', 'ok promote 1', '#state', 'a|t|r|1|1-2']);
add(51, 'purge 删该教师全部课程', ['add a t1 r 1 1 2', 'add b t2 r 2 1 2', 'purge t1'],
  ['ok add 1', 'ok add 1', 'ok purge 1', '#state', 'b|t2|r|2|1-2']);

// —— 52–56：全局规则 --dry（tasks/v3-maint.spec.md）——
add(52, '--dry add 不落盘', ['--dry add a t r 1 1 2'],
  ['ok add 1', '#state']);
add(53, '--dry del 不删除', ['add a t r 1 1 2', '--dry del a'],
  ['ok add 1', 'ok del 1', '#state', 'a|t|r|1|1-2']);
add(54, '--dry clear 报数量但不删', ['add a t r 1 1 2', 'add b t r 1 3 4', '--dry clear 1'],
  ['ok add 1', 'ok add 1', 'ok clear 2', '#state', 'a|t|r|1|1-2', 'b|t|r|1|3-4']);
add(55, '--dry 与真实命令混用：状态不受影响', ['add a t r 1 1 2', '--dry del a', 'count'],
  ['ok add 1', 'ok del 1', 'ok count 1', '#state', 'a|t|r|1|1-2']);
add(56, '--dry 遇错仍报 err', ['--dry del ghost'],
  ['err NOTFOUND', '#state']);
// —— 执行 ——
const upto = arg('--upto') ? +arg('--upto') : 0;
const want = only ? new Set(only.split(',').map((s) => +s.trim())) : (upto ? new Set(T.filter((x) => x.id <= upto).map((x) => x.id)) : null);
let pass = 0, fail = 0, crash = 0;
const failures = [];
for (const t of T) {
  if (want && !want.has(t.id)) continue;
  const r = runImpl(t.cmds);
  if (r.crashed) {
    crash++;
    failures.push({ id: t.id, desc: t.desc, kind: 'CRASH', stderr: r.stderr.slice(0, 3) });
    if (!asJson) console.log(`#${String(t.id).padStart(2)} CRASH  ${t.desc}\n     ${r.stderr.slice(0, 3).join(' | ')}`);
    continue;
  }
  const got = r.out;
  const okk = got.length === t.expect.length && got.every((l, i) => l === t.expect[i]);
  if (okk) { pass++; if (!asJson) console.log(`#${String(t.id).padStart(2)} PASS   ${t.desc}`); }
  else {
    fail++;
    failures.push({ id: t.id, desc: t.desc, kind: 'MISMATCH', expect: t.expect, got });
    if (!asJson) {
      console.log(`#${String(t.id).padStart(2)} FAIL   ${t.desc}`);
      const n = Math.max(t.expect.length, got.length);
      for (let i = 0; i < n; i++) {
        const e = t.expect[i], g = got[i];
        if (e !== g) console.log(`     L${i + 1} 期望: ${e === undefined ? '(无)' : e}\n     L${i + 1} 实际: ${g === undefined ? '(无)' : g}`);
      }
    }
  }
}

const total = pass + fail + crash;
if (asJson) {
  console.log(JSON.stringify({ impl, pass, fail, crash, total, failures }, null, 2));
} else {
  console.log(`\n${pass}/${total} 通过（fail=${fail} crash=${crash}）`);
}
process.exit(fail + crash === 0 ? 0 : 1);




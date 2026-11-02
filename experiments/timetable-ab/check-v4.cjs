// check-v4.cjs — v3 协议的不变量检查器（纯文本契约，无 I/O）
// 用法: node check-v3.cjs --impl <impl.lisp|impl.js> [--only 3,7] [--json]
// 判据 36 条，全部为「同一条状态序列 → 精确输出比对」。空白规范化后比对。
// 编号说明（2026-11-01 补注，不改行为）：
//   本文件的用例编号为 1–80、83–86，共 84 条 —— **81 和 82 是空号，不是漏项。**
//   它们对应的是 tasks/v3-full.spec.md L61（行尾卫生）与 L124（不依赖 cwd），
//   因为判的是「进程级行为」（末尾字节、跨目录输出一致性，需要多次调用比对），
//   和本文件「按行比对输出内容」不是一个机制，所以实现在 check-hygiene.cjs 里，
//   编号为 H1 / H2。
//   判别据总数时按 84(v4) + 2(hygiene) + 2(static) = 88 条计。
//   盲跑复核时曾有子代理据「编号到 #86、分母 84」误推为「实际跑了 86 条用例」，
//   这条注释就是为了消除该歧义。
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const impl = arg('--impl');
const only = arg('--only');
const asJson = argv.includes('--json');
if (!impl) { console.log('usage: node check-v3.cjs --impl X [--only 3,7] [--json]'); process.exit(2); }
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
  ['ok add 1', 'ok add 1', 'ok swapteacher 2', '#state', 'a|t2|r1|1|1-2', 'b|t1|r2|2|1-2']);
add(38, 'swapLoc 交换地点', ['add a t1 r1 1 1 2', 'add b t2 r2 2 1 2', 'swapLoc a b'],
  ['ok add 1', 'ok add 1', 'ok swaploc 2', '#state', 'a|t1|r2|1|1-2', 'b|t2|r1|2|1-2']);
add(39, 'copyTo 复制到指定时间（name_3）', ['add a t r 1 1 2', 'copyTo a 3 5 6'],
  ['ok add 1', 'ok copyto 1', '#state', 'a|t|r|1|1-2', 'a_3|t|r|3|5-6']);
add(40, 'truncate 该天只保留字典序最小', ['add b t r 1 1 2', 'add a t r 1 3 4', 'truncate 1'],
  ['ok add 1', 'ok add 1', 'ok truncate 1', '#state', 'a|t|r|1|3-4']);
add(41, 'keep 该天只留前 n 门', ['add a t r 1 1 2', 'add b t r 1 3 4', 'add c t r 1 5 6', 'keep 1 2'],
  ['ok add 1', 'ok add 1', 'ok add 1', 'ok keep 1', '#state', 'a|t|r|1|1-2', 'b|t|r|1|3-4']);
add(42, 'renameTeacher 全表改教师', ['add a t1 r 1 1 2', 'add b t1 r 2 1 2', 'renameTeacher t1 t9'],
  ['ok add 1', 'ok add 1', 'ok renameteacher 2', '#state', 'a|t9|r|1|1-2', 'b|t9|r|2|1-2']);
add(43, 'renameLoc 全表改地点', ['add a t r1 1 1 2', 'renameLoc r1 r9'],
  ['ok add 1', 'ok renameloc 1', '#state', 'a|t|r9|1|1-2']);
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
  ['ok add 1', 'ok add 1', 'ok swapdays 2', '#state', 'a|t|r|2|1-2', 'b|t|r|1|3-4']);
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
// —— 57–76：锐判据（v4）——
// 设计原则：专打"看起来对但实际没做对"的地方——n 一致性、原子性、幂等性、dry 与真实执行等价

add(57, 'dry 遇冲突也要报 CONFLICT', ['add a t r 1 1 2', '--dry add b t r 1 1 2'],
  ['ok add 1', 'err CONFLICT', '#state', 'a|t|r|1|1-2']);
add(58, 'n 一致性：dry del 与真 del', ['add a t r 1 1 2', '--dry del a', 'del a'],
  ['ok add 1', 'ok del 1', 'ok del 1', '#state']);
add(59, 'n 一致性：dry clear 与真 clear', ['add a t r 1 1 2', 'add b t r 1 3 4', '--dry clear 1', 'clear 1'],
  ['ok add 1', 'ok add 1', 'ok clear 2', 'ok clear 2', '#state']);
add(60, 'dry trim 报 n 且不改状态', ['add a t r 1 1 4', '--dry trim 1 2'],
  ['ok add 1', 'ok trim 1', '#state', 'a|t|r|1|1-4']);
add(61, 'n 一致性：dry shift', ['add a t r 1 1 2', '--dry shift 1 1'],
  ['ok add 1', 'ok shift 1', '#state', 'a|t|r|1|1-2']);
add(62, 'n 一致性：dry compress', ['add a t r 1 3 4', 'add b t r 1 7 8', '--dry compress 1'],
  ['ok add 1', 'ok add 1', 'ok compress 2', '#state', 'a|t|r|1|3-4', 'b|t|r|1|7-8']);
add(63, 'n 一致性：dry dedupe', ['add a t r 1 1 2', 'duplicate a b', '--dry dedupe'],
  ['ok add 1', 'ok duplicate 1', 'ok dedupe 1', '#state', 'a|t|r|1|1-2', 'b|t|r|1|1-2']);
add(64, 'n 一致性：dry purge', ['add a t1 r 1 1 2', 'add b t1 r 2 1 2', '--dry purge t1'],
  ['ok add 1', 'ok add 1', 'ok purge 2', '#state', 'a|t1|r|1|1-2', 'b|t1|r|2|1-2']);
add(65, '连续 dry 不累积改状态', ['add a t r 1 1 2', '--dry del a', '--dry del a', 'count'],
  ['ok add 1', 'ok del 1', 'ok del 1', 'ok count 1', '#state', 'a|t|r|1|1-2']);
add(66, 'dry 遇重名报 DUP', ['add a t r 1 1 2', '--dry add a t r 3 1 2'],
  ['ok add 1', 'err DUP', '#state', 'a|t|r|1|1-2']);
add(67, 'dry 遇越界报 BADARG', ['--dry add a t r 8 1 2'],
  ['err BADARG', '#state']);
add(68, '原子性：shift 越界不得部分生效', ['add a t r 3 1 2', 'add b t r 7 1 2', 'shift 1'],
  ['ok add 1', 'ok add 1', 'err BADARG', '#state', 'a|t|r|3|1-2', 'b|t|r|7|1-2']);
add(69, '原子性：mirror 撞名不得复制任何一门', ['add a t r 1 1 2', 'add a_m t r 2 1 2', 'mirror 1 2'],
  ['ok add 1', 'ok add 1', 'err DUP', '#state', 'a|t|r|1|1-2', 'a_m|t|r|2|1-2']);
add(70, '幂等：第二次 dedupe 为 0', ['add a t r 1 1 2', 'duplicate a b', 'dedupe', 'dedupe'],
  ['ok add 1', 'ok duplicate 1', 'ok dedupe 1', 'ok dedupe 0', '#state', 'a|t|r|1|1-2']);
add(71, '幂等：第二次 compact 为 0', ['add a t r 1 3 4', 'compact', 'compact'],
  ['ok add 1', 'ok compact 1', 'ok compact 0', '#state', 'a|t|r|1|1-2']);
add(72, '顺序：shift 两次等于 +2', ['add a t r 1 1 2', 'shift 1 1', 'shift 2 1'],
  ['ok add 1', 'ok shift 1', 'ok shift 1', '#state', 'a|t|r|3|1-2']);
add(73, '名字 13 字符越界', ['add abcdefghijklm t r 1 1 2'],
  ['err BADARG', '#state']);
add(74, '跨天同时间段可重叠', ['add a t r 1 1 2', 'add b t r 2 1 2'],
  ['ok add 1', 'ok add 1', '#state', 'a|t|r|1|1-2', 'b|t|r|2|1-2']);
add(75, 'trim 只截跨过 to 的门（n 结构上≤1）', ['add a t r 1 1 6', 'add b t r 1 7 8', '--dry trim 1 5'],
  ['ok add 1', 'ok add 1', 'ok trim 1', '#state', 'a|t|r|1|1-6', 'b|t|r|1|7-8']);
add(76, 'dry 与真执行混合仍正确', ['add a t r 1 1 2', '--dry move a 2 1 2', '--dry edit a t2 r2', 'edit a t2 r2'],
  ['ok add 1', 'ok move 1', 'ok edit 1', 'ok edit 1', '#state', 'a|t2|r2|1|1-2']);

// —— 77–80：补 SPEC-AUDIT 核出的覆盖缺口（规格明文但原本无判据）——
add(77, "teacher/loc 可为 '-'（规格 L24）", ["add a - - 1 1 2"],
  ['ok add 1', '#state', 'a|-|-|1|1-2']);
add(78, 'name 恰好 12 字符合法（规格 1–12）', ['add abcdefghijkl t r 1 1 2'],
  ['ok add 1', '#state', 'abcdefghijkl|t|r|1|1-2']);
add(79, 'teacher 13 字符越界（规格 1–12）', ['add a abcdefghijklm r 1 1 2'],
  ['err BADARG', '#state']);
add(80, "- 可被 edit 覆盖成真名", ['add a - - 1 1 2', 'edit a t9 r9'],
  ['ok add 1', 'ok edit 1', '#state', 'a|t9|r9|1|1-2']);

// —— 83–84：补 SPEC-AUDIT 攻击出的真盲区（2026-11-01）——
add(83, 'copyTo 复制到已占时段 → CONFLICT 且状态不变（规格 L162）',
  ['add a t1 r1 1 1 2', 'add b t2 r2 1 3 4', 'copyTo a 1 3 4'],
  ['ok add 1', 'ok add 1', 'err CONFLICT', '#state', 'a|t1|r1|1|1-2', 'b|t2|r2|1|3-4']);
add(84, 'copyTo 复制到自身原时段 → CONFLICT（自撞也查）',
  ['add a t1 r1 1 1 2', 'copyTo a 1 1 2'],
  ['ok add 1', 'err CONFLICT', '#state', 'a|t1|r1|1|1-2']);
// —— 85–86：攻击实验暴露的两处真盲区（2026-11-01）——
// 85：判据期望里 n 只出现过 {0,1,2,3}，n>=4 从未被观测 → 补一条 n=4
add(85, 'n >= 4（多位数 n 的书写形式）',
  ['add a t1 r1 1 1 2', 'add b t1 r1 2 1 2', 'add c t1 r1 3 1 2', 'add d t1 r1 4 1 2', 'purge t1'],
  ['ok add 1', 'ok add 1', 'ok add 1', 'ok add 1', 'ok purge 4', '#state']);
// 86：copyTo 的 DUP 那一半（L161 需查重）原本无判据，CONFLICT 那一半已由 #83/#84 覆盖
add(86, 'copyTo 目标名已存在 → DUP（规格 L161）',
  ['add a t1 r1 1 1 2', 'add a_3 t2 r2 2 3 4', 'copyTo a 3 5 6'],
  ['ok add 1', 'ok add 1', 'err DUP', '#state', 'a|t1|r1|1|1-2', 'a_3|t2|r2|2|3-4']);
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

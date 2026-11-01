// check-closure.cjs —— 判据收口补丁（2026-11-01，本文件共 K1–K7 七条）
// 用法: node check-closure.cjs --impl <impl.lisp|impl.js> [--only K1,K2]
//
// 起因：mate.cjs 在 scale-js 上报出 5 条存活变异，逐条查过之后要分成两类：
//   · 真盲区（判据没喂过这种输入，而 spec 已经规定了语义）  → 补一条判据
//   · 等价变异（删掉的那行在 spec 允许的输入上不可观测）    → 不算盲区，改工具或记边界
//
// 纪律（来自 #32/#36 的教训）：**每条新判据都要能在 tasks/scale.spec.md 里指到原文**，
// 指不到的不写 —— 否则测的是我的偏好，不是规格。判据还必须对"另一种合法实现写法"同样成立：
// 例如 tag 清空后「省掉该键」和「置为 null」都合法，判据不许只认其中一种。
//
// 七条判据的 spec 依据（行号指 tasks/scale.spec.md）：
//   K1  L15  `tag`：字符串或 null（可选字段，缺省 null）
//   K2  L46  trim：把命中课的节次范围收窄到 [from,to]
//   K3  L26  `n` = 实际改动条数  ＋  L50  untag：删掉所有该标签
//   K4  L9 数据模型 JSON 含 location；L36 edit 只改 set 里的键
//   K5  L34  add 行只列了两处改写（缺 weeks → range 1..16；day 夹 1..7）
//   K6  L37  move：match/day/periodFrom/periodTo 三件套
//   K7  L48  shift：（夹在 ≥1，`periodTo ≥ periodFrom`）
//
// 2026-11-01 独立复核要求改写两条 —— 原写法在咬实现偏好，不是在测规格：
//   · K3 原断言「清空后 c.tag 必须是 null」。tag 是可选字段（L15 只规定"字符串或 null"），
//     "省掉该键"同样合法，原断言会把合法变体判红 → 改成「不再等于原标签值 'x'」，
//     只保留 n===2 作主断言。
//   · K5 原注释写「spec §数据模型 periodFrom ≤ periodTo，所以不许改写」。那句是**输入约束**，
//     推不出 add 能不能改写；正确依据是 L34 的 add 行**只列了两处改写**（缺 weeks → range
//     1..16；day 夹 1..7），没授权改 periodFrom。断言语义不变，只换依据。
//   · 同时补两条复核推翻后暴露的盲区（两臂 36 条当时全绿）：K6 move 的 periodTo 不落地、
//     K7 shift 的"夹在 ≥1"。
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const impl = arg('--impl');
const onlyArg = arg('--only');
const ONLY = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim())) : null;
if (!impl) { console.log('usage: node check-closure.cjs --impl <impl.lisp|impl.js> [--only K1,K2]'); process.exit(2); }

const isLisp = impl.endsWith('.lisp');
const sbcl = process.env.SBCL || 'sbcl';
const WSL = process.env.SBCL_WSL || '';
const toWsl = (p) => '/mnt/' + p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (m, d) => d.toLowerCase());
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'closure-'));

function run(input) {
  const f = path.join(tmp, 'in.json');
  fs.writeFileSync(f, JSON.stringify(input));
  const r = isLisp
    ? (WSL
      ? spawnSync('wsl', ['-d', WSL, '-u', 'root', '--', sbcl,
          '--script', toWsl(path.resolve(impl)), toWsl(path.resolve(f))], { encoding: 'utf8', timeout: 180000 })
      : spawnSync(sbcl, ['--script', impl, f], { encoding: 'utf8', timeout: 60000 }))
    : spawnSync(process.execPath, [impl, f], { encoding: 'utf8', timeout: 60000 });
  try { return JSON.parse((r.stdout || '').trim()); } catch { return null; }
}

const C = (o = {}) => ({ name: 'X', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, ...o });
const find = (out, name) => (out.courses || []).find((c) => c.name === name);
const ok = (cond, msg) => (cond ? true : msg || 'invariant failed');

const T = [];
const add = (id, name, input, check) => T.push({ id, name, input, check });

// ---- K1：add 带 tag 必须原样落到状态里（杀 L30 删 `tag: COERCE.tag(c.tag)`）----
// 断言只到"给了 tag 就该留住、没给就该是 null（或省略）"，不指定大小写/trim 之类的偏好。
add('K1', 'add-tag-roundtrip',
  { courses: [], ops: [{ op: 'add', course: C({ name: 'T1', tag: '重要' }) },
                       { op: 'add', course: C({ name: 'T2', day: 2 }) }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const a = find(o, 'T1'), b = find(o, 'T2');
    if (!a || !b) return 'add 后应有 2 门课';
    if (a.tag !== '重要') return 'tag 未保留：得到 ' + JSON.stringify(a.tag);
    if (!(b.tag === null || b.tag === undefined)) return '缺省 tag 应为 null，得到 ' + JSON.stringify(b.tag);
    return true;
  });

// ---- K2：trim 命中"只剩一节"也必须真的收窄（杀 L157 `>` → `>=`）----
// 3..5 收窄到 [5,7] → 结果 5..5 且 n=1。这里改动是真实的（3..5 ≠ 5..5），
// 所以 n=1 不依赖"有没有改"的歧义判断。
add('K2', 'trim-to-single-slot',
  { courses: [C({ name: 'P', day: 3, periodFrom: 3, periodTo: 5 })],
    ops: [{ op: 'trim', match: 'P', from: 5, to: 7 }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const c = find(o, 'P');
    if (!c) return '课不见了';
    if (c.periodFrom !== 5 || c.periodTo !== 5) return '应收窄到 5..5，得到 ' + c.periodFrom + '..' + c.periodTo;
    if (o.n !== 1) return 'n 应为 1（实际改了一门），得到 ' + JSON.stringify(o.n);
    return true;
  });

// ---- K3：untag 的计数必须回到 n（杀 L216 删 `return targets.length`）----
// 依据：L26（`n` = 实际改动条数）＋ L50（untag：删掉所有该标签）。
// 两门带同一标签 → n=2、两门都不再带该标签、第三门不受影响。
// 主断言是 n===2；对 A/B 只断言「不再等于原标签值 'x'」—— tag 是可选字段（L15），
// 「清空后省掉该键」和「置为 null」都合法，不许只认一种（原写法只认 null，会咬合法变体）。
add('K3', 'untag-count',
  { courses: [C({ name: 'A', tag: 'x' }), C({ name: 'B', day: 2, tag: 'x' }), C({ name: 'C', day: 3, tag: 'y' })],
    ops: [{ op: 'untag', tag: 'x' }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    if (o.n !== 2) return 'n 应为 2，得到 ' + JSON.stringify(o.n);
    for (const nm of ['A', 'B']) { const c = find(o, nm); if (!c) return nm + ' 不见了'; if (c.tag === 'x') return nm + ' 的 tag 未清空：' + JSON.stringify(c.tag); }
    const c = find(o, 'C');
    if (!c || c.tag !== 'y') return 'C 的标签不该被动';
    return true;
  });

// ---- K4：location 必须跟着课走（杀 scale-lisp L200 删 `:location ...`）----
// spec §数据模型含 location；§op3 edit 只改 set 里的键 → add 时给的 location 必须留住，
// edit 没提到 location 时不许被顺手抹掉。
add('K4', 'location-roundtrip',
  { courses: [], ops: [{ op: 'add', course: C({ name: 'R', location: 'B404' }) },
                       { op: 'edit', match: 'R', set: { teacher: '王' } }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const c = find(o, 'R');
    if (!c) return '课不见了';
    if (c.location !== 'B404') return 'location 不该被丢：得到 ' + JSON.stringify(c.location);
    if (c.teacher !== '王') return 'teacher 未改：得到 ' + JSON.stringify(c.teacher);
    return true;
  });

// ---- K5：add 只夹 day，不夹 periodFrom（杀 scale-lisp L282 `max` → `min`）----
// 依据：L34 的 add 行只列了两处改写（缺 weeks → range 1..16；day 夹 1..7），
// 没有授权改 periodFrom —— 所以合法输入 3..4 必须原样留住。
// （旧注释拿「§数据模型 periodFrom ≤ periodTo」当依据，那是输入约束，推不出 add 能不能改写。）
add('K5', 'add-keeps-period-from',
  { courses: [], ops: [{ op: 'add', course: C({ name: 'S', day: 2, periodFrom: 3, periodTo: 4 }) }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const c = find(o, 'S');
    if (!c) return '课不见了';
    if (c.periodFrom !== 3 || c.periodTo !== 4) return '节次被改写：得到 ' + c.periodFrom + '..' + c.periodTo;
    return true;
  });

// ---- K6：move 的三件套必须全部落地（杀 scale-js L99 删 `c.periodTo = ...`）----
// 依据：L37 move 行的字段就写着 match/day/periodFrom/periodTo 三件套（原文「三件套缺任一 → 不执行」），
// 齐了就该按参数落下去。所以断言「等于参数值」，**不是**「被钳到某个值」——
// 合法输入 periodFrom=3 ≤ periodTo=4 本来就在界内，改写它不在 L37 授权内。
// 盲区来源：原 36 条不看 move 之后的 periodTo，删掉 L99 后输出 3..2（倒挂）仍然全绿。
add('K6', 'move-periods-landed',
  { courses: [C({ name: 'M', day: 1, periodFrom: 1, periodTo: 2 })],
    ops: [{ op: 'move', match: 'M', day: 3, periodFrom: 3, periodTo: 4 }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const c = find(o, 'M');
    if (!c) return '课不见了';
    if (c.day !== 3 || c.periodFrom !== 3 || c.periodTo !== 4)
      return '应原样落到 周3 第3..4节，得到 周' + c.day + ' 第' + c.periodFrom + '..' + c.periodTo + '节';
    if (o.n !== 1) return 'n 应为 1（实际改了一门），得到 ' + JSON.stringify(o.n);
    return true;
  });

// ---- K7：shift 必须夹在 ≥1 且不倒挂（杀两臂"删掉 shift 钳位"）----
// 依据：L48 原文「命中课节次整体平移（夹在 ≥1，`periodTo ≥ periodFrom`）」。
// 只查这两条不变量，**不规定具体落点** —— 先夹 from 再推跨度、from/to 分别夹，
// 都在这两条内合法；规定落点就成了在咬实现偏好。
// 盲区来源：shift(1..2, delta=-3) 删掉钳位后输出 -2..-1，原 36 条全绿。
add('K7', 'shift-clamp-min1',
  { courses: [C({ name: 'Q', day: 1, periodFrom: 1, periodTo: 2 })],
    ops: [{ op: 'shift', match: 'Q', delta: -3 }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const c = find(o, 'Q');
    if (!c) return '课不见了';
    if (!(c.periodFrom >= 1)) return 'periodFrom 应夹在 ≥1，得到 ' + JSON.stringify(c.periodFrom);
    if (!(c.periodTo >= c.periodFrom)) return '应满足 periodTo ≥ periodFrom，得到 ' + c.periodFrom + '..' + c.periodTo;
    return true;
  });

const list = ONLY ? T.filter((t) => ONLY.has(t.id)) : T;
let pass = 0, fail = 0;
for (const t of list) {
  let res;
  try { res = t.check(run(t.input)); } catch (e) { res = '抛异常：' + e.message; }
  if (res === true) { pass++; console.log('[ok  ] ' + t.id + ' ' + t.name); }
  else { fail++; console.log('[FAIL] ' + t.id + ' ' + t.name + ' → ' + res); }
}
console.log('-- ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

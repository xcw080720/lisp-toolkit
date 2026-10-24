// check-scale.cjs — 规模臂的不变量检查器（不比对文案，只看状态）
// 用法： node check-scale.cjs --impl <impl.lisp|impl.js> [--only 6,7]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const impl = arg('--impl');
const only = arg('--only');
if (!impl) { console.log('usage: node check-scale.cjs --impl X [--only 6,7]'); process.exit(2); }
const isLisp = impl.endsWith('.lisp');
const isJavaFile = /\.java$/i.test(impl);
const sbcl = process.env.SBCL || 'sbcl';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));

// Java：先编译到临时目录，再跑。类名必须等于文件名（impl.java → class impl）
let JAVA_CLASSES = null, JAVA_MAIN = null;
if (isJavaFile) {
  JAVA_MAIN = path.basename(impl, path.extname(impl));
  JAVA_CLASSES = fs.mkdtempSync(path.join(os.tmpdir(), 'scj-'));
  const c = spawnSync('javac', ['-encoding', 'UTF-8', '-d', JAVA_CLASSES, impl], { encoding: 'utf8', timeout: 180000 });
  if (c.status !== 0) {
    console.log('[COMPILE FAIL] javac: ' + ((c.stderr || c.stdout || '').split('\n').slice(0, 5).join(' | ')));
    process.exit(1);
  }
}

// C/C++：先编译成 exe，再跑
let CPP_BIN = null;
const isCppFile = /\.(cpp|cc|cxx|c)$/i.test(impl);
if (isCppFile) {
  const CXX = process.env.CXX || 'g++';
  CPP_BIN = path.join(tmp, 'impl.exe');
  const c = spawnSync(CXX, ['-O2', '-std=c++17', '-o', CPP_BIN, impl], { encoding: 'utf8', timeout: 300000 });
  if (c.status !== 0) {
    console.log('[COMPILE FAIL] ' + CXX + ': ' + ((c.stderr || c.stdout || '').split('\n').slice(0, 6).join(' | ')));
    process.exit(1);
  }
}

const C = (o = {}) => ({ name: 'X', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, ...o });
const find = (out, name) => (out.courses || []).find((c) => c.name === name);
const ok = (cond, msg) => (cond ? true : msg || 'invariant failed');

function run(input) {
  const f = path.join(tmp, 'in.json');
  fs.writeFileSync(f, JSON.stringify(input));
  const isExe = /\.exe$/i.test(impl);
  const isJl = /\.jl$/i.test(impl);
  const isJava = /\.java$/i.test(impl);
  const isPy = /\.py$/i.test(impl);
  const isCpp = /\.(cpp|cc|cxx)$/i.test(impl);
  const isC = /\.c$/i.test(impl);
  const r = isExe
    ? spawnSync(impl, [f], { encoding: 'utf8', timeout: 120000 })
    : isJl
    ? spawnSync(process.env.JULIA || 'julia', ['--startup-file=no', impl, f], { encoding: 'utf8', timeout: 120000 })
    : isJava
    ? spawnSync('java', ['-cp', JAVA_CLASSES, JAVA_MAIN, f], { encoding: 'utf8', timeout: 120000 })
    : isPy
    ? spawnSync(process.env.PYTHON || 'python', [impl, f], { encoding: 'utf8', timeout: 120000 })
    : (isCpp || isC)
    ? spawnSync(CPP_BIN, [f], { encoding: 'utf8', timeout: 120000 })
    : isLisp
      ? spawnSync(sbcl, ['--script', impl, f], { encoding: 'utf8', timeout: 30000 })
      : spawnSync(process.execPath, [impl, f], { encoding: 'utf8', timeout: 30000 });
  try { return JSON.parse((r.stdout || '').trim()); } catch { return null; }
}

// ---- 不变量表：每个 op 至少一条 ----
const T = [];
const add = (id, name, input, check) => T.push({ id, name, input, check });

add(1, 'add-default-weeks',
  { courses: [], ops: [{ op: 'add', course: C({ name: '线代', day: 3 }) }] },
  (o) => ok(o && o.n === 1 && find(o, '线代') && JSON.stringify(find(o, '线代').weeks) === JSON.stringify({ type: 'range', from: 1, to: 16 }), '默认 weeks 不对'));

add(2, 'add-clamp-day',
  { courses: [], ops: [{ op: 'add', course: C({ name: '体育', day: 0 }) }] },
  (o) => ok(o && find(o, '体育') && find(o, '体育').day === 1, 'day 未夹到 1'));

add(3, 'del-hits',
  { courses: [C({ name: '高数' }), C({ name: '高数补', day: 2 }), C({ name: '英语', day: 3 })], ops: [{ op: 'del', match: '高数' }] },
  (o) => ok(o && o.n === 2 && o.courses.length === 1 && o.courses[0].name === '英语', 'del 计数或结果错'));

add(4, 'del-miss',
  { courses: [C({ name: '高数' })], ops: [{ op: 'del', match: '物理' }] },
  (o) => ok(o && o.n === 0 && o.courses.length === 1 && o.log.length === 1, '未命中处理错'));

add(5, 'edit-clamp',
  { courses: [C({ name: '高数', day: 1 })], ops: [{ op: 'edit', match: '高数', set: { day: 9 } }] },
  (o) => ok(o && find(o, '高数').day === 7, 'edit day 未夹到 7'));

add(6, 'move-partial',
  { courses: [C({ name: '高数' })], ops: [{ op: 'move', match: '高数', day: 4 }] },
  (o) => ok(o && o.n === 0 && find(o, '高数').day === 1, '缺字段应不执行'));

add(7, 'swap-ok',
  { courses: [C({ name: 'A', day: 1 }), C({ name: 'B', day: 4, periodFrom: 5, periodTo: 6 })], ops: [{ op: 'swap', match: 'A', with: 'B' }] },
  (o) => ok(o && o.n === 2 && find(o, 'A').day === 4 && find(o, 'B').day === 1, 'swap 未互换'));

add(8, 'reject-unknown',
  { courses: [C({ name: '高数' })], ops: [{ op: 'del', match: '高数' }, { op: 'nope' }] },
  (o) => ok(o && o.n === 0 && o.courses.length === 1 && o.log.length === 1 && o.opsText === '', '未知 op 应整批拒绝'));

add(9, 'log-numbering',
  { courses: [C({ name: '高数' })], ops: [{ op: 'add', course: C({ name: '线代', day: 2 }) }] },
  (o) => ok(o && o.log.length >= 1 && /^1\) /.test(o.log[0]), '日志无 1) 前缀'));

// ---- 后续十个 op（每条改动一个）----
add(10, 'rename',
  { courses: [C({ name: '高数' })], ops: [{ op: 'rename', match: '高数', to: '高等数学' }] },
  (o) => ok(o && find(o, '高等数学') && o.n === 1, 'rename 未生效'));

add(11, 'duplicate',
  { courses: [C({ name: '高数', day: 1 })], ops: [{ op: 'duplicate', match: '高数', day: 3 }] },
  (o) => ok(o && o.courses.length === 2 && o.courses.filter((c) => c.name === '高数' && c.day === 3).length === 1, 'duplicate 未复制到新 day'));

add(12, 'trim',
  { courses: [C({ name: '高数', periodFrom: 1, periodTo: 4 })], ops: [{ op: 'trim', match: '高数', from: 2, to: 3 }] },
  (o) => ok(o && find(o, '高数').periodFrom === 2 && find(o, '高数').periodTo === 3, 'trim 未收窄'));

add(13, 'clear-day',
  { courses: [C({ name: 'A', day: 3 }), C({ name: 'B', day: 3 }), C({ name: 'C', day: 4 })], ops: [{ op: 'clear', day: 3 }] },
  (o) => ok(o && o.courses.length === 1 && o.courses[0].name === 'C' && o.n === 2, 'clear 未按天清空'));

add(14, 'shift',
  { courses: [C({ name: 'A', periodFrom: 2, periodTo: 3 })], ops: [{ op: 'shift', match: 'A', delta: 2 }] },
  (o) => ok(o && find(o, 'A').periodFrom === 4 && find(o, 'A').periodTo === 5, 'shift 未平移'));

add(15, 'tag',
  { courses: [C({ name: 'A' })], ops: [{ op: 'tag', match: 'A', tag: 'exam' }] },
  (o) => ok(o && find(o, 'A') && find(o, 'A').tag === 'exam', 'tag 未打上'));

add(15.5, 'untag',
  { courses: [C({ name: 'A', tag: 'exam' })], ops: [{ op: 'untag', tag: 'exam' }] },
  (o) => ok(o && o.courses.length === 1 && !find(o, 'A').tag, 'untag 未清空'));

add(16, 'sort',
  { courses: [C({ name: 'B', day: 4 }), C({ name: 'A', day: 2 }), C({ name: 'C', day: 2, periodFrom: 3, periodTo: 4 })], ops: [{ op: 'sort' }] },
  (o) => ok(o && o.courses.map((c) => c.name).join('') === 'ACB', 'sort 顺序不对：' + (o ? o.courses.map((c) => c.name).join('') : '?')));

add(17, 'swapDay',
  { courses: [C({ name: 'A', day: 1 }), C({ name: 'B', day: 2 })], ops: [{ op: 'swapDay', a: 1, b: 2 }] },
  (o) => ok(o && find(o, 'A').day === 2 && find(o, 'B').day === 1, 'swapDay 未对调'));

add(18, 'stats',
  { courses: [C({ name: 'A', day: 1 }), C({ name: 'B', day: 2 })], ops: [{ op: 'stats' }] },
  (o) => ok(o && o.log.length === 1 && /2/.test(o.log[0]), 'stats 日志未报条数'));

// #19 —— 补洞：edit 必须真的改节次
// 由来：2026-10-24 的 inline 实验发现 scale-js 的 edit 静默丢弃 periodFrom/periodTo，
// 日志却写着"键：day/periodFrom/periodTo"，而此前 18 条判据全绿、完全没覆盖这一行为。
add(19, 'edit-periods-applied',
  { courses: [C({ name: 'A', day: 1, periodFrom: 1, periodTo: 2 })],
    ops: [{ op: 'edit', match: 'A', set: { day: 3, periodFrom: 5, periodTo: 6 } }] },
  (o) => {
    const c = o && find(o, 'A');
    if (!c) return '课程 A 不见了';
    if (c.day !== 3) return 'day 未改成 3（得到 ' + c.day + '）';
    if (c.periodFrom !== 5) return 'periodFrom 被丢弃（得到 ' + c.periodFrom + '）';
    if (c.periodTo !== 6) return 'periodTo 被丢弃（得到 ' + c.periodTo + '）';
    return true;
  });

// ===== #21–#26：JSON 数据通道（由变异测试发现的真实盲区）=====
// 由来：2026-10-24 的变异测试里，CL 实现有 6/9 条存活变异全部落在 JSON 读写层
// （转义 / 布尔 / 小数点 / 嵌套 / 空对象 / 负数）。20 条判据喂的全是整数与 ASCII 单层结构。
// 这 6 条专门喂"不常见但合法"的输入，逼数据通道显形。

// #21 浮点入参：输出必须是合法 JSON（不能出现 2.5d0 这类 Lisp 专属字面量）
add(21, 'float-input-roundtrip',
  { courses: [C({ name: 'F', day: 1, periodFrom: 1, periodTo: 2 })],
    ops: [{ op: 'edit', match: 'F', set: { day: 2.5 } }] },
  (o) => {
    if (!o) return 'stdout 不是合法 JSON（浮点入参把 writer 打穿？）';
    const c = find(o, 'F');
    if (!c) return '课程 F 不见了';
    if (!Number.isInteger(c.day)) return 'day 未夹成整数（得到 ' + c.day + '）';
    return true;
  });

// #22 转义：名字里带引号与反斜杠，必须能原样往返
add(22, 'escape-roundtrip',
  { courses: [C({ name: 'a"b\\c', day: 1 })], ops: [{ op: 'stats' }] },
  (o) => {
    if (!o) return 'stdout 不是合法 JSON（转义被打穿）';
    const c = find(o, 'a"b\\c');
    if (!c) return '带引号/反斜杠的名字没有原样保留：' + JSON.stringify((o.courses || []).map((x) => x.name));
    return true;
  });

// #23 非 ASCII 往返（中文 + emoji）
add(23, 'unicode-roundtrip',
  { courses: [C({ name: '数据结构🐋', teacher: '张三', day: 1 })], ops: [{ op: 'stats' }] },
  (o) => {
    if (!o) return 'stdout 不是合法 JSON（非 ASCII 被打穿）';
    const c = find(o, '数据结构🐋');
    if (!c) return '中文/emoji 名字没有原样保留';
    if (c.teacher !== '张三') return '中文 teacher 没有原样保留（得到 ' + c.teacher + '）';
    return true;
  });

// #24 嵌套结构：weeks 为 list 型，数组必须原样往返
add(24, 'nested-weeks-roundtrip',
  { courses: [C({ name: 'N', day: 1, weeks: { type: 'list', list: [1, 3, 5] } })], ops: [{ op: 'stats' }] },
  (o) => {
    if (!o) return 'stdout 不是合法 JSON（嵌套数组被打穿）';
    const c = find(o, 'N');
    if (!c || !c.weeks) return 'weeks 丢失';
    if (c.weeks.type !== 'list') return 'weeks.type 变了：' + c.weeks.type;
    const got = JSON.stringify(c.weeks.list);
    if (got !== '[1,3,5]') return 'weeks.list 没有原样往返：' + got;
    return true;
  });

// #25 空对象：weeks 为 {} 时不能崩，必须回落到默认
add(25, 'empty-object-weeks',
  { courses: [C({ name: 'E', day: 1, weeks: {} })], ops: [{ op: 'stats' }] },
  (o) => {
    if (!o) return 'stdout 不是合法 JSON（空对象把解析打穿）';
    const c = find(o, 'E');
    if (!c) return '课程 E 丢了';
    if (!c.weeks || typeof c.weeks !== 'object') return 'weeks 不是对象：' + JSON.stringify(c.weeks);
    return true;
  });

// #26 负数入参：必须被夹到合法下界，不能原样落进输出
add(26, 'negative-clamp',
  { courses: [C({ name: 'G', day: 1, periodFrom: 1, periodTo: 2 })],
    ops: [{ op: 'edit', match: 'G', set: { periodFrom: -5 } }] },
  (o) => {
    if (!o) return 'stdout 不是合法 JSON（负数入参被打穿）';
    const c = find(o, 'G');
    if (!c) return '课程 G 不见了';
    if (!(c.periodFrom >= 1)) return 'periodFrom 没被夹到 ≥1（得到 ' + c.periodFrom + '）';
    return true;
  });

// ===== #27–#30：字段级语义（由变异测试在 JS 实现上发现的存活变异）=====
// 由来：2026-10-24 变异测试中，JS 的 16 条存活变异全部落在业务字段层：
// L267（normalizePatch 丢 name/teacher/location）、L39（swap 不交换 periodFrom）、
// L99（edit 不做下界夹紧）、L113（swap 多匹配不拒绝）。这 4 条各打一个。

// #27 edit 必须能改 name / teacher / location（kills L267）
add(27, 'edit-text-fields',
  { courses: [C({ name: 'H', teacher: '旧老师', location: '旧楼', day: 1 })],
    ops: [{ op: 'edit', match: 'H', set: { name: '新名', teacher: '新老师', location: '新楼' } }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const c = (o.courses || []).find((x) => x.name === '新名');
    if (!c) return 'name 没改成「新名」（得到 ' + JSON.stringify((o.courses || []).map((x) => x.name)) + '）';
    if (c.teacher !== '新老师') return 'teacher 被丢弃（得到 ' + JSON.stringify(c.teacher) + '）';
    if (c.location !== '新楼') return 'location 被丢弃（得到 ' + JSON.stringify(c.location) + '）';
    return true;
  });

// #28 swap 必须三件套全互换（kills L39：只换 day 不换 periodFrom/periodTo）
add(28, 'swap-all-three',
  { courses: [C({ name: 'S1', day: 1, periodFrom: 1, periodTo: 2 }),
              C({ name: 'S2', day: 5, periodFrom: 7, periodTo: 8 })],
    ops: [{ op: 'swap', match: 'S1', with: 'S2' }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const a = find(o, 'S1'), b = find(o, 'S2');
    if (!a || !b) return '交换后课程丢失';
    if (a.day !== 5 || b.day !== 1) return 'day 未互换（' + a.day + '/' + b.day + '）';
    if (a.periodFrom !== 7 || b.periodFrom !== 1) return 'periodFrom 未互换（' + a.periodFrom + '/' + b.periodFrom + '）';
    if (a.periodTo !== 8 || b.periodTo !== 2) return 'periodTo 未互换（' + a.periodTo + '/' + b.periodTo + '）';
    return true;
  });

// #29 edit 只给 periodTo 且小于原 periodFrom → 结果不得倒挂（kills L99）
// 注意：规格只要求「不倒挂」，没规定是把 periodTo 抬上去还是把 periodFrom 压下来。
// 第一版我写成"periodTo 必须等于 2"，两臂都红——那是我的断言过分具体，不是它们的错。
add(29, 'edit-no-inversion',
  { courses: [C({ name: 'R', day: 1, periodFrom: 6, periodTo: 8 })],
    ops: [{ op: 'edit', match: 'R', set: { periodTo: 2 } }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const c = find(o, 'R');
    if (!c) return '课程 R 不见了';
    if (!(c.periodFrom >= 1)) return 'periodFrom 越界（得到 ' + c.periodFrom + '）';
    if (!(c.periodTo >= 1)) return 'periodTo 越界（得到 ' + c.periodTo + '）';
    if (!(c.periodFrom <= c.periodTo)) return '出现倒挂：periodFrom=' + c.periodFrom + ' > periodTo=' + c.periodTo;
    return true;
  });

// #30 swap 匹配到多门时必须整批拒绝（kills L113：守卫被删）
add(30, 'swap-ambiguous-reject',
  { courses: [C({ name: '同名', day: 1 }), C({ name: '同名2', day: 2 }), C({ name: 'X', day: 3 })],
    ops: [{ op: 'swap', match: '同名', with: 'X' }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    if (o.n !== 0) return '多匹配时 n 应为 0（得到 ' + o.n + '）';
    const a = find(o, '同名'), x = find(o, 'X');
    if (!a || !x) return '课程丢失';
    if (a.day !== 1 || x.day !== 3) return '多匹配时不该交换，但 day 变了（' + a.day + '/' + x.day + '）';
    return true;
  });

// ===== #31–#36：日志语义 / 计数 / 边界（第三轮变异测试的存活变异）=====
// 判据至今不看日志文本，于是"删掉整条日志的构造"这类变异全部存活。
// 这里只断言"语义要点"（提到操作 + 数量），不锁定措辞，避免把文案当契约。

const logHas = (o, ...words) => (o && (o.log || []).some((l) => words.every((w) => String(l).includes(w))));

// #31 move 的日志必须提到「移动」与数量（打"删掉整条 return 文案"的变异）
add(31, 'move-log-says-count',
  { courses: [C({ name: 'MM1', day: 1 }), C({ name: 'MM2', day: 1 })],
    ops: [{ op: 'move', match: 'MM', day: 4, periodFrom: 1, periodTo: 2 }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    if (o.n !== 2) return '应移动 2 门（得到 ' + o.n + '）';
    if (!logHas(o, '移动', '2')) return '日志没同时提到「移动」和数量 2：' + JSON.stringify(o.log);
    return true;
  });

// #32 duplicate 的日志必须提到数量（打 L145 那条）
add(32, 'duplicate-log-says-count',
  { courses: [C({ name: 'D1', day: 1 })], ops: [{ op: 'duplicate', match: 'D1', day: 3 }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    if (o.n !== 1) return '应复制 1 门（得到 ' + o.n + '）';
    if (!logHas(o, '1')) return '日志没提到数量：' + JSON.stringify(o.log);
    return true;
  });

// #33 clear 周内无课时的日志（修过一次假阳：原版只断言 n===0 且 log 非空，
// 而"clear 未实现 → 整包拒绝"恰好也给出 n=0、log 1 条 —— 断言被绕过。
// 现在同一批里再放一个必须生效的 add，整包一旦被拒就露馅。)
add(33, 'clear-empty-log',
  { courses: [C({ name: 'Z', day: 1 })],
    ops: [{ op: 'clear', day: 7 }, { op: 'add', course: C({ name: '事后', day: 7 }) }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    if (!find(o, '事后')) return '整包被拒绝（add 没生效）——clear 很可能未实现，判据在假阳';
    const first = (o.log || [])[0] || '';
    if (!/清空|周\s*7|7/.test(first)) return '第一条日志不是 clear 的结果：' + JSON.stringify(first);
    return true;
  });

// #34 节次下界：periodFrom=0 必须夹到 1（打 `|| 1 → || 2` 这类强制值变异）
add(34, 'period-lower-bound',
  { courses: [C({ name: 'P', day: 1, periodFrom: 1, periodTo: 2 })],
    ops: [{ op: 'edit', match: 'P', set: { periodFrom: 0 } }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const c = find(o, 'P');
    if (!c) return '课程 P 不见了';
    if (c.periodFrom !== 1) return 'periodFrom 未夹到 1（得到 ' + c.periodFrom + '）';
    return true;
  });

// #35 tag 必须能写入（打"删掉 tag 强制"那条）
add(35, 'tag-applied',
  { courses: [C({ name: 'T', day: 1 })], ops: [{ op: 'tag', match: 'T', tag: '重点' }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    const c = find(o, 'T');
    if (!c) return '课程 T 不见了';
    if (c.tag !== '重点') return 'tag 未写入（得到 ' + JSON.stringify(c.tag) + '）';
    return true;
  });

// #36 stats 的时段计数必须按跨度算（打 slots 计算被删那条）
add(36, 'stats-slot-span',
  { courses: [C({ name: 'W', day: 1, periodFrom: 1, periodTo: 4 })], ops: [{ op: 'stats' }] },
  (o) => {
    if (!o) return 'stdout 非 JSON';
    if (!logHas(o, '4')) return '一节跨 1–4 应计 4 个时段，日志里没有 4：' + JSON.stringify(o.log);
    return true;
  });

// ---- 执行 ----
const want = only ? new Set(only.split(',').map((s) => s.trim())) : null;
// 守卫：--only 里出现不存在的编号必须报错。
// 由来：2026-10-24 盲复现者发现 `--only 20`（没有 #20，编号到 19）返回
// "0 passed, 0 failed" exit 0 —— 静默通过 = 假绿。
if (want) {
  const known = new Set([...T.map((t) => String(t.id)), ...T.map((t) => t.name)]);
  const unknown = [...want].filter((w) => !known.has(w));
  if (unknown.length) {
    console.error('[ERROR] --only 里有不存在的编号: ' + unknown.join(','));
    console.error('        合法编号: ' + T.map((t) => t.id).join(','));
    process.exit(2);
  }
}
let pass = 0, fail = 0;
for (const t of T) {
  if (want && !want.has(String(t.id)) && !want.has(t.name)) continue;
  const o = run(t.input);
  let r;
  try { r = o ? t.check(o) : 'stdout 非 JSON'; } catch (e) { r = '检查器异常: ' + e.message; }
  if (r === true) { pass++; console.log('[ok  ] #' + t.id + ' ' + t.name); }
  else { fail++; console.log('[FAIL] #' + t.id + ' ' + t.name + '  — ' + r); }
}
console.log('-- ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

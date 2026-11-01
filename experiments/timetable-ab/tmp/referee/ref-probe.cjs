// ref-probe.cjs —— 独立复核用的行为探针（不改任何被判据审计的对象）
// 用法: node tmp/referee/ref-probe.cjs --impl <impl.js|impl.lisp>
// 输出：每个 case 一行摘要，便于跨实现 diff（差分对照，用来自己判定"红的原因"和"等价性"）
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const impl = path.resolve(arg('--impl'));
const isLisp = impl.endsWith('.lisp');
const WSL = process.env.SBCL_WSL || 'kali-linux';
const toWsl = (p) => '/mnt/' + p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (m, d) => d.toLowerCase());
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-'));

function run(input) {
  const f = path.join(tmp, 'in.json');
  fs.writeFileSync(f, JSON.stringify(input));
  const r = isLisp
    ? spawnSync('wsl', ['-d', WSL, '-u', 'root', '--', 'sbcl', '--script', toWsl(impl), toWsl(f)], { encoding: 'utf8', timeout: 180000 })
    : spawnSync(process.execPath, [impl, f], { encoding: 'utf8', timeout: 120000 });
  const raw = r.stdout || '';
  let o = null;
  try { o = JSON.parse(raw.trim()); } catch { o = null; }
  return { raw, o, stderr: (r.stderr || '').trim(), status: r.status };
}

const C = (o = {}) => ({ name: 'X', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, ...o });
const W = 32;

const CASES = [
  ['K1-input', { courses: [], ops: [{ op: 'add', course: C({ name: 'T1', tag: '重要' }) }, { op: 'add', course: C({ name: 'T2', day: 2 }) }] },
    (o) => `T1.tag=${JSON.stringify((o.courses.find(c => c.name === 'T1') || {}).tag)} key?${'tag' in ((o.courses.find(c => c.name === 'T1')) || {})} T2.tag=${JSON.stringify((o.courses.find(c => c.name === 'T2') || {}).tag)}`],
  ['K2-input', { courses: [C({ name: 'P', day: 3, periodFrom: 3, periodTo: 5 })], ops: [{ op: 'trim', match: 'P', from: 5, to: 7 }] },
    (o) => { const c = o.courses.find(x => x.name === 'P'); return `P=${c.periodFrom}..${c.periodTo} n=${o.n} log=${JSON.stringify(o.log)}`; }],
  ['K3-input', { courses: [C({ name: 'A', tag: 'x' }), C({ name: 'B', day: 2, tag: 'x' }), C({ name: 'C', day: 3, tag: 'y' })], ops: [{ op: 'untag', tag: 'x' }] },
    (o) => `n=${o.n} A.tag=${JSON.stringify(o.courses.find(c => c.name === 'A').tag)} B.tag=${JSON.stringify(o.courses.find(c => c.name === 'B').tag)} C.tag=${JSON.stringify(o.courses.find(c => c.name === 'C').tag)}`],
  ['K4-input', { courses: [], ops: [{ op: 'add', course: C({ name: 'R', location: 'B404' }) }, { op: 'edit', match: 'R', set: { teacher: '王' } }] },
    (o) => { const c = o.courses.find(x => x.name === 'R'); return `R.location=${JSON.stringify(c.location)} teacher=${JSON.stringify(c.teacher)} n=${o.n}`; }],
  ['K5-input', { courses: [], ops: [{ op: 'add', course: C({ name: 'S', day: 2, periodFrom: 3, periodTo: 4 }) }] },
    (o) => { const c = o.courses.find(x => x.name === 'S'); return `S=${c.periodFrom}..${c.periodTo} log=${JSON.stringify(o.log)}`; }],

  // move 的反序参数（js-L99 的钳位只在此时可见）
  ['move-5-3', { courses: [C({ name: 'M', day: 1, periodFrom: 1, periodTo: 2 })], ops: [{ op: 'move', match: 'M', day: 4, periodFrom: 5, periodTo: 3 }] },
    (o) => { const c = o.courses.find(x => x.name === 'M'); return `M=${c.day}/${c.periodFrom}..${c.periodTo} n=${o.n} log=${JSON.stringify(o.log)}`; }],
  ['move-3-4', { courses: [C({ name: 'M', day: 1, periodFrom: 1, periodTo: 2 })], ops: [{ op: 'move', match: 'M', day: 4, periodFrom: 3, periodTo: 4 }] },
    (o) => { const c = o.courses.find(x => x.name === 'M'); return `M=${c.day}/${c.periodFrom}..${c.periodTo} n=${o.n}`; }],
  ['move-to-0', { courses: [C({ name: 'M', day: 1, periodFrom: 1, periodTo: 2 })], ops: [{ op: 'move', match: 'M', day: 4, periodFrom: 0, periodTo: 2 }] },
    (o) => { const c = o.courses.find(x => x.name === 'M'); return `M=${c.periodFrom}..${c.periodTo} n=${o.n}`; }],

  ['edit-inversion(#29)', { courses: [C({ name: 'R', day: 1, periodFrom: 6, periodTo: 8 })], ops: [{ op: 'edit', match: 'R', set: { periodTo: 2 } }] },
    (o) => { const c = o.courses.find(x => x.name === 'R'); return `R=${c.periodFrom}..${c.periodTo} n=${o.n}`; }],

  // 输入侧反序（越模型输入）：两臂是否都会原样吐出倒挂
  ['in-reversed-course', { courses: [C({ name: 'V', periodFrom: 5, periodTo: 3 })], ops: [{ op: 'stats' }] },
    (o) => { const c = o.courses.find(x => x.name === 'V'); return `V=${c.periodFrom}..${c.periodTo} log=${JSON.stringify(o.log)}`; }],

  // 空格 / 控制字符（cl-L127 的转义分支）
  ['space-name', { courses: [C({ name: 'a b  c', teacher: 't t' })], ops: [{ op: 'stats' }] },
    (o) => { const c = o.courses.find(x => x.name === 'a b  c'); return c ? `name ok=${JSON.stringify(c.name)}` : 'name 丢失:' + JSON.stringify(o.courses.map(c => c.name)); }],
  ['ctrl-char-name', { courses: [C({ name: 'a\u0001b' })], ops: [{ op: 'stats' }] },
    (o) => { const c = o.courses.find(x => x.name === 'a\u0001b'); return c ? 'ctrl ok' : 'ctrl 丢失'; }],

  // 日志/大输出（cl-L444 finish-output）
  ['big-300add', { courses: [], ops: Array.from({ length: 300 }, (_, i) => ({ op: 'add', course: C({ name: 'N' + i, day: 1 + (i % 7), periodFrom: 1 + (i % 5), periodTo: 2 + (i % 5) }) })) },
    (o) => `courses=${o.courses.length} log=${o.log.length} n=${o.n} opsTextLen=${(o.opsText || '').length}`],
  // spec 明文写死的边界（十次改动 #10 shift：「夹在 ≥1，periodTo ≥ periodFrom」）
  ['shift--3', { courses: [C({ name: 'H', periodFrom: 1, periodTo: 2 })], ops: [{ op: 'shift', match: 'H', delta: -3 }] },
    (o) => { const c = o.courses.find(x => x.name === 'H'); return `H=${c.periodFrom}..${c.periodTo} n=${o.n} log=${JSON.stringify(o.log)}`; }],
  ['shift--3-5..6', { courses: [C({ name: 'H', periodFrom: 5, periodTo: 6 })], ops: [{ op: 'shift', match: 'H', delta: -3 }] },
    (o) => { const c = o.courses.find(x => x.name === 'H'); return `H=${c.periodFrom}..${c.periodTo} n=${o.n}`; }],
  // trim 交集为空（spec 未写）
  ['trim-empty', { courses: [C({ name: 'Q', periodFrom: 3, periodTo: 5 })], ops: [{ op: 'trim', match: 'Q', from: 7, to: 9 }] },
    (o) => { const c = o.courses.find(x => x.name === 'Q'); return `Q=${c.periodFrom}..${c.periodTo} n=${o.n} log=${JSON.stringify(o.log)}`; }],
  // stats 时段重叠（spec "M 个时段被占" 未写并集还是总和）
  ['stats-overlap', { courses: [C({ name: 'O1', day: 1, periodFrom: 1, periodTo: 2 }), C({ name: 'O2', day: 1, periodFrom: 2, periodTo: 3 })], ops: [{ op: 'stats' }] },
    (o) => `log=${JSON.stringify(o.log)}`],

  ['empty-ops', { courses: [C({ name: 'Z' })], ops: [] }, (o) => `opsText=${JSON.stringify(o.opsText)} log=${o.log.length} n=${o.n}`],
  ['unknown-op', { courses: [C({ name: 'Z' })], ops: [{ op: 'nope' }] }, (o) => `opsText=${JSON.stringify(o.opsText)} n=${o.n} log0=${JSON.stringify(o.log[0] || '')}`],
];

for (const [id, input, dig] of CASES) {
  const { raw, o, stderr, status } = run(input);
  let out;
  if (!o) out = 'NON-JSON stdoutLen=' + raw.length + ' status=' + status + (stderr ? ' stderr=' + stderr.split('\n')[0].slice(0, 90) : '');
  else { try { out = dig(o); } catch (e) { out = 'DIGEST-ERR ' + e.message; } }
  console.log((id + '                    ').slice(0, 24) + '| ' + out);
}

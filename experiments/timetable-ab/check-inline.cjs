// check-inline.cjs v2 — body 级内嵌横切判据（用"真值"判，不信声明）
// 用法: node check-inline.cjs --dir runs/inline-cl --lang cl
//
// v1 的缺陷（JS 臂发现）：
//   · J1 只查"包含"，声明里塞一个 body 根本不写的字段也绿
//   · 声明与真实行为不一致（edit 的 periodFrom 被静默丢掉，声明仍写 8 字段）也绿
// v2 改为：用**运行前后快照 diff** 算"实际改了哪些字段"（真值），
//          再要求 log 里的 [fields: ...] 与该真值**完全相等**。
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const dir = arg('--dir');
const lang = arg('--lang') || (fs.existsSync(path.join(dir || '', 'impl.lisp')) ? 'cl' : 'js');
if (!dir) { console.log('usage: node check-inline.cjs --dir <armDir> --lang cl|js'); process.exit(2); }

const implFile = path.join(dir, lang === 'cl' ? 'impl.lisp' : 'impl.js');
if (!fs.existsSync(implFile)) { console.log('[FAIL] 找不到 ' + implFile); process.exit(1); }

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('[ok  ] ' + n); };
const no = (n, why) => { fail++; console.log('[FAIL] ' + n + '  — ' + why); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inl2-'));
const SBCL = process.env.SBCL || 'sbcl';

const C = (o) => ({ name: 'A', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, weeks: { type: 'range', from: 1, to: 16, list: [] }, ...o });
const BEFORE = [C({ name: 'A', day: 1, periodFrom: 1, periodTo: 2, teacher: 'T1' }), C({ name: 'B', day: 4, periodFrom: 5, periodTo: 6 })];
const OPS = [{ op: 'edit', match: 'A', set: { day: 3, periodFrom: 2 } }, { op: 'del', match: 'B' }];
const FIELDS = ['name', 'teacher', 'location', 'day', 'periodFrom', 'periodTo', 'weeks', 'note'];

const inFile = path.join(tmp, 'in.json');
fs.writeFileSync(inFile, JSON.stringify({ courses: BEFORE, ops: OPS }));

function run(file) {
  const r = lang === 'cl'
    ? spawnSync(SBCL, ['--script', file, inFile], { encoding: 'utf8', timeout: 60000 })
    : spawnSync(process.execPath, [file, inFile], { encoding: 'utf8', timeout: 60000 });
  let j = null;
  try { j = JSON.parse((r.stdout || '').trim()); } catch { j = null; }
  return { status: r.status, json: j, raw: (r.stdout || ''), err: (r.stderr || '') };
}
const fieldsOf = (log) => {
  const m = String(log || '').match(/\[fields:\s*([^\]]*)\]/);
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean).sort() : null;
};
// 真值：把输入里的 A 与输出里的 A 逐字段比，得出"实际改了哪些"
function actualChanged(json) {
  const after = (json.courses || []).find((c) => c.name === 'A');
  const before = BEFORE.find((c) => c.name === 'A');
  if (!after) return null;
  const changed = [];
  for (const f of FIELDS) {
    const a = JSON.stringify(before[f] ?? null), b = JSON.stringify(after[f] ?? null);
    if (a !== b) changed.push(f);
  }
  return changed.sort();
}

// ---------- J1 基线：log 的字段集必须等于真值 ----------
{
  const r = run(implFile);
  if (!r.json) no('J1 输出是 JSON', (r.raw || r.err).slice(0, 120));
  else {
    const logs = r.json.log || [];
    const editLine = logs.find((l) => /edit|改/.test(String(l))) || '';
    const got = fieldsOf(editLine);
    const want = actualChanged(r.json);
    if (!want) no('J1 能算真值', '输出里找不到课程 A');
    else if (!got) no('J1 log 带 [fields: ...]', String(editLine).slice(0, 100));
    else if (got.join(',') === want.join(',')) ok('J1 字段集 == 真值（' + want.join(',') + '）');
    else no('J1 字段集 == 真值', '声明 ' + got.join(',') + '  vs 实际 ' + want.join(','));
  }
}

// ---------- J2 注入：body 多写 note，字段集必须自动含 note ----------
{
  const src = fs.readFileSync(implFile, 'utf8');
  const marker = lang === 'cl' ? ';; INJECT:' : '// INJECT:';
  const lines = src.split('\n');
  const idx = lines.findIndex((l) => l.trim().startsWith(marker) && /edit/.test(l));
  if (idx < 0) no('J2 找到 edit 注入点', '缺 ' + marker + ' edit');
  else {
    const snip = lang === 'cl' ? '        (setf (fld c "note") "injected")' : '        c.note = "injected";';
    const pf = path.join(tmp, 'patched.' + (lang === 'cl' ? 'lisp' : 'js'));
    fs.writeFileSync(pf, [...lines.slice(0, idx + 1), snip, ...lines.slice(idx + 1)].join('\n'), 'utf8');
    const r = run(pf);
    if (!r.json) no('J2 注入后仍能跑', (r.raw || r.err).slice(0, 140));
    else {
      const got = fieldsOf((r.json.log || []).find((l) => /edit|改/.test(String(l))) || '');
      const want = actualChanged(r.json);
      if (!want) no('J2 能算真值', '找不到课程 A');
      else if (want.includes('note') === false) no('J2 注入是否真的生效', 'note 没被写进去，注入点无效');
      else if (got && got.includes('note')) ok('J2 body 多写 note → 字段集自动含 note（手改 0 处）');
      else no('J2 body 多写 note → 字段集自动含 note', '得到 ' + (got ? got.join(',') : '无标记') + '；需人工同步');
    }
  }
}

// ---------- J3 撒谎检测：给声明塞一个永不写的字段，必须被抓 ----------
{
  const src = fs.readFileSync(implFile, 'utf8');
  let patched = null, how = '';
  if (lang === 'js') {
    // 在第一个 writes: [ 后面塞一个不存在的字段
    patched = src.replace(/writes:\s*\[/, 'writes: ["__bogus_never_written__", ');
    how = 'writes: [...]';
  } else {
    // CL 臂若用推导，声明里没有 writes 表，这一条不适用
    how = 'n/a';
  }
  if (patched && patched !== src) {
    const pf = path.join(tmp, 'liar.' + (lang === 'cl' ? 'lisp' : 'js'));
    fs.writeFileSync(pf, patched, 'utf8');
    const r = run(pf);
    const got = r.json ? fieldsOf((r.json.log || []).find((l) => /edit|改/.test(String(l))) || '') : null;
    const want = r.json ? actualChanged(r.json) : null;
    if (got && want && got.join(',') !== want.join(',')) ok('J3 撒谎的声明被抓住（声明 ≠ 真值）');
    else no('J3 撒谎的声明被抓住', '塞了不存在的字段仍判一致：' + (got ? got.join(',') : '无'));
  } else {
    ok('J3 不适用（该臂没有手写 writes 表 → 无从撒谎）');
  }
}

// ---------- J0 负对照 ----------
{
  const fake = lang === 'cl'
    ? '(format t "{\"log\":[\"edit [fields: day]\"],\"courses\":[],\"n\":1}")'
    : 'console.log(JSON.stringify({log:["edit [fields: day]"],courses:[],n:1}));';
  const pf = path.join(tmp, 'fake.' + (lang === 'cl' ? 'lisp' : 'js'));
  fs.writeFileSync(pf, fake + '\n', 'utf8');
  const r = run(pf);
  const want = r.json ? actualChanged(r.json) : null;
  const got = r.json ? fieldsOf((r.json.log || [])[0] || '') : null;
  if (want === null || (got && want && got.join(',') !== want.join(','))) ok('J0 负对照：写死的假实现过不了');
  else no('J0 负对照', '假实现也过了');
}

console.log('-- ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

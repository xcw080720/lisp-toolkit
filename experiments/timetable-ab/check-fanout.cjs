// check-fanout.cjs — 产物扇出判据
// 用法: node check-fanout.cjs --dir runs/fanout-cl
//
// 约定（三臂统一）：
//   <dir>/decls.json     唯一声明源（5 个 op）
//   <dir>/emit.<cmd>     生成器入口：node emit.cjs | sbcl --script emit.lisp | java ... Emit
//                        运行后必须写出：opsText.txt  schema.json  client.js  tests.json  validate.txt
//   <dir>/impl.*         手写的执行体（不参与本判据）
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const dir = arg('--dir');
if (!dir) { console.log('usage: node check-fanout.cjs --dir <armDir>'); process.exit(2); }

const ART = ['opsText.txt', 'schema.json', 'client.js', 'tests.json', 'validate.txt'];
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('[ok  ] ' + n); };
const no = (n, why) => { fail++; console.log('[FAIL] ' + n + '  — ' + why); };

function readDecls() { return JSON.parse(fs.readFileSync(path.join(dir, 'decls.json'), 'utf8')); }
function writeDecls(d) { fs.writeFileSync(path.join(dir, 'decls.json'), JSON.stringify(d, null, 2), 'utf8'); }
function readArt(f) { const p = path.join(dir, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; }

function runEmit() {
  // 支持三种入口，按存在性挑一个
  const cmds = [
    { f: 'emit.cjs', cmd: 'node', args: ['emit.cjs'] },
    { f: 'emit.lisp', cmd: process.env.SBCL || 'sbcl', args: ['--script', 'emit.lisp'] },
    { f: 'Emit.class', cmd: 'java', args: ['-cp', '.', 'Emit'] }
  ];
  for (const c of cmds) {
    if (fs.existsSync(path.join(dir, c.f))) {
      const r = spawnSync(c.cmd, c.args, { cwd: dir, encoding: 'utf8', timeout: 180000 });
      return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
    }
  }
  return { ok: false, out: '找不到 emit 入口（emit.cjs / emit.lisp / Emit.class）' };
}

// ---------- 0. 声明本身 ----------
let D;
try { D = readDecls(); } catch (e) { no('decls.json', '读不出: ' + e.message); process.exit(1); }
const names = Object.keys(D);
if (names.length === 5) ok('声明含 5 个 op'); else no('声明含 5 个 op', '实际 ' + names.length);

// ---------- 1. 生成 ----------
const g = runEmit();
if (g.ok) ok('emit 运行成功'); else no('emit 运行成功', g.out.split('\n').slice(0, 3).join(' | '));

// ---------- 2. 五样产物都在 ----------
for (const a of ART) {
  const t = readArt(a);
  if (t === null) no('产物存在: ' + a, '文件不存在');
  else ok('产物存在: ' + a);
}

// ---------- 3. 每样产物都覆盖全部 op ----------
for (const a of ART) {
  const t = readArt(a) || '';
  const miss = names.filter((n) => !t.includes(n));
  if (!miss.length) ok(a + ' 覆盖全部 op');
  else no(a + ' 覆盖全部 op', '缺: ' + miss.join(','));
}

// ---------- 4. text 一致 ----------
{
  const t = readArt('opsText.txt') || '';
  const bad = names.filter((n) => D[n].text && !t.includes(D[n].text.replace('{course.name}', '').slice(0, 2)));
  if (!bad.length) ok('opsText 与声明一致'); else no('opsText 与声明一致', '不一致: ' + bad.join(','));
}

// ---------- 5. schema 的 params / required 一致 ----------
{
  let S = null;
  try { S = JSON.parse(readArt('schema.json') || 'null'); } catch { S = null; }
  if (!S) no('schema.json 可解析', '不是合法 JSON');
  else {
    const bad = [];
    for (const n of names) {
      const s = S[n] || S.ops?.[n];
      if (!s) { bad.push(n + '(缺条目)'); continue; }
      const p = (s.params || []).join(',');
      if (p !== (D[n].params || []).join(',')) bad.push(n + '(params)');
      const r = (s.required || []).join(',');
      if (r !== (D[n].required || []).join(',')) bad.push(n + '(required)');
    }
    if (!bad.length) ok('schema 与声明一致'); else no('schema 与声明一致', bad.join(','));
  }
}

// ---------- 6. client.js 每个 op 一个函数 ----------
{
  const t = readArt('client.js') || '';
  const bad = names.filter((n) => !(t.includes('function ' + n) || t.includes(n + '(') || t.includes(n + ':')));
  if (!bad.length) ok('client.js 覆盖全部 op'); else no('client.js 覆盖全部 op', '缺: ' + bad.join(','));
}

// ---------- 6b. client.js 必须是合法 JS ----------
{
  const p = path.join(dir, 'client.js');
  if (fs.existsSync(p)) {
    const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    if (r.status === 0) ok('client.js 是合法 JS');
    else no('client.js 是合法 JS', ((r.stderr || '').split('\n').filter(Boolean)[1] || '').slice(0, 140));
  }
}

// ---------- 7. 同步测试 A：改一条 text ----------
const orig = JSON.stringify(D, null, 2);
{
  const before = readArt('opsText.txt') || '';
  const oldT = D.add.text;
  const newT = oldT.replace('加「', '新增「').replace('新增「新增「', '新增「');
  if (oldT === newT) no('同步A 准备', 'add.text 不符合模板，无法构造测试');
  else {
    D.add.text = newT; writeDecls(D);
    const r = runEmit();
    const after = readArt('opsText.txt') || '';
    const changed = after.includes(newT) || after !== before;
    if (r.ok && changed) ok('同步A：改 text 后产物自动变（手改 0 处）');
    else no('同步A：改 text 后产物自动变', 'emit=' + r.ok + ' changed=' + changed);
    writeDecls(JSON.parse(orig)); runEmit();
  }
}

// ---------- 8. 同步测试 B：给 move 加一个 param ----------
{
  const d2 = JSON.parse(orig);
  d2.move.params = [...(d2.move.params || []), 'delta'];
  writeDecls(d2);
  const r = runEmit();
  const sch = readArt('schema.json') || '';
  const cli = readArt('client.js') || '';
  const gotS = sch.includes('delta'), gotC = cli.includes('delta');
  if (r.ok && gotS && gotC) ok('同步B：给 move 加 param 后 schema 与 client 自动变（手改 0 处）');
  else no('同步B：加 param', 'emit=' + r.ok + ' schema=' + gotS + ' client=' + gotC);
  writeDecls(JSON.parse(orig)); runEmit();
}

console.log('-- ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

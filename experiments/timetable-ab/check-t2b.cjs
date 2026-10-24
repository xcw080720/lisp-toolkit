// check-t2b.cjs — 宏的第三层：展开期校验能否挡住"测试看不见的错误"
// 用法: node check-t2b.cjs --dir runs/t2b-lisp
//
// 与实现方的约定（写进 spec，必须照做）：
//   1. impl.lisp 里 defop 带展开期校验（同名重复 / 未知字段 / 缺 text / 空 body / 空名字）
//   2. 提供 `(probe-duplicate "add")`   —— 一个宏，展开成"与已有 op 同名的第二份声明"
//   3. 提供 `(probe-bad :kind)`        —— 一个宏，按 kind 展开出非法声明：
//        :unknown-field / :no-text / :empty-body / :empty-name
//   4. 支持环境变量 T2B_VALIDATE=0 关闭校验（用于"测试看不见"的对照）
//
// 四组判据：
//   C2  合法文件能加载 + check-scale 19/19
//   C3a 关校验 + 重复声明 → 加载成功，且 check-scale 仍 19/19   ← 证明测试看不见
//   C3b 开校验 + 重复声明 → 加载失败，报错含 op 名              ← 证明宏挡得住
//   C1  四种非法声明 → 各自加载失败
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const dir = arg('--dir');
if (!dir) { console.log('usage: node check-t2b.cjs --dir <armDir>'); process.exit(2); }

const SBCL = process.env.SBCL || 'sbcl';
const implPath = path.join(dir, 'impl.lisp');
if (!fs.existsSync(implPath)) { console.log('[FAIL] 找不到 ' + implPath); process.exit(1); }

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('[ok  ] ' + n); };
const no = (n, why) => { fail++; console.log('[FAIL] ' + n + '  — ' + why); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't2b-'));
const base = fs.readFileSync(implPath, 'utf8');
const probeFile = path.join(tmp, 'in.json');
fs.writeFileSync(probeFile, JSON.stringify({ courses: [], ops: [] }));

function runScript(file, env) {
  const r = spawnSync(SBCL, ['--script', file, probeFile],
    { encoding: 'utf8', timeout: 60000, env: { ...process.env, ...(env || {}) } });
  return { status: r.status, out: ((r.stdout || '') + (r.stderr || '')) };
}
function inject(extra) {
  const p = path.join(tmp, 'v' + Math.random().toString(36).slice(2, 7) + '.lisp');
  fs.writeFileSync(p, base + '\n;;; ---- injected ----\n' + extra + '\n', 'utf8');
  return p;
}
function checkScale(file, env) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'check-scale.cjs'), '--impl', file],
    { encoding: 'utf8', timeout: 180000, env: { ...process.env, ...(env || {}) } });
  const m = (r.stdout || '').match(/--\s*(\d+) passed,\s*(\d+) failed/);
  return m ? { p: Number(m[1]), f: Number(m[2]) } : { p: -1, f: -1 };
}
const saysDuplicate = (s) => /duplicate|重复|already|defined more than once|同名/i.test(s);
// 关键守卫：失败必须来自"校验拒绝"，不能是"探针宏根本不存在"
const isRealValidation = (s) => !/UNDEFINED-FUNCTION|undefined function|undefined variable|未定义/i.test(s);

// ---------- C2 ----------
{
  const r = runScript(implPath);
  if (r.status === 0) ok('C2 原文件能加载'); else no('C2 原文件能加载', r.out.split('\n').slice(0, 1).join('').slice(0, 140));
  const s = checkScale(implPath);
  if (s.f === 0 && s.p >= 19) ok('C2 check-scale ' + s.p + '/' + s.p); else no('C2 check-scale', s.p + 'p/' + s.f + 'f');
}

// ---------- C3a：关校验 + 重复 → 加载成功，且测试仍全绿 ----------
const dupFile = inject('(probe-duplicate "add")');
{
  const r = runScript(dupFile, { T2B_VALIDATE: '0' });
  if (r.status === 0) ok('C3a 关校验时，重复声明不报错（说明"静默"是真的）');
  else no('C3a 关校验时重复声明不报错', 'status=' + r.status + ' ' + r.out.split('\n')[0].slice(0, 120));
  const s = checkScale(dupFile, { T2B_VALIDATE: '0' });
  if (s.f === 0 && s.p >= 19) ok('C3a 重复声明下 check-scale 仍 ' + s.p + '/' + s.p + '（测试看不见）');
  else no('C3a 重复声明下 check-scale 仍全绿', s.p + 'p/' + s.f + 'f');
}

// ---------- C3b：开校验 + 重复 → 加载失败，且点到 op 名 ----------
{
  const r = runScript(dupFile);
  if (r.status !== 0 && isRealValidation(r.out)) ok('C3b 开校验时，重复声明被校验拒绝');
  else if (r.status !== 0) no('C3b 校验拒绝', '失败了，但原因是"探针不存在"而非校验：' + r.out.split('\n')[0].slice(0, 110));
  else no('C3b 校验拒绝', 'status=0，没拦住');
  if (saysDuplicate(r.out) && /\badd\b/.test(r.out)) ok('C3b 报错点名了 duplicate 与 op 名');
  else no('C3b 报错含量可读信息', r.out.split('\n').slice(0, 2).join(' | ').slice(0, 160));
}

// ---------- C1：四种非法 ----------
for (const k of ['unknown-field', 'no-text', 'empty-body', 'empty-name']) {
  const f = inject('(probe-bad :' + k + ')');
  const r = runScript(f);
  if (r.status !== 0 && isRealValidation(r.out)) ok('C1 ' + k + ' → 被校验拒绝');
  else if (r.status !== 0) no('C1 ' + k + ' → 被校验拒绝', '失败原因是探针不存在：' + r.out.split('\n')[0].slice(0, 100));
  else no('C1 ' + k + ' → 被校验拒绝', 'status=0，没拦住');
}

// ---------- C0：负对照 ----------
{
  const f = inject('(this-symbol-does-not-exist-probe)');
  const r = runScript(f);
  if (r.status !== 0) ok('C0 负对照：未知符号确实会让加载失败');
  else no('C0 负对照', 'status=0，说明"加载失败"这条路本身不成立');
}

console.log('-- ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

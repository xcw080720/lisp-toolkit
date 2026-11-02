// gate.cjs —— 变异门禁：判据强度不许退步
// 用法: node gate.cjs [--max N] [--closure-only] [--v3-baseline]
//       N 缺省读 mutation-floors.json 的 sample
//       --closure-only  跳过第一步（变异测试），只跑配置自洽、判据集指纹、补丁判据 K1–K7 与证据表存证；秒级自检用
//       --v3-baseline   额外跑 v3-full 的 10 格基线（约 12 分钟，含 6 个 Lisp 格）
//       不带参数：两步都跑
//
// 第一步：读 mutation-floors.json 里的地板分，逐个跑 mutate.cjs，
//   低于地板 → 退出码 1（说明判据变弱了，或实现里长了新盲区）。
// 第二步（2026-11-01 补）：变异测试只跑 check-scale.cjs（36 条），
//   从不跑 check-closure.cjs（K1–K7）—— 于是删掉 check-closure.cjs 门禁照样绿，
//   新判据没人守。这一步把 K1–K7 也纳入：每个实现都要 7 passed, 0 failed 且退出码 0。
//   顺带校验证据表存证：closure-matrix.tsv 的 sha256 必须与 closure-matrix.sha256 一致
//   （证据表被改过却没重新存证 → 计 bad）。
//
// 第三步（2026-11-01 第三轮补，三条“该 FAIL 却 PASS”的洞）：
//   3.1 判据集指纹：mutation-floors.json 的 criteria_sha256 过去只登记不校验 ——
//       改了 check-scale.cjs / check-closure.cjs 却不重设地板，门禁照样绿。
//       现在重算这两个文件的 sha256 与记录比对，不符即计 bad（--closure-only 也跑）。
//   3.2 覆盖范围：过去遍历 cfg.floors 决定给哪些实现跑判据 —— 从 floors 删一条，
//       就把该实现的守护一起删掉了。现在覆盖范围由 cfg.impls 决定，
//       并校验 set(impls) === set(Object.keys(floors))，不等即计 bad 并打印差集。
//   3.3 缺文件：过去找不到实现就 [skip] 然后 PASS。现在计 bad 并写“实现文件缺失”。
//
// 地板只能手动上调，不许下调。要下调必须在提交信息里写清理由。
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const CLOSURE_ONLY = argv.includes('--closure-only');

const t0 = Date.now();
const here = __dirname;
const cfgPath = path.join(here, 'mutation-floors.json');
if (!fs.existsSync(cfgPath)) { console.error('[gate] 找不到 mutation-floors.json'); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

// 地板绑定抽样数，跨抽样数不可比：默认抽样数直接读配置里的 sample，
// 免得不带参数跑（旧默认 40）拿 40 的得分去比 30 记的地板，误报 FAIL。
const MAX = arg('--max', String(cfg.sample || 40));

// 补丁判据集合：check-closure.cjs 的 K1–K7，共 7 条，必须全绿
const CLOSURE_TOTAL = 7;
const env = { ...process.env, SBCL_WSL: process.env.SBCL_WSL || 'kali-linux' };

let bad = 0, rows = [];

// ---------- 第零步：配置自洽（覆盖范围 + 实现文件在场）——必跑，--closure-only 也跑 ----------
// 覆盖范围必须由 cfg.impls 决定，不能由 cfg.floors 的键反推：
// 否则从 floors 里删掉一条，就顺手把那个实现的守护一起删了，门禁只会更绿。
const impls = Array.isArray(cfg.impls) ? cfg.impls.map((s) => String(s)) : [];
const floorKeys = Object.keys(cfg.floors || {});
{
  let cfgBad = 0;
  if (!impls.length) {
    console.log('[FAIL] mutation-floors.json 缺 impls 数组：覆盖范围不能绑在 floors 键上，必须有显式 impls 清单');
    cfgBad++;
  }
  // 差集必须为空：impls 多了 → 该被守护的实现没记地板；floors 多了 → floors 里留了脱钩的孤儿键
  const implsSet = new Set(impls), floorsSet = new Set(floorKeys);
  const onlyImpls = [...implsSet].filter((x) => !floorsSet.has(x));
  const onlyFloors = [...floorsSet].filter((x) => !implsSet.has(x));
  if (onlyImpls.length || onlyFloors.length) {
    console.log('[FAIL] impls 与 floors 不一致（覆盖范围脱钩）：'
      + '仅 impls 有 → ' + (onlyImpls.join(', ') || '（无）')
      + '；仅 floors 有 → ' + (onlyFloors.join(', ') || '（无）')
      + '。两边必须完全相同，floors 里的孤儿键或被删掉的守护都算不合格。');
    cfgBad++;
  }
  const missing = impls.filter((rel) => !fs.existsSync(path.join(here, 'runs', rel)));
  if (missing.length) {
    console.log('[FAIL] 实现文件缺失：' + missing.map((r) => 'runs/' + r).join('、')
      + '（impls 里登记的实现必须真实在场，不得静默跳过）');
    cfgBad++;
  }
  rows.push({
    rel: '配置自洽(impls/floors/文件)', base: '前置', got: cfgBad ? cfgBad + ' 项不符' : '一致',
    floor: '0 项不符', pass: cfgBad === 0,
    note: cfgBad ? 'FAIL  ← impls/floors 不一致或实现文件缺失' : 'PASS  (impls = floors，文件在场)'
  });
  bad += cfgBad;
}

// ---------- 第一步：变异得分 ≥ 地板 ----------
if (!CLOSURE_ONLY) {
  for (const rel of impls) {
    const floor = cfg.floors[rel];
    const impl = path.join(here, 'runs', rel);
    if (!fs.existsSync(impl)) continue; // 缺文件已在第零步计 bad，这里不重复计
    const r = spawnSync(process.execPath, [path.join(here, 'mutate.cjs'), '--impl', impl, '--max', MAX, '--json'],
      { encoding: 'utf8', timeout: 900000 });
    const line = (r.stdout || '').split('\n').find((l) => l.startsWith('GATE_JSON '));
    if (!line) { console.log('[FAIL] ' + rel + ' 变异测试没跑完'); bad++; continue; }
    const j = JSON.parse(line.slice('GATE_JSON '.length));
    const pass = j.baselineGreen && j.score >= floor;
    rows.push({
      rel, base: j.baselineGreen ? '绿' : '红', got: j.score + '%', floor: floor + '%', pass,
      note: pass ? 'PASS  (' + j.killed + '/' + j.total + ' 杀死)' : 'FAIL  ← 判据强度退步'
    });
    if (!pass) bad++;
  }
}

// ---------- 第二步：判据集指纹（criteria_sha256 必须与实际文件一致）——必跑 ----------
// 判据被改过而地板没重设时，旧地板数字不再对应现判据，抽样得分与地板之间失去可比性：
// 这时候门禁给绿是假的绿，必须计 bad 逼人重设地板并更新 criteria_sha256。
{
  const recorded = cfg.criteria_sha256 || {};
  const CRITERIA = ['check-scale.cjs', 'check-closure.cjs'];
  const notRecorded = [], mismatch = [];
  for (const f of CRITERIA) {
    const p = path.join(here, f);
    const rec = String(recorded[f] || '').toLowerCase();
    const actual = fs.existsSync(p)
      ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : '';
    if (!rec) notRecorded.push(f);
    else if (actual !== rec) mismatch.push(f + '（现 ' + (actual || '文件缺失') + ' / 记 ' + rec + '）');
  }
  const pass = notRecorded.length === 0 && mismatch.length === 0;
  if (!pass) {
    console.log('[FAIL] 判据集指纹与地板记录不符：判据被改过，需重设地板并更新 criteria_sha256'
      + (mismatch.length ? ' 不符：' + mismatch.join('、') : '')
      + (notRecorded.length ? ' 未登记：' + notRecorded.join('、') : ''));
  }
  rows.push({
    rel: '判据集指纹(2 个判据)', base: 'sha256',
    got: pass ? '2 项一致' : (mismatch.length + notRecorded.length) + ' 项不符',
    floor: '2 项一致', pass,
    note: pass ? 'PASS  (现判据即地板记录的判据)'
      : 'FAIL  ← 判据集指纹与地板记录不符：判据被改过，需重设地板并更新 criteria_sha256'
  });
  if (!pass) bad++;
}

// ---------- 第三步：补丁判据 K1–K7（不在变异测试覆盖内）----------
for (const rel of impls) {
  const impl = path.join(here, 'runs', rel);
  if (!fs.existsSync(impl)) continue; // 缺文件已在第零步计 bad，这里不重复计
  const r = spawnSync(process.execPath, [path.join(here, 'check-closure.cjs'), '--impl', impl],
    { encoding: 'utf8', env, timeout: 600000 });
  const out = r.stdout || '', err = (r.stderr || '').trim();
  const errLine = (err.split('\n').find((l) => /Cannot find module|^Error|SyntaxError/.test(l)) || err.split('\n')[0] || '').trim();
  const m = out.match(/--\s*(\d+) passed,\s*(\d+) failed/);
  const exitOk = r.status === 0;
  const countOk = !!m && Number(m[1]) === CLOSURE_TOTAL && Number(m[2]) === 0;
  const pass = exitOk && countOk;
  let note;
  if (pass) note = 'PASS  (K1–K7 全绿)';
  else if (!m) note = 'FAIL  ← 补丁判据没跑起来（exit ' + r.status + (errLine ? '，' + errLine.slice(0, 70) : '') + '）';
  else if (!countOk) note = 'FAIL  ← 补丁判据有红：' + m[1] + ' passed, ' + m[2] + ' failed';
  else note = 'FAIL  ← 补丁判据退出码 ' + r.status;
  rows.push({
    rel: 'K1-K7 ' + rel, base: m && Number(m[2]) === 0 ? '绿' : '红',
    got: m ? m[1] + '/' + (+m[1] + +m[2]) : 'ERR', floor: CLOSURE_TOTAL + '/' + CLOSURE_TOTAL,
    pass, note
  });
  if (!pass) bad++;
}

// ---------- 第四步：证据表存证（closure-matrix.tsv 的 sha256 必须对得上）----------
{
  const tsvPath = path.join(here, 'closure-matrix.tsv');
  const shaPath = path.join(here, 'closure-matrix.sha256');
  const actual = fs.existsSync(tsvPath)
    ? crypto.createHash('sha256').update(fs.readFileSync(tsvPath)).digest('hex') : '';
  const recorded = fs.existsSync(shaPath)
    ? (fs.readFileSync(shaPath, 'utf8').trim().split(/\s+/)[0] || '').toLowerCase() : '';
  const pass = !!actual && actual === recorded;
  rows.push({
    rel: 'closure-matrix.tsv', base: '存证',
    got: actual ? actual.slice(0, 8) : '缺失', floor: recorded ? recorded.slice(0, 8) : '缺失',
    pass, note: pass ? 'PASS  (sha256 与存证一致)'
      : 'FAIL  ← 证据表被改过但没重新存证'
  });
  if (!pass) bad++;
}

// ---------- 第五步（2026-11-02 补）：v3-full 判据集（88 条）的指纹与基线地板 ----------
// 前三步守的是 scale.spec（30 op / 36 条 + K1-K7）。v3-full（15 op / 88 条）此前完全没有门禁：
//   check-v4.cjs / check-hygiene.cjs / check-static.cjs 删掉或改弱，门禁照样绿。
// 这一步做两件事：
//   5.1 指纹：三个判据文件的 sha256 必须与 v3-baseline.json 记录一致。
//   5.2 基线地板：可选用 --v3-baseline 触发，10 格逐个跑 check-v4，得分不许低于地板。
//       10 格含 6 个 Lisp 格（每格约 65-77 秒），全跑约 12 分钟，因此不设为默认。
{
  const v3Path = path.join(here, 'v3-baseline.json');
  if (!fs.existsSync(v3Path)) {
    console.log('[FAIL] 找不到 v3-baseline.json（v3-full 判据集没有指纹与地板记录）');
    rows.push({ rel: 'v3-full 判据集', base: '缺失', got: '无', floor: '应有', pass: false,
      note: 'FAIL  ← v3-baseline.json 不存在' });
    bad++;
  } else {
    const v3 = JSON.parse(fs.readFileSync(v3Path, 'utf8'));

    // 5.1 指纹
    const rec = v3.criteria_sha256 || {};
    const notRec = [], mism = [];
    for (const f of Object.keys(rec)) {
      const fp = path.join(here, f);
      const actual = fs.existsSync(fp)
        ? crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex') : '';
      if (!actual) notRec.push(f + '(文件缺失)');
      else if (actual !== String(rec[f]).toLowerCase()) mism.push(f);
    }
    const fpPass = notRec.length === 0 && mism.length === 0;
    rows.push({
      rel: 'v3 判据集指纹(3 个)', base: 'sha256',
      got: fpPass ? '3 项一致' : (mism.length + notRec.length) + ' 项不符',
      floor: '3 项一致', pass: fpPass,
      note: fpPass ? 'PASS  (v3 判据未被改动)'
        : 'FAIL  ← v3 判据被改过却未更新 v3-baseline.json：' + mism.concat(notRec).join('、')
    });
    if (!fpPass) bad++;

    // 5.2 基线地板（可选，慢）
    if (argv.includes('--v3-baseline')) {
      const floors = v3.floors || {};
      const floorTotal = Number(v3.total || 84);
      for (const rel of Object.keys(floors)) {
        const impl = path.join(here, 'runs', rel);
        if (!fs.existsSync(impl)) {
          rows.push({ rel, base: 'v3', got: '缺失', floor: floors[rel] + '/' + floorTotal, pass: false,
            note: 'FAIL  ← 实现文件缺失' });
          bad++;
          continue;
        }
        const r = spawnSync(process.execPath, [path.join(here, 'check-v4.cjs'), '--impl', impl],
          { encoding: 'utf8', env, timeout: 300000 });
        const out = (r.stdout || '') + (r.stderr || '');
        const m = out.match(/(\d+)\s*\/\s*(\d+)\s*通过/);
        const got = m ? Number(m[1]) : -1;
        const pass = got >= Number(floors[rel]);
        rows.push({
          rel, base: 'v3', got: got < 0 ? '解析失败' : got + '/' + floorTotal,
          floor: floors[rel] + '/' + floorTotal, pass,
          note: pass ? 'PASS  (不低于基线地板)'
            : 'FAIL  ← 低于 v3 基线地板，判据变弱或实现长了新盲区'
        });
        if (!pass) bad++;
      }
      // 配对判据（hygiene / static）必须全绿
      for (const [f, n] of Object.entries(v3.pair_criteria || {})) {
        const fp = path.join(here, f);
        if (!fs.existsSync(fp)) { bad++; continue; }
        const r = spawnSync(process.execPath, [fp, '--impl', path.join(here, 'runs', Object.keys(floors)[0])],
          { encoding: 'utf8', env, timeout: 300000 });
        const out = (r.stdout || '') + (r.stderr || '');
        const ok = new RegExp('\\b' + n + ' passed, 0 failed').test(out);
        rows.push({ rel: f, base: '配对', got: ok ? n + ' 通过' : '非全绿', floor: n + ' 通过', pass: ok,
          note: ok ? 'PASS' : 'FAIL  ← 配对判据未全绿' });
        if (!ok) bad++;
      }
    }
  }
}
// ---------- 第六步（2026-11-02 补）：冻结文件不许改 ----------
// 前五步都只守判据。冻结的规格与判据文件从来只有 FREEZE-*.txt 里的文字记录，没有任何自动校验：
// 改一个字节，冻结记录就失效了，而门禁照样绿。docs/DO-NOT-MODIFY.md 立了规矩但没代码执行它。
// 这一步读 frozen-files.json（由 make-frozen-list.cjs 从 FREEZE*.txt 生成），逐个比对 sha256。
{
  const ffPath = path.join(here, 'frozen-files.json');
  if (!fs.existsSync(ffPath)) {
    console.log('[FAIL] 找不到 frozen-files.json（冻结文件清单不存在，无法校验禁改）');
    rows.push({ rel: '冻结文件', base: '缺失', got: '无', floor: '应有', pass: false,
      note: 'FAIL  ← frozen-files.json 不存在' });
    bad++;
  } else {
    const ff = JSON.parse(fs.readFileSync(ffPath, 'utf8'));
    const files = ff.files || {};
    const changed = [], missing = [];
    for (const [rel, info] of Object.entries(files)) {
      const fp = path.join(here, rel);
      if (!fs.existsSync(fp)) { missing.push(rel); continue; }
      const actual = crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
      if (actual !== String(info.sha256).toLowerCase()) changed.push(rel + '（现 ' + actual.slice(0, 12) + ' / 记 ' + String(info.sha256).slice(0, 12) + '）');
    }
    const pass = changed.length === 0 && missing.length === 0;
    rows.push({
      rel: '冻结文件(' + Object.keys(files).length + ' 个)', base: '禁改',
      got: pass ? '全部一致' : (changed.length + missing.length) + ' 项不符',
      floor: '全部一致', pass,
      note: pass ? 'PASS  (冻结文件未被改动)'
        : 'FAIL  ← 冻结文件被改过：' + changed.concat(missing).join('、')
    });
    if (!pass) bad++;
  }
}
// ---------- 第七步（2026-11-02 补）：发布元数据一致性 ----------
// 前六步守判据、守冻结文件，没有一步守「对外声明」。后果已经发生过两次：
//   · v1.7.5 的 notes 写着 CITATION 与 zenodo.json「both now read 1.7.5」，
//     而 CITATION 的 doi 仍指向 v1.7.4；
//   · .zenodo.json 的 description（与线上 record 逐字相同的那段）停在 v1.6.3，
//     里面还留着 0.825 / 1.93x / nine surviving mutants 三个已撤回值。
// 这一步只做机械比对，不评价措辞：
//   7.1 version 必须相同
//   7.2 CITATION 的 doi 必须是 concept DOI（版本 DOI 每版都要改，一定会忘）
//   7.3 authors == creators，contributors == contributors，且 contributors 非空
//   7.4 notes 与 description 都必须提到当前版本号
{
  const root = path.join(here, '..', '..');
  const zPath = path.join(root, '.zenodo.json');
  const cPath = path.join(root, 'CITATION.cff');
  const CONCEPT_DOI = '10.5281/zenodo.23618044';
  const problems = [];
  try {
    const z = JSON.parse(fs.readFileSync(zPath, 'utf8'));
    const c = fs.readFileSync(cPath, 'utf8');
    const pick = (re) => { const m = c.match(re); return m ? m[1].trim() : null; };
    const cVer = pick(/^version:\s*"?([^"\n]+)"?\s*$/m);
    const cDoi = pick(/^doi:\s*"?([^"\n]+)"?\s*$/m);
    const block = (key) => {
      const i = c.indexOf('\n' + key + ':');
      if (i < 0) return [];
      const rest = c.slice(i + key.length + 2);
      const end = rest.search(/^[a-z][a-z0-9-]*:\s*$/m);
      const body = end < 0 ? rest : rest.slice(0, end);
      return [...body.matchAll(/^\s+-\s+name:\s*"?([^"\n]*?)"?\s*$/gm)].map(m => m[1].trim());
    };
    const cAuthors = block('authors');
    const cContribs = block('contributors');
    const zCreators = (z.creators || []).map(x => String(x.name).trim());
    const zContribs = (z.contributors || []).map(x => String(x.name).trim());
    // 集合比较：两边排序后逐位比。有序比较会把「作者顺序调整」误报成不一致。
    const same = (a, b) => {
      const A = a.slice().sort(), B = b.slice().sort();
      return A.length === B.length && A.every((x, i) => x === B[i]);
    };
    if (!cVer || cVer !== z.version) problems.push('version 不一致：CITATION=' + (cVer || '缺失') + ' / zenodo.json=' + z.version);
    if (cDoi !== CONCEPT_DOI) problems.push('CITATION 的 doi 不是 concept DOI：' + (cDoi || '缺失') + '（版本 DOI 每版都要改，改用 ' + CONCEPT_DOI + '）');
    if (!same(cAuthors, zCreators)) problems.push('authors 与 creators 不一致：[' + cAuthors.join('、') + '] vs [' + zCreators.join('、') + ']');
    if (!same(cContribs, zContribs)) problems.push('contributors 不一致：[' + cContribs.join('、') + '] vs [' + zContribs.join('、') + ']');
    if (zContribs.length === 0) problems.push('.zenodo.json 没有 contributors');
    // 版本号检查用「提取再比对」，不用边界正则。边界正则有过两个实测漏判：
    //   · v1.7.60            —— 子串匹配（第一版）
    //   · version 写短成 1.7 —— 前缀命中（第二版）
    // 提取法把这两个都堵住了。
    //
    // 已知且**不堵**的边界，写在这里，不装作没有：
    //   · v1.7.6.1 / v1.7.6x 会被抽成 "1.7.6"——四段或后缀写法截断后与当前版本相等。
    //     加 (?![\d.]) 能堵，但会把「v1.7.6.」这种句末写法一并挡掉，两者只能选一个，
    //     而句末句号是真实文本的常态。
    //   · 抽取在整段字符串上跑，不剥 HTML：<span data-version="v1.7.6"> 也算一次出现。
    // 这两条针对的是「刻意构造」。而这条判据要防的是**自己忘记改版本号**（v1.7.5 那次），
    // 不是对手——给不会自然发生的输入补判据，等于造假绿。
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(String(z.version))) {
      problems.push('version 不是三段式或带前导零：' + z.version + '（1.7 / 1 / 01.7.6 都会让前缀匹配放行）');
    }
    const versOf = (s) => [...String(s || '').matchAll(/v(\d+\.\d+(?:\.\d+)?)/g)].map(m => m[1]);
    const notesVers = versOf(z.notes);
    const descVers = versOf(z.description);
    if (!notesVers.includes(String(z.version))) problems.push('notes 里没有 v' + z.version + '（本版没写记录）');
    if (!descVers.includes(String(z.version))) problems.push('description 里没有 v' + z.version + '（对外摘要停在旧版）');
    // 摘要的第一处版本号必须是当前版本：读者第一眼看到的那句写错，等于没有摘要。
    if (descVers.length && descVers[0] !== String(z.version)) {
      problems.push('description 第一处版本号是 v' + descVers[0] + '，不是 v' + z.version + '（开头那句写错了）');
    }
  } catch (e) {
    problems.push('读取元数据失败：' + e.message);
  }
  const mpass = problems.length === 0;
  rows.push({
    rel: '发布元数据', base: '一致性', got: mpass ? '全部一致' : problems.length + ' 项不符',
    floor: '全部一致', pass: mpass,
    note: mpass ? 'PASS  (CITATION / zenodo.json / 对外摘要三方一致)'
      : 'FAIL  ← ' + problems.join('；')
  });
  if (!mpass) bad++;
}

// ---------- 第八步（2026-11-02 补）：反例仍然能红 ----------
// 一条从没红过的检查不是检查。counterexamples/matrix.tsv 记录了每个变异体让哪些判据变红；
// 这一步抽样复跑，比对「现在的红集」与「记录的红集」。
// 判据被改弱、变异体被动过、实现被替换，红集都会变，这里会 FAIL。
// 抽样四个（首、两个三分点、尾），确定性，约 30 秒；全跑 32 个约 4.5 分钟，所以默认抽样。
{
  const ceDir = path.join(here, 'counterexamples');
  const mPath = path.join(ceDir, 'matrix.tsv');
  if (!fs.existsSync(mPath)) {
    rows.push({ rel: '反例矩阵', base: '缺失', got: '无', floor: '应有', pass: false,
      note: 'FAIL  ← counterexamples/matrix.tsv 不存在（没有反例记录，判据无法证明还能失败）' });
    bad++;
  } else {
    const recs = fs.readFileSync(mPath, 'utf8').trim().split(/\r?\n/).slice(1)
      .map(l => l.split('\t')).filter(c => c.length >= 7)
      .map(c => ({ name: c[0], reds: c[6].split(/\s+/).filter(Boolean) }));
    const idx = recs.length <= 4 ? recs.map((_, i) => i)
      : [0, Math.floor(recs.length / 3), Math.floor((2 * recs.length) / 3), recs.length - 1];
    const problems = [];
    let ran = 0;
    for (const i of idx) {
      const rec = recs[i];
      const f = path.join(ceDir, 'mut-' + rec.name + '.js');
      if (!fs.existsSync(f)) { problems.push(rec.name + '（变异体缺失）'); continue; }
      const r = spawnSync(process.execPath, [path.join(here, 'check-v4.cjs'), '--impl', f],
        { encoding: 'utf8', env, timeout: 300000 });
      const out = (r.stdout || '') + (r.stderr || '');
      const got = [...out.matchAll(/^#\s*(\d+)\s+(FAIL|CRASH)/mg)].map(x => '#' + x[1]).sort();
      ran++;
      const want = rec.reds.slice().sort();
      if (got.join(' ') !== want.join(' ')) {
        problems.push(rec.name + '（记 ' + (want.join(' ') || '空') + ' / 现 ' + (got.join(' ') || '空') + '）');
      }
    }
    const cePass = problems.length === 0;
    rows.push({
      rel: '反例仍能红(' + ran + ' 个)', base: '抽样',
      got: cePass ? ran + '/' + ran + ' 一致' : problems.length + ' 项不符',
      floor: '全部一致', pass: cePass,
      note: cePass ? 'PASS  (变异体红集与 matrix.tsv 一致，判据仍能失败)'
        : 'FAIL  ← 红集对不上：' + problems.join('；')
    });
    if (!cePass) bad++;
  }
}

// ---------- 一张表 + 末行结论 ----------
console.log('');
if (CLOSURE_ONLY) console.log('（--closure-only：跳过变异测试，只跑配置自洽、判据集指纹、补丁判据与存证校验）');
console.log('实现'.padEnd(30) + '基线'.padEnd(8) + '得分'.padEnd(10) + '地板'.padEnd(10) + '结论');
for (const r of rows) {
  console.log(
    r.rel.padEnd(30) +
    r.base.padEnd(8) +
    String(r.got).padEnd(10) +
    String(r.floor).padEnd(10) +
    r.note
  );
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log('');
console.log('[gate] 耗时 ' + secs + ' s');
if (bad) { console.log('[gate] ' + bad + ' 项未通过（配置与 floors 脱钩 / 实现文件缺失 / 判据集指纹不符 / 变异未达地板 / 补丁判据未全绿 / 证据表存证不符 / v3 判据指纹或地板不符 / 冻结文件被改 / 发布元数据不一致 / 反例红集对不上）。地板只能上调，不许下调。'); process.exitCode = 1; }
else console.log('[gate] 全部通过：覆盖范围自洽且实现在场，判据集指纹与地板记录一致，变异达到地板分，补丁判据 K1–K7 全绿，证据表存证一致，v3 判据未被削弱，冻结文件未被改动，发布元数据三方一致，反例仍能红。');

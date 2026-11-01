// v4-collect-js.cjs —— 只做采集与汇总：调 metric.cjs / check-v3.cjs（原样命令），抄 log.txt
// 不改任何被判据/被保护文件。输出 v4-results-js.tsv + 统计到 stdout。
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const EXP = path.resolve(__dirname, '..');
const CELLS = [];
for (let r = 1; r <= 6; r++) CELLS.push(['v4-js-inline', r]);
for (let r = 1; r <= 6; r++) CELLS.push(['v4-js-table', r]);

function run(cmd, args) {
  const r = cp.spawnSync(cmd, args, { cwd: EXP, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: false });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function metric(file) {
  const r = run('node', ['metric.cjs', file]);
  const m = r.out.match(/JSON: (\[.*\])\s*$/m);
  if (!m) return null;
  const rows = JSON.parse(m[1]);
  return rows[0];
}

function judge(file, upto) {
  const r = run('node', ['check-v3.cjs', '--impl', file, '--upto', String(upto)]);
  const m = r.out.match(/(\d+)\/(\d+) 通过（fail=(\d+) crash=(\d+)）/);
  const ids = [];
  for (const line of r.out.split('\n')) {
    const mm = line.match(/^#\s*(\d+)\s+(FAIL|CRASH)\b/);
    if (mm) ids.push(+mm[1]);
  }
  if (!m) return { pass: null, total: null, ids, raw: r.out.slice(-300) };
  return { pass: +m[1], total: +m[2], fail: +m[3], crash: +m[4], ids };
}

function logInfo(dir) {
  const p = path.join(dir, 'log.txt');
  if (!fs.existsSync(p)) return { note: 'no log.txt' };
  const t = fs.readFileSync(p, 'utf8');
  if (/^FAILED after 3 attempts/m.test(t)) return { failed: true, note: t.trim() };
  const g = (k) => { const m = t.match(new RegExp(k + '=([^\\s]+)')); return m ? m[1] : ''; };
  return {
    failed: false,
    out_tok: +(g('usage_completion') || 0),
    in_tok: +(g('usage_prompt') || 0),
    finish: g('finish_reason'),
    fenced: g('fenced'),
    elapsed_s: Math.round((+(g('elapsed_ms') || 0)) / 100) / 10
  };
}

const rows = [];
for (const [arm, r] of CELLS) {
  const dir = path.join('runs', arm + '-r' + r);
  const file = path.join(dir, 'impl.js');
  const li = logInfo(path.join(EXP, dir));
  const row = { arm, run: 'r' + r, exists: fs.existsSync(path.join(EXP, file)), li };
  if (row.exists) {
    const mt = metric(file);
    if (mt) { row.chars = mt.chars; row.lines = mt.lines; row.code_lines = mt.codeLines; }
    row.j36 = judge(file, 36);
    row.j56 = judge(file, 56);
  }
  rows.push(row);
  console.log('done ' + arm + '-r' + r + (row.exists ? ' pass36=' + row.j36.pass + '/' + row.j36.total +
    ' pass56=' + row.j56.pass + '/' + row.j56.total + ' chars=' + row.chars + ' fin=' + li.finish : ' MISSING impl.js'));
}

const H = ['arm', 'run', 'chars', 'lines', 'code_lines', 'upto36_pass', 'upto36_total', 'upto36_fail_ids',
  'upto56_pass', 'upto56_total', 'out_tok', 'finish', 'elapsed_s'];
const lines = [H.join('\t')];
for (const w of rows) {
  const v = (x) => (x === undefined || x === null || x === '' ? '' : String(x));
  lines.push([w.arm, w.run, v(w.chars), v(w.lines), v(w.code_lines),
    w.exists ? v(w.j36.pass) : 'NA', w.exists ? v(w.j36.total) : 'NA', w.exists ? w.j36.ids.join(',') : 'NA',
    w.exists ? v(w.j56.pass) : 'NA', w.exists ? v(w.j56.total) : 'NA',
    v(w.li.out_tok), v(w.li.failed ? 'generation_failed' : w.li.finish), v(w.li.elapsed_s)].join('\t'));
}
fs.writeFileSync(path.join(EXP, 'v4-results-js.tsv'), lines.join('\n') + '\n', 'utf8');
console.log('\n=== TSV ===');
console.log(lines.join('\n'));

// 统计
function stats(a) {
  const n = a.length, mean = a.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  return { n, mean: +mean.toFixed(1), sd: +sd.toFixed(1), min: Math.min(...a), max: Math.max(...a), range: Math.max(...a) - Math.min(...a) };
}
for (const arm of ['v4-js-inline', 'v4-js-table']) {
  const a = rows.filter((x) => x.arm === arm && x.chars !== undefined).map((x) => x.chars);
  if (a.length) console.log('STAT ' + arm + ' ' + JSON.stringify(stats(a)));
}
const tin = rows.reduce((s, x) => s + (x.li.in_tok || 0), 0);
const tout = rows.reduce((s, x) => s + (x.li.out_tok || 0), 0);
const el = rows.reduce((s, x) => s + (x.li.elapsed_s || 0), 0);
console.log('TOTAL in_tok=' + tin + ' out_tok=' + tout + ' elapsed_s=' + el);
console.log('FIRSTPASS upto36: inline=' + rows.filter((x) => x.arm === 'v4-js-inline' && x.j36 && x.j36.pass === 36).length +
  '/6 table=' + rows.filter((x) => x.arm === 'v4-js-table' && x.j36 && x.j36.pass === 36).length + '/6');
console.log('FINISH ' + JSON.stringify(rows.map((x) => x.arm + '-r' + x.run + ':' + (x.li.failed ? 'FAILED' : x.li.finish))));

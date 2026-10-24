// selftest.cjs -- extra checks beyond the 9 invariants (empty ops, 5-op chain, reject, ASCII-only stdout)
const { spawnSync } = require('child_process');
const fs = require('fs');
const sbcl = process.env.SBCL;
let fails = 0;
function run(input) {
  fs.writeFileSync('tmp_in.json', JSON.stringify(input));
  const r = spawnSync(sbcl, ['--script', 'impl.lisp', 'tmp_in.json'], { encoding: 'utf8' });
  if (r.status !== 0) { console.log('spawn error:', (r.stderr || '').split('\n')[0]); fails++; return null; }
  const nonAscii = [...Buffer.from(r.stdout, 'utf8')].filter((b) => b > 127).length;
  if (nonAscii) { console.log('stdout not ASCII-only:', nonAscii); fails++; }
  try { return JSON.parse(r.stdout.trim()); } catch (e) { console.log('bad json:', e.message); fails++; return null; }
}
const p = (tag, cond, extra) => { if (cond) console.log('[ok  ] ' + tag); else { fails++; console.log('[FAIL] ' + tag + ' ' + (extra || '')); } };
const C = (o = {}) => ({ name: 'X', teacher: '', location: '', day: 1, periodFrom: 1, periodTo: 2, weeks: { type: 'range', from: 1, to: 16 }, tag: null, ...o });
const f = (o, n) => (o.courses || []).find((c) => c.name === n);

const a = run({ courses: [C({ name: '高数' })], ops: [] });
p('empty-ops', a && a.n === 0 && a.opsText === '' && a.log.length === 0 && a.courses.length === 1, JSON.stringify(a));

const b = run({
  courses: [C({ name: '高数', day: 1 }), C({ name: '英语', day: 3, periodFrom: 3, periodTo: 4 })],
  ops: [
    { op: 'add', course: { name: '物理', teacher: '李', location: 'B2', day: 9, periodFrom: 5, periodTo: 6 } },
    { op: 'edit', match: '英语', set: { periodTo: 9 } },
    { op: 'move', match: '物理', day: 2, periodFrom: 1, periodTo: 2 },
    { op: 'swap', match: '高数', with: '物理' },
    { op: 'del', match: '英语' },
  ],
});
p('chain-n', b && b.n === 6, 'n=' + (b && b.n));
p('chain-log5', b && b.log.length === 5 && /^5\) /.test(b.log[4]) && /^1\) /.test(b.log[0]), JSON.stringify(b && b.log));
p('chain-add-weeks', b && JSON.stringify((f(b, '物理') || {}).weeks) === JSON.stringify({ type: 'range', from: 1, to: 16 }), JSON.stringify(f(b, '物理')));
p('chain-add-dayclamp', b && f(b, '物理').day === 1, JSON.stringify(f(b, '物理')));
p('chain-swap', b && f(b, '高数').day === 2 && f(b, '物理').day === 1, JSON.stringify(b && b.courses));
p('chain-del', b && !f(b, '英语') && b.courses.length === 2, '');

const c = run({ courses: [C({ name: 'A' }), C({ name: 'B', day: 2 })], ops: [{ op: 'del', match: 'A' }, { op: 'helper' }] });
p('reject', c && c.n === 0 && c.courses.length === 2 && c.log.length === 1 && c.opsText === '', JSON.stringify(c));

const d = run({ courses: [], ops: [{ op: 'move', match: 'X', day: 2 }] });
p('move-incomplete-noop', d && d.n === 0 && d.courses.length === 0, JSON.stringify(d));

console.log(fails ? '-- FAIL ' + fails : '-- all extra checks passed');
process.exitCode = fails ? 1 : 0;

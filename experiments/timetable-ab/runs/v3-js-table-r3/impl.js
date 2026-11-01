'use strict';
// one registry row per op: a = arg-kind spec (also the arg count), r = body on the shared state
const MAXC = 20;
const INT = /^-?[0-9]+$/;
const num = (x, lo, hi) => { const v = INT.test(x) ? +x : NaN; return v >= lo && v <= hi ? v : null; };
const KIND = {
  w: (x) => (x.length >= 1 && x.length <= 12 ? x : null),
  d: (x) => num(x, 1, 7),
  s: (x) => num(x, 1, 12),
  i: (x) => (INT.test(x) ? +x : null)
};
const ok = (n) => ({ n: n });
const err = (e) => ({ e: e });
const at = (s, nm) => s.find((c) => c.name === nm);
const hit = (s, d, f, t, sk) => s.some((c) => c !== sk && c.day === d && f <= c.to && c.from <= t);
const byName = (x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0);
const OPS = {
  add: { a: 'wwwdss', r: (s, v) => {
    const nm = v[0], te = v[1], lo = v[2], d = v[3], f = v[4], t = v[5];
    if (t < f) return err('BADARG');
    if (at(s, nm)) return err('DUP');
    if (s.length >= MAXC) return err('LIMIT');
    if (hit(s, d, f, t)) return err('CONFLICT');
    s.push({ name: nm, teacher: te, loc: lo, day: d, from: f, to: t });
    return ok(1); } },
  del: { a: 'w', r: (s, v) => {
    const c = at(s, v[0]);
    if (!c) return err('NOTFOUND');
    s.splice(s.indexOf(c), 1);
    return ok(1); } },
  edit: { a: 'www', r: (s, v) => {
    const c = at(s, v[0]);
    if (!c) return err('NOTFOUND');
    c.teacher = v[1]; c.loc = v[2];
    return ok(1); } },
  move: { a: 'wdss', r: (s, v) => {
    const c = at(s, v[0]), d = v[1], f = v[2], t = v[3];
    if (!c) return err('NOTFOUND');
    if (t < f) return err('BADARG');
    if (hit(s, d, f, t, c)) return err('CONFLICT');
    c.day = d; c.from = f; c.to = t;
    return ok(1); } },
  swap: { a: 'ww', r: (s, v) => {
    const x = at(s, v[0]), y = at(s, v[1]);
    if (!x || !y) return err('NOTFOUND');
    const k = [x.day, x.from, x.to];
    x.day = y.day; x.from = y.from; x.to = y.to;
    y.day = k[0]; y.from = k[1]; y.to = k[2];
    return ok(2); } },
  rename: { a: 'ww', r: (s, v) => {
    const c = at(s, v[0]);
    if (!c) return err('NOTFOUND');
    if (at(s, v[1])) return err('DUP');
    c.name = v[1];
    return ok(1); } },
  duplicate: { a: 'ww', r: (s, v) => {
    const c = at(s, v[0]);
    if (!c) return err('NOTFOUND');
    if (at(s, v[1])) return err('DUP');
    if (s.length >= MAXC) return err('LIMIT');
    s.push({ name: v[1], teacher: c.teacher, loc: c.loc, day: c.day, from: c.from, to: c.to });
    return ok(1); } },
  trim: { a: 'ds', r: (s, v) => {
    let n = 0;
    for (const c of s) if (c.day === v[0] && c.from <= v[1] && v[1] < c.to) { c.to = v[1]; n++; }
    return ok(n); } },
  clear: { a: 'd', r: (s, v) => {
    const keep = s.filter((c) => c.day !== v[0]);
    const n = s.length - keep.length;
    s.length = 0;
    for (const c of keep) s.push(c);
    return ok(n); } },
  shift: { a: 'di', r: (s, v) => {
    const nd = v[0] + v[1];
    if (nd < 1 || nd > 7) return err('BADARG');
    let n = 0;
    for (const c of s) if (c.day === v[0]) { c.day = nd; n++; }
    return ok(n); } },
  copy: { a: 'wd', r: (s, v) => {
    const c = at(s, v[0]);
    if (!c) return err('NOTFOUND');
    const nn = c.name + '_2';
    if (nn.length > 12) return err('BADARG');
    if (at(s, nn)) return err('DUP');
    if (s.length >= MAXC) return err('LIMIT');
    s.push({ name: nn, teacher: c.teacher, loc: c.loc, day: v[1], from: c.from, to: c.to });
    return ok(1); } },
  merge: { a: 'ww', r: (s, v) => {
    const x = at(s, v[0]), y = at(s, v[1]);
    if (!x || !y) return err('NOTFOUND');
    x.teacher = y.teacher; x.loc = y.loc;
    s.splice(s.indexOf(y), 1);
    return ok(2); } },
  sort: { a: '', r: (s) => { s.sort(byName); return ok(0); } },
  filter: { a: 'd', r: (s, v) => ok(s.filter((c) => c.day === v[0]).length) },
  count: { a: '', r: (s) => ok(s.length) }
};
const W = (c) => c.trim().split(/\s+/).filter(Boolean);
const ST = [];
function run(cmd) {
  const w = W(cmd);
  const verb = w.length ? w[0].toLowerCase() : '';
  const op = OPS[verb];
  if (!op) return 'err BADARG';
  if (w.length - 1 !== op.a.length) return 'err BADARG';
  const args = [];
  for (let i = 0; i < op.a.length; i++) {
    const val = KIND[op.a.charAt(i)](w[i + 1]);
    if (val === null) return 'err BADARG';
    args.push(val);
  }
  const res = op.r(ST, args);
  return res.e ? 'err ' + res.e : 'ok ' + verb + ' ' + res.n;
}
const out = process.argv.slice(2).map((c) => run(c));
out.push('#state');
for (const c of ST.slice().sort(byName)) out.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
process.stdout.write(out.join('\n') + '\n');

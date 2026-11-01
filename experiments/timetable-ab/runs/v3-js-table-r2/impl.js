'use strict';

const MAXN = 20;
const WLEN = 12;
const db = [];

const int = s => {
  if (!/^[+-]?\d+$/.test(s)) return null;
  const v = Number(s);
  return Number.isSafeInteger(v) ? v : null;
};
const rng = (lo, hi) => s => {
  const v = int(s);
  return v === null || v < lo || v > hi ? null : v;
};
const word = s => (typeof s === 'string' && s.length > 0 && s.length <= WLEN ? s : null);
const day1 = rng(1, 7);
const slot1 = rng(1, 12);

const ix = n => db.findIndex(c => c.name === n);
const clash = (d, f, t, sk) => db.some((c, i) => i !== sk && c.day === d && c.from <= t && f <= c.to);

const T = [
  { op: 'add', k: [word, word, word, day1, slot1, slot1], g: a => a[4] <= a[5], x: a => {
    if (ix(a[0]) >= 0) return 'DUP';
    if (db.length >= MAXN) return 'LIMIT';
    if (clash(a[3], a[4], a[5], -1)) return 'CONFLICT';
    db.push({ name: a[0], teacher: a[1], loc: a[2], day: a[3], from: a[4], to: a[5] });
    return 1;
  } },
  { op: 'del', k: [word], x: a => {
    const i = ix(a[0]);
    if (i < 0) return 'NOTFOUND';
    db.splice(i, 1);
    return 1;
  } },
  { op: 'edit', k: [word, word, word], x: a => {
    const i = ix(a[0]);
    if (i < 0) return 'NOTFOUND';
    db[i].teacher = a[1];
    db[i].loc = a[2];
    return 1;
  } },
  { op: 'move', k: [word, day1, slot1, slot1], g: a => a[2] <= a[3], x: a => {
    const i = ix(a[0]);
    if (i < 0) return 'NOTFOUND';
    if (clash(a[1], a[2], a[3], i)) return 'CONFLICT';
    const c = db[i];
    c.day = a[1];
    c.from = a[2];
    c.to = a[3];
    return 1;
  } },
  { op: 'swap', k: [word, word], x: a => {
    const i = ix(a[0]);
    const j = ix(a[1]);
    if (i < 0 || j < 0) return 'NOTFOUND';
    const p = db[i];
    const q = db[j];
    const s = [p.day, p.from, p.to];
    p.day = q.day; p.from = q.from; p.to = q.to;
    q.day = s[0]; q.from = s[1]; q.to = s[2];
    return 2;
  } },
  { op: 'rename', k: [word, word], x: a => {
    const i = ix(a[0]);
    if (i < 0) return 'NOTFOUND';
    if (a[0] !== a[1] && ix(a[1]) >= 0) return 'DUP';
    db[i].name = a[1];
    return 1;
  } },
  { op: 'duplicate', k: [word, word], x: a => {
    const i = ix(a[0]);
    if (i < 0) return 'NOTFOUND';
    if (ix(a[1]) >= 0) return 'DUP';
    if (db.length >= MAXN) return 'LIMIT';
    const c = db[i];
    db.push({ name: a[1], teacher: c.teacher, loc: c.loc, day: c.day, from: c.from, to: c.to });
    return 1;
  } },
  { op: 'trim', k: [day1, slot1], x: a => {
    let n = 0;
    for (const c of db) if (c.day === a[0] && c.from <= a[1] && a[1] < c.to) { c.to = a[1]; n++; }
    return n;
  } },
  { op: 'clear', k: [day1], x: a => {
    const b = db.length;
    for (let i = db.length - 1; i >= 0; i--) if (db[i].day === a[0]) db.splice(i, 1);
    return b - db.length;
  } },
  { op: 'shift', k: [day1, int], x: a => {
    const nd = a[0] + a[1];
    if (nd < 1 || nd > 7) return 'BADARG';
    let n = 0;
    for (const c of db) if (c.day === a[0]) { c.day = nd; n++; }
    return n;
  } },
  { op: 'copy', k: [word, day1], x: a => {
    const i = ix(a[0]);
    if (i < 0) return 'NOTFOUND';
    const nm = a[0] + '_2';
    if (nm.length > WLEN) return 'BADARG';
    if (ix(nm) >= 0) return 'DUP';
    if (db.length >= MAXN) return 'LIMIT';
    const c = db[i];
    if (clash(a[1], c.from, c.to, -1)) return 'CONFLICT';
    db.push({ name: nm, teacher: c.teacher, loc: c.loc, day: a[1], from: c.from, to: c.to });
    return 1;
  } },
  { op: 'merge', k: [word, word], x: a => {
    const i = ix(a[0]);
    const j = ix(a[1]);
    if (i < 0 || j < 0) return 'NOTFOUND';
    if (i === j) return 'BADARG';
    db[i].teacher = db[j].teacher;
    db[i].loc = db[j].loc;
    db.splice(j, 1);
    return 2;
  } },
  { op: 'sort', k: [], x: () => 0 },
  { op: 'filter', k: [day1], x: a => db.filter(c => c.day === a[0]).length },
  { op: 'count', k: [], x: () => db.length }
];

const REG = {};
for (const e of T) REG[e.op] = e;

const run = cmd => {
  const s = String(cmd).trim();
  if (!s) return 'err BADARG';
  const w = s.split(/\s+/);
  const e = REG[w[0]];
  if (!e) return 'err BADARG';
  const raw = w.slice(1);
  if (raw.length !== e.k.length) return 'err BADARG';
  const a = [];
  for (let i = 0; i < raw.length; i++) {
    const v = e.k[i](raw[i]);
    if (v === null) return 'err BADARG';
    a.push(v);
  }
  if (e.g && !e.g(a)) return 'err BADARG';
  const r = e.x(a);
  return typeof r === 'number' ? 'ok ' + e.op + ' ' + r : 'err ' + r;
};

const lines = [];
for (const c of process.argv.slice(2)) lines.push(run(c));
lines.push('#state');
const rows = db.slice().sort((p, q) => (p.name < q.name ? -1 : p.name > q.name ? 1 : 0));
for (const c of rows) lines.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
process.stdout.write(lines.join('\n') + '\n');

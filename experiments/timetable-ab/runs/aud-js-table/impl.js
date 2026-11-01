'use strict';

const MAX = 20;
const WORD = /^[^\s]{1,12}$/;
const INT = /^-?\d+$/;

function nf(code) { throw code; }

function w(t) { if (!WORD.test(t)) nf('BADARG'); return t; }

function n(t, lo, hi) {
  if (!INT.test(t)) nf('BADARG');
  const v = +t;
  if (v < lo || v > hi) nf('BADARG');
  return v;
}

function find(s, name) {
  for (let i = 0; i < s.length; i++) if (s[i].name === name) return s[i];
  return null;
}

function need(s, name) {
  const c = find(s, name);
  if (!c) nf('NOTFOUND');
  return c;
}

function clash(s, day, from, to, skip) {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== skip && c.day === day && c.from <= to && from <= c.to) return true;
  }
  return false;
}

function room(s) { if (s.length >= MAX) nf('LIMIT'); }

function cnt(s, day) {
  let k = 0;
  for (let i = 0; i < s.length; i++) if (s[i].day === day) k++;
  return k;
}

function course(name, teacher, loc, day, from, to) {
  return { name: name, teacher: teacher, loc: loc, day: day, from: from, to: to };
}

const OPS = {

  add: [6, function (s, a) {
    const name = w(a[0]);
    if (find(s, name)) nf('DUP');
    const teacher = w(a[1]);
    const loc = w(a[2]);
    const day = n(a[3], 1, 7);
    const from = n(a[4], 1, 12);
    const to = n(a[5], 1, 12);
    if (to < from) nf('BADARG');
    room(s);
    if (clash(s, day, from, to, null)) nf('CONFLICT');
    s.push(course(name, teacher, loc, day, from, to));
    return 1;
  }],

  del: [1, function (s, a) {
    const c = need(s, w(a[0]));
    s.splice(s.indexOf(c), 1);
    return 1;
  }],

  edit: [3, function (s, a) {
    const c = need(s, w(a[0]));
    const teacher = w(a[1]);
    const loc = w(a[2]);
    c.teacher = teacher;
    c.loc = loc;
    return 1;
  }],

  move: [4, function (s, a) {
    const c = need(s, w(a[0]));
    const day = n(a[1], 1, 7);
    const from = n(a[2], 1, 12);
    const to = n(a[3], 1, 12);
    if (to < from) nf('BADARG');
    if (clash(s, day, from, to, c)) nf('CONFLICT');
    c.day = day;
    c.from = from;
    c.to = to;
    return 1;
  }],

  swap: [2, function (s, a) {
    const x = need(s, w(a[0]));
    const y = need(s, w(a[1]));
    const d = x.day, f = x.from, t = x.to;
    x.day = y.day; x.from = y.from; x.to = y.to;
    y.day = d; y.from = f; y.to = t;
    return 2;
  }],

  rename: [2, function (s, a) {
    const c = need(s, w(a[0]));
    const nn = w(a[1]);
    if (find(s, nn)) nf('DUP');
    c.name = nn;
    return 1;
  }],

  duplicate: [2, function (s, a) {
    const c = need(s, w(a[0]));
    const nn = w(a[1]);
    if (find(s, nn)) nf('DUP');
    room(s);
    s.push(course(nn, c.teacher, c.loc, c.day, c.from, c.to));
    return 1;
  }],

  trim: [2, function (s, a) {
    const day = n(a[0], 1, 7);
    const to = n(a[1], 1, 12);
    let k = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c.day === day && c.from <= to && to < c.to) { c.to = to; k++; }
    }
    return k;
  }],

  clear: [1, function (s, a) {
    const day = n(a[0], 1, 7);
    let k = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i].day === day) { s.splice(i, 1); k++; }
    }
    return k;
  }],

  shift: [2, function (s, a) {
    const day = n(a[0], 1, 7);
    if (!INT.test(a[1])) nf('BADARG');
    const nd = day + (+a[1]);
    if (nd < 1 || nd > 7) nf('BADARG');
    let k = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i].day === day) { s[i].day = nd; k++; }
    }
    return k;
  }],

  copy: [2, function (s, a) {
    const c = need(s, w(a[0]));
    const day = n(a[1], 1, 7);
    const nn = c.name + '_2';
    if (find(s, nn)) nf('DUP');
    room(s);
    if (clash(s, day, c.from, c.to, null)) nf('CONFLICT');
    s.push(course(nn, c.teacher, c.loc, day, c.from, c.to));
    return 1;
  }],

  merge: [2, function (s, a) {
    const x = need(s, w(a[0]));
    const y = need(s, w(a[1]));
    if (x === y) return 2;
    x.teacher = y.teacher;
    x.loc = y.loc;
    s.splice(s.indexOf(y), 1);
    return 2;
  }],

  sort: [0, function () { return 0; }],

  filter: [1, function (s, a) { return cnt(s, n(a[0], 1, 7)); }],

  count: [0, function (s) { return s.length; }]

};

const state = [];
const out = [];

for (let i = 0; i < process.argv.length - 2; i++) {
  const raw = process.argv[i + 2].trim();
  if (raw === '') { out.push('err BADARG'); continue; }
  const p = raw.split(/\s+/);
  const op = OPS[p[0]];
  let line;
  try {
    if (!op) nf('BADARG');
    const a = p.slice(1);
    if (a.length !== op[0]) nf('BADARG');
    line = 'ok ' + p[0] + ' ' + op[1](state, a);
  } catch (e) {
    line = 'err ' + (typeof e === 'string' ? e : 'BADARG');
  }
  out.push(line);
}

out.push('#state');
const order = state.map(function (c) { return c.name; }).sort();
for (let i = 0; i < order.length; i++) {
  const c = find(state, order[i]);
  out.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
}

process.stdout.write(out.join('\n') + '\n');

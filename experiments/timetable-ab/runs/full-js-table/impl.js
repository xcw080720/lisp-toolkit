'use strict';

// Timetable ops engine, v3.1 spec: 30 ops, one registry, one dispatcher,
// global --dry prefix. argv in, stdout out, no I/O, no JSON.

var CAP = 20;

function bad() { throw { code: 'BADARG' }; }
function fail(c) { throw { code: c }; }

function w(s) {
  if (typeof s !== 'string' || s.length < 1 || s.length > 12 || /\s/.test(s)) bad();
  return s;
}
function u(s, lo, hi) {
  if (!/^[0-9]+$/.test(s)) bad();
  var v = +s;
  if (v < lo || v > hi) bad();
  return v;
}
function q(s) {
  if (!/^[0-9]+$/.test(s)) bad();
  return +s;
}
function sp(a, b) {
  var f = u(a, 1, 12), t = u(b, 1, 12);
  if (t < f) bad();
  return [f, t];
}
function get(s, name) {
  for (var i = 0; i < s.length; i++) if (s[i].name === name) return s[i];
  return null;
}
function need(s, name) {
  var c = get(s, name);
  if (!c) fail('NOTFOUND');
  return c;
}
function day(s, d) {
  var out = [];
  for (var i = 0; i < s.length; i++) if (s[i].day === d) out.push(s[i]);
  return out;
}
function hits(s, d, f, t, skip) {
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (c.day === d && c.name !== skip && f <= c.to && c.from <= t) return true;
  }
  return false;
}
function pair(s, a, b) { return [need(s, w(a)), need(s, w(b))]; }
function byName(x, y) { return x.name < y.name ? -1 : x.name > y.name ? 1 : 0; }
function byFrom(x, y) { return (x.from - y.from) || byName(x, y); }
function clone(c) {
  return { name: c.name, teacher: c.teacher, loc: c.loc, day: c.day, from: c.from, to: c.to };
}
function put(s, list) {
  s.splice(0, s.length);
  for (var i = 0; i < list.length; i++) s.push(list[i]);
}
function without(s, drop) {
  var kept = [];
  for (var i = 0; i < s.length; i++) if (drop.indexOf(s[i]) < 0) kept.push(s[i]);
  var n = s.length - kept.length;
  if (n) put(s, kept);
  return n;
}
function pick(s, f) {
  var out = [];
  for (var i = 0; i < s.length; i++) if (f(s[i])) out.push(s[i]);
  return out;
}
function snap(s) { return s.map(clone); }
function add(s, c) { s.push(c); return 1; }
function fits(s, n) { if (s.length + n > CAP) fail('LIMIT'); }

var OPS = {};
function op(key, argc, run) { OPS[key] = { key: key, argc: argc, run: run }; }

// ---- base ops 1-15 -------------------------------------------------------

op('add', 6, function (s, a) {
  var name = w(a[0]), teacher = w(a[1]), loc = w(a[2]);
  var d = u(a[3], 1, 7), r = sp(a[4], a[5]);
  if (get(s, name)) fail('DUP');
  fits(s, 1);
  if (hits(s, d, r[0], r[1], null)) fail('CONFLICT');
  s.push({ name: name, teacher: teacher, loc: loc, day: d, from: r[0], to: r[1] });
  return 1;
});

op('del', 1, function (s, a) {
  var c = need(s, w(a[0]));
  s.splice(s.indexOf(c), 1);
  return 1;
});

op('edit', 3, function (s, a) {
  var c = need(s, w(a[0]));
  var t = w(a[1]), l = w(a[2]);
  c.teacher = t;
  c.loc = l;
  return 1;
});

op('move', 4, function (s, a) {
  var c = need(s, w(a[0]));
  var d = u(a[1], 1, 7), r = sp(a[2], a[3]);
  if (hits(s, d, r[0], r[1], c.name)) fail('CONFLICT');
  c.day = d;
  c.from = r[0];
  c.to = r[1];
  return 1;
});

op('swap', 2, function (s, a) {
  var p = pair(s, a[0], a[1]), x = p[0], y = p[1];
  var d = x.day, f = x.from, t = x.to;
  x.day = y.day; x.from = y.from; x.to = y.to;
  y.day = d; y.from = f; y.to = t;
  return 2;
});

op('rename', 2, function (s, a) {
  var c = need(s, w(a[0]));
  var nn = w(a[1]);
  if (nn !== c.name && get(s, nn)) fail('DUP');
  c.name = nn;
  return 1;
});

op('duplicate', 2, function (s, a) {
  var c = need(s, w(a[0]));
  var nn = w(a[1]);
  if (get(s, nn)) fail('DUP');
  fits(s, 1);
  s.push({ name: nn, teacher: c.teacher, loc: c.loc, day: c.day, from: c.from, to: c.to });
  return 1;
});

op('trim', 2, function (s, a) {
  var d = u(a[0], 1, 7), t = u(a[1], 1, 12), n = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (c.day === d && c.from <= t && t < c.to) { c.to = t; n++; }
  }
  return n;
});

op('clear', 1, function (s, a) {
  var d = u(a[0], 1, 7);
  return without(s, day(s, d));
});

op('shift', 2, function (s, a) {
  var d = u(a[0], 1, 7);
  if (!/^-?[0-9]+$/.test(a[1])) bad();
  var nd = d + (+a[1]);
  if (nd < 1 || nd > 7) bad();
  var l = day(s, d);
  for (var i = 0; i < l.length; i++) l[i].day = nd;
  return l.length;
});

op('copy', 2, function (s, a) {
  var c = need(s, w(a[0]));
  var d = u(a[1], 1, 7);
  var nn = c.name + '_2';
  if (get(s, nn)) fail('DUP');
  fits(s, 1);
  s.push({ name: nn, teacher: c.teacher, loc: c.loc, day: d, from: c.from, to: c.to });
  return 1;
});

op('merge', 2, function (s, a) {
  var p = pair(s, a[0], a[1]), x = p[0], y = p[1];
  x.teacher = y.teacher;
  x.loc = y.loc;
  s.splice(s.indexOf(y), 1);
  return 2;
});

op('sort', 0, function () { return 0; });

op('filter', 1, function (s, a) { return day(s, u(a[0], 1, 7)).length; });

op('count', 0, function (s) { return s.length; });

// ---- extension ops 16-30 -------------------------------------------------

op('swapTeacher', 2, function (s, a) {
  var p = pair(s, a[0], a[1]), x = p[0], y = p[1];
  var t = x.teacher;
  x.teacher = y.teacher;
  y.teacher = t;
  return 2;
});

op('swapLoc', 2, function (s, a) {
  var p = pair(s, a[0], a[1]), x = p[0], y = p[1];
  var t = x.loc;
  x.loc = y.loc;
  y.loc = t;
  return 2;
});

op('copyTo', 4, function (s, a) {
  var c = need(s, w(a[0]));
  var d = u(a[1], 1, 7), r = sp(a[2], a[3]);
  var nn = c.name + '_3';
  if (get(s, nn)) fail('DUP');
  fits(s, 1);
  if (hits(s, d, r[0], r[1], null)) fail('CONFLICT');
  s.push({ name: nn, teacher: c.teacher, loc: c.loc, day: d, from: r[0], to: r[1] });
  return 1;
});

op('truncate', 1, function (s, a) {
  var l = day(s, u(a[0], 1, 7)).sort(byName);
  return without(s, l.slice(1));
});

op('keep', 2, function (s, a) {
  var l = day(s, u(a[0], 1, 7)).sort(byName);
  return without(s, l.slice(q(a[1])));
});

op('renameTeacher', 2, function (s, a) {
  var t1 = w(a[0]), t2 = w(a[1]), n = 0;
  for (var i = 0; i < s.length; i++) if (s[i].teacher === t1) { s[i].teacher = t2; n++; }
  return n;
});

op('renameLoc', 2, function (s, a) {
  var l1 = w(a[0]), l2 = w(a[1]), n = 0;
  for (var i = 0; i < s.length; i++) if (s[i].loc === l1) { s[i].loc = l2; n++; }
  return n;
});

op('dedupe', 0, function (s) {
  var kept = [], n = 0;
  var l = s.slice().sort(byName);
  for (var i = 0; i < l.length; i++) {
    var c = l[i], dup = false;
    for (var j = 0; j < kept.length; j++) {
      var k = kept[j];
      if (k.teacher === c.teacher && k.loc === c.loc && k.day === c.day && k.from === c.from && k.to === c.to) {
        dup = true;
        break;
      }
    }
    if (dup) n++; else kept.push(c);
  }
  if (n) put(s, kept);
  return n;
});

function compressDay(s, d) {
  var l = day(s, d).sort(byFrom), n = 0;
  for (var i = 0; i < l.length; i++) {
    if (l[i].from !== i + 1 || l[i].to !== i + 2) {
      l[i].from = i + 1;
      l[i].to = i + 2;
      n++;
    }
  }
  return n;
}

op('compress', 1, function (s, a) { return compressDay(s, u(a[0], 1, 7)); });

op('compact', 0, function (s) {
  var n = 0;
  for (var d = 1; d <= 7; d++) n += compressDay(s, d);
  return n;
});

op('mirror', 2, function (s, a) {
  var d1 = u(a[0], 1, 7), d2 = u(a[1], 1, 7);
  var src = day(s, d1).sort(byName), items = [];
  for (var i = 0; i < src.length; i++) {
    var c = src[i];
    items.push({ name: c.name + '_m', teacher: c.teacher, loc: c.loc, day: d2, from: c.from, to: c.to });
  }
  for (var j = 0; j < items.length; j++) if (get(s, items[j].name)) fail('DUP');
  fits(s, items.length);
  put(s, s.concat(items));
  return items.length;
});

op('absorb', 2, function (s, a) {
  var p = pair(s, a[0], a[1]), x = p[0], y = p[1];
  x.teacher = y.teacher;
  x.loc = y.loc;
  return 2;
});

op('swapDays', 2, function (s, a) {
  var d1 = u(a[0], 1, 7), d2 = u(a[1], 1, 7);
  var n = day(s, d1).length + day(s, d2).length;
  var moved = s.map(function (c) {
    var d = c.day === d1 ? d2 : (c.day === d2 ? d1 : c.day);
    return { name: c.name, teacher: c.teacher, loc: c.loc, day: d, from: c.from, to: c.to };
  });
  for (var i = 0; i < moved.length; i++) {
    for (var j = i + 1; j < moved.length; j++) {
      var x = moved[i], y = moved[j];
      if (x.day === y.day && x.from <= y.to && y.from <= x.to) fail('CONFLICT');
    }
  }
  put(s, moved);
  return n;
});

op('promote', 1, function (s, a) {
  var c = need(s, w(a[0]));
  var len = c.to - c.from;
  for (var st = 1; st + len <= 12; st++) {
    if (!hits(s, c.day, st, st + len, c.name)) {
      c.from = st;
      c.to = st + len;
      return 1;
    }
  }
  fail('CONFLICT');
});

op('purge', 1, function (s, a) {
  var t = w(a[0]);
  return without(s, pick(s, function (c) { return c.teacher === t; }));
});

// ---- dispatcher ----------------------------------------------------------

function split(raw) {
  var text = String(raw).trim();
  if (text === '') bad();
  var parts = text.split(/\s+/);
  var dry = false;
  if (parts[0] === '--dry') {
    dry = true;
    parts.shift();
    if (!parts.length) bad();
  }
  return { dry: dry, parts: parts };
}

function step(raw) {
  var cmd = split(raw);
  var o = OPS[cmd.parts[0]];
  if (!o) bad();
  var args = cmd.parts.slice(1);
  if (args.length !== o.argc) bad();
  var work = cmd.dry ? snap(state) : state;
  return { verb: o.key, n: o.run(work, args) };
}

var state = [];
var lines = [];

for (var i = 0; i < process.argv.length - 2; i++) {
  var raw = process.argv[i + 2], line;
  try {
    var r = step(raw);
    line = 'ok ' + r.verb + ' ' + r.n;
  } catch (e) {
    line = 'err ' + (e && e.code ? e.code : 'BADARG');
  }
  lines.push(line);
}

lines.push('#state');
var order = state.slice().sort(byName);
for (var k = 0; k < order.length; k++) {
  var c = order[k];
  lines.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
}

var text = '';
for (var m = 0; m < lines.length; m++) text += lines[m] + '\n';
process.stdout.write(text);

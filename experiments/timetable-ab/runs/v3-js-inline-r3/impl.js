'use strict';

const cs = [];
const out = [];
const args = process.argv.slice(2);

for (let ai = 0; ai < args.length; ai++) {
  const raw = args[ai];
  const parts = raw.split(/[ \t\r\n]+/);
  const w = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== '') w.push(parts[i]);
  }
  if (w.length === 0) {
    out.push('err BADARG');
    continue;
  }
  const v = w[0];

  if (v === 'add') {
    if (w.length !== 7) {
      out.push('err BADARG');
      continue;
    }
    const nm = w[1];
    const tc = w[2];
    const lc = w[3];
    if (nm.length < 1 || nm.length > 12) {
      out.push('err BADARG');
      continue;
    }
    if (tc.length < 1 || tc.length > 12) {
      out.push('err BADARG');
      continue;
    }
    if (lc.length < 1 || lc.length > 12) {
      out.push('err BADARG');
      continue;
    }
    if (!/^\d+$/.test(w[4]) || !/^\d+$/.test(w[5]) || !/^\d+$/.test(w[6])) {
      out.push('err BADARG');
      continue;
    }
    const d = +w[4];
    const f = +w[5];
    const e = +w[6];
    if (d < 1 || d > 7) {
      out.push('err BADARG');
      continue;
    }
    if (f < 1 || f > 12 || e < 1 || e > 12 || e < f) {
      out.push('err BADARG');
      continue;
    }
    let dup = 0;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].name === nm) dup = 1;
    }
    if (dup) {
      out.push('err DUP');
      continue;
    }
    if (cs.length >= 20) {
      out.push('err LIMIT');
      continue;
    }
    let clash = 0;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.day === d && f <= c.to && c.from <= e) clash = 1;
    }
    if (clash) {
      out.push('err CONFLICT');
      continue;
    }
    cs.push({ name: nm, teacher: tc, loc: lc, day: d, from: f, to: e });
    out.push('ok add 1');
    continue;
  }

  if (v === 'del') {
    if (w.length !== 2) {
      out.push('err BADARG');
      continue;
    }
    let k = -1;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].name === w[1]) k = i;
    }
    if (k < 0) {
      out.push('err NOTFOUND');
      continue;
    }
    cs.splice(k, 1);
    out.push('ok del 1');
    continue;
  }

  if (v === 'edit') {
    if (w.length !== 4) {
      out.push('err BADARG');
      continue;
    }
    const tc = w[2];
    const lc = w[3];
    if (tc.length < 1 || tc.length > 12) {
      out.push('err BADARG');
      continue;
    }
    if (lc.length < 1 || lc.length > 12) {
      out.push('err BADARG');
      continue;
    }
    let k = -1;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].name === w[1]) k = i;
    }
    if (k < 0) {
      out.push('err NOTFOUND');
      continue;
    }
    cs[k].teacher = tc;
    cs[k].loc = lc;
    out.push('ok edit 1');
    continue;
  }

  if (v === 'move') {
    if (w.length !== 5) {
      out.push('err BADARG');
      continue;
    }
    if (!/^\d+$/.test(w[2]) || !/^\d+$/.test(w[3]) || !/^\d+$/.test(w[4])) {
      out.push('err BADARG');
      continue;
    }
    const d = +w[2];
    const f = +w[3];
    const e = +w[4];
    if (d < 1 || d > 7) {
      out.push('err BADARG');
      continue;
    }
    if (f < 1 || f > 12 || e < 1 || e > 12 || e < f) {
      out.push('err BADARG');
      continue;
    }
    let k = -1;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].name === w[1]) k = i;
    }
    if (k < 0) {
      out.push('err NOTFOUND');
      continue;
    }
    let clash = 0;
    for (let i = 0; i < cs.length; i++) {
      if (i === k) continue;
      const c = cs[i];
      if (c.day === d && f <= c.to && c.from <= e) clash = 1;
    }
    if (clash) {
      out.push('err CONFLICT');
      continue;
    }
    cs[k].day = d;
    cs[k].from = f;
    cs[k].to = e;
    out.push('ok move 1');
    continue;
  }

  if (v === 'swap') {
    if (w.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    let p = -1;
    let q = -1;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].name === w[1]) p = i;
    }
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].name === w[2]) q = i;
    }
    if (p < 0) {
      out.push('err NOTFOUND');
      continue;
    }
    if (q < 0) {
      out.push('err NOTFOUND');
      continue;
    }
    if (p !== q) {
      const a = cs[p];
      const b = cs[q];
      const d0 = a.day;
      const f0 = a.from;
      const e0 = a.to;
      a.day = b.day;
      a.from = b.from;
      a.to = b.to;
      b.day = d0;
      b.from = f0;
      b.to = e0;
    }
    out.push('ok swap 2');
    continue;
  }

  if (v === 'rename') {
    if (w.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    const nn = w[2];
    if (nn.length < 1 || nn.length > 12) {
      out.push('err BADARG');
      continue;
    }
    let k = -1;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].name === w[1]) k = i;
    }
    if (k < 0) {
      out.push('err NOTFOUND');
      continue;
    }
    let dup = 0;
    for (let i = 0; i < cs.length; i++) {
      if (i !== k && cs[i].name === nn) dup = 1;
    }
    if (dup) {
      out.push('err DUP');
      continue;
    }
    cs[k].name = nn;
    out.push('ok rename 1');
    continue;
  }

  if (v === 'duplicate') {
    if (w.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    const nn = w[2];
    if (nn.length < 1 || nn.length > 12) {
      out.push('err BADARG');
      continue;
    }
    let k = -1;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].name === w[1]) k = i;
    }
    if (k < 0) {
      out.push('err NOTFOUND');
      continue;
    }
    let dup = 0;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].name === nn) dup = 1;
    }
    if (dup) {
      out.push('err DUP');
      continue;
    }
    if (cs.length >= 20) {
      out.push('err LIMIT');
      continue;
    }
    const s = cs[k];
    cs.push({ name: nn, teacher: s.teacher, loc: s.loc, day: s.day, from: s.from, to: s.to });
    out.push('ok duplicate 1');
    continue;
  }

  if (v === 'trim') {
    if (w.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    if (!/^\d+$/.test(w[1]) || !/^\d+$/.test(w[2])) {
      out.push('err BADARG');
      continue;
    }
    const d = +w[1];
    const e = +w[2];
    if (d < 1 || d > 7) {
      out.push('err BADARG');
      continue;
    }
    if (e < 1 || e > 12) {
      out.push('err BADARG');
      continue;
    }
    let n = 0;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.day === d && c.from <= e && e < c.to) {
        c.to = e;
        n = n + 1;
      }
    }
    out.push('ok trim ' + n);
    continue;
  }

  if (v === 'clear') {
    if (w.length !== 2) {
      out.push('err BADARG');
      continue;
    }
    if (!/^\d+$/.test(w[1])) {
      out.push('err BADARG');
      continue;
    }
    const d = +w[1];
    if (d < 1 || d > 7) {
      out.push('err BADARG');
      continue;
    }
    let n = 0;
    const keep = [];
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].day === d) n = n + 1;
      else keep.push(cs[i]);
    }
    cs.length = 0;
    for (let i = 0; i < keep.length; i++) {
      cs.push(keep[i]);
    }
    out.push('ok clear ' + n);
    continue;
  }

  if (v === 'shift') {
    if (w.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    if (!/^\d+$/.test(w[1]) || !/^-?\d+$/.test(w[2])) {
      out.push('err BADARG');
      continue;
    }
    const d = +w[1];
    const delta = +w[2];
    if (d < 1 || d > 7) {
      out.push('err BADARG');
      continue;
    }
    let n = 0;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].day === d) n = n + 1;
    }
    if (n > 0 && (d + delta < 1 || d + delta > 7)) {
      out.push('err BADARG');
      continue;
    }
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].day === d) cs[i].day = d + delta;
    }
    out.push('ok shift ' + n);
    continue;
  }

  if (v === 'copy') {
    if (w.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    if (!/^\d+$/.test(w[2])) {
      out.push('err BADARG');
      continue;
    }
    const d = +w[2];
    if (d < 1 || d > 7) {
      out.push('err BADARG');
      continue;
    }
    let k = -1;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].name === w[1]) k = i;
    }
    if (k < 0) {
      out.push('err NOTFOUND');
      continue;
    }
    const nn = w[1] + '_2';
    let dup = 0;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].name === nn) dup = 1;
    }
    if (dup) {
      out.push('err DUP');
      continue;
    }
    if (cs.length >= 20) {
      out.push('err LIMIT');
      continue;
    }
    const s = cs[k];
    let clash = 0;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.day === d && s.from <= c.to && c.from <= s.to) clash = 1;
    }
    if (clash) {
      out.push('err CONFLICT');
      continue;
    }
    cs.push({ name: nn, teacher: s.teacher, loc: s.loc, day: d, from: s.from, to: s.to });
    out.push('ok copy 1');
    continue;
  }

  if (v === 'merge') {
    if (w.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    let p = -1;
    let q = -1;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].name === w[1]) p = i;
    }
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].name === w[2]) q = i;
    }
    if (p < 0) {
      out.push('err NOTFOUND');
      continue;
    }
    if (q < 0) {
      out.push('err NOTFOUND');
      continue;
    }
    if (p !== q) {
      const a = cs[p];
      const b = cs[q];
      if (b.teacher !== '-') a.teacher = b.teacher;
      if (b.loc !== '-') a.loc = b.loc;
      cs.splice(q, 1);
    }
    out.push('ok merge 2');
    continue;
  }

  if (v === 'sort') {
    if (w.length !== 1) {
      out.push('err BADARG');
      continue;
    }
    out.push('ok sort 0');
    continue;
  }

  if (v === 'filter') {
    if (w.length !== 2) {
      out.push('err BADARG');
      continue;
    }
    if (!/^\d+$/.test(w[1])) {
      out.push('err BADARG');
      continue;
    }
    const d = +w[1];
    if (d < 1 || d > 7) {
      out.push('err BADARG');
      continue;
    }
    let n = 0;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].day === d) n = n + 1;
    }
    out.push('ok filter ' + n);
    continue;
  }

  if (v === 'count') {
    if (w.length !== 1) {
      out.push('err BADARG');
      continue;
    }
    out.push('ok count ' + cs.length);
    continue;
  }

  out.push('err BADARG');
}

out.push('#state');

const ordered = cs.slice(0);
ordered.sort(function (a, b) {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
});

for (let i = 0; i < ordered.length; i++) {
  out.push(ordered[i].name + '|' + ordered[i].teacher + '|' + ordered[i].loc + '|' + ordered[i].day + '|' + ordered[i].from + '-' + ordered[i].to);
}

process.stdout.write(out.join('\n') + '\n');

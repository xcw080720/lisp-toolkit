'use strict';
const N = function (s) { return /^-?[0-9]+$/.test(s) ? parseInt(s, 10) : NaN; };
const W = function (s) { return /^[!-~]{1,12}$/.test(s); };
const T = [];
const O = [];
const CMD = process.argv.slice(2);
for (let i = 0; i < CMD.length; i++) {
  const raw = String(CMD[i]);
  if (raw.trim() === '') { O.push('err BADARG'); continue; }
  const a = raw.trim().split(/[ \t]+/);
  const v = a[0];

  if (v === 'add') {
    if (a.length !== 7) { O.push('err BADARG'); continue; }
    const nm = a[1], tc = a[2], lc = a[3];
    const d = N(a[4]), f = N(a[5]), t = N(a[6]);
    if (!W(nm) || !W(tc) || !W(lc) || !(d >= 1 && d <= 7) || !(f >= 1 && f <= 12) || !(t >= 1 && t <= 12) || !(t >= f)) { O.push('err BADARG'); continue; }
    let dup = false;
    for (let j = 0; j < T.length; j++) { if (T[j].name === nm) { dup = true; break; } }
    if (dup) { O.push('err DUP'); continue; }
    if (T.length >= 20) { O.push('err LIMIT'); continue; }
    let clash = false;
    for (let j = 0; j < T.length; j++) { if (T[j].day === d && f <= T[j].to && T[j].from <= t) { clash = true; break; } }
    if (clash) { O.push('err CONFLICT'); continue; }
    T.push({ name: nm, teacher: tc, loc: lc, day: d, from: f, to: t });
    O.push('ok add 1');
    continue;
  }

  if (v === 'del') {
    if (a.length !== 2) { O.push('err BADARG'); continue; }
    const nm = a[1];
    let k = -1;
    for (let j = 0; j < T.length; j++) { if (T[j].name === nm) { k = j; break; } }
    if (k < 0) { O.push('err NOTFOUND'); continue; }
    T.splice(k, 1);
    O.push('ok del 1');
    continue;
  }

  if (v === 'edit') {
    if (a.length !== 4) { O.push('err BADARG'); continue; }
    const nm = a[1], tc = a[2], lc = a[3];
    if (!W(tc) || !W(lc)) { O.push('err BADARG'); continue; }
    let k = -1;
    for (let j = 0; j < T.length; j++) { if (T[j].name === nm) { k = j; break; } }
    if (k < 0) { O.push('err NOTFOUND'); continue; }
    T[k].teacher = tc;
    T[k].loc = lc;
    O.push('ok edit 1');
    continue;
  }

  if (v === 'move') {
    if (a.length !== 5) { O.push('err BADARG'); continue; }
    const nm = a[1];
    const d = N(a[2]), f = N(a[3]), t = N(a[4]);
    if (!(d >= 1 && d <= 7) || !(f >= 1 && f <= 12) || !(t >= 1 && t <= 12) || !(t >= f)) { O.push('err BADARG'); continue; }
    let k = -1;
    for (let j = 0; j < T.length; j++) { if (T[j].name === nm) { k = j; break; } }
    if (k < 0) { O.push('err NOTFOUND'); continue; }
    let clash = false;
    for (let j = 0; j < T.length; j++) { if (j !== k && T[j].day === d && f <= T[j].to && T[j].from <= t) { clash = true; break; } }
    if (clash) { O.push('err CONFLICT'); continue; }
    T[k].day = d;
    T[k].from = f;
    T[k].to = t;
    O.push('ok move 1');
    continue;
  }

  if (v === 'swap') {
    if (a.length !== 3) { O.push('err BADARG'); continue; }
    const na = a[1], nb = a[2];
    let ka = -1, kb = -1;
    for (let j = 0; j < T.length; j++) { if (T[j].name === na) { ka = j; } if (T[j].name === nb) { kb = j; } }
    if (ka < 0 || kb < 0) { O.push('err NOTFOUND'); continue; }
    const sd = T[ka].day, sf = T[ka].from, st = T[ka].to;
    T[ka].day = T[kb].day;
    T[ka].from = T[kb].from;
    T[ka].to = T[kb].to;
    T[kb].day = sd;
    T[kb].from = sf;
    T[kb].to = st;
    O.push('ok swap 2');
    continue;
  }

  if (v === 'rename') {
    if (a.length !== 3) { O.push('err BADARG'); continue; }
    const o1 = a[1], n1 = a[2];
    if (!W(n1)) { O.push('err BADARG'); continue; }
    let k = -1;
    for (let j = 0; j < T.length; j++) { if (T[j].name === o1) { k = j; break; } }
    if (k < 0) { O.push('err NOTFOUND'); continue; }
    let dup = false;
    for (let j = 0; j < T.length; j++) { if (T[j].name === n1) { dup = true; break; } }
    if (dup) { O.push('err DUP'); continue; }
    T[k].name = n1;
    O.push('ok rename 1');
    continue;
  }

  if (v === 'duplicate') {
    if (a.length !== 3) { O.push('err BADARG'); continue; }
    const o1 = a[1], n1 = a[2];
    if (!W(n1)) { O.push('err BADARG'); continue; }
    let k = -1;
    for (let j = 0; j < T.length; j++) { if (T[j].name === o1) { k = j; break; } }
    if (k < 0) { O.push('err NOTFOUND'); continue; }
    let dup = false;
    for (let j = 0; j < T.length; j++) { if (T[j].name === n1) { dup = true; break; } }
    if (dup) { O.push('err DUP'); continue; }
    const src = T[k];
    T.push({ name: n1, teacher: src.teacher, loc: src.loc, day: src.day, from: src.from, to: src.to });
    O.push('ok duplicate 1');
    continue;
  }

  if (v === 'trim') {
    if (a.length !== 3) { O.push('err BADARG'); continue; }
    const d = N(a[1]), t = N(a[2]);
    if (!(d >= 1 && d <= 7) || !(t >= 1 && t <= 12)) { O.push('err BADARG'); continue; }
    let c = 0;
    for (let j = 0; j < T.length; j++) { if (T[j].day === d && T[j].from <= t && T[j].to > t) { T[j].to = t; c = c + 1; } }
    O.push('ok trim ' + c);
    continue;
  }

  if (v === 'clear') {
    if (a.length !== 2) { O.push('err BADARG'); continue; }
    const d = N(a[1]);
    if (!(d >= 1 && d <= 7)) { O.push('err BADARG'); continue; }
    let c = 0;
    for (let j = T.length - 1; j >= 0; j--) { if (T[j].day === d) { T.splice(j, 1); c = c + 1; } }
    O.push('ok clear ' + c);
    continue;
  }

  if (v === 'shift') {
    if (a.length !== 3) { O.push('err BADARG'); continue; }
    const d = N(a[1]), dl = N(a[2]);
    if (!(d >= 1 && d <= 7) || !(dl >= -6 && dl <= 6) || !(d + dl >= 1 && d + dl <= 7)) { O.push('err BADARG'); continue; }
    let c = 0;
    for (let j = 0; j < T.length; j++) { if (T[j].day === d) { T[j].day = d + dl; c = c + 1; } }
    O.push('ok shift ' + c);
    continue;
  }

  if (v === 'copy') {
    if (a.length !== 3) { O.push('err BADARG'); continue; }
    const nm = a[1], d = N(a[2]);
    if (!(d >= 1 && d <= 7)) { O.push('err BADARG'); continue; }
    let k = -1;
    for (let j = 0; j < T.length; j++) { if (T[j].name === nm) { k = j; break; } }
    if (k < 0) { O.push('err NOTFOUND'); continue; }
    const n1 = nm + '_2';
    let dup = false;
    for (let j = 0; j < T.length; j++) { if (T[j].name === n1) { dup = true; break; } }
    if (dup) { O.push('err DUP'); continue; }
    const src = T[k];
    T.push({ name: n1, teacher: src.teacher, loc: src.loc, day: d, from: src.from, to: src.to });
    O.push('ok copy 1');
    continue;
  }

  if (v === 'merge') {
    if (a.length !== 3) { O.push('err BADARG'); continue; }
    const na = a[1], nb = a[2];
    let ka = -1, kb = -1;
    for (let j = 0; j < T.length; j++) { if (T[j].name === na) { ka = j; } if (T[j].name === nb) { kb = j; } }
    if (ka < 0 || kb < 0) { O.push('err NOTFOUND'); continue; }
    T[ka].teacher = T[kb].teacher;
    T[ka].loc = T[kb].loc;
    T.splice(kb, 1);
    O.push('ok merge 2');
    continue;
  }

  if (v === 'sort') {
    if (a.length !== 1) { O.push('err BADARG'); continue; }
    O.push('ok sort 0');
    continue;
  }

  if (v === 'filter') {
    if (a.length !== 2) { O.push('err BADARG'); continue; }
    const d = N(a[1]);
    if (!(d >= 1 && d <= 7)) { O.push('err BADARG'); continue; }
    let c = 0;
    for (let j = 0; j < T.length; j++) { if (T[j].day === d) { c = c + 1; } }
    O.push('ok filter ' + c);
    continue;
  }

  if (v === 'count') {
    if (a.length !== 1) { O.push('err BADARG'); continue; }
    O.push('ok count ' + T.length);
    continue;
  }

  O.push('err BADARG');
}
const S = T.slice().sort(function (x, y) { if (x.name < y.name) { return -1; } if (x.name > y.name) { return 1; } return 0; });
O.push('#state');
for (let k = 0; k < S.length; k++) {
  O.push(S[k].name + '|' + S[k].teacher + '|' + S[k].loc + '|' + S[k].day + '|' + S[k].from + '-' + S[k].to);
}
process.stdout.write(O.join('\n') + '\n');

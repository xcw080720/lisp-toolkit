// ref-js-30.js — check-v3 的 30-op 参考实现（用于证明 51 条判据能绿）
// 严格按 tasks/v3.spec.md（op 1–15）+ tasks/v3-increment.spec.md（op 16–30）
// 纯文本、无 I/O、无 JSON
'use strict';

const LIMIT = 20;
let db = [];            // [{name,teacher,loc,day,from,to}]
const byName = (n) => db.find((c) => c.name === n);
const overlap = (a, b) => !(a.to < b.from || b.to < a.from); // 端点相接算冲突
const bad = (code) => { console.log('err ' + code); };

// 解析一条命令
const parse = (s) => s.trim().split(/\s+/).filter((x) => x !== '');

function conflict(day, from, to, except) {
  return db.some((c) => c !== except && c.day === day && overlap({ from, to }, c));
}

// —— 增量规格用的小工具 ——
const lex = (x, y) => (x < y ? -1 : x > y ? 1 : 0);          // 字典序（逐字节等价）
const dayOK = (d) => d >= 1 && d <= 7;
const spanOK = (f, t) => f >= 1 && f <= 12 && t >= 1 && t <= 12 && t >= f;
const byNameOn = (list) => [...list].sort((x, y) => lex(x.name, y.name));
const clashIn = (list) => list.some((c, i) => list.some((d, j) => j > i && overlap(c, d)));

// op 24 / 25 共用的按天压缩：该天按原 from 升序重排为 (k, k+1)
function compressDay(day) {
  const hit = [...db.filter((c) => c.day === day)]
    .sort((x, y) => (x.from - y.from) || lex(x.name, y.name));
  let n = 0;
  for (let i = 0; i < hit.length; i++) {
    const f = i + 1, t = i + 2;
    if (hit[i].from !== f || hit[i].to !== t) { hit[i].from = f; hit[i].to = t; n++; }
  }
  return n;
}

function exec(tok) {
  const cmd = tok[0];
  switch (cmd) {
    case 'add': {
      if (tok.length !== 7) return bad('BADARG');
      const [, name, teacher, loc, d, f, t] = tok;
      const day = +d, from = +f, to = +t;
      if (!(day >= 1 && day <= 7 && from >= 1 && from <= 12 && to >= 1 && to <= 12 && to >= from)) return bad('BADARG');
      if (byName(name)) return bad('DUP');
      if (db.length >= LIMIT) return bad('LIMIT');
      if (conflict(day, from, to, null)) return bad('CONFLICT');
      db.push({ name, teacher, loc, day, from, to });
      return console.log('ok add 1');
    }
    case 'del': {
      if (tok.length !== 2) return bad('BADARG');
      const i = db.findIndex((c) => c.name === tok[1]);
      if (i < 0) return bad('NOTFOUND');
      db.splice(i, 1);
      return console.log('ok del 1');
    }
    case 'edit': {
      if (tok.length !== 4) return bad('BADARG');
      const c = byName(tok[1]);
      if (!c) return bad('NOTFOUND');
      c.teacher = tok[2]; c.loc = tok[3];
      return console.log('ok edit 1');
    }
    case 'move': {
      if (tok.length !== 5) return bad('BADARG');
      const c = byName(tok[1]);
      if (!c) return bad('NOTFOUND');
      const day = +tok[2], from = +tok[3], to = +tok[4];
      if (!(day >= 1 && day <= 7 && from >= 1 && from <= 12 && to >= 1 && to <= 12 && to >= from)) return bad('BADARG');
      if (conflict(day, from, to, c)) return bad('CONFLICT');
      c.day = day; c.from = from; c.to = to;
      return console.log('ok move 1');
    }
    case 'swap': {
      if (tok.length !== 3) return bad('BADARG');
      const a = byName(tok[1]), b = byName(tok[2]);
      if (!a || !b) return bad('NOTFOUND');
      const [ad, af, at] = [a.day, a.from, a.to];
      a.day = b.day; a.from = b.from; a.to = b.to;
      b.day = ad; b.from = af; b.to = at;
      return console.log('ok swap 2');
    }
    case 'rename': {
      if (tok.length !== 3) return bad('BADARG');
      const c = byName(tok[1]);
      if (!c) return bad('NOTFOUND');
      if (byName(tok[2])) return bad('DUP');
      c.name = tok[2];
      return console.log('ok rename 1');
    }
    case 'duplicate': {
      if (tok.length !== 3) return bad('BADARG');
      const c = byName(tok[1]);
      if (!c) return bad('NOTFOUND');
      if (byName(tok[2])) return bad('DUP');
      if (db.length >= LIMIT) return bad('LIMIT');
      db.push({ ...c, name: tok[2] });
      return console.log('ok duplicate 1');
    }
    case 'trim': {
      if (tok.length !== 3) return bad('BADARG');
      const day = +tok[1], cap = +tok[2];
      if (!(day >= 1 && day <= 7 && cap >= 1 && cap <= 12)) return bad('BADARG');
      let n = 0;
      for (const c of db) if (c.day === day && c.from <= cap && c.to > cap) { c.to = cap; n++; }
      return console.log('ok trim ' + n);
    }
    case 'clear': {
      if (tok.length !== 2) return bad('BADARG');
      const day = +tok[1];
      if (!(day >= 1 && day <= 7)) return bad('BADARG');
      const n = db.filter((c) => c.day === day).length;
      db = db.filter((c) => c.day !== day);
      return console.log('ok clear ' + n);
    }
    case 'shift': {
      if (tok.length !== 3) return bad('BADARG');
      const day = +tok[1], delta = +tok[2];
      if (!(day >= 1 && day <= 7)) return bad('BADARG');
      const hit = db.filter((c) => c.day === day);
      if (hit.some((c) => c.day + delta < 1 || c.day + delta > 7)) return bad('BADARG');
      for (const c of hit) c.day += delta;
      return console.log('ok shift ' + hit.length);
    }
    case 'copy': {
      if (tok.length !== 3) return bad('BADARG');
      const c = byName(tok[1]);
      if (!c) return bad('NOTFOUND');
      const day = +tok[2];
      if (!(day >= 1 && day <= 7)) return bad('BADARG');
      if (db.length >= LIMIT) return bad('LIMIT');
      db.push({ ...c, name: c.name + '_2', day });
      return console.log('ok copy 1');
    }
    case 'merge': {
      if (tok.length !== 3) return bad('BADARG');
      const a = byName(tok[1]), b = byName(tok[2]);
      if (!a || !b) return bad('NOTFOUND');
      a.teacher = b.teacher; a.loc = b.loc;
      db = db.filter((c) => c !== b);
      return console.log('ok merge 2');
    }
    case 'sort': {
      if (tok.length !== 1) return bad('BADARG');
      return console.log('ok sort 0');
    }
    case 'filter': {
      if (tok.length !== 2) return bad('BADARG');
      const day = +tok[1];
      if (!(day >= 1 && day <= 7)) return bad('BADARG');
      return console.log('ok filter ' + db.filter((c) => c.day === day).length);
    }
    case 'count': {
      if (tok.length !== 1) return bad('BADARG');
      return console.log('ok count ' + db.length);
    }

    // ===== 增量规格 op 16–30 =====
    case 'swapTeacher': {
      if (tok.length !== 3) return bad('BADARG');
      const a = byName(tok[1]), b = byName(tok[2]);
      if (!a || !b) return bad('NOTFOUND');
      const t = a.teacher; a.teacher = b.teacher; b.teacher = t;
      return console.log('ok swapTeacher 2');
    }
    case 'swapLoc': {
      if (tok.length !== 3) return bad('BADARG');
      const a = byName(tok[1]), b = byName(tok[2]);
      if (!a || !b) return bad('NOTFOUND');
      const l = a.loc; a.loc = b.loc; b.loc = l;
      return console.log('ok swapLoc 2');
    }
    case 'copyTo': {
      if (tok.length !== 5) return bad('BADARG');
      const c = byName(tok[1]);
      if (!c) return bad('NOTFOUND');
      const day = +tok[2], from = +tok[3], to = +tok[4];
      if (!(dayOK(day) && spanOK(from, to))) return bad('BADARG');
      if (byName(c.name + '_3')) return bad('DUP');
      if (db.length >= LIMIT) return bad('LIMIT');
      if (conflict(day, from, to, null)) return bad('CONFLICT');
      db.push({ name: c.name + '_3', teacher: c.teacher, loc: c.loc, day, from, to });
      return console.log('ok copyTo 1');
    }
    case 'truncate': {
      if (tok.length !== 2) return bad('BADARG');
      const day = +tok[1];
      if (!dayOK(day)) return bad('BADARG');
      const keepOne = byNameOn(db.filter((c) => c.day === day))[0];
      const drop = new Set(db.filter((c) => c.day === day && c !== keepOne));
      db = db.filter((c) => !drop.has(c));
      return console.log('ok truncate ' + drop.size);
    }
    case 'keep': {
      if (tok.length !== 3) return bad('BADARG');
      const day = +tok[1], n = +tok[2];
      if (!(dayOK(day) && n >= 0)) return bad('BADARG');
      const hit = byNameOn(db.filter((c) => c.day === day));
      const drop = new Set(hit.slice(n));
      db = db.filter((c) => !drop.has(c));
      return console.log('ok keep ' + drop.size);
    }
    case 'renameTeacher': {
      if (tok.length !== 3) return bad('BADARG');
      let n = 0;
      for (const c of db) if (c.teacher === tok[1]) { c.teacher = tok[2]; n++; }
      return console.log('ok renameTeacher ' + n);
    }
    case 'renameLoc': {
      if (tok.length !== 3) return bad('BADARG');
      let n = 0;
      for (const c of db) if (c.loc === tok[1]) { c.loc = tok[2]; n++; }
      return console.log('ok renameLoc ' + n);
    }
    case 'dedupe': {
      if (tok.length !== 1) return bad('BADARG');
      const groups = new Map();
      for (const c of db) {
        const k = [c.teacher, c.loc, c.day, c.from, c.to].join('\u0001');
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(c);
      }
      const drop = new Set();
      for (const arr of groups.values()) {
        for (const c of byNameOn(arr).slice(1)) drop.add(c); // 留字典序最小
      }
      db = db.filter((c) => !drop.has(c));
      return console.log('ok dedupe ' + drop.size);
    }
    case 'compress': {
      if (tok.length !== 2) return bad('BADARG');
      const day = +tok[1];
      if (!dayOK(day)) return bad('BADARG');
      return console.log('ok compress ' + compressDay(day));
    }
    case 'compact': {
      if (tok.length !== 1) return bad('BADARG');
      let n = 0;
      for (let d = 1; d <= 7; d++) n += compressDay(d);
      return console.log('ok compact ' + n);
    }
    case 'mirror': {
      if (tok.length !== 3) return bad('BADARG');
      const day = +tok[1], day2 = +tok[2];
      if (!(dayOK(day) && dayOK(day2))) return bad('BADARG');
      const src = db.filter((c) => c.day === day);
      const names = src.map((c) => c.name + '_m');
      for (const nn of names) if (byName(nn)) return bad('DUP');
      for (let i = 0; i < names.length; i++) {
        for (let j = 0; j < i; j++) if (names[i] === names[j]) return bad('DUP');
      }
      if (db.length + src.length > LIMIT) return bad('LIMIT');
      for (let i = 0; i < src.length; i++) {
        db.push({ name: names[i], teacher: src[i].teacher, loc: src[i].loc,
          day: day2, from: src[i].from, to: src[i].to });
      }
      return console.log('ok mirror ' + src.length);
    }
    case 'absorb': {
      if (tok.length !== 3) return bad('BADARG');
      const a = byName(tok[1]), b = byName(tok[2]);
      if (!a || !b) return bad('NOTFOUND');
      a.teacher = b.teacher; a.loc = b.loc;   // 保留 b
      return console.log('ok absorb 2');
    }
    case 'swapDays': {
      if (tok.length !== 3) return bad('BADARG');
      const d1 = +tok[1], d2 = +tok[2];
      if (!(dayOK(d1) && dayOK(d2))) return bad('BADARG');
      const A = db.filter((c) => c.day === d1);
      const B = db.filter((c) => c.day === d2);
      if (clashIn(A) || clashIn(B)) return bad('CONFLICT'); // 不部分生效
      for (const c of A) c.day = d2;
      for (const c of B) c.day = d1;
      return console.log('ok swapDays ' + (A.length + B.length));
    }
    case 'promote': {
      if (tok.length !== 2) return bad('BADARG');
      const c = byName(tok[1]);
      if (!c) return bad('NOTFOUND');
      const len = c.to - c.from + 1;
      for (let f = 1; f + len - 1 <= 12; f++) {
        const t = f + len - 1;
        if (!conflict(c.day, f, t, c)) { c.from = f; c.to = t; return console.log('ok promote 1'); }
      }
      return bad('CONFLICT');
    }
    case 'purge': {
      if (tok.length !== 2) return bad('BADARG');
      const n = db.filter((c) => c.teacher === tok[1]).length;
      db = db.filter((c) => c.teacher !== tok[1]);
      return console.log('ok purge ' + n);
    }

    default:
      return bad('BADARG');
  }
}

const cmds = process.argv.slice(2);
for (const raw of cmds) {
  const tok = parse(raw);
  if (!tok.length) { bad('BADARG'); continue; }
  exec(tok);
}
console.log('#state');
for (const c of [...db].sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))) {
  console.log(`${c.name}|${c.teacher}|${c.loc}|${c.day}|${c.from}-${c.to}`);
}

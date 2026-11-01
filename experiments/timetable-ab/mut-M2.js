// ref-js.js — check-v3 的参考实现（用于证明判据能绿）
// 严格按 tasks/v3.spec.md：纯文本、无 I/O、无 JSON
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
      for (const c of db) if (c.day === day && c.to > cap) { c.to = Math.max(c.from, cap); n++; }
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

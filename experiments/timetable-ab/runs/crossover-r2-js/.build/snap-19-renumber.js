'use strict';
// impl.js — 第二轮（会议室预订领域，同样 30 op）
// 契约：{courses, ops} → {opsText, courses, log, n}；一 op 一条 REG 登记。
const fs = require('fs');

const defaultWeeks = () => ({ type: 'range', from: 1, to: 16 });
const str = (v) => (v == null ? '' : String(v));
const day = (v) => Math.min(7, Math.max(1, Math.trunc(Number(v)) || 1));
const per = (v) => Math.max(1, Math.trunc(Number(v)) || 1);
const integer = (v) => Math.trunc(Number(v)) || 0;
const weeks = (v) => (v && v.type ? v : defaultWeeks());
const tag = (v) => (v == null || v === '' ? null : String(v));

function loadCourse(c) {
  return {
    name: str(c.name), teacher: str(c.teacher), location: str(c.location),
    day: Number.isFinite(Number(c.day)) ? Number(c.day) : 1,
    periodFrom: Number.isFinite(Number(c.periodFrom)) ? Number(c.periodFrom) : 1,
    periodTo: Number.isFinite(Number(c.periodTo)) ? Number(c.periodTo) : 1,
    weeks: c.weeks || defaultWeeks(), tag: tag(c.tag), note: str(c.note),
  };
}
const COERCE = { day, period: per, int: integer, str, weeks, tag, course: (v) => loadCourse(v || {}) };
const hit = (list, m) => list.filter((c) => c.name.includes(str(m)));
const clone = (c) => JSON.parse(JSON.stringify(c));
const wk = (c) => c.weeks || defaultWeeks();
const setWk = (c, from, to) => { c.weeks = { type: 'range', from, to }; };
function spliceIn(list, keep) {
  const n = list.length - keep.length;
  list.length = 0; list.push(...keep); return n;
}

const REG = {};

//@@ OP setDay A
REG.setDay = {
  need: ['match', 'day'], fields: { day: 'day' },
  run(s, op, p) { const t = hit(s, op.match); for (const c of t) c.day = p.day; return t.length; },
  say(n) { return `setDay：${n} 场改天`; },
};

//@@ OP setPeriodFrom A
REG.setPeriodFrom = {
  need: ['match', 'from'], fields: { from: 'period' },
  run(s, op, p) {
    const t = hit(s, op.match);
    for (const c of t) { c.periodFrom = p.from; c.periodTo = Math.max(p.from, c.periodTo); }
    return t.length;
  },
  say(n) { return `setPeriodFrom：${n} 场从第${n}节起`; },
};

//@@ OP setPeriodTo A
REG.setPeriodTo = {
  need: ['match', 'to'], fields: { to: 'period' },
  run(s, op, p) { const t = hit(s, op.match); for (const c of t) c.periodTo = Math.max(c.periodFrom, p.to); return t.length; },
  say(n) { return `setPeriodTo：${n} 场`; },
};

//@@ OP setTeacher A
REG.setTeacher = {
  need: ['match', 'teacher'], fields: { teacher: 'str' },
  run(s, op, p) { const t = hit(s, op.match); for (const c of t) c.teacher = p.teacher; return t.length; },
  say(n) { return `setTeacher：${n} 场负责人改为「${n}」`; },
};

//@@ OP setLocation A
REG.setLocation = {
  need: ['match', 'location'], fields: { location: 'str' },
  run(s, op, p) { const t = hit(s, op.match); for (const c of t) c.location = p.location; return t.length; },
  say(n) { return `setLocation：${n} 场改会议室`; },
};

//@@ OP setNote A
REG.setNote = {
  need: ['match', 'note'], fields: { note: 'str' },
  run(s, op, p) { const t = hit(s, op.match); for (const c of t) c.note = p.note; return t.length; },
  say(n) { return `setNote：${n} 场加备注`; },
};

//@@ OP setWeeks A
REG.setWeeks = {
  need: ['match', 'weeks'], fields: { weeks: 'weeks' },
  run(s, op, p) {
    const t = hit(s, op.match);
    for (const c of t) c.weeks = { type: 'range', from: p.weeks.from, to: p.weeks.to };
    return t.length;
  },
  say(n) { return `setWeeks：${n} 场设周次`; },
};

//@@ OP clearNote A
REG.clearNote = {
  need: ['match'],
  run(s, op) { const t = hit(s, op.match); for (const c of t) c.note = ''; return t.length; },
  say(n) { return `clearNote：${n} 场清备注`; },
};

//@@ OP bumpDay A
REG.bumpDay = {
  need: ['match', 'delta'], fields: { delta: 'int' },
  run(s, op, p) { const t = hit(s, op.match); for (const c of t) c.day = day(c.day + p.delta); return t.length; },
  say(n) { return `bumpDay：${n} 场`; },
};

//@@ OP bumpPeriod A
REG.bumpPeriod = {
  need: ['match', 'delta'], fields: { delta: 'int' },
  run(s, op, p) {
    const t = hit(s, op.match);
    for (const c of t) {
      const f = Math.max(1, c.periodFrom + p.delta);
      c.periodFrom = f; c.periodTo = Math.max(f, c.periodTo + p.delta);
    }
    return t.length;
  },
  say(n) { return `bumpPeriod：${n} 场`; },
};

//@@ OP moveDay B
REG.moveDay = {
  need: ['match', 'day'], fields: { day: 'day' },
  run(s, op, p) {
    const t = hit(s, op.match);
    for (const c of t) {
      const d = p.day - c.day;
      c.day = p.day;
      const f = Math.max(1, c.periodFrom + d);
      c.periodFrom = f; c.periodTo = Math.max(f, c.periodTo + d);
    }
    return t.length;
  },
  say(n) { return `moveDay：${n} 场`; },
};

//@@ OP swapTeacher B
REG.swapTeacher = {
  need: ['match', 'with'],
  run(s, op) {
    const a = hit(s, op.match), b = hit(s, op.with);
    if (a.length !== 1 || b.length !== 1 || a[0] === b[0]) return 0;
    [a[0].teacher, b[0].teacher] = [b[0].teacher, a[0].teacher];
    return 2;
  },
  say(n) { return `swapTeacher：${n} 场互换负责人`; },
};

//@@ OP copyWeeks B
REG.copyWeeks = {
  need: ['match', 'with'],
  run(s, op) {
    const a = hit(s, op.match), b = hit(s, op.with);
    if (a.length !== 1 || b.length !== 1 || a[0] === b[0]) return 0;
    b[0].weeks = clone(wk(a[0]));
    return 1;
  },
  say(n) { return 'copyWeeks：周次已抄' ; },
};

//@@ OP mergeCourses B
REG.mergeCourses = {
  run(s) {
    const groups = new Map();
    for (const c of s) { if (!groups.has(c.name)) groups.set(c.name, []); groups.get(c.name).push(c); }
    let removed = 0; const keep = [];
    for (const [, g] of groups) {
      if (g.length > 1) {
        const rs = g.map(wk);
        if (rs.every((w) => w && w.type === 'range')) setWk(g[0], Math.min(...rs.map((w) => w.from)), Math.max(...rs.map((w) => w.to)));
        removed += g.length - 1;
      }
      keep.push(g[0]);
    }
    spliceIn(s, keep);
    return removed;
  },
  say(n) { return `mergeCourses：并掉 ${n} 场`; },
};

//@@ OP splitCourse B
REG.splitCourse = {
  need: ['match'],
  run(s, op) {
    const h = hit(s, op.match);
    if (h.length !== 1 || h[0].periodTo <= h[0].periodFrom) return 0;
    const c = h[0];
    const mid = Math.floor((c.periodFrom + c.periodTo) / 2);
    const x = clone(c);
    x.periodFrom = mid + 1; x.periodTo = c.periodTo; c.periodTo = mid;
    s.push(x);
    return 1;
  },
  say(n) { return 'splitCourse：拆两场'; },
};

//@@ OP rotateDay B
REG.rotateDay = {
  run(s) { for (const c of s) c.day = (c.day % 7) + 1; return s.length; },
  say(n) { return `rotateDay：${n} 场环移`; },
};

//@@ OP trimWeeks B
REG.trimWeeks = {
  need: ['match', 'from', 'to'], fields: { from: 'period', to: 'period' },
  run(s, op, p) {
    let n = 0;
    for (const c of hit(s, op.match)) {
      const w = wk(c);
      const a = Math.max(w.from, Math.min(p.from, p.to));
      const b = Math.min(w.to, Math.max(p.from, p.to));
      if (a > b) continue;
      setWk(c, a, b); n++;
    }
    return n;
  },
  say(n) { return `trimWeeks：${n} 场收窄`; },
};

//@@ OP padWeeks B
REG.padWeeks = {
  need: ['match', 'to'], fields: { to: 'period' },
  run(s, op, p) {
    const t = hit(s, op.match);
    for (const c of t) { const w = wk(c); setWk(c, w.from, Math.max(w.to, p.to)); }
    return t.length;
  },
  say(n) { return `padWeeks：${n} 场补齐`; },
};

//@@ OP renumber B
REG.renumber = {
  run(s) {
    let changed = 0;
    for (let d = 1; d <= 7; d++) {
      const cs = s.filter((c) => c.day === d).sort((a, b) => a.periodFrom - b.periodFrom);
      let cur = 1;
      for (const c of cs) {
        const span = c.periodTo - c.periodFrom;
        if (c.periodFrom !== cur) changed++;
        c.periodFrom = cur; c.periodTo = cur + span; cur = c.periodTo + 1;
      }
    }
    return changed;
  },
  say(n) { return `renumber：${n} 场节次变动`; },
};

/* ---------- 5. 执行器 ---------- */
function runOp(state, op) {
  const d = REG[op.op];
  const p = {};
  for (const [k, kind] of Object.entries(d.fields || {})) p[k] = COERCE[kind](op[k]);
  const miss = (d.need || []).filter((k) => op[k] === undefined || op[k] === null);
  if (miss.length) return { n: 0, text: `${op.op}：参数不全（缺 ${miss.join('、')}），不执行` };
  return { n: d.run(state, op, p) || 0, text: d.say(0, op, p) };
}

const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const orig = Array.isArray(input.courses) ? input.courses : [];
const ops = Array.isArray(input.ops) ? input.ops : [];
const bad = ops.find((o) => !o || typeof o.op !== 'string' || !Object.prototype.hasOwnProperty.call(REG, o.op));

let out;
if (bad) out = { opsText: '', courses: orig, log: [`1) 拒绝：未知 op ${bad && bad.op}`], n: 0 };
else if (!ops.length) out = { opsText: '', courses: orig, log: [], n: 0 };
else {
  const state = JSON.parse(JSON.stringify(orig)).map(loadCourse);
  const log = []; let n = 0;
  for (const op of ops) {
    const d = REG[op.op];
    const p = {};
    for (const [k, kind] of Object.entries(d.fields || {})) p[k] = COERCE[kind](op[k]);
    const miss = (d.need || []).filter((k) => op[k] === undefined || op[k] === null);
    if (miss.length) { log.push(`${log.length + 1}) ${op.op}：参数不全，不执行`); continue; }
    const cnt = d.run(state, op, p) || 0;
    n += cnt;
    log.push(`${log.length + 1}) ${d.say(cnt, op, p)}`);
  }
  out = { opsText: JSON.stringify(ops), courses: state, log, n, available: Object.keys(REG) };
}
process.stdout.write(JSON.stringify(out));

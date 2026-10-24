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

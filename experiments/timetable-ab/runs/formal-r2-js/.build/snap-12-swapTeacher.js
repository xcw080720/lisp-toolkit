'use strict';
// 会议室预订 · 30 op 执行器（JS 表驱动：一 op 一条 REG 登记）
// 契约：入 {courses, ops} → 出 {opsText, courses, log, n}
// name=会议名 teacher=负责人 location=会议室；day 夹 1..7；日志 k) 编号；未知 op 整批拒绝
const fs = require('fs');

/* ---------- 1. 登记表 ---------- */
const OPS = Object.create(null);
const REG = (name, group, req, fn) => { OPS[name] = { name, group, req, fn }; };

/* ---------- 2. 基础设施 ---------- */
const num = (v, d) => (Number.isFinite(+v) ? Math.round(+v) : d);
const pad = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const DAY = (v) => pad(num(v, 1), 1, 7);
const PER = (v, lo) => pad(num(v, 1), lo === undefined ? 1 : lo, 12);
const RANGE = (f, t) => ({ type: 'range', from: f, to: t });
const wk = (w) => {
  if (!w || typeof w !== 'object' || w.type !== 'range') return RANGE(1, 16);
  const f = num(w.from, 1), t = num(w.to, 16);
  return RANGE(Math.min(f, t), Math.max(f, t));
};
const clone = (v) => JSON.parse(JSON.stringify(v));
const set = (c, k, v) => (JSON.stringify(c[k]) === JSON.stringify(v) ? 0 : ((c[k] = v), 1));
const mut = (cs, m, f) => { let n = 0; for (const c of cs) if (!m || c.name === m) n += Number(f(c)) || 0; return n; };
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1
  : (num(a.day) - num(b.day)) || (num(a.periodFrom) - num(b.periodFrom)));

/* ---------- 3. A 组：纯横切（改一个标量字段）---------- */
//@@ OP setDay A
REG('setDay', 'A', ['day'], (cs, o) => mut(cs, o.match, (c) => set(c, 'day', DAY(o.day))));
//@@ OP setPeriodFrom A
REG('setPeriodFrom', 'A', ['from'], (cs, o) => mut(cs, o.match, (c) => {
  const f = PER(o.from), t = Math.max(PER(c.periodTo), f);
  return set(c, 'periodFrom', f) | set(c, 'periodTo', t);
}));
//@@ OP setPeriodTo A
REG('setPeriodTo', 'A', ['to'], (cs, o) => mut(cs, o.match, (c) =>
  set(c, 'periodTo', PER(Math.max(num(o.to, 1), num(c.periodFrom, 1)), num(c.periodFrom, 1)))));
//@@ OP setTeacher A
REG('setTeacher', 'A', ['teacher'], (cs, o) => mut(cs, o.match, (c) => set(c, 'teacher', String(o.teacher))));
//@@ OP setLocation A
REG('setLocation', 'A', ['location'], (cs, o) => mut(cs, o.match, (c) => set(c, 'location', String(o.location))));
//@@ OP setNote A
REG('setNote', 'A', ['note'], (cs, o) => mut(cs, o.match, (c) => set(c, 'note', String(o.note))));
//@@ OP setWeeks A
REG('setWeeks', 'A', ['weeks'], (cs, o) => mut(cs, o.match, (c) => set(c, 'weeks', wk(o.weeks))));
//@@ OP clearNote A
REG('clearNote', 'A', [], (cs, o) => mut(cs, o.match, (c) => set(c, 'note', '')));
//@@ OP bumpDay A
REG('bumpDay', 'A', ['delta'], (cs, o) => mut(cs, o.match, (c) => set(c, 'day', DAY(num(c.day, 1) + num(o.delta, 0)))));
//@@ OP bumpPeriod A
REG('bumpPeriod', 'A', ['delta'], (cs, o) => mut(cs, o.match, (c) => {
  const d = num(o.delta, 0), f = PER(num(c.periodFrom, 1) + d), t = PER(num(c.periodTo, 1) + d, f);
  return set(c, 'periodFrom', f) | set(c, 'periodTo', t);
}));
/* ---------- 4. B 组：复合（对命中集合做两步）---------- */
//@@ OP moveDay B
REG('moveDay', 'B', ['day'], (cs, o) => mut(cs, o.match, (c) => {
  const d = DAY(o.day) - num(c.day, 1), f = PER(num(c.periodFrom, 1) + d), t = PER(num(c.periodTo, 1) + d, f);
  return set(c, 'day', DAY(o.day)) | set(c, 'periodFrom', f) | set(c, 'periodTo', t);
}));
//@@ OP swapTeacher B
REG('swapTeacher', 'B', ['with'], (cs, o) => {
  const a = cs.find((c) => c.name === o.match), b = cs.find((c) => c.name === o.with);
  if (!a || !b || a === b) return 0;
  const t = a.teacher;
  return set(a, 'teacher', b.teacher) + set(b, 'teacher', t);
});
/* ---------- 5. 执行器 ---------- */
const main = () => {
  const file = process.argv[2];
  const raw = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');
  const out = { opsText: '', courses: [], log: [], n: 0 };
  let input;
  try { input = JSON.parse(raw); }
  catch (e) { out.log.push('1) 输入不是 JSON，整批拒绝'); return out; }
  const ops = Array.isArray(input && input.ops) ? input.ops : [];
  const cs = Array.isArray(input && input.courses) ? clone(input.courses) : [];
  out.opsText = JSON.stringify(ops);
  const say = (m) => out.log.push(`${out.log.length + 1}) ${m}`);
  const unknown = ops.find((o) => !o || typeof o.op !== 'string' || !OPS[o.op]);
  if (unknown) { say(`未知 op：${unknown && unknown.op}，整批拒绝`); return out; }
  for (const o of ops) {
    const rec = OPS[o.op];
    const miss = rec.req.filter((k) => o[k] === undefined || o[k] === null || o[k] === '');
    if (miss.length) { say(`跳过 ${o.op}：缺字段 ${miss.join(',')}`); continue; }
    try { out.n += Number(rec.fn(cs, o, say)) || 0; }
    catch (e) { say(`跳过 ${o.op}：${e.message}`); }
  }
  out.courses = cs;
  return out;
};
process.stdout.write(JSON.stringify(main()));

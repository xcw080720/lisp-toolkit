'use strict';
// impl.js —— 课表 ops 执行器（臂 1 / JS 表驱动：一条 op = 一条 REG 登记）
// 契约：node impl.js in.json  ->  stdout 一行 JSON { opsText, courses, log, n }
// 假设（判据未写死处按此定，报告里已写明）：
//   1) match 省略 / null / '' 一律视为命中全部；
//   2) 未知 op 整批拒绝：不执行任何 op，courses 原样返回，n=0；
//   3) 缺必填字段只跳过该 op，并记一条带序号的日志；
//   4) weeks 统一为 {type:'range',from,to}，节次合法域 1..12，星期 1..7。
const fs = require('fs');

const P_MAX = 12;
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, num(v, lo)));
const wk = (f, t) => { const a = clamp(f, 1, 30); return { type: 'range', from: a, to: Math.max(a, clamp(t, 1, 30)) }; };
const badWeeks = (w) => !w || typeof w !== 'object' || typeof w.from !== 'number' || typeof w.to !== 'number' || w.from < 1 || w.from > w.to;
const W = (c) => (badWeeks(c.weeks) ? wk(1, 16) : wk(c.weeks.from, c.weeks.to));
const hit = (cs, m) => (m === undefined || m === null || m === '' ? cs.slice() : cs.filter((c) => c.name === m));
const each = (cs, m, fn) => hit(cs, m).reduce((n, c) => (fn(c) === false ? n : n + 1), 0);
const fixP = (c, f, t) => { c.periodFrom = clamp(f, 1, P_MAX); c.periodTo = Math.max(c.periodFrom, clamp(t, 1, P_MAX)); };
const field = (k, conv) => (cs, o) => each(cs, o.match, (c) => { c[k] = conv(c, o); });
const get = (o, k) => k.split('.').reduce((v, p) => (v == null ? undefined : v[p]), o);

const REG = Object.create(null);
const reg = (name, group, need, fn) => { REG[name] = { name, group, need, fn }; };

//@@ OP setDay A
reg('setDay', 'A', ['day'], field('day', (c, o) => clamp(o.day, 1, 7)));
//@@ OP setPeriodFrom A
reg('setPeriodFrom', 'A', ['from'], (cs, o) => each(cs, o.match, (c) => { const f = clamp(o.from, 1, P_MAX); fixP(c, f, Math.max(c.periodTo, f)); }));
//@@ OP setPeriodTo A
reg('setPeriodTo', 'A', ['to'], (cs, o) => each(cs, o.match, (c) => { c.periodTo = Math.max(clamp(o.to, 1, P_MAX), clamp(c.periodFrom, 1, P_MAX)); }));
//@@ OP setTeacher A
reg('setTeacher', 'A', ['teacher'], field('teacher', (c, o) => String(o.teacher)));
//@@ OP setLocation A
reg('setLocation', 'A', ['location'], field('location', (c, o) => String(o.location)));
//@@ OP setNote A
reg('setNote', 'A', ['note'], field('note', (c, o) => String(o.note)));
//@@ OP setWeeks A
reg('setWeeks', 'A', ['weeks.from', 'weeks.to'], (cs, o) => each(cs, o.match, (c) => { c.weeks = wk(o.weeks.from, o.weeks.to); }));
//@@ OP clearNote A
reg('clearNote', 'A', [], field('note', () => ''));
/* ---------- 5. 执行器与输出契约 ---------- */
function exec(input) {
  const src = Array.isArray(input && input.courses) ? input.courses : [];
  const ops = Array.isArray(input && input.ops) ? input.ops : [];
  const courses = src.map((c) => ({ ...c }));
  const log = [];
  const ctx = { say: (m) => log.push(`${log.length + 1}) ${m}`) };
  const opsText = ops.map((o, i) => `${i + 1}. ${String((o && o.op) || '?')} ${JSON.stringify(Object.fromEntries(Object.entries(o || {}).filter(([k]) => k !== 'op')))}`).join('\n');
  const unknown = ops.find((o) => !o || typeof o.op !== 'string' || !REG[o.op]);
  if (unknown) { ctx.say(`未知 op=${unknown && unknown.op}，整批拒绝，未执行任何 op`); return { opsText: '', courses: src, log, n: 0 }; }
  let n = 0;
  for (const o of ops) {
    const def = REG[o.op];
    const miss = def.need.filter((k) => get(o, k) === undefined || get(o, k) === null);
    if (miss.length) { ctx.say(`跳过 op=${o.op}：缺必填字段 ${miss.join(',')}`); continue; }
    n += def.fn(courses, o, ctx) | 0;
  }
  return { opsText, courses, log, n };
}

process.stdout.write(JSON.stringify(exec(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')))));

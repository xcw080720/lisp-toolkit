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
//@@ OP bumpDay A
reg('bumpDay', 'A', ['delta'], (cs, o) => each(cs, o.match, (c) => { c.day = clamp(clamp(c.day, 1, 7) + num(o.delta, 0), 1, 7); }));
//@@ OP bumpPeriod A
reg('bumpPeriod', 'A', ['delta'], (cs, o) => each(cs, o.match, (c) => { const d = num(o.delta, 0); fixP(c, clamp(c.periodFrom, 1, P_MAX) + d, clamp(c.periodTo, 1, P_MAX) + d); }));
//@@ OP moveDay B
reg('moveDay', 'B', ['day'], (cs, o) => each(cs, o.match, (c) => { const d = clamp(o.day, 1, 7), s = d - clamp(c.day, 1, 7); c.day = d; fixP(c, clamp(c.periodFrom, 1, P_MAX) + s, clamp(c.periodTo, 1, P_MAX) + s); }));
//@@ OP swapTeacher B
reg('swapTeacher', 'B', ['with'], (cs, o) => { const a = cs.find((c) => c.name === o.match), b = cs.find((c) => c.name === o.with); if (!a || !b) return 0; const t = a.teacher; a.teacher = b.teacher; b.teacher = t; return 2; });
//@@ OP copyWeeks B
reg('copyWeeks', 'B', ['with'], (cs, o) => { const a = cs.find((c) => c.name === o.match), b = cs.find((c) => c.name === o.with); if (!a || !b) return 0; b.weeks = { ...W(a) }; return 1; });
//@@ OP mergeCourses B
reg('mergeCourses', 'B', [], (cs) => { const keep = new Map(), out = []; let cut = 0; for (const c of cs) { const k = String(c.name), m = keep.get(k); if (!m) { keep.set(k, c); c.weeks = { ...W(c) }; out.push(c); } else { m.weeks = wk(Math.min(W(m).from, W(c).from), Math.max(W(m).to, W(c).to)); cut++; } } cs.splice(0, cs.length, ...out); return cut; });
//@@ OP splitCourse B
reg('splitCourse', 'B', ['match'], (cs, o) => { const add = []; for (const c of hit(cs, o.match)) { const f = clamp(c.periodFrom, 1, P_MAX), t = Math.max(f, clamp(c.periodTo, 1, P_MAX)), mid = Math.floor((f + t) / 2); if (mid + 1 > t) continue; add.push({ ...c, weeks: { ...W(c) }, periodFrom: mid + 1, periodTo: t }); c.periodFrom = f; c.periodTo = mid; } cs.push(...add); return add.length; });
//@@ OP rotateDay B
reg('rotateDay', 'B', [], (cs) => each(cs, '', (c) => { c.day = clamp(c.day, 1, 7) % 7 + 1; }));
//@@ OP trimWeeks B
reg('trimWeeks', 'B', ['from', 'to'], (cs, o) => each(cs, o.match, (c) => { const w = W(c), f = Math.max(w.from, clamp(o.from, 1, 30)), t = Math.min(w.to, clamp(o.to, 1, 30)); c.weeks = wk(f, t); }));
//@@ OP padWeeks B
reg('padWeeks', 'B', ['to'], (cs, o) => each(cs, o.match, (c) => { c.weeks = wk(W(c).from, Math.max(W(c).to, clamp(o.to, 1, 30))); }));
//@@ OP renumber B
reg('renumber', 'B', [], (cs) => { const byDay = new Map(); for (const c of cs) { const k = clamp(c.day, 1, 7); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(c); } let ch = 0; for (const g of byDay.values()) { g.sort((a, b) => clamp(a.periodFrom, 1, P_MAX) - clamp(b.periodFrom, 1, P_MAX) || clamp(a.periodTo, 1, P_MAX) - clamp(b.periodTo, 1, P_MAX)); let cur = 1; for (const c of g) { const sp = Math.max(0, clamp(c.periodTo, 1, P_MAX) - clamp(c.periodFrom, 1, P_MAX)), f = cur, t = cur + sp; if (c.periodFrom !== f || c.periodTo !== t) ch++; c.periodFrom = f; c.periodTo = t; cur = t + 1; } } return ch; });
//@@ OP sortByName B
reg('sortByName', 'B', [], (cs) => { const before = cs.slice(), cmp = (a, b) => (String(a.name) < String(b.name) ? -1 : String(a.name) > String(b.name) ? 1 : 0); cs.sort(cmp); return cs.filter((c, i) => c !== before[i]).length; });
//@@ OP bulkMark C
reg('bulkMark', 'C', ['tag'], field('tag', (c, o) => String(o.tag)));
//@@ OP bulkClear C
reg('bulkClear', 'C', [], field('tag', () => null));
//@@ OP bulkShift C
reg('bulkShift', 'C', ['delta'], (cs, o) => each(cs, o.match, (c) => { const d = num(o.delta, 0); fixP(c, clamp(c.periodFrom, 1, P_MAX) + d, clamp(c.periodTo, 1, P_MAX) + d); }));
//@@ OP bulkCopy C
reg('bulkCopy', 'C', ['toDay'], (cs, o) => { const d = clamp(o.toDay, 1, 7), add = hit(cs, o.match).map((c) => ({ ...c, day: d, weeks: { ...W(c) } })); cs.push(...add); return add.length; });
//@@ OP filterDay C
reg('filterDay', 'C', ['day'], (cs, o) => { const d = clamp(o.day, 1, 7), keep = cs.filter((c) => clamp(c.day, 1, 7) === d), cut = cs.length - keep.length; cs.splice(0, cs.length, ...keep); return cut; });
//@@ OP dropWeek C
reg('dropWeek', 'C', ['week'], (cs, o) => each(cs, o.match, (c) => { const w = W(c), k = clamp(o.week, 1, 30); if (k < w.from || k > w.to || w.from === w.to) return false; c.weeks = k === w.from ? wk(k + 1, w.to) : wk(w.from, k - 1); }));
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

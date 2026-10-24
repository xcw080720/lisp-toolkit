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
//@@ OP copyWeeks B
REG('copyWeeks', 'B', ['with'], (cs, o) => {
  const a = cs.find((c) => c.name === o.match), b = cs.find((c) => c.name === o.with);
  return a && b ? set(b, 'weeks', wk(a.weeks)) : 0;
});
//@@ OP mergeCourses B
REG('mergeCourses', 'B', [], (cs) => {
  let n = 0;
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i];
    for (let k = cs.length - 1; k > i; k--) {
      const b = cs[k];
      if (b.name !== a.name) continue;
      const x = wk(a.weeks), y = wk(b.weeks);
      a.weeks = RANGE(Math.min(x.from, y.from), Math.max(x.to, y.to));
      cs.splice(k, 1); n++;
    }
  }
  return n;
});
//@@ OP splitCourse B
REG('splitCourse', 'B', [], (cs, o) => {
  let n = 0;
  const out = [];
  for (const c of cs) {
    if ((!o.match || c.name === o.match) && num(c.periodTo, 1) > num(c.periodFrom, 1)) {
      const mid = Math.floor((num(c.periodFrom, 1) + num(c.periodTo, 1)) / 2);
      const b = clone(c);
      c.periodTo = mid; b.periodFrom = mid + 1;
      out.push(c, b); n++;
    } else out.push(c);
  }
  cs.length = 0; cs.push(...out);
  return n;
});
//@@ OP rotateDay B
REG('rotateDay', 'B', [], (cs) => { let n = 0; for (const c of cs) n += set(c, 'day', (num(c.day, 1) % 7) + 1); return n; });
//@@ OP trimWeeks B
REG('trimWeeks', 'B', ['from', 'to'], (cs, o) => mut(cs, o.match, (c) => {
  const w = wk(c.weeks), f = Math.max(w.from, num(o.from, 1)), t = Math.min(w.to, num(o.to, 16));
  return f <= t ? set(c, 'weeks', RANGE(f, t)) : 0;
}));
//@@ OP padWeeks B
REG('padWeeks', 'B', ['to'], (cs, o) => mut(cs, o.match, (c) => {
  const w = wk(c.weeks);
  return set(c, 'weeks', RANGE(w.from, Math.max(w.to, num(o.to, 16))));
}));
//@@ OP renumber B
REG('renumber', 'B', [], (cs) => {
  let n = 0;
  for (const d of [...new Set(cs.map((c) => c.day))]) {
    const g = cs.filter((c) => c.day === d).sort((a, b) => (num(a.periodFrom) - num(b.periodFrom)) || (num(a.periodTo) - num(b.periodTo)));
    let cur = 1;
    for (const c of g) {
      const dur = Math.max(0, num(c.periodTo, 1) - num(c.periodFrom, 1));
      n += set(c, 'periodFrom', cur) + set(c, 'periodTo', cur + dur);
      cur += dur + 1;
    }
  }
  return n;
});
//@@ OP sortByName B
REG('sortByName', 'B', [], (cs) => {
  const key = () => cs.map((c) => c.name + ':' + c.day + ':' + c.periodFrom).join('\u0000');
  const before = key();
  cs.sort(byName);
  return before === key() ? 0 : 1;
});
/* ---------- 4b. C 组：批处理 / 参数化 ---------- */
//@@ OP bulkMark C
REG('bulkMark', 'C', ['tag'], (cs, o) => mut(cs, o.match, (c) => set(c, 'tag', o.tag)));
//@@ OP bulkClear C
REG('bulkClear', 'C', [], (cs, o) => mut(cs, o.match, (c) => set(c, 'tag', null)));
//@@ OP bulkShift C
REG('bulkShift', 'C', ['delta'], (cs, o) => {
  const d = num(o.delta, 0);
  let n = 0;
  for (const c of cs) {
    const f = PER(num(c.periodFrom, 1) + d), t = PER(num(c.periodTo, 1) + d, f);
    n += set(c, 'periodFrom', f) | set(c, 'periodTo', t);
  }
  return n;
});
//@@ OP bulkCopy C
REG('bulkCopy', 'C', ['toDay'], (cs, o) => {
  const d = DAY(o.toDay), add = [];
  for (const c of cs) if (!o.match || c.name === o.match) add.push(Object.assign(clone(c), { day: d }));
  cs.push(...add);
  return add.length;
});
//@@ OP filterDay C
REG('filterDay', 'C', ['day'], (cs, o) => {
  const d = DAY(o.day), keep = cs.filter((c) => c.day === d), n = cs.length - keep.length;
  cs.length = 0; cs.push(...keep);
  return n;
});
//@@ OP dropWeek C
REG('dropWeek', 'C', ['week'], (cs, o) => mut(cs, o.match, (c) => {
  const w = wk(c.weeks), k = num(o.week, 0);
  if (k < w.from || k > w.to) return 0;
  if (k === w.from) return w.from < w.to ? set(c, 'weeks', RANGE(w.from + 1, w.to)) : 0;
  return set(c, 'weeks', RANGE(w.from, k - 1));
}));
//@@ OP keepWeek C
REG('keepWeek', 'C', ['week'], (cs, o) => mut(cs, o.match, (c) => {
  const k = num(o.week, 1);
  return set(c, 'weeks', RANGE(k, k));
}));
//@@ OP statsByDay C
REG('statsByDay', 'C', [], (cs, o, say) => {
  const m = new Map();
  for (const c of cs) m.set(c.day, (m.get(c.day) || 0) + 1);
  const parts = [...m.keys()].sort((a, b) => a - b).map((d) => `周${d}:${m.get(d)}`);
  say(`按天统计：${parts.join(' ')} 共${cs.length}门`);
  return 0;
});
//@@ OP validate C
REG('validate', 'C', [], (cs, o, say) => {
  const bad = [];
  cs.forEach((c, i) => {
    if (!c.name) bad.push(`#${i} 空会议名`);
    if (!(c.day >= 1 && c.day <= 7)) bad.push(`#${i} day 越界`);
    if (!(c.periodFrom >= 1 && c.periodFrom <= 12) || !(c.periodTo >= 1 && c.periodTo <= 12)) bad.push(`#${i} 节次越界`);
    if (c.periodFrom > c.periodTo) bad.push(`#${i} 节次倒挂`);
    if (!c.weeks || c.weeks.type !== 'range' || !(c.weeks.from <= c.weeks.to)) bad.push(`#${i} 周次非法`);
  });
  say(`校验：问题 ${bad.length} 处${bad.length ? '（' + bad.join('；') + '）' : ''}`);
  return 0;
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

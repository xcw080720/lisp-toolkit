'use strict';
// impl.js — 交叉点臂 JS：OPS 表驱动 + JSON.parse
// 契约与 CL 臂逐字相同（判据只认契约，不认写法）：
//   入: {courses:[...], ops:[...]}   出: {opsText, courses, log, n}
//   course: name teacher location day periodFrom periodTo weeks tag note
// 一条 op = 一条 REG 登记（need 必填 / fields 夹紧 / run 执行 / say 文案）；
// 校验、分发、名册都从这张表长出来。
const fs = require('fs');

/* ---------- 1. 字段夹紧：一处定义，全 op 共用 ---------- */
const defaultWeeks = () => ({ type: 'range', from: 1, to: 16 });

const COERCE = {
  day: (v) => Math.min(7, Math.max(1, Math.trunc(Number(v)) || 1)),
  period: (v) => Math.max(1, Math.trunc(Number(v)) || 1),
  int: (v) => Math.trunc(Number(v)) || 0,
  str: (v) => (v == null ? '' : String(v)),
  course: (v) => loadCourse(v || {}),
  weeks: (v) => (v && v.type ? v : defaultWeeks()),
  tag: (v) => (v == null || v === '' ? null : String(v)),
};

/* ---------- 2. 小工具 ---------- */
const hit = (list, m) => list.filter((c) => c.name.includes(COERCE.str(m)));
const clone = (c) => JSON.parse(JSON.stringify(c));
const weeksOf = (c) => c.weeks || defaultWeeks();
const setWeeks = (c, from, to) => { c.weeks = { type: 'range', from, to }; };
const numOr = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
// 入口只补形状，不夹紧：夹紧是 normalize 的活。否则 validate 永远看不到坏值（假绿来源）。
function loadCourse(c) {
  return {
    name: COERCE.str(c.name),
    teacher: COERCE.str(c.teacher),
    location: COERCE.str(c.location),
    day: numOr(c.day, 1),
    periodFrom: numOr(c.periodFrom, 1),
    periodTo: numOr(c.periodTo, 1),
    weeks: c.weeks || defaultWeeks(),
    tag: c.tag == null ? null : String(c.tag),
    note: COERCE.str(c.note),
  };
}
function spliceIn(list, keep) {
  const n = list.length - keep.length;
  list.length = 0;
  list.push(...keep);
  return n;
}

/* ---------- 3. 注册表：唯一的声明处 ---------- */
const REG = {};

/* ---------- 4. 30 个 op：每块一条登记，块首有 @@ 标记 ---------- */

//@@ OP setDay A
REG.setDay = {
  need: ['match', 'day'],
  fields: { day: 'day' },
  run(state, op, p) {
    const targets = hit(state, op.match);
    for (const c of targets) c.day = p.day;
    return targets.length;
  },
  say(n, op) { return n ? `setDay：${n} 门改到周${op.day}` : `setDay：没找到「${op.match}」`; },
};

//@@ OP setPeriodFrom A
REG.setPeriodFrom = {
  need: ['match', 'from'],
  fields: { from: 'period' },
  run(state, op, p) {
    const targets = hit(state, op.match);
    for (const c of targets) { c.periodFrom = p.from; c.periodTo = Math.max(p.from, c.periodTo); }
    return targets.length;
  },
  say(n, op, p) { return n ? `setPeriodFrom：${n} 门从第${p.from}节起` : `setPeriodFrom：没找到「${op.match}」`; },
};

//@@ OP setPeriodTo A
REG.setPeriodTo = {
  need: ['match', 'to'],
  fields: { to: 'period' },
  run(state, op, p) {
    const targets = hit(state, op.match);
    for (const c of targets) c.periodTo = Math.max(c.periodFrom, p.to);
    return targets.length;
  },
  say(n, op, p) { return n ? `setPeriodTo：${n} 门到第${p.to}节` : `setPeriodTo：没找到「${op.match}」`; },
};

//@@ OP setTeacher A
REG.setTeacher = {
  need: ['match', 'teacher'],
  fields: { teacher: 'str' },
  run(state, op, p) {
    const targets = hit(state, op.match);
    for (const c of targets) c.teacher = p.teacher;
    return targets.length;
  },
  say(n, op, p) { return n ? `setTeacher：${n} 门老师改为「${p.teacher}」` : `setTeacher：没找到「${op.match}」`; },
};

//@@ OP setLocation A
REG.setLocation = {
  need: ['match', 'location'],
  fields: { location: 'str' },
  run(state, op, p) {
    const targets = hit(state, op.match);
    for (const c of targets) c.location = p.location;
    return targets.length;
  },
  say(n, op, p) { return n ? `setLocation：${n} 门地点改为「${p.location}」` : `setLocation：没找到「${op.match}」`; },
};

//@@ OP setNote A
REG.setNote = {
  need: ['match', 'note'],
  fields: { note: 'str' },
  run(state, op, p) {
    const targets = hit(state, op.match);
    for (const c of targets) c.note = p.note;
    return targets.length;
  },
  say(n, op) { return n ? `setNote：${n} 门加了备注` : `setNote：没找到「${op.match}」`; },
};

//@@ OP setWeeks A
REG.setWeeks = {
  need: ['match', 'weeks'],
  fields: { weeks: 'weeks' },
  run(state, op, p) {
    const targets = hit(state, op.match);
    for (const c of targets) c.weeks = { type: 'range', from: p.weeks.from, to: p.weeks.to };
    return targets.length;
  },
  say(n) { return n ? `setWeeks：${n} 门周次已设置` : 'setWeeks：没找到匹配的课'; },
};

//@@ OP clearNote A
REG.clearNote = {
  need: ['match'],
  run(state, op) {
    const targets = hit(state, op.match);
    for (const c of targets) c.note = '';
    return targets.length;
  },
  say(n) { return n ? `clearNote：${n} 门备注清空` : 'clearNote：没找到匹配的课'; },
};

//@@ OP bumpDay A
REG.bumpDay = {
  need: ['match', 'delta'],
  fields: { delta: 'int' },
  run(state, op, p) {
    const targets = hit(state, op.match);
    for (const c of targets) c.day = Math.min(7, Math.max(1, c.day + p.delta));
    return targets.length;
  },
  say(n, op, p) { return n ? `bumpDay：${n} 门周次 +${p.delta}` : `bumpDay：没找到「${op.match}」`; },
};

//@@ OP bumpPeriod A
REG.bumpPeriod = {
  need: ['match', 'delta'],
  fields: { delta: 'int' },
  run(state, op, p) {
    const targets = hit(state, op.match);
    for (const c of targets) {
      const from = Math.max(1, c.periodFrom + p.delta);
      c.periodFrom = from;
      c.periodTo = Math.max(from, c.periodTo + p.delta);
    }
    return targets.length;
  },
  say(n, op, p) { return n ? `bumpPeriod：${n} 门节次 ${p.delta >= 0 ? '+' : ''}${p.delta}` : `bumpPeriod：没找到「${op.match}」`; },
};

//@@ OP moveDay B
REG.moveDay = {
  need: ['match', 'day'],
  fields: { day: 'day' },
  run(state, op, p) {
    const targets = hit(state, op.match);
    for (const c of targets) {
      const delta = p.day - c.day;
      c.day = p.day;
      const from = Math.max(1, c.periodFrom + delta);
      c.periodFrom = from;
      c.periodTo = Math.max(from, c.periodTo + delta);
    }
    return targets.length;
  },
  say(n, op, p) { return n ? `moveDay：${n} 门移到周${p.day} 并顺延节次` : `moveDay：没找到「${op.match}」`; },
};

/* ---------- 5. 执行器：校验 / 分支 / 日志 / 计数全部读表 ---------- */
function runOp(state, op) {
  const d = REG[op.op];
  const p = {};
  for (const [k, kind] of Object.entries(d.fields || {})) p[k] = COERCE[kind](op[k]);
  const miss = (d.need || []).filter((k) => op[k] === undefined || op[k] === null);
  if (miss.length) return { n: 0, text: `${op.op}：参数不全（缺 ${miss.join('、')}），不执行` };
  const n = d.run(state, op, p) || 0;
  return { n, text: d.say(n, op, p) };
}

/* ---------- 6. 入口：契约 ---------- */
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const origCourses = Array.isArray(input.courses) ? input.courses : [];
const ops = Array.isArray(input.ops) ? input.ops : [];

const bad = ops.find((o) => !o || typeof o.op !== 'string' || !Object.prototype.hasOwnProperty.call(REG, o.op));

let out;
if (bad) {
  out = { opsText: '', courses: origCourses, log: [`1) 拒绝：未知 op ${bad && bad.op}`], n: 0 };
} else if (ops.length === 0) {
  out = { opsText: '', courses: origCourses, log: [], n: 0 };
} else {
  const state = JSON.parse(JSON.stringify(origCourses)).map(loadCourse);
  const log = [];
  let n = 0;
  for (const op of ops) {
    const r = runOp(state, op);
    n += r.n;
    log.push(`${log.length + 1}) ${r.text}`);
  }
  out = { opsText: JSON.stringify(ops), courses: state, log, n, available: Object.keys(REG) };
}

process.stdout.write(JSON.stringify(out));

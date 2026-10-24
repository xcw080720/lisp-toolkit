#!/usr/bin/env node
// impl.js — 课表 ops 执行器（规模臂起点：建时即含 add/del/edit/move/swap）
// 入口： node impl.js <input.json>  → stdout 打印 {"opsText":"...","courses":[...],"log":["1) ..."],"n":N}
'use strict';

const fs = require('fs');

// ---------------- 基础工具 ----------------

const DAY_MIN = 1;
const DAY_MAX = 7;
const DEFAULT_WEEKS = { type: 'range', from: 1, to: 16 };

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const toInt = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : d; };
const str = (v) => (v === null || v === undefined ? '' : String(v));
const own = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

const normDay = (v, d) => clamp(toInt(v, d), DAY_MIN, DAY_MAX);
const normPeriod = (v, d) => { const n = toInt(v, d); return n < 1 ? 1 : n; };

// ---------------- 数据模型 ----------------

function cloneDeep(v) {
  if (Array.isArray(v)) return v.map(cloneDeep);
  if (isObj(v)) { const o = {}; for (const k of Object.keys(v)) o[k] = cloneDeep(v[k]); return o; }
  return v;
}

// weeks 归一：缺省 → range 1..16；有值按 type 逐字段保留（list 等类型的附加键原样带走）
function normWeeks(w) {
  if (!isObj(w)) return cloneDeep(DEFAULT_WEEKS);
  const type = typeof w.type === 'string' ? w.type : DEFAULT_WEEKS.type;
  const out = { type };
  if (type === 'range') {
    const from = toInt(w.from, DEFAULT_WEEKS.from);
    const toRaw = toInt(w.to, DEFAULT_WEEKS.to);
    out.from = from;
    out.to = toRaw < from ? from : toRaw;
  } else {
    for (const k of Object.keys(w)) if (k !== 'type') out[k] = cloneDeep(w[k]);
  }
  return out;
}

function normCourse(src) {
  const s = isObj(src) ? src : {};
  const pf = normPeriod(s.periodFrom, 1);
  const ptRaw = normPeriod(s.periodTo, pf);
  return {
    name: str(s.name),
    teacher: str(s.teacher),
    location: str(s.location),
    day: normDay(s.day, 1),
    periodFrom: pf,
    periodTo: ptRaw < pf ? pf : ptRaw,
    weeks: normWeeks(s.weeks),
    tag: s.tag === undefined ? null : s.tag,
  };
}

// 时间三件套整体赋值（day 夹 1..7，节次 ≥1 且 from ≤ to）
function setSlot(c, day, from, to) {
  const pf = normPeriod(from, c.periodFrom);
  const ptRaw = normPeriod(to, pf);
  c.day = normDay(day, c.day);
  c.periodFrom = pf;
  c.periodTo = ptRaw < pf ? pf : ptRaw;
}

function hitsOf(st, match) {
  const m = str(match);
  return st.courses.filter((c) => c.name.includes(m));
}

const names = (list) => list.map((c) => c.name).join('、');

// ---------------- op 处理器（每个返回 {n, msg}） ----------------
// 后续十个 op 只需在这里加一条：OPS[name] = (st, op) => ({ n, msg })

function opAdd(st, op) {
  if (!isObj(op.course)) return { n: 0, msg: 'add 缺少 course，不执行' };
  const c = normCourse(op.course);          // 缺 weeks → range 1..16；day 夹 1..7
  st.courses.push(c);
  return { n: 1, msg: `新增「${c.name}」周${c.day} 第${c.periodFrom}-${c.periodTo}节` };
}

function opDel(st, op) {
  const m = str(op.match);
  const kept = [];
  const hit = [];
  for (const c of st.courses) (c.name.includes(m) ? hit : kept).push(c);
  st.courses = kept;
  return hit.length
    ? { n: hit.length, msg: `删除 ${hit.length} 门：${names(hit)}` }
    : { n: 0, msg: `没找到「${m}」` };
}

function applySet(c, set) {
  for (const k of Object.keys(set)) {
    const v = set[k];
    if (k === 'day') c.day = normDay(v, c.day);
    else if (k === 'periodFrom') { c.periodFrom = normPeriod(v, c.periodFrom); if (c.periodTo < c.periodFrom) c.periodTo = c.periodFrom; }
    else if (k === 'periodTo') { c.periodTo = normPeriod(v, c.periodTo); if (c.periodTo < c.periodFrom) c.periodFrom = c.periodTo; }
    else if (k === 'weeks') c.weeks = normWeeks(v);
    else if (k === 'tag') c.tag = v === undefined ? null : v;
    else if (k === 'name' || k === 'teacher' || k === 'location') c[k] = str(v);
  }
}

function opEdit(st, op) {
  if (!isObj(op.set)) return { n: 0, msg: 'edit 缺少 set，不执行' };
  const hit = hitsOf(st, op.match);
  if (!hit.length) return { n: 0, msg: `没找到「${str(op.match)}」` };
  for (const c of hit) applySet(c, op.set);
  return { n: hit.length, msg: `修改 ${hit.length} 门：${names(hit)}（${Object.keys(op.set).join('/')}）` };
}

function opMove(st, op) {
  const need = ['day', 'periodFrom', 'periodTo'];
  const miss = need.filter((k) => !own(op, k));
  if (miss.length) return { n: 0, msg: `move 缺少 ${miss.join('/')}，不执行` };
  const hit = hitsOf(st, op.match);
  if (!hit.length) return { n: 0, msg: `没找到「${str(op.match)}」` };
  for (const c of hit) setSlot(c, op.day, op.periodFrom, op.periodTo);
  const c0 = hit[0];
  return { n: hit.length, msg: `移动 ${hit.length} 门 → 周${c0.day} 第${c0.periodFrom}-${c0.periodTo}节` };
}

function opSwap(st, op) {
  const a = hitsOf(st, op.match);
  const b = hitsOf(st, op.with);
  if (a.length !== 1 || b.length !== 1) {
    return { n: 0, msg: `swap 需两侧各恰好 1 门（实际 ${a.length}/${b.length}），不执行` };
  }
  const A = a[0], B = b[0];
  const [ad, af, at] = [A.day, A.periodFrom, A.periodTo];
  setSlot(A, B.day, B.periodFrom, B.periodTo);
  setSlot(B, ad, af, at);
  return { n: 2, msg: `互换「${A.name}」⇄「${B.name}」` };
}

const OPS = {
  add: opAdd,
  del: opDel,
  edit: opEdit,
  move: opMove,
  swap: opSwap,
};

// ---------------- 批量执行 ----------------

function run(input) {
  const data = isObj(input) ? input : {};
  const st = { courses: (Array.isArray(data.courses) ? data.courses : []).map(normCourse) };
  const ops = Array.isArray(data.ops) ? data.ops : [];

  // 空 ops：什么都不做
  if (!ops.length) return { opsText: '', courses: st.courses, log: [], n: 0 };

  // 未知 op：整批拒绝（先验，不执行任何一条）
  const bad = ops.find((o) => !isObj(o) || typeof o.op !== 'string' || !Object.prototype.hasOwnProperty.call(OPS, o.op));
  if (bad) {
    const label = bad && bad.op !== undefined ? str(bad.op) : 'undefined';
    return { opsText: '', courses: st.courses, log: [`1) 拒绝：未知 op ${label}`], n: 0 };
  }

  const log = [];
  let n = 0;
  ops.forEach((op, i) => {
    let r;
    try { r = OPS[op.op](st, op); } catch (e) { r = { n: 0, msg: `${op.op} 执行异常：${e.message}` }; }
    n += r.n;
    log.push(`${i + 1}) ${r.msg}`);
  });

  const opsText = ops.map((op, i) => `${i + 1}) ${op.op}`).join('\n');
  return { opsText, courses: st.courses, log, n };
}

// ---------------- 入口 ----------------

function main() {
  const file = process.argv[2];
  let input = { courses: [], ops: [] };
  let payload;
  if (file) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch (e) {
      payload = { opsText: '', courses: [], log: [`1) 读取失败：${e.message}`], n: 0 };
    }
    if (payload === undefined) {
      try { input = JSON.parse(raw); } catch (e) {
        payload = { opsText: '', courses: [], log: [`1) 解析失败：${e.message}`], n: 0 };
      }
    }
  }
  if (payload === undefined) payload = run(input);
  process.stdout.write(JSON.stringify(payload) + '\n');
}

if (require.main === module) main();

module.exports = { run };

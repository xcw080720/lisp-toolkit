#!/usr/bin/env node
'use strict';
// 任务 A：大学课表（中文）—— 从零实现
// 用法： node impl.js input.json  ->  stdout 一个 JSON

const fs = require('fs');

const COURSE_KEYS = ['name', 'teacher', 'location', 'day', 'periodFrom', 'periodTo', 'weeks'];

function clampInt(v, lo, hi) {
  let n = Math.trunc(Number(v));
  if (!isFinite(n)) return null;
  if (n < lo) n = lo;
  if (n > hi) n = hi;
  return n;
}

// 统一课程对象：固定键序，缺 teacher/location 补 ""，weeks 原样保留（没有就不加）
function canonCourse(c) {
  const src = (c && typeof c === 'object') ? c : {};
  const out = {};
  out.name = src.name == null ? '' : String(src.name);
  out.teacher = src.teacher == null ? '' : String(src.teacher);
  out.location = src.location == null ? '' : String(src.location);
  out.day = clampInt(src.day == null ? 1 : src.day, 1, 7);
  out.periodFrom = Math.max(1, Math.trunc(Number(src.periodFrom == null ? 1 : src.periodFrom)) || 1);
  out.periodTo = Math.max(out.periodFrom, Math.trunc(Number(src.periodTo == null ? out.periodFrom : src.periodTo)) || out.periodFrom);
  if (src.weeks !== undefined) out.weeks = src.weeks;
  for (const k of Object.keys(src)) {
    if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = src[k];
  }
  return out;
}

function has(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }

// edit 用的五值校验：range/odd/even 必须 with from+to，list 必须有数组，all 不管
function weeksOk(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
  const type = String(w.type);
  if (type === 'all') return true;
  if (type === 'list') return Array.isArray(w.list);
  if (type !== 'range' && type !== 'odd' && type !== 'even') return false;
  const num = (v) => v != null && isFinite(Number(v));
  return num(w.from) && num(w.to);
}

function weeksOf(w, totalWeeks) {
  if (!w || typeof w !== 'object') return { type: 'range', from: 1, to: totalWeeks };
  const type = String(w.type || 'range');
  if (type === 'all') return { type: 'all' };
  if (type === 'list') {
    const list = Array.isArray(w.list) ? w.list.map(Number).filter(n => isFinite(n)) : [];
    return { type: 'list', list };
  }
  // range / odd / even
  const from = w.from == null ? 1 : Math.trunc(Number(w.from));
  const to = w.to == null ? totalWeeks : Math.trunc(Number(w.to));
  if (type === 'odd' || type === 'even') return { type, from, to };
  return { type: 'range', from, to };
}

function pickMatched(courses, match) {
  const m = match == null ? '' : String(match);
  if (m === '') return [];
  const hits = [];
  for (let i = 0; i < courses.length; i++) {
    if (String(courses[i].name || '').includes(m)) hits.push(i);
  }
  return hits;
}

function main() {
  const file = process.argv[2];
  if (!file) { process.exit(2); }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const totalWeeks = raw.totalWeeks == null ? 16 : Math.trunc(Number(raw.totalWeeks)) || 16;

  let courses = Array.isArray(raw.courses) ? raw.courses.map(canonCourse) : [];
  const ops = Array.isArray(raw.ops) ? raw.ops : [];

  const opsTexts = [];
  const logs = [];
  let n = 0;

  // 未知 op：整批拒绝——一条都不执行，课表原样，日志只有编号后的那一条
  const KNOWN_OPS = ['add', 'del', 'edit', 'move', 'swap'];
  const badIdx = ops.findIndex((o) => KNOWN_OPS.indexOf(o && o.op) < 0);
  if (badIdx >= 0) {
    const badKind = String(ops[badIdx] && ops[badIdx].op);
    const out = { opsText: '', courses, log: ['拒绝：未知 op ' + badKind], n: 0 };
    out.log = out.log.map((s, i) => (i + 1) + ') ' + s);
    process.stdout.write(JSON.stringify(out) + '\n');
    return;
  }

  for (const op of ops) {
    const kind = op && op.op;

    if (kind === 'add') {
      const src = op.course || {};
      const c = canonCourse(src);
      c.weeks = weeksOf(src.weeks, totalWeeks);
      let offs = [];
      if (has(src, 'remindOffsets')) {
        offs = Array.isArray(src.remindOffsets)
          ? src.remindOffsets.map((v) => {
              if (typeof v === 'number' && isFinite(v)) return Math.trunc(v);
              if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Math.trunc(Number(v));
              return null;
            }).filter((v) => v !== null)
          : [];
        if (offs.length > 3) {
          offs = offs.slice(0, 3);                      // 超过 3 个只留前 3 个
          logs.push('提醒点太多，只留 3 个');
        }
        delete c.remindOffsets;
        c.remindOffsets = offs;                         // 放在最后，紧跟 weeks
      }
      courses.push(c);
      opsTexts.push('加「' + c.name + '」' + (offs.length > 0 ? '（带提醒）' : ''));
      logs.push('加了「' + c.name + '」');
      n += 1;
      continue;
    }

    if (kind === 'del') {
      const match = op.match == null ? '' : String(op.match);
      const hits = pickMatched(courses, match);
      if (hits.length === 0) {
        opsTexts.push('删掉「' + match + '」');
        logs.push('没找到「' + match + '」');
        continue;
      }
      const drop = new Set(hits);
      courses = courses.filter((_, i) => !drop.has(i));
      opsTexts.push('删掉「' + match + '」');
      logs.push('删掉 ' + hits.length + ' 条「' + match + '」');
      n += hits.length;
      continue;
    }

    if (kind === 'edit') {
      const match = op.match == null ? '' : String(op.match);
      const hits = pickMatched(courses, match);
      if (hits.length === 0) {
        opsTexts.push('改「' + match + '」');
        logs.push('没找到「' + match + '」');
        continue;
      }
      const set = (op.set && typeof op.set === 'object') ? op.set : {};
      const badWeeks = has(set, 'weeks') && !weeksOk(set.weeks);
      for (const i of hits) {
        const c = courses[i];
        for (const k of Object.keys(set)) {
          const v = set[k];
          if (k === 'day') {
            const d = clampInt(v, 1, 7);
            if (d !== null) c.day = d;
          } else if (k === 'periodFrom' || k === 'periodTo') {
            const p = Math.trunc(Number(v));
            if (isFinite(p) && p >= 1) c[k] = p;      // <1 保留原值
          } else if (k === 'weeks') {
            if (!badWeeks) c.weeks = weeksOf(v, totalWeeks);   // 非法周次：不写
          } else if (k === 'name' || k === 'teacher' || k === 'location') {
            c[k] = v == null ? '' : String(v);
          }
        }
        if (c.periodTo < c.periodFrom) c.periodTo = c.periodFrom;
        courses[i] = canonCourse(c);
      }
      if (badWeeks) logs.push('周次格式不对，跳过');
      opsTexts.push('改「' + match + '」');
      logs.push('改了 ' + hits.length + ' 条「' + match + '」');
      n += hits.length;
      continue;
    }

    if (kind === 'move') {
      const match = op.match == null ? '' : String(op.match);
      const missing = [];
      if (op.day == null) missing.push('day');
      if (op.periodFrom == null) missing.push('periodFrom');
      if (op.periodTo == null) missing.push('periodTo');
      if (missing.length > 0) {
        logs.push('非法 move「' + match + '」：缺 ' + missing.join('/') + '，未执行');
        continue;
      }
      const hits = pickMatched(courses, match);
      if (hits.length === 0) {
        opsTexts.push('移「' + match + '」');
        logs.push('没找到「' + match + '」');
        continue;
      }
      const day = clampInt(op.day, 1, 7);
      let pf = Math.max(1, Math.trunc(Number(op.periodFrom)) || 1);
      let pt = Math.max(1, Math.trunc(Number(op.periodTo)) || 1);
      if (pt < pf) pt = pf;
      for (const i of hits) {
        courses[i].day = day === null ? courses[i].day : day;
        courses[i].periodFrom = pf;
        courses[i].periodTo = pt;
        courses[i] = canonCourse(courses[i]);
      }
      opsTexts.push('移「' + match + '」');
      logs.push('移了 ' + hits.length + ' 条「' + match + '」');
      n += hits.length;
      continue;
    }

    if (kind === 'swap') {
      const ma = op.match == null ? '' : String(op.match);
      const wb = op.with == null ? '' : String(op.with);
      const ha = pickMatched(courses, ma);
      const hb = pickMatched(courses, wb);
      if (ha.length !== 1 || hb.length !== 1) {
        const bad = ha.length !== 1 ? ma : wb;
        const cnt = ha.length !== 1 ? ha.length : hb.length;
        logs.push('swap 跳过：「' + bad + '」命中 ' + cnt + ' 门，要恰好 1 门');
        continue;
      }
      const a = courses[ha[0]], b = courses[hb[0]];
      const av = [a.day, a.periodFrom, a.periodTo];
      const bv = [b.day, b.periodFrom, b.periodTo];
      a.day = bv[0]; a.periodFrom = bv[1]; a.periodTo = bv[2];
      b.day = av[0]; b.periodFrom = av[1]; b.periodTo = av[2];
      const txt = '换「' + ma + '」和「' + wb + '」的时间';
      opsTexts.push(txt);
      logs.push(txt);
      n += ha[0] === hb[0] ? 0 : 2;
      continue;
    }

    // 未知 op 走不到这里：入口已整批拒绝
  }

  // 日志加序号：1) 2) 3) …（按执行顺序，从 1 起）
  const result = { opsText: opsTexts.join('；'), courses, log: logs.map((s, i) => (i + 1) + ') ' + s), n };
  process.stdout.write(JSON.stringify(result) + '\n');
}

main();

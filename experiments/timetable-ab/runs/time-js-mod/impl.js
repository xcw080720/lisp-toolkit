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

// 想写进课表的 weeks 必须先过格式校验；不合法返回 null（调用方不写、记日志）
function validWeeks(w) {
  if (!w || typeof w !== 'object') return null;
  const type = String(w.type == null ? '' : w.type);
  if (type === 'all') return { type: 'all' };
  if (type === 'list') return Array.isArray(w.list) ? weeksOf(w, 16) : null;
  if (type === 'range' || type === 'odd' || type === 'even') {
    if (w.from == null || w.to == null) return null;
    return weeksOf(w, 16);
  }
  return null;
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
  const pristine = JSON.parse(JSON.stringify(courses));

  const opsTexts = [];
  const logs = [];
  let n = 0;

  for (const op of ops) {
    const kind = op && op.op;

    if (kind === 'add') {
      const c = canonCourse(op.course || {});
      c.weeks = weeksOf((op.course || {}).weeks, totalWeeks);
      const rawOff = (op.course || {}).remindOffsets;
      let offs = Array.isArray(rawOff) ? rawOff.map(Number).filter(v => isFinite(v)) : [];
      if (offs.length > 3) {
        offs = offs.slice(0, 3);
        logs.push('提醒点太多，只留 3 个');
      }
      c.remindOffsets = offs;
      // 键序固定：weeks 在 remindOffsets 之前
      const fixed = {};
      for (const k of COURSE_KEYS) if (k !== 'remindOffsets' && c[k] !== undefined) fixed[k] = c[k];
      if (c.weeks !== undefined) fixed.weeks = c.weeks;
      for (const k of Object.keys(c)) if (!has(fixed, k) && k !== 'remindOffsets' && k !== 'weeks') fixed[k] = c[k];
      fixed.remindOffsets = offs;
      courses.push(fixed);
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
            const w = validWeeks(v);
            if (w === null) { logs.push('周次格式不对，跳过'); continue; }
            c.weeks = w;
          } else if (k === 'name' || k === 'teacher' || k === 'location') {
            c[k] = v == null ? '' : String(v);
          }
        }
        if (c.periodTo < c.periodFrom) c.periodTo = c.periodFrom;
        courses[i] = canonCourse(c);
      }
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
      const a = op.match == null ? '' : String(op.match);
      const b = op.with == null ? '' : String(op.with);
      opsTexts.push('换「' + a + '」和「' + b + '」的时间');
      const ha = pickMatched(courses, a);
      const hb = pickMatched(courses, b);
      if (ha.length !== 1 || hb.length !== 1) {
        const side = ha.length !== 1 ? '「' + a + '」命中 ' + ha.length + ' 条' : '「' + b + '」命中 ' + hb.length + ' 条';
        logs.push('没换时间：' + side + '，未执行');
        continue;
      }
      const t1 = { day: courses[ha[0]].day, periodFrom: courses[ha[0]].periodFrom, periodTo: courses[ha[0]].periodTo };
      const t2 = { day: courses[hb[0]].day, periodFrom: courses[hb[0]].periodFrom, periodTo: courses[hb[0]].periodTo };
      Object.assign(courses[ha[0]], t2);
      Object.assign(courses[hb[0]], t1);
      courses[ha[0]] = canonCourse(courses[ha[0]]);
      courses[hb[0]] = canonCourse(courses[hb[0]]);
      logs.push('换了「' + a + '」和「' + b + '」的时间');
      n += 2;
      continue;
    }

    // 未知 op：整批拒绝，一条都不执行
    courses = pristine;
    opsTexts.length = 0;
    logs.length = 0;
    logs.push('拒绝：未知 op ' + String(kind));
    n = 0;
    break;
  }

  // 日志按执行顺序加 1) 2) 序号；n 只算实际改动条数（上面各 op 已按命中条数累加）
  const log = logs.map((s, i) => (i + 1) + ') ' + s);
  const result = { opsText: opsTexts.join('；'), courses, log, n };
  process.stdout.write(JSON.stringify(result) + '\n');
}

main();

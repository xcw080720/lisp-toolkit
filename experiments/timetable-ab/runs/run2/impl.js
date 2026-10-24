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

  for (const op of ops) {
    const kind = op && op.op;

    if (kind === 'add') {
      const c = canonCourse(op.course || {});
      c.weeks = weeksOf((op.course || {}).weeks, totalWeeks);
      courses.push(c);
      opsTexts.push('加「' + c.name + '」');
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
            c.weeks = weeksOf(v, totalWeeks);
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

    // 未知 op：进 log，不静默
    logs.push('未知 op「' + String(kind) + '」，已跳过');
  }

  const result = { opsText: opsTexts.join('；'), courses, log: logs, n };
  process.stdout.write(JSON.stringify(result) + '\n');
}

main();

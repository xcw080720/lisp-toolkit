'use strict';
// 任务 A：大学课表（中文） —— 规格实现
// 用法: node impl.js <input.json>  -> stdout 打印一个 JSON

const fs = require('fs');

const DAY_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function toInt(v, dflt) {
  if (typeof v === 'number' && isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Math.trunc(Number(v));
  return dflt;
}

function has(v) { return v !== undefined && v !== null; }

function clampDay(v) {
  let d = toInt(v, NaN);
  if (!isFinite(d)) return null;
  if (d < 1) d = 1;
  if (d > 7) d = 7;
  return d;
}

// periodFrom/periodTo 至少 1；< 1 或非数字 -> 不改（返回 null）
function clampPeriod(v) {
  const p = toInt(v, NaN);
  if (!isFinite(p) || p < 1) return null;
  return p;
}

function asText(v) { return has(v) ? String(v) : ''; }

// weeks 规范化：键序 type -> from -> to / list
function canonWeeks(w, totalWeeks) {
  if (!has(w) || typeof w !== 'object' || Array.isArray(w)) return undefined;
  const type = w.type;
  const o = { type: type };
  if (type === 'list') {
    o.list = Array.isArray(w.list) ? w.list.map(function (x) { return toInt(x, 0); }) : [];
    return o;
  }
  if (type === 'all') {
    return o;
  }
  // range / odd / even （未知 type 也按同样方式带上 from/to）
  o.from = has(w.from) ? toInt(w.from, 1) : 1;
  o.to = has(w.to) ? toInt(w.to, totalWeeks) : totalWeeks;
  return o;
}

// 课表条目的规范键序：name, teacher, location, day, periodFrom, periodTo, weeks
function canonCourse(c) {
  const from = toInt(c.periodFrom, 1);
  const out = {
    name: asText(c.name),
    teacher: asText(c.teacher),
    location: asText(c.location),
    day: toInt(c.day, 1),
    periodFrom: from,
    periodTo: toInt(c.periodTo, from)
  };
  if (has(c.weeks)) {
    const w = canonWeeks(c.weeks, 16);
    if (w) out.weeks = w;
  }
  return out;
}

function fixRange(c) {
  if (c.periodTo < c.periodFrom) c.periodTo = c.periodFrom;
}

function matchIndexes(courses, match) {
  const m = asText(match);
  if (m === '') return [];
  const idx = [];
  for (let i = 0; i < courses.length; i++) {
    if (asText(courses[i].name).indexOf(m) >= 0) idx.push(i);
  }
  return idx;
}

function applyEdit(courses, idx, set) {
  if (!set || typeof set !== 'object') return;
  for (let k = 0; k < idx.length; k++) {
    const c = courses[idx[k]];
    if (has(set.name)) c.name = asText(set.name);
    if (has(set.teacher)) c.teacher = asText(set.teacher);
    if (has(set.location)) c.location = asText(set.location);
    if (has(set.day)) { const d = clampDay(set.day); if (d !== null) c.day = d; }
    if (has(set.periodFrom)) { const p = clampPeriod(set.periodFrom); if (p !== null) c.periodFrom = p; }
    if (has(set.periodTo)) { const p = clampPeriod(set.periodTo); if (p !== null) c.periodTo = p; }
    if (has(set.weeks)) { const w = canonWeeks(set.weeks, 16); if (w) c.weeks = w; }
    fixRange(c);
  }
}

function run(input) {
  const totalWeeks = has(input.totalWeeks) ? toInt(input.totalWeeks, 16) : 16;
  const courses = Array.isArray(input.courses) ? input.courses.map(function (c) { return canonCourse(c); }) : [];
  const ops = Array.isArray(input.ops) ? input.ops : [];

  const texts = [];
  const log = [];
  let n = 0;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i] || {};
    const kind = op.op;

    if (kind === 'add') {
      const src = (op.course && typeof op.course === 'object') ? op.course : null;
      const name = src ? asText(src.name) : '';
      if (!src || name === '') {
        log.push('没写课程名，跳过');
        continue;
      }
      const c = canonCourse({
        name: src.name,
        teacher: src.teacher,
        location: src.location,
        day: src.day,
        periodFrom: src.periodFrom,
        periodTo: src.periodTo
      });
      c.weeks = has(src.weeks) ? canonWeeks(src.weeks, totalWeeks) : { type: 'range', from: 1, to: totalWeeks };
      courses.push(c);
      texts.push('加「' + name + '」');
      log.push('加了「' + name + '」');
      n += 1;
    } else if (kind === 'del') {
      const m = asText(op.match);
      texts.push('删掉「' + m + '」');
      const idx = matchIndexes(courses, op.match);
      if (idx.length === 0) {
        log.push('没找到「' + m + '」');
        continue;
      }
      const drop = {};
      idx.forEach(function (x) { drop[x] = true; });
      const kept = courses.filter(function (_, x) { return !drop[x]; });
      courses.length = 0;
      Array.prototype.push.apply(courses, kept);
      log.push('删掉 ' + idx.length + ' 条「' + m + '」');
      n += idx.length;
    } else if (kind === 'edit') {
      const m = asText(op.match);
      texts.push('改「' + m + '」');
      const idx = matchIndexes(courses, op.match);
      if (idx.length === 0) {
        log.push('没找到「' + m + '」');
        continue;
      }
      applyEdit(courses, idx, op.set);
      log.push('改了 ' + idx.length + ' 条「' + m + '」');
      n += idx.length;
    } else if (kind === 'move') {
      const m = asText(op.match);
      const missing = [];
      if (!has(op.day)) missing.push('day');
      if (!has(op.periodFrom)) missing.push('periodFrom');
      if (!has(op.periodTo)) missing.push('periodTo');
      texts.push('移动「' + m + '」');
      if (missing.length > 0) {
        log.push('移动「' + m + '」缺少 ' + missing.join('/') + '，不执行');
        continue;
      }
      const idx = matchIndexes(courses, op.match);
      if (idx.length === 0) {
        log.push('没找到「' + m + '」');
        continue;
      }
      applyEdit(courses, idx, { day: op.day, periodFrom: op.periodFrom, periodTo: op.periodTo });
      let where = '';
      if (idx.length > 0) {
        const c0 = courses[idx[0]];
        where = '到' + DAY_CN[c0.day - 1] + '第' + c0.periodFrom + '-' + c0.periodTo + '节';
      }
      log.push('移动 ' + idx.length + ' 条「' + m + '」' + where);
      n += idx.length;
    } else {
      const label = has(kind) ? String(kind) : '(空)';
      log.push('未知操作「' + label + '」，已跳过');
    }
  }

  const outCourses = courses.map(function (c) { return canonCourse(c); });

  return {
    opsText: texts.join('；'),
    courses: outCourses,
    log: log,
    n: n
  };
}

function main() {
  const file = process.argv[2];
  const raw = fs.readFileSync(file, 'utf8');
  const input = JSON.parse(raw);
  const result = run(input || {});
  process.stdout.write(JSON.stringify(result) + '\n');
}

main();

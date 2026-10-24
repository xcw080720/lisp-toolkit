// impl.js — 课表 ops 执行器（F 臂：禁用 JSON.parse / JSON.stringify，手写读写）
// 只实现建臂就有的 5 个 op：add / del / edit / move / swap + 输出契约。
'use strict';
const fs = require('fs');

// ===================== 手写 JSON 读取 =====================
function parseJSON(text) {
  const s = String(text);
  let i = 0;
  const fail = (m) => { throw new Error('JSON 解析失败：' + m + ' @' + i); };
  const ws = () => {
    while (i < s.length) {
      const c = s.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++; else break;
    }
  };
  const HEX4 = /^[0-9a-fA-F]{4}$/;
  function str() {
    i++; // 跳过开头的 "
    let out = '';
    for (;;) {
      if (i >= s.length) fail('字符串未闭合');
      const c = s[i];
      if (c === '"') { i++; return out; }
      if (c === '\\') {
        i++;
        const e = s[i++];
        if (e === '"') out += '"';
        else if (e === '\\') out += '\\';
        else if (e === '/') out += '/';
        else if (e === 'b') out += '\b';
        else if (e === 'f') out += '\f';
        else if (e === 'n') out += '\n';
        else if (e === 'r') out += '\r';
        else if (e === 't') out += '\t';
        else if (e === 'u') {
          const h = s.slice(i, i + 4);
          if (!HEX4.test(h)) fail('非法 \\u 转义');
          out += String.fromCharCode(parseInt(h, 16));
          i += 4;
        } else fail('非法转义 \\' + e);
      } else { out += c; i++; }
    }
  }
  function num() {
    const re = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m || m.index !== i) fail('非法数字');
    i += m[0].length;
    return Number(m[0]);
  }
  function value() {
    ws();
    if (i >= s.length) fail('意外结束');
    const c = s[i];
    if (c === '{') return obj();
    if (c === '[') return arr();
    if (c === '"') return str();
    if (c === 't') { if (s.slice(i, i + 4) !== 'true') fail('非法字面量'); i += 4; return true; }
    if (c === 'f') { if (s.slice(i, i + 5) !== 'false') fail('非法字面量'); i += 5; return false; }
    if (c === 'n') { if (s.slice(i, i + 4) !== 'null') fail('非法字面量'); i += 4; return null; }
    return num();
  }
  function obj() {
    i++; // {
    const o = {}; // 键按出现顺序插入，V8 对非数字键保持插入序
    ws();
    if (s[i] === '}') { i++; return o; }
    for (;;) {
      ws();
      if (s[i] !== '"') fail('对象的键必须是字符串');
      const k = str();
      ws();
      if (s[i] !== ':') fail('对象缺少冒号');
      i++;
      o[k] = value();
      ws();
      if (s[i] === ',') { i++; continue; }
      if (s[i] === '}') { i++; return o; }
      fail('对象缺少逗号或右括号');
    }
  }
  function arr() {
    i++; // [
    const a = [];
    ws();
    if (s[i] === ']') { i++; return a; }
    for (;;) {
      a.push(value());
      ws();
      if (s[i] === ',') { i++; continue; }
      if (s[i] === ']') { i++; return a; }
      fail('数组缺少逗号或右括号');
    }
  }
  const v = value();
  ws();
  if (i !== s.length) fail('尾部有多余字符');
  return v;
}

// ===================== 手写 JSON 写出 =====================
function quoteStr(str) {
  let out = '"';
  for (let k = 0; k < str.length; k++) {
    const code = str.charCodeAt(k);
    if (code === 34) out += '\\"';
    else if (code === 92) out += '\\\\';
    else if (code === 8) out += '\\b';
    else if (code === 12) out += '\\f';
    else if (code === 10) out += '\\n';
    else if (code === 13) out += '\\r';
    else if (code === 9) out += '\\t';
    else if (code < 0x20 || code === 0x7f) out += '\\u' + code.toString(16).padStart(4, '0');
    else out += str[k];
  }
  return out + '"';
}
function toJSON(v) {
  if (v === null || v === undefined) return 'null';
  const t = typeof v;
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (t === 'string') return quoteStr(v);
  if (Array.isArray(v)) {
    let out = '[';
    for (let k = 0; k < v.length; k++) { if (k) out += ','; out += toJSON(v[k]); }
    return out + ']';
  }
  if (t === 'object') {
    let out = '{';
    const keys = Object.keys(v);
    for (let k = 0; k < keys.length; k++) { if (k) out += ','; out += quoteStr(keys[k]) + ':' + toJSON(v[keys[k]]); }
    return out + '}';
  }
  return 'null';
}

// ===================== 语义辅助 =====================
const KNOWN_OPS = ['add', 'del', 'edit', 'move', 'swap'];
const DEFAULT_WEEKS = { type: 'range', from: 1, to: 16 };

function clampDay(d) {
  let v = typeof d === 'number' ? d : parseInt(d, 10);
  if (!Number.isFinite(v)) return 1;
  v = Math.trunc(v);
  if (v < 1) return 1;
  if (v > 7) return 7;
  return v;
}
function normText(x) { return x === null || x === undefined ? '' : String(x); }
function hits(courses, match) {
  const m = normText(match);
  const out = [];
  for (let k = 0; k < courses.length; k++) {
    const nm = courses[k] && typeof courses[k].name === 'string' ? courses[k].name : '';
    if (nm.indexOf(m) >= 0) out.push(k);
  }
  return out;
}
function makeCourse(src) {
  const c = src && typeof src === 'object' ? src : {};
  const o = {};
  o.name = normText(c.name);
  o.teacher = c.teacher === undefined ? '' : c.teacher;
  o.location = c.location === undefined ? '' : c.location;
  o.day = clampDay(c.day === undefined ? 1 : c.day);
  o.periodFrom = c.periodFrom === undefined ? 1 : c.periodFrom;
  o.periodTo = c.periodTo === undefined ? 2 : c.periodTo;
  o.weeks = c.weeks === undefined || c.weeks === null
    ? { type: DEFAULT_WEEKS.type, from: DEFAULT_WEEKS.from, to: DEFAULT_WEEKS.to }
    : c.weeks;
  o.tag = c.tag === undefined ? null : c.tag;
  return o;
}

// ===================== 主流程 =====================
function main() {
  const file = process.argv[2];
  let state;
  try {
    state = parseJSON(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    process.stdout.write(toJSON({ opsText: '', courses: [], log: ['1) 读取失败 ' + e.message], n: 0 }) + '\n');
    return;
  }
  if (!state || typeof state !== 'object') state = {};
  const origCourses = Array.isArray(state.courses) ? state.courses : [];
  const ops = Array.isArray(state.ops) ? state.ops : [];

  // 先整体校验，未知 op 一律整批拒绝（课表原样不动）
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const nm = op && typeof op === 'object' ? op.op : undefined;
    if (typeof nm !== 'string' || KNOWN_OPS.indexOf(nm) < 0) {
      const out = { opsText: '', courses: origCourses, log: ['1) 拒绝：未知 op ' + normText(nm)], n: 0 };
      process.stdout.write(toJSON(out) + '\n');
      return;
    }
  }

  const courses = origCourses.slice();
  const log = [];
  let n = 0;
  const say = (msg) => { log.push((log.length + 1) + ') ' + msg); };

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op.op === 'add') {
      const c = makeCourse(op.course);
      courses.push(c);
      n += 1;
      say('添加 ' + c.name + '（周' + c.day + ' 第' + c.periodFrom + '-' + c.periodTo + '节）');
    } else if (op.op === 'del') {
      const idx = hits(courses, op.match);
      for (let j = idx.length - 1; j >= 0; j--) courses.splice(idx[j], 1);
      n += idx.length;
      say(idx.length ? ('删除 ' + idx.length + ' 门：' + normText(op.match)) : ('没找到 ' + normText(op.match)));
    } else if (op.op === 'edit') {
      const idx = hits(courses, op.match);
      const set = op.set && typeof op.set === 'object' ? op.set : {};
      const keys = Object.keys(set);
      for (let j = 0; j < idx.length; j++) {
        const c = courses[idx[j]];
        for (let t = 0; t < keys.length; t++) {
          const key = keys[t];
          c[key] = key === 'day' ? clampDay(set[key]) : set[key];
        }
      }
      n += idx.length;
      say(idx.length ? ('修改 ' + idx.length + ' 门：' + normText(op.match)) : ('没找到 ' + normText(op.match)));
    } else if (op.op === 'move') {
      if (op.day === undefined || op.periodFrom === undefined || op.periodTo === undefined) {
        say('跳过 move：day/periodFrom/periodTo 缺字段');
      } else {
        const idx = hits(courses, op.match);
        for (let j = 0; j < idx.length; j++) {
          const c = courses[idx[j]];
          c.day = clampDay(op.day);
          c.periodFrom = op.periodFrom;
          c.periodTo = op.periodTo;
        }
        n += idx.length;
        say(idx.length ? ('移动 ' + idx.length + ' 门到周' + clampDay(op.day)) : ('没找到 ' + normText(op.match)));
      }
    } else if (op.op === 'swap') {
      const A = hits(courses, op.match);
      const B = hits(courses, op.with);
      if (A.length === 1 && B.length === 1 && A[0] !== B[0]) {
        const a = courses[A[0]], b = courses[B[0]];
        const d = a.day, f = a.periodFrom, t = a.periodTo;
        a.day = b.day; a.periodFrom = b.periodFrom; a.periodTo = b.periodTo;
        b.day = d; b.periodFrom = f; b.periodTo = t;
        n += 2;
        say('互换：' + a.name + ' ↔ ' + b.name);
      } else {
        say('跳过 swap：两侧需各命中恰好 1 门');
      }
    }
  }

  const out = { opsText: ops.length ? toJSON(ops) : '', courses, log, n };
  process.stdout.write(toJSON(out) + '\n');
}

main();

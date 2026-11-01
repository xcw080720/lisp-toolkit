'use strict';

let state = [];
const out = [];

function validName(s) {
  return typeof s === 'string' && s.length >= 1 && s.length <= 12;
}

function validWord(s) {
  return typeof s === 'string' && s.length >= 1 && s.length <= 12;
}

function isIntRange(s, lo, hi) {
  if (typeof s !== 'string' || !/^[0-9]+$/.test(s)) return false;
  const n = Number(s);
  return Number.isInteger(n) && n >= lo && n <= hi;
}

function isDelta(s) {
  if (typeof s !== 'string' || !/^-?[0-9]+$/.test(s)) return false;
  const n = Number(s);
  return Number.isInteger(n) && Number.isSafeInteger(n);
}

function findIndex(name) {
  for (let i = 0; i < state.length; i++) {
    if (state[i].name === name) return i;
  }
  return -1;
}

function hasConflict(day, from, to, exclude) {
  for (let i = 0; i < state.length; i++) {
    if (i === exclude) continue;
    const c = state[i];
    if (c.day === day && c.from <= to && from <= c.to) return true;
  }
  return false;
}

const args = process.argv.slice(2);

for (let ai = 0; ai < args.length; ai++) {
  const cmd = args[ai];
  const trimmed = cmd.trim();
  const tokens = trimmed === '' ? [] : trimmed.split(/\s+/);

  if (tokens.length === 0) {
    out.push('err BADARG');
    continue;
  }

  const verb = tokens[0];

  switch (verb) {
    case 'add': {
      if (tokens.length !== 7) { out.push('err BADARG'); break; }
      const name = tokens[1];
      const teacher = tokens[2];
      const loc = tokens[3];
      if (!validName(name) || !validWord(teacher) || !validWord(loc)) { out.push('err BADARG'); break; }
      if (!isIntRange(tokens[4], 1, 7) || !isIntRange(tokens[5], 1, 12) || !isIntRange(tokens[6], 1, 12)) { out.push('err BADARG'); break; }
      const day = Number(tokens[4]);
      const from = Number(tokens[5]);
      const to = Number(tokens[6]);
      if (to < from) { out.push('err BADARG'); break; }
      if (findIndex(name) !== -1) { out.push('err DUP'); break; }
      if (state.length >= 20) { out.push('err LIMIT'); break; }
      if (hasConflict(day, from, to, -1)) { out.push('err CONFLICT'); break; }
      state.push({ name: name, teacher: teacher, loc: loc, day: day, from: from, to: to });
      out.push('ok add 1');
      break;
    }
    case 'del': {
      if (tokens.length !== 2) { out.push('err BADARG'); break; }
      const name = tokens[1];
      if (!validName(name)) { out.push('err BADARG'); break; }
      const idx = findIndex(name);
      if (idx === -1) { out.push('err NOTFOUND'); break; }
      state.splice(idx, 1);
      out.push('ok del 1');
      break;
    }
    case 'edit': {
      if (tokens.length !== 4) { out.push('err BADARG'); break; }
      const name = tokens[1];
      const teacher = tokens[2];
      const loc = tokens[3];
      if (!validName(name) || !validWord(teacher) || !validWord(loc)) { out.push('err BADARG'); break; }
      const idx = findIndex(name);
      if (idx === -1) { out.push('err NOTFOUND'); break; }
      state[idx].teacher = teacher;
      state[idx].loc = loc;
      out.push('ok edit 1');
      break;
    }
    case 'move': {
      if (tokens.length !== 5) { out.push('err BADARG'); break; }
      const name = tokens[1];
      if (!validName(name) || !isIntRange(tokens[2], 1, 7) || !isIntRange(tokens[3], 1, 12) || !isIntRange(tokens[4], 1, 12)) { out.push('err BADARG'); break; }
      const day = Number(tokens[2]);
      const from = Number(tokens[3]);
      const to = Number(tokens[4]);
      if (to < from) { out.push('err BADARG'); break; }
      const idx = findIndex(name);
      if (idx === -1) { out.push('err NOTFOUND'); break; }
      if (hasConflict(day, from, to, idx)) { out.push('err CONFLICT'); break; }
      state[idx].day = day;
      state[idx].from = from;
      state[idx].to = to;
      out.push('ok move 1');
      break;
    }
    case 'swap': {
      if (tokens.length !== 3) { out.push('err BADARG'); break; }
      const a = tokens[1];
      const b = tokens[2];
      if (!validName(a) || !validName(b)) { out.push('err BADARG'); break; }
      const ia = findIndex(a);
      if (ia === -1) { out.push('err NOTFOUND'); break; }
      const ib = findIndex(b);
      if (ib === -1) { out.push('err NOTFOUND'); break; }
      if (ia !== ib) {
        const ca = state[ia];
        const cb = state[ib];
        const tmpDay = ca.day;
        const tmpFrom = ca.from;
        const tmpTo = ca.to;
        ca.day = cb.day;
        ca.from = cb.from;
        ca.to = cb.to;
        cb.day = tmpDay;
        cb.from = tmpFrom;
        cb.to = tmpTo;
      }
      out.push('ok swap 2');
      break;
    }
    case 'rename': {
      if (tokens.length !== 3) { out.push('err BADARG'); break; }
      const oldName = tokens[1];
      const newName = tokens[2];
      if (!validName(oldName) || !validName(newName)) { out.push('err BADARG'); break; }
      const idx = findIndex(oldName);
      if (idx === -1) { out.push('err NOTFOUND'); break; }
      if (newName !== oldName && findIndex(newName) !== -1) { out.push('err DUP'); break; }
      state[idx].name = newName;
      out.push('ok rename 1');
      break;
    }
    case 'duplicate': {
      if (tokens.length !== 3) { out.push('err BADARG'); break; }
      const name = tokens[1];
      const newname = tokens[2];
      if (!validName(name) || !validName(newname)) { out.push('err BADARG'); break; }
      const idx = findIndex(name);
      if (idx === -1) { out.push('err NOTFOUND'); break; }
      if (findIndex(newname) !== -1) { out.push('err DUP'); break; }
      if (state.length >= 20) { out.push('err LIMIT'); break; }
      const src = state[idx];
      state.push({ name: newname, teacher: src.teacher, loc: src.loc, day: src.day, from: src.from, to: src.to });
      out.push('ok duplicate 1');
      break;
    }
    case 'trim': {
      if (tokens.length !== 3) { out.push('err BADARG'); break; }
      if (!isIntRange(tokens[1], 1, 7) || !isIntRange(tokens[2], 1, 12)) { out.push('err BADARG'); break; }
      const day = Number(tokens[1]);
      const to = Number(tokens[2]);
      let count = 0;
      for (let i = 0; i < state.length; i++) {
        const c = state[i];
        if (c.day === day && c.from <= to && to < c.to) {
          c.to = to;
          count++;
        }
      }
      out.push('ok trim ' + count);
      break;
    }
    case 'clear': {
      if (tokens.length !== 2) { out.push('err BADARG'); break; }
      if (!isIntRange(tokens[1], 1, 7)) { out.push('err BADARG'); break; }
      const day = Number(tokens[1]);
      let count = 0;
      const next = [];
      for (let i = 0; i < state.length; i++) {
        if (state[i].day === day) {
          count++;
        } else {
          next.push(state[i]);
        }
      }
      state = next;
      out.push('ok clear ' + count);
      break;
    }
    case 'shift': {
      if (tokens.length !== 3) { out.push('err BADARG'); break; }
      if (!isIntRange(tokens[1], 1, 7) || !isDelta(tokens[2])) { out.push('err BADARG'); break; }
      const day = Number(tokens[1]);
      const delta = Number(tokens[2]);
      const target = day + delta;
      if (target < 1 || target > 7) { out.push('err BADARG'); break; }
      let count = 0;
      for (let i = 0; i < state.length; i++) {
        if (state[i].day === day) {
          state[i].day = target;
          count++;
        }
      }
      out.push('ok shift ' + count);
      break;
    }
    case 'copy': {
      if (tokens.length !== 3) { out.push('err BADARG'); break; }
      const name = tokens[1];
      if (!validName(name) || !isIntRange(tokens[2], 1, 7)) { out.push('err BADARG'); break; }
      const day = Number(tokens[2]);
      const idx = findIndex(name);
      if (idx === -1) { out.push('err NOTFOUND'); break; }
      const src = state[idx];
      const newname = src.name + '_2';
      if (newname.length < 1 || newname.length > 12) { out.push('err BADARG'); break; }
      if (findIndex(newname) !== -1) { out.push('err DUP'); break; }
      if (state.length >= 20) { out.push('err LIMIT'); break; }
      state.push({ name: newname, teacher: src.teacher, loc: src.loc, day: day, from: src.from, to: src.to });
      out.push('ok copy 1');
      break;
    }
    case 'merge': {
      if (tokens.length !== 3) { out.push('err BADARG'); break; }
      const a = tokens[1];
      const b = tokens[2];
      if (!validName(a) || !validName(b)) { out.push('err BADARG'); break; }
      const ia = findIndex(a);
      if (ia === -1) { out.push('err NOTFOUND'); break; }
      const ib = findIndex(b);
      if (ib === -1) { out.push('err NOTFOUND'); break; }
      state[ia].teacher = state[ib].teacher;
      state[ia].loc = state[ib].loc;
      state.splice(ib, 1);
      out.push('ok merge 2');
      break;
    }
    case 'sort': {
      if (tokens.length !== 1) { out.push('err BADARG'); break; }
      out.push('ok sort 0');
      break;
    }
    case 'filter': {
      if (tokens.length !== 2) { out.push('err BADARG'); break; }
      if (!isIntRange(tokens[1], 1, 7)) { out.push('err BADARG'); break; }
      const day = Number(tokens[1]);
      let count = 0;
      for (let i = 0; i < state.length; i++) {
        if (state[i].day === day) count++;
      }
      out.push('ok filter ' + count);
      break;
    }
    case 'count': {
      if (tokens.length !== 1) { out.push('err BADARG'); break; }
      out.push('ok count ' + state.length);
      break;
    }
    default: {
      out.push('err BADARG');
      break;
    }
  }
}

out.push('#state');

const sorted = state.slice().sort(function (a, b) {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
});

for (let i = 0; i < sorted.length; i++) {
  const c = sorted[i];
  out.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
}

process.stdout.write(out.join('\n') + '\n');

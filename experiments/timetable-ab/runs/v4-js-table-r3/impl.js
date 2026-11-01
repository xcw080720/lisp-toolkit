const find = (state, name) => state.find(c => c.name === name);
const isWord = s => typeof s === 'string' && s.length >= 1 && s.length <= 12;
const parseIntStrict = s => {
  if (typeof s !== 'string' || !/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
};
const hasConflict = (state, day, from, to, excludeName) => {
  for (let i = 0; i < state.length; i++) {
    const c = state[i];
    if (c.name === excludeName) continue;
    if (c.day === day && !(c.to < from || to < c.from)) return true;
  }
  return false;
};

const OPS = {
  add: { argc: 6, fn: (state, a) => {
    const name = a[0], teacher = a[1], loc = a[2];
    if (!isWord(name) || !isWord(teacher) || !isWord(loc)) return { ok: false, code: 'BADARG' };
    const day = parseIntStrict(a[3]);
    const from = parseIntStrict(a[4]);
    const to = parseIntStrict(a[5]);
    if (day === null || day < 1 || day > 7 || from === null || from < 1 || from > 12 || to === null || to < 1 || to > 12 || to < from) return { ok: false, code: 'BADARG' };
    if (find(state, name)) return { ok: false, code: 'DUP' };
    if (state.length >= 20) return { ok: false, code: 'LIMIT' };
    if (hasConflict(state, day, from, to, null)) return { ok: false, code: 'CONFLICT' };
    state.push({ name, teacher, loc, day, from, to });
    return { ok: true, verb: 'add', n: 1 };
  }},
  del: { argc: 1, fn: (state, a) => {
    const name = a[0];
    if (!isWord(name)) return { ok: false, code: 'BADARG' };
    const idx = state.findIndex(c => c.name === name);
    if (idx < 0) return { ok: false, code: 'NOTFOUND' };
    state.splice(idx, 1);
    return { ok: true, verb: 'del', n: 1 };
  }},
  edit: { argc: 3, fn: (state, a) => {
    const name = a[0], teacher = a[1], loc = a[2];
    if (!isWord(name) || !isWord(teacher) || !isWord(loc)) return { ok: false, code: 'BADARG' };
    const c = find(state, name);
    if (!c) return { ok: false, code: 'NOTFOUND' };
    c.teacher = teacher;
    c.loc = loc;
    return { ok: true, verb: 'edit', n: 1 };
  }},
  move: { argc: 4, fn: (state, a) => {
    const name = a[0];
    if (!isWord(name)) return { ok: false, code: 'BADARG' };
    const day = parseIntStrict(a[1]);
    const from = parseIntStrict(a[2]);
    const to = parseIntStrict(a[3]);
    if (day === null || day < 1 || day > 7 || from === null || from < 1 || from > 12 || to === null || to < 1 || to > 12 || to < from) return { ok: false, code: 'BADARG' };
    const c = find(state, name);
    if (!c) return { ok: false, code: 'NOTFOUND' };
    if (hasConflict(state, day, from, to, name)) return { ok: false, code: 'CONFLICT' };
    c.day = day;
    c.from = from;
    c.to = to;
    return { ok: true, verb: 'move', n: 1 };
  }},
  swap: { argc: 2, fn: (state, a) => {
    const nameA = a[0], nameB = a[1];
    if (!isWord(nameA) || !isWord(nameB)) return { ok: false, code: 'BADARG' };
    const A = find(state, nameA);
    const B = find(state, nameB);
    if (!A || !B) return { ok: false, code: 'NOTFOUND' };
    const tmpDay = A.day, tmpFrom = A.from, tmpTo = A.to;
    A.day = B.day; A.from = B.from; A.to = B.to;
    B.day = tmpDay; B.from = tmpFrom; B.to = tmpTo;
    return { ok: true, verb: 'swap', n: 2 };
  }},
  rename: { argc: 2, fn: (state, a) => {
    const oldName = a[0], newName = a[1];
    if (!isWord(oldName) || !isWord(newName)) return { ok: false, code: 'BADARG' };
    const c = find(state, oldName);
    if (!c) return { ok: false, code: 'NOTFOUND' };
    if (find(state, newName)) return { ok: false, code: 'DUP' };
    c.name = newName;
    return { ok: true, verb: 'rename', n: 1 };
  }},
  duplicate: { argc: 2, fn: (state, a) => {
    const name = a[0], newName = a[1];
    if (!isWord(name) || !isWord(newName)) return { ok: false, code: 'BADARG' };
    const c = find(state, name);
    if (!c) return { ok: false, code: 'NOTFOUND' };
    if (find(state, newName)) return { ok: false, code: 'DUP' };
    if (state.length >= 20) return { ok: false, code: 'LIMIT' };
    state.push({ name: newName, teacher: c.teacher, loc: c.loc, day: c.day, from: c.from, to: c.to });
    return { ok: true, verb: 'duplicate', n: 1 };
  }},
  trim: { argc: 2, fn: (state, a) => {
    const day = parseIntStrict(a[0]);
    const to = parseIntStrict(a[1]);
    if (day === null || day < 1 || day > 7 || to === null || to < 1 || to > 12) return { ok: false, code: 'BADARG' };
    let changed = 0;
    for (let i = 0; i < state.length; i++) {
      const c = state[i];
      if (c.day === day && c.from <= to && to < c.to) {
        c.to = to;
        changed++;
      }
    }
    return { ok: true, verb: 'trim', n: changed };
  }},
  clear: { argc: 1, fn: (state, a) => {
    const day = parseIntStrict(a[0]);
    if (day === null || day < 1 || day > 7) return { ok: false, code: 'BADARG' };
    let count = 0;
    for (let i = state.length - 1; i >= 0; i--) {
      if (state[i].day === day) {
        state.splice(i, 1);
        count++;
      }
    }
    return { ok: true, verb: 'clear', n: count };
  }},
  shift: { argc: 2, fn: (state, a) => {
    const day = parseIntStrict(a[0]);
    const delta = parseIntStrict(a[1]);
    if (day === null || day < 1 || day > 7 || delta === null) return { ok: false, code: 'BADARG' };
    const newDay = day + delta;
    if (newDay < 1 || newDay > 7) return { ok: false, code: 'BADARG' };
    let count = 0;
    for (let i = 0; i < state.length; i++) {
      const c = state[i];
      if (c.day === day) {
        c.day = newDay;
        count++;
      }
    }
    return { ok: true, verb: 'shift', n: count };
  }},
  copy: { argc: 2, fn: (state, a) => {
    const name = a[0];
    if (!isWord(name)) return { ok: false, code: 'BADARG' };
    const day = parseIntStrict(a[1]);
    if (day === null || day < 1 || day > 7) return { ok: false, code: 'BADARG' };
    const c = find(state, name);
    if (!c) return { ok: false, code: 'NOTFOUND' };
    const newName = name + '_2';
    if (newName.length > 12) return { ok: false, code: 'BADARG' };
    if (find(state, newName)) return { ok: false, code: 'DUP' };
    if (state.length >= 20) return { ok: false, code: 'LIMIT' };
    state.push({ name: newName, teacher: c.teacher, loc: c.loc, day: day, from: c.from, to: c.to });
    return { ok: true, verb: 'copy', n: 1 };
  }},
  merge: { argc: 2, fn: (state, a) => {
    const nameA = a[0], nameB = a[1];
    if (!isWord(nameA) || !isWord(nameB)) return { ok: false, code: 'BADARG' };
    const A = find(state, nameA);
    const B = find(state, nameB);
    if (!A || !B) return { ok: false, code: 'NOTFOUND' };
    A.teacher = B.teacher;
    A.loc = B.loc;
    const idx = state.indexOf(B);
    state.splice(idx, 1);
    return { ok: true, verb: 'merge', n: 2 };
  }},
  sort: { argc: 0, fn: (state, a) => {
    return { ok: true, verb: 'sort', n: 0 };
  }},
  filter: { argc: 1, fn: (state, a) => {
    const day = parseIntStrict(a[0]);
    if (day === null || day < 1 || day > 7) return { ok: false, code: 'BADARG' };
    let count = 0;
    for (let i = 0; i < state.length; i++) {
      if (state[i].day === day) count++;
    }
    return { ok: true, verb: 'filter', n: count };
  }},
  count: { argc: 0, fn: (state, a) => {
    return { ok: true, verb: 'count', n: state.length };
  }}
};

const args = process.argv.slice(2);
let state = [];
for (let i = 0; i < args.length; i++) {
  const cmd = args[i];
  const tokens = cmd.trim().split(/\s+/);
  if (tokens.length === 0 || tokens[0] === '') {
    console.log('err BADARG');
    continue;
  }
  const verb = tokens[0];
  const params = tokens.slice(1);
  const entry = OPS[verb];
  if (!entry || params.length !== entry.argc) {
    console.log('err BADARG');
    continue;
  }
  const result = entry.fn(state, params);
  if (result.ok) {
    console.log(`ok ${result.verb} ${result.n}`);
  } else {
    console.log(`err ${result.code}`);
  }
}
console.log('#state');
state.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
for (let i = 0; i < state.length; i++) {
  const c = state[i];
  console.log(`${c.name}|${c.teacher}|${c.loc}|${c.day}|${c.from}-${c.to}`);
}

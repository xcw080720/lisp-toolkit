function ok(n) { return { ok: true, n: n }; }
function err(code) { return { ok: false, code: code }; }
function isWord(s) {
  return typeof s === 'string' && s.length >= 1 && s.length <= 12 && !/\s/.test(s);
}
function parseInteger(s) {
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}
function find(state, name) {
  for (const c of state) {
    if (c.name === name) return c;
  }
  return null;
}
function hasConflict(state, day, from, to, excludeName) {
  for (const c of state) {
    if (c.name === excludeName) continue;
    if (c.day === day && from <= c.to && c.from <= to) return true;
  }
  return false;
}

const OPS = {
  add: { arity: 6, run: function(state, a) {
    const name = a[0], teacher = a[1], loc = a[2];
    if (!isWord(name) || !isWord(teacher) || !isWord(loc)) return err('BADARG');
    const day = parseInteger(a[3]);
    const from = parseInteger(a[4]);
    const to = parseInteger(a[5]);
    if (day === null || from === null || to === null) return err('BADARG');
    if (day < 1 || day > 7 || from < 1 || from > 12 || to < 1 || to > 12 || to < from) return err('BADARG');
    if (find(state, name)) return err('DUP');
    if (state.length >= 20) return err('LIMIT');
    if (hasConflict(state, day, from, to, null)) return err('CONFLICT');
    state.push({ name: name, teacher: teacher, loc: loc, day: day, from: from, to: to });
    return ok(1);
  }},
  del: { arity: 1, run: function(state, a) {
    const idx = state.findIndex(function(c) { return c.name === a[0]; });
    if (idx === -1) return err('NOTFOUND');
    state.splice(idx, 1);
    return ok(1);
  }},
  edit: { arity: 3, run: function(state, a) {
    const name = a[0], teacher = a[1], loc = a[2];
    if (!isWord(teacher) || !isWord(loc)) return err('BADARG');
    const c = find(state, name);
    if (!c) return err('NOTFOUND');
    c.teacher = teacher;
    c.loc = loc;
    return ok(1);
  }},
  move: { arity: 4, run: function(state, a) {
    const name = a[0];
    const day = parseInteger(a[1]);
    const from = parseInteger(a[2]);
    const to = parseInteger(a[3]);
    if (day === null || from === null || to === null) return err('BADARG');
    if (day < 1 || day > 7 || from < 1 || from > 12 || to < 1 || to > 12 || to < from) return err('BADARG');
    const c = find(state, name);
    if (!c) return err('NOTFOUND');
    if (hasConflict(state, day, from, to, name)) return err('CONFLICT');
    c.day = day; c.from = from; c.to = to;
    return ok(1);
  }},
  swap: { arity: 2, run: function(state, a) {
    const ca = find(state, a[0]);
    const cb = find(state, a[1]);
    if (!ca || !cb) return err('NOTFOUND');
    const d = ca.day, f = ca.from, t = ca.to;
    ca.day = cb.day; ca.from = cb.from; ca.to = cb.to;
    cb.day = d; cb.from = f; cb.to = t;
    return ok(2);
  }},
  rename: { arity: 2, run: function(state, a) {
    const oldName = a[0], newName = a[1];
    if (!isWord(newName)) return err('BADARG');
    const c = find(state, oldName);
    if (!c) return err('NOTFOUND');
    if (find(state, newName)) return err('DUP');
    c.name = newName;
    return ok(1);
  }},
  duplicate: { arity: 2, run: function(state, a) {
    const name = a[0], newName = a[1];
    if (!isWord(newName)) return err('BADARG');
    const c = find(state, name);
    if (!c) return err('NOTFOUND');
    if (find(state, newName)) return err('DUP');
    if (state.length >= 20) return err('LIMIT');
    state.push({ name: newName, teacher: c.teacher, loc: c.loc, day: c.day, from: c.from, to: c.to });
    return ok(1);
  }},
  trim: { arity: 2, run: function(state, a) {
    const day = parseInteger(a[0]);
    const to = parseInteger(a[1]);
    if (day === null || to === null) return err('BADARG');
    if (day < 1 || day > 7 || to < 1 || to > 12) return err('BADARG');
    let n = 0;
    for (const c of state) {
      if (c.day === day && c.from <= to && to < c.to) {
        c.to = to;
        n++;
      }
    }
    return ok(n);
  }},
  clear: { arity: 1, run: function(state, a) {
    const day = parseInteger(a[0]);
    if (day === null || day < 1 || day > 7) return err('BADARG');
    let n = 0;
    for (let i = state.length - 1; i >= 0; i--) {
      if (state[i].day === day) {
        state.splice(i, 1);
        n++;
      }
    }
    return ok(n);
  }},
  shift: { arity: 2, run: function(state, a) {
    const day = parseInteger(a[0]);
    const delta = parseInteger(a[1]);
    if (day === null || delta === null) return err('BADARG');
    if (day < 1 || day > 7) return err('BADARG');
    const newDay = day + delta;
    if (newDay < 1 || newDay > 7) return err('BADARG');
    let n = 0;
    for (const c of state) {
      if (c.day === day) {
        c.day = newDay;
        n++;
      }
    }
    return ok(n);
  }},
  copy: { arity: 2, run: function(state, a) {
    const name = a[0];
    const day = parseInteger(a[1]);
    if (day === null || day < 1 || day > 7) return err('BADARG');
    const c = find(state, name);
    if (!c) return err('NOTFOUND');
    const newName = name + '_2';
    if (!isWord(newName)) return err('BADARG');
    if (find(state, newName)) return err('DUP');
    if (state.length >= 20) return err('LIMIT');
    state.push({ name: newName, teacher: c.teacher, loc: c.loc, day: day, from: c.from, to: c.to });
    return ok(1);
  }},
  merge: { arity: 2, run: function(state, a) {
    const ca = find(state, a[0]);
    const cb = find(state, a[1]);
    if (!ca || !cb) return err('NOTFOUND');
    ca.teacher = cb.teacher;
    ca.loc = cb.loc;
    const idx = state.indexOf(cb);
    state.splice(idx, 1);
    return ok(2);
  }},
  sort: { arity: 0, run: function(state, a) {
    return ok(0);
  }},
  filter: { arity: 1, run: function(state, a) {
    const day = parseInteger(a[0]);
    if (day === null || day < 1 || day > 7) return err('BADARG');
    let n = 0;
    for (const c of state) {
      if (c.day === day) n++;
    }
    return ok(n);
  }},
  count: { arity: 0, run: function(state, a) {
    return ok(state.length);
  }}
};

function execute(raw, state) {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, code: 'BADARG' };
  const tokens = trimmed.split(/\s+/);
  const verb = tokens[0];
  const spec = OPS[verb];
  if (!spec) return { ok: false, code: 'BADARG' };
  const args = tokens.slice(1);
  if (args.length !== spec.arity) return { ok: false, code: 'BADARG' };
  const res = spec.run(state, args);
  if (!res.ok) return res;
  return { ok: true, verb: verb, n: res.n };
}

const state = [];
const lines = [];
for (let i = 2; i < process.argv.length; i++) {
  const res = execute(process.argv[i], state);
  if (res.ok) {
    lines.push('ok ' + res.verb + ' ' + res.n);
  } else {
    lines.push('err ' + res.code);
  }
}
lines.push('#state');
state.sort(function(a, b) {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
});
for (const c of state) {
  lines.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
}
process.stdout.write(lines.join('\n') + '\n');

'use strict';
let state = [];

function word(s) {
  return typeof s === 'string' && s.length >= 1 && s.length <= 12 && !/\s/.test(s);
}

function posInt(s, min, max) {
  if (typeof s !== 'string' || !/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function deltaInt(s) {
  if (typeof s !== 'string' || !/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

function find(name) {
  return state.find(function (c) { return c.name === name; });
}

function intervalOverlap(a, b) {
  return a.from <= b.to && b.from <= a.to;
}

const OPS = {
  add: {
    arity: 6,
    run: function (args) {
      const name = args[0];
      const teacher = args[1];
      const loc = args[2];
      const day = posInt(args[3], 1, 7);
      const from = posInt(args[4], 1, 12);
      const to = posInt(args[5], 1, 12);
      if (!word(name) || !word(teacher) || !word(loc)) return { code: 'BADARG' };
      if (day === null || from === null || to === null || to < from) return { code: 'BADARG' };
      if (find(name)) return { code: 'DUP' };
      if (state.length >= 20) return { code: 'LIMIT' };
      for (let i = 0; i < state.length; i++) {
        const c = state[i];
        if (c.day === day && intervalOverlap({ from: from, to: to }, c)) return { code: 'CONFLICT' };
      }
      state.push({ name: name, teacher: teacher, loc: loc, day: day, from: from, to: to });
      return { n: 1 };
    }
  },
  del: {
    arity: 1,
    run: function (args) {
      const name = args[0];
      if (!word(name)) return { code: 'BADARG' };
      const idx = state.findIndex(function (c) { return c.name === name; });
      if (idx < 0) return { code: 'NOTFOUND' };
      state.splice(idx, 1);
      return { n: 1 };
    }
  },
  edit: {
    arity: 3,
    run: function (args) {
      const name = args[0];
      const teacher = args[1];
      const loc = args[2];
      if (!word(name) || !word(teacher) || !word(loc)) return { code: 'BADARG' };
      const c = find(name);
      if (!c) return { code: 'NOTFOUND' };
      c.teacher = teacher;
      c.loc = loc;
      return { n: 1 };
    }
  },
  move: {
    arity: 4,
    run: function (args) {
      const name = args[0];
      const day = posInt(args[1], 1, 7);
      const from = posInt(args[2], 1, 12);
      const to = posInt(args[3], 1, 12);
      if (!word(name)) return { code: 'BADARG' };
      if (day === null || from === null || to === null || to < from) return { code: 'BADARG' };
      const c = find(name);
      if (!c) return { code: 'NOTFOUND' };
      for (let i = 0; i < state.length; i++) {
        const x = state[i];
        if (x === c) continue;
        if (x.day === day && intervalOverlap({ from: from, to: to }, x)) return { code: 'CONFLICT' };
      }
      c.day = day;
      c.from = from;
      c.to = to;
      return { n: 1 };
    }
  },
  swap: {
    arity: 2,
    run: function (args) {
      const aName = args[0];
      const bName = args[1];
      if (!word(aName) || !word(bName)) return { code: 'BADARG' };
      const a = find(aName);
      const b = find(bName);
      if (!a || !b) return { code: 'NOTFOUND' };
      if (a === b) return { n: 2 };
      const ad = a.day;
      const af = a.from;
      const at = a.to;
      a.day = b.day;
      a.from = b.from;
      a.to = b.to;
      b.day = ad;
      b.from = af;
      b.to = at;
      return { n: 2 };
    }
  },
  rename: {
    arity: 2,
    run: function (args) {
      const oldName = args[0];
      const newName = args[1];
      if (!word(oldName) || !word(newName)) return { code: 'BADARG' };
      const c = find(oldName);
      if (!c) return { code: 'NOTFOUND' };
      if (find(newName)) return { code: 'DUP' };
      c.name = newName;
      return { n: 1 };
    }
  },
  duplicate: {
    arity: 2,
    run: function (args) {
      const name = args[0];
      const newName = args[1];
      if (!word(name) || !word(newName)) return { code: 'BADARG' };
      const c = find(name);
      if (!c) return { code: 'NOTFOUND' };
      if (find(newName)) return { code: 'DUP' };
      if (state.length >= 20) return { code: 'LIMIT' };
      state.push({ name: newName, teacher: c.teacher, loc: c.loc, day: c.day, from: c.from, to: c.to });
      return { n: 1 };
    }
  },
  trim: {
    arity: 2,
    run: function (args) {
      const day = posInt(args[0], 1, 7);
      const to = posInt(args[1], 1, 12);
      if (day === null || to === null) return { code: 'BADARG' };
      let cnt = 0;
      for (let i = 0; i < state.length; i++) {
        const c = state[i];
        if (c.day === day && c.from <= to && to < c.to) {
          c.to = to;
          cnt++;
        }
      }
      return { n: cnt };
    }
  },
  clear: {
    arity: 1,
    run: function (args) {
      const day = posInt(args[0], 1, 7);
      if (day === null) return { code: 'BADARG' };
      const before = state.length;
      state = state.filter(function (c) { return c.day !== day; });
      return { n: before - state.length };
    }
  },
  shift: {
    arity: 2,
    run: function (args) {
      const day = posInt(args[0], 1, 7);
      const delta = deltaInt(args[1]);
      if (day === null || delta === null) return { code: 'BADARG' };
      const newDay = day + delta;
      if (newDay < 1 || newDay > 7) return { code: 'BADARG' };
      const moving = state.filter(function (c) { return c.day === day; });
      for (let i = 0; i < moving.length; i++) moving[i].day = newDay;
      return { n: moving.length };
    }
  },
  copy: {
    arity: 2,
    run: function (args) {
      const name = args[0];
      const day = posInt(args[1], 1, 7);
      if (!word(name)) return { code: 'BADARG' };
      if (day === null) return { code: 'BADARG' };
      const c = find(name);
      if (!c) return { code: 'NOTFOUND' };
      const newName = name + '_2';
      if (!word(newName)) return { code: 'BADARG' };
      if (find(newName)) return { code: 'DUP' };
      if (state.length >= 20) return { code: 'LIMIT' };
      state.push({ name: newName, teacher: c.teacher, loc: c.loc, day: day, from: c.from, to: c.to });
      return { n: 1 };
    }
  },
  merge: {
    arity: 2,
    run: function (args) {
      const aName = args[0];
      const bName = args[1];
      if (!word(aName) || !word(bName)) return { code: 'BADARG' };
      const a = find(aName);
      const b = find(bName);
      if (!a || !b) return { code: 'NOTFOUND' };
      a.teacher = b.teacher;
      a.loc = b.loc;
      const idx = state.indexOf(b);
      state.splice(idx, 1);
      return { n: 2 };
    }
  },
  sort: {
    arity: 0,
    run: function (args) {
      return { n: 0 };
    }
  },
  filter: {
    arity: 1,
    run: function (args) {
      const day = posInt(args[0], 1, 7);
      if (day === null) return { code: 'BADARG' };
      let cnt = 0;
      for (let i = 0; i < state.length; i++) {
        if (state[i].day === day) cnt++;
      }
      return { n: cnt };
    }
  },
  count: {
    arity: 0,
    run: function (args) {
      return { n: state.length };
    }
  }
};

function parse(line) {
  if (typeof line !== 'string') return [];
  const s = line.trim();
  if (s === '') return [];
  return s.split(/\s+/);
}

const lines = [];
const commands = process.argv.slice(2);
for (let i = 0; i < commands.length; i++) {
  const tokens = parse(commands[i]);
  if (tokens.length === 0) {
    lines.push('err BADARG');
    continue;
  }
  const verb = tokens[0];
  const op = OPS[verb];
  if (!op) {
    lines.push('err BADARG');
    continue;
  }
  const args = tokens.slice(1);
  if (args.length !== op.arity) {
    lines.push('err BADARG');
    continue;
  }
  const res = op.run(args);
  if (res.code) {
    lines.push('err ' + res.code);
  } else {
    lines.push('ok ' + verb + ' ' + res.n);
  }
}
lines.push('#state');
const sorted = state.slice().sort(function (a, b) {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
});
for (let i = 0; i < sorted.length; i++) {
  const c = sorted[i];
  lines.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
}
process.stdout.write(lines.join('\n') + '\n');

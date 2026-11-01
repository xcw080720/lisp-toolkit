let courses = [];
const MAX_COURSES = 20;

function bad(code) {
  return { ok: false, code: code };
}

function good(n) {
  return { ok: true, n: n };
}

function isIntStr(s) {
  return typeof s === 'string' && /^[+-]?\d+$/.test(s);
}

function intIn(s, min, max) {
  if (!isIntStr(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function anyInt(s) {
  if (!isIntStr(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

function isWord(s) {
  return typeof s === 'string' && s.length >= 1 && s.length <= 12 && !/\s/.test(s);
}

function find(name) {
  for (let i = 0; i < courses.length; i++) {
    if (courses[i].name === name) return courses[i];
  }
  return null;
}

function hasConflict(day, from, to, excludeName) {
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    if (c.name === excludeName) continue;
    if (c.day !== day) continue;
    if (!(c.to < from || c.from > to)) return true;
  }
  return false;
}

function removeCourse(c) {
  const i = courses.indexOf(c);
  if (i >= 0) courses.splice(i, 1);
}

const OPS = {
  add: (args) => {
    if (args.length !== 6) return bad('BADARG');
    const name = args[0];
    const teacher = args[1];
    const loc = args[2];
    if (!isWord(name) || !isWord(teacher) || !isWord(loc)) return bad('BADARG');
    const day = intIn(args[3], 1, 7);
    const from = intIn(args[4], 1, 12);
    const to = intIn(args[5], 1, 12);
    if (day === null || from === null || to === null || to < from) return bad('BADARG');
    if (find(name)) return bad('DUP');
    if (courses.length >= MAX_COURSES) return bad('LIMIT');
    if (hasConflict(day, from, to, null)) return bad('CONFLICT');
    courses.push({ name: name, teacher: teacher, loc: loc, day: day, from: from, to: to });
    return good(1);
  },
  del: (args) => {
    if (args.length !== 1) return bad('BADARG');
    const name = args[0];
    if (!isWord(name)) return bad('BADARG');
    const c = find(name);
    if (!c) return bad('NOTFOUND');
    removeCourse(c);
    return good(1);
  },
  edit: (args) => {
    if (args.length !== 3) return bad('BADARG');
    const name = args[0];
    const teacher = args[1];
    const loc = args[2];
    if (!isWord(name) || !isWord(teacher) || !isWord(loc)) return bad('BADARG');
    const c = find(name);
    if (!c) return bad('NOTFOUND');
    c.teacher = teacher;
    c.loc = loc;
    return good(1);
  },
  move: (args) => {
    if (args.length !== 4) return bad('BADARG');
    const name = args[0];
    if (!isWord(name)) return bad('BADARG');
    const day = intIn(args[1], 1, 7);
    const from = intIn(args[2], 1, 12);
    const to = intIn(args[3], 1, 12);
    if (day === null || from === null || to === null || to < from) return bad('BADARG');
    const c = find(name);
    if (!c) return bad('NOTFOUND');
    if (hasConflict(day, from, to, name)) return bad('CONFLICT');
    c.day = day;
    c.from = from;
    c.to = to;
    return good(1);
  },
  swap: (args) => {
    if (args.length !== 2) return bad('BADARG');
    const aName = args[0];
    const bName = args[1];
    if (!isWord(aName) || !isWord(bName)) return bad('BADARG');
    const a = find(aName);
    const b = find(bName);
    if (!a || !b) return bad('NOTFOUND');
    const tmpDay = a.day;
    const tmpFrom = a.from;
    const tmpTo = a.to;
    a.day = b.day;
    a.from = b.from;
    a.to = b.to;
    b.day = tmpDay;
    b.from = tmpFrom;
    b.to = tmpTo;
    return good(2);
  },
  rename: (args) => {
    if (args.length !== 2) return bad('BADARG');
    const oldName = args[0];
    const newName = args[1];
    if (!isWord(oldName) || !isWord(newName)) return bad('BADARG');
    const c = find(oldName);
    if (!c) return bad('NOTFOUND');
    if (find(newName)) return bad('DUP');
    c.name = newName;
    return good(1);
  },
  duplicate: (args) => {
    if (args.length !== 2) return bad('BADARG');
    const name = args[0];
    const newName = args[1];
    if (!isWord(name) || !isWord(newName)) return bad('BADARG');
    const c = find(name);
    if (!c) return bad('NOTFOUND');
    if (find(newName)) return bad('DUP');
    if (courses.length >= MAX_COURSES) return bad('LIMIT');
    courses.push({ name: newName, teacher: c.teacher, loc: c.loc, day: c.day, from: c.from, to: c.to });
    return good(1);
  },
  trim: (args) => {
    if (args.length !== 2) return bad('BADARG');
    const day = intIn(args[0], 1, 7);
    const to = intIn(args[1], 1, 12);
    if (day === null || to === null) return bad('BADARG');
    let n = 0;
    for (let i = 0; i < courses.length; i++) {
      const c = courses[i];
      if (c.day === day && c.from <= to && to < c.to) {
        c.to = to;
        n++;
      }
    }
    return good(n);
  },
  clear: (args) => {
    if (args.length !== 1) return bad('BADARG');
    const day = intIn(args[0], 1, 7);
    if (day === null) return bad('BADARG');
    const kept = [];
    let n = 0;
    for (let i = 0; i < courses.length; i++) {
      const c = courses[i];
      if (c.day === day) {
        n++;
      } else {
        kept.push(c);
      }
    }
    courses = kept;
    return good(n);
  },
  shift: (args) => {
    if (args.length !== 2) return bad('BADARG');
    const day = intIn(args[0], 1, 7);
    const delta = anyInt(args[1]);
    if (day === null || delta === null) return bad('BADARG');
    const newDay = day + delta;
    if (!Number.isSafeInteger(newDay) || newDay < 1 || newDay > 7) return bad('BADARG');
    let n = 0;
    for (let i = 0; i < courses.length; i++) {
      const c = courses[i];
      if (c.day === day) {
        c.day = newDay;
        n++;
      }
    }
    return good(n);
  },
  copy: (args) => {
    if (args.length !== 2) return bad('BADARG');
    const name = args[0];
    if (!isWord(name)) return bad('BADARG');
    const day = intIn(args[1], 1, 7);
    if (day === null) return bad('BADARG');
    const c = find(name);
    if (!c) return bad('NOTFOUND');
    const newName = name + '_2';
    if (newName.length < 1 || newName.length > 12) return bad('BADARG');
    if (find(newName)) return bad('DUP');
    if (courses.length >= MAX_COURSES) return bad('LIMIT');
    courses.push({ name: newName, teacher: c.teacher, loc: c.loc, day: day, from: c.from, to: c.to });
    return good(1);
  },
  merge: (args) => {
    if (args.length !== 2) return bad('BADARG');
    const aName = args[0];
    const bName = args[1];
    if (!isWord(aName) || !isWord(bName)) return bad('BADARG');
    if (aName === bName) return bad('BADARG');
    const a = find(aName);
    const b = find(bName);
    if (!a || !b) return bad('NOTFOUND');
    a.teacher = b.teacher;
    a.loc = b.loc;
    removeCourse(b);
    return good(2);
  },
  sort: (args) => {
    if (args.length !== 0) return bad('BADARG');
    return good(0);
  },
  filter: (args) => {
    if (args.length !== 1) return bad('BADARG');
    const day = intIn(args[0], 1, 7);
    if (day === null) return bad('BADARG');
    let n = 0;
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].day === day) n++;
    }
    return good(n);
  },
  count: (args) => {
    if (args.length !== 0) return bad('BADARG');
    return good(courses.length);
  }
};

function execute(cmd) {
  if (typeof cmd !== 'string') return bad('BADARG');
  const trimmed = cmd.trim();
  if (trimmed === '') return bad('BADARG');
  const parts = trimmed.split(/\s+/);
  const verb = parts[0];
  if (!Object.prototype.hasOwnProperty.call(OPS, verb)) return bad('BADARG');
  const op = OPS[verb];
  const res = op(parts.slice(1));
  if (res.ok) return { ok: true, verb: verb, n: res.n };
  return res;
}

const commands = process.argv.slice(2);
const lines = [];
for (let i = 0; i < commands.length; i++) {
  const res = execute(commands[i]);
  if (res.ok) {
    lines.push('ok ' + res.verb + ' ' + res.n);
  } else {
    lines.push('err ' + res.code);
  }
}
lines.push('#state');
const sorted = courses.slice().sort((a, b) => {
  const ba = Buffer.from(a.name, 'utf8');
  const bb = Buffer.from(b.name, 'utf8');
  return Buffer.compare(ba, bb);
});
for (let i = 0; i < sorted.length; i++) {
  const c = sorted[i];
  lines.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
}
process.stdout.write(lines.join('\n') + '\n');

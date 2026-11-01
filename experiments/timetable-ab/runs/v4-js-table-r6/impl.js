const courses = [];

const ok = (verb, n) => `ok ${verb} ${n}`;
const err = (code) => `err ${code}`;

const isWord = (s) => typeof s === 'string' && s.length >= 1 && s.length <= 12 && !/\s/.test(s);

const toInt = (s) => {
  if (typeof s !== 'string' || !/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
};

const find = (name) => {
  for (let i = 0; i < courses.length; i++) {
    if (courses[i].name === name) return i;
  }
  return -1;
};

const conflict = (day, from, to, exceptName) => {
  for (const c of courses) {
    if (exceptName !== null && c.name === exceptName) continue;
    if (c.day === day && c.from <= to && from <= c.to) return true;
  }
  return false;
};

const ops = Object.create(null);

ops.add = {
  argc: 7,
  run(t) {
    const name = t[1];
    const teacher = t[2];
    const loc = t[3];
    const day = toInt(t[4]);
    const from = toInt(t[5]);
    const to = toInt(t[6]);
    if (!isWord(name) || !isWord(teacher) || !isWord(loc) ||
        day === null || from === null || to === null ||
        day < 1 || day > 7 || from < 1 || from > 12 || to < 1 || to > 12 || to < from) {
      return err('BADARG');
    }
    if (find(name) >= 0) return err('DUP');
    if (courses.length >= 20) return err('LIMIT');
    if (conflict(day, from, to, null)) return err('CONFLICT');
    courses.push({ name, teacher, loc, day, from, to });
    return ok('add', 1);
  }
};

ops.del = {
  argc: 2,
  run(t) {
    const name = t[1];
    if (!isWord(name)) return err('BADARG');
    const i = find(name);
    if (i < 0) return err('NOTFOUND');
    courses.splice(i, 1);
    return ok('del', 1);
  }
};

ops.edit = {
  argc: 4,
  run(t) {
    const name = t[1];
    const teacher = t[2];
    const loc = t[3];
    if (!isWord(name) || !isWord(teacher) || !isWord(loc)) return err('BADARG');
    const i = find(name);
    if (i < 0) return err('NOTFOUND');
    courses[i].teacher = teacher;
    courses[i].loc = loc;
    return ok('edit', 1);
  }
};

ops.move = {
  argc: 5,
  run(t) {
    const name = t[1];
    const day = toInt(t[2]);
    const from = toInt(t[3]);
    const to = toInt(t[4]);
    if (!isWord(name) || day === null || from === null || to === null ||
        day < 1 || day > 7 || from < 1 || from > 12 || to < 1 || to > 12 || to < from) {
      return err('BADARG');
    }
    const i = find(name);
    if (i < 0) return err('NOTFOUND');
    if (conflict(day, from, to, name)) return err('CONFLICT');
    courses[i].day = day;
    courses[i].from = from;
    courses[i].to = to;
    return ok('move', 1);
  }
};

ops.swap = {
  argc: 3,
  run(t) {
    const a = t[1];
    const b = t[2];
    if (!isWord(a) || !isWord(b)) return err('BADARG');
    const i = find(a);
    const j = find(b);
    if (i < 0 || j < 0) return err('NOTFOUND');
    const ca = courses[i];
    const cb = courses[j];
    const td = ca.day;
    const tf = ca.from;
    const tt = ca.to;
    ca.day = cb.day;
    ca.from = cb.from;
    ca.to = cb.to;
    cb.day = td;
    cb.from = tf;
    cb.to = tt;
    return ok('swap', 2);
  }
};

ops.rename = {
  argc: 3,
  run(t) {
    const oldName = t[1];
    const newName = t[2];
    if (!isWord(oldName) || !isWord(newName)) return err('BADARG');
    const i = find(oldName);
    if (i < 0) return err('NOTFOUND');
    if (find(newName) >= 0) return err('DUP');
    courses[i].name = newName;
    return ok('rename', 1);
  }
};

ops.duplicate = {
  argc: 3,
  run(t) {
    const name = t[1];
    const newName = t[2];
    if (!isWord(name) || !isWord(newName)) return err('BADARG');
    const i = find(name);
    if (i < 0) return err('NOTFOUND');
    if (find(newName) >= 0) return err('DUP');
    if (courses.length >= 20) return err('LIMIT');
    const c = courses[i];
    courses.push({ name: newName, teacher: c.teacher, loc: c.loc, day: c.day, from: c.from, to: c.to });
    return ok('duplicate', 1);
  }
};

ops.trim = {
  argc: 3,
  run(t) {
    const day = toInt(t[1]);
    const to = toInt(t[2]);
    if (day === null || to === null || day < 1 || day > 7 || to < 1 || to > 12) return err('BADARG');
    let n = 0;
    for (const c of courses) {
      if (c.day === day && c.from <= to && to < c.to) {
        c.to = to;
        n++;
      }
    }
    return ok('trim', n);
  }
};

ops.clear = {
  argc: 2,
  run(t) {
    const day = toInt(t[1]);
    if (day === null || day < 1 || day > 7) return err('BADARG');
    let n = 0;
    for (let i = courses.length - 1; i >= 0; i--) {
      if (courses[i].day === day) {
        courses.splice(i, 1);
        n++;
      }
    }
    return ok('clear', n);
  }
};

ops.shift = {
  argc: 3,
  run(t) {
    const day = toInt(t[1]);
    const delta = toInt(t[2]);
    if (day === null || delta === null || day < 1 || day > 7) return err('BADARG');
    const newDay = day + delta;
    if (newDay < 1 || newDay > 7) return err('BADARG');
    let n = 0;
    for (const c of courses) {
      if (c.day === day) {
        c.day = newDay;
        n++;
      }
    }
    return ok('shift', n);
  }
};

ops.copy = {
  argc: 3,
  run(t) {
    const name = t[1];
    const day = toInt(t[2]);
    if (!isWord(name) || day === null || day < 1 || day > 7) return err('BADARG');
    const i = find(name);
    if (i < 0) return err('NOTFOUND');
    const newName = name + '_2';
    if (!isWord(newName)) return err('BADARG');
    if (find(newName) >= 0) return err('DUP');
    if (courses.length >= 20) return err('LIMIT');
    const c = courses[i];
    courses.push({ name: newName, teacher: c.teacher, loc: c.loc, day, from: c.from, to: c.to });
    return ok('copy', 1);
  }
};

ops.merge = {
  argc: 3,
  run(t) {
    const a = t[1];
    const b = t[2];
    if (!isWord(a) || !isWord(b)) return err('BADARG');
    const i = find(a);
    const j = find(b);
    if (i < 0 || j < 0) return err('NOTFOUND');
    courses[i].teacher = courses[j].teacher;
    courses[i].loc = courses[j].loc;
    courses.splice(j, 1);
    return ok('merge', 2);
  }
};

ops.sort = {
  argc: 1,
  run(t) {
    return ok('sort', 0);
  }
};

ops.filter = {
  argc: 2,
  run(t) {
    const day = toInt(t[1]);
    if (day === null || day < 1 || day > 7) return err('BADARG');
    let n = 0;
    for (const c of courses) {
      if (c.day === day) n++;
    }
    return ok('filter', n);
  }
};

ops.count = {
  argc: 1,
  run(t) {
    return ok('count', courses.length);
  }
};

const lines = [];

for (let i = 2; i < process.argv.length; i++) {
  const raw = process.argv[i];
  const trimmed = raw.trim();
  const parts = trimmed === '' ? [''] : trimmed.split(/\s+/);
  const verb = parts[0];
  const op = ops[verb];
  let out;
  if (!op) {
    out = err('BADARG');
  } else if (parts.length !== op.argc) {
    out = err('BADARG');
  } else {
    out = op.run(parts);
  }
  lines.push(out);
}

lines.push('#state');

const sorted = courses.slice().sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
for (const c of sorted) {
  lines.push(`${c.name}|${c.teacher}|${c.loc}|${c.day}|${c.from}-${c.to}`);
}

process.stdout.write(lines.join('\n') + '\n');

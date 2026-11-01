const courses = [];

function intVal(s) {
  if (typeof s !== 'string') return null;
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

function isName(s) {
  return typeof s === 'string' && s.length >= 1 && s.length <= 12;
}

function isField(s) {
  return typeof s === 'string' && s.length >= 1 && s.length <= 12;
}

function find(name) {
  for (let i = 0; i < courses.length; i++) {
    if (courses[i].name === name) return courses[i];
  }
  return null;
}

function findIndex(name) {
  for (let i = 0; i < courses.length; i++) {
    if (courses[i].name === name) return i;
  }
  return -1;
}

function conflict(day, from, to, exceptName) {
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    if (exceptName !== null && c.name === exceptName) continue;
    if (c.day === day && !(to < c.from || from > c.to)) return true;
  }
  return false;
}

function ok(verb, n) {
  return { ok: true, verb: verb, n: n };
}

function err(code) {
  return { ok: false, code: code };
}

function opAdd(args) {
  const name = args[0];
  const teacher = args[1];
  const loc = args[2];
  const day = intVal(args[3]);
  const from = intVal(args[4]);
  const to = intVal(args[5]);
  if (!isName(name) || !isField(teacher) || !isField(loc)) return err('BADARG');
  if (day === null || day < 1 || day > 7) return err('BADARG');
  if (from === null || from < 1 || from > 12) return err('BADARG');
  if (to === null || to < 1 || to > 12 || to < from) return err('BADARG');
  if (find(name)) return err('DUP');
  if (courses.length >= 20) return err('LIMIT');
  if (conflict(day, from, to, null)) return err('CONFLICT');
  courses.push({ name: name, teacher: teacher, loc: loc, day: day, from: from, to: to });
  return ok('add', 1);
}

function opDel(args) {
  const name = args[0];
  if (!isName(name)) return err('BADARG');
  const i = findIndex(name);
  if (i < 0) return err('NOTFOUND');
  courses.splice(i, 1);
  return ok('del', 1);
}

function opEdit(args) {
  const name = args[0];
  const teacher = args[1];
  const loc = args[2];
  if (!isName(name) || !isField(teacher) || !isField(loc)) return err('BADARG');
  const c = find(name);
  if (!c) return err('NOTFOUND');
  c.teacher = teacher;
  c.loc = loc;
  return ok('edit', 1);
}

function opMove(args) {
  const name = args[0];
  const day = intVal(args[1]);
  const from = intVal(args[2]);
  const to = intVal(args[3]);
  if (!isName(name)) return err('BADARG');
  if (day === null || day < 1 || day > 7) return err('BADARG');
  if (from === null || from < 1 || from > 12) return err('BADARG');
  if (to === null || to < 1 || to > 12 || to < from) return err('BADARG');
  const c = find(name);
  if (!c) return err('NOTFOUND');
  if (conflict(day, from, to, name)) return err('CONFLICT');
  c.day = day;
  c.from = from;
  c.to = to;
  return ok('move', 1);
}

function opSwap(args) {
  const a = args[0];
  const b = args[1];
  if (!isName(a) || !isName(b)) return err('BADARG');
  const ca = find(a);
  const cb = find(b);
  if (!ca || !cb) return err('NOTFOUND');
  if (a === b) return ok('swap', 2);
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

function opRename(args) {
  const oldName = args[0];
  const newName = args[1];
  if (!isName(oldName) || !isName(newName)) return err('BADARG');
  const c = find(oldName);
  if (!c) return err('NOTFOUND');
  if (find(newName)) return err('DUP');
  c.name = newName;
  return ok('rename', 1);
}

function opDuplicate(args) {
  const name = args[0];
  const newName = args[1];
  if (!isName(name) || !isName(newName)) return err('BADARG');
  const c = find(name);
  if (!c) return err('NOTFOUND');
  if (find(newName)) return err('DUP');
  if (courses.length >= 20) return err('LIMIT');
  courses.push({ name: newName, teacher: c.teacher, loc: c.loc, day: c.day, from: c.from, to: c.to });
  return ok('duplicate', 1);
}

function opTrim(args) {
  const day = intVal(args[0]);
  const to = intVal(args[1]);
  if (day === null || day < 1 || day > 7) return err('BADARG');
  if (to === null || to < 1 || to > 12) return err('BADARG');
  let n = 0;
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    if (c.day === day && c.from <= to && to < c.to) {
      c.to = to;
      n++;
    }
  }
  return ok('trim', n);
}

function opClear(args) {
  const day = intVal(args[0]);
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

function opShift(args) {
  const day = intVal(args[0]);
  const delta = intVal(args[1]);
  if (day === null || day < 1 || day > 7) return err('BADARG');
  if (delta === null) return err('BADARG');
  const target = day + delta;
  if (target < 1 || target > 7) return err('BADARG');
  let n = 0;
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    if (c.day === day) {
      c.day = target;
      n++;
    }
  }
  return ok('shift', n);
}

function opCopy(args) {
  const name = args[0];
  const day = intVal(args[1]);
  if (!isName(name)) return err('BADARG');
  if (day === null || day < 1 || day > 7) return err('BADARG');
  const c = find(name);
  if (!c) return err('NOTFOUND');
  const newName = c.name + '_2';
  if (!isName(newName)) return err('BADARG');
  if (find(newName)) return err('DUP');
  if (courses.length >= 20) return err('LIMIT');
  if (conflict(day, c.from, c.to, null)) return err('CONFLICT');
  courses.push({ name: newName, teacher: c.teacher, loc: c.loc, day: day, from: c.from, to: c.to });
  return ok('copy', 1);
}

function opMerge(args) {
  const a = args[0];
  const b = args[1];
  if (!isName(a) || !isName(b)) return err('BADARG');
  if (a === b) return err('BADARG');
  const ca = find(a);
  const cb = find(b);
  if (!ca || !cb) return err('NOTFOUND');
  ca.teacher = cb.teacher;
  ca.loc = cb.loc;
  const idx = findIndex(b);
  courses.splice(idx, 1);
  return ok('merge', 2);
}

function opSort(args) {
  courses.sort(function(a, b) {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });
  return ok('sort', 0);
}

function opFilter(args) {
  const day = intVal(args[0]);
  if (day === null || day < 1 || day > 7) return err('BADARG');
  let n = 0;
  for (let i = 0; i < courses.length; i++) {
    if (courses[i].day === day) n++;
  }
  return ok('filter', n);
}

function opCount(args) {
  return ok('count', courses.length);
}

const OPS = {
  add: { n: 6, run: opAdd },
  del: { n: 1, run: opDel },
  edit: { n: 3, run: opEdit },
  move: { n: 4, run: opMove },
  swap: { n: 2, run: opSwap },
  rename: { n: 2, run: opRename },
  duplicate: { n: 2, run: opDuplicate },
  trim: { n: 2, run: opTrim },
  clear: { n: 1, run: opClear },
  shift: { n: 2, run: opShift },
  copy: { n: 2, run: opCopy },
  merge: { n: 2, run: opMerge },
  sort: { n: 0, run: opSort },
  filter: { n: 1, run: opFilter },
  count: { n: 0, run: opCount }
};

function out(s) {
  process.stdout.write(s + '\n');
}

for (let i = 2; i < process.argv.length; i++) {
  const raw = process.argv[i];
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    out('err BADARG');
    continue;
  }
  const verb = parts[0];
  const op = OPS[verb];
  if (!op) {
    out('err BADARG');
    continue;
  }
  const args = parts.slice(1);
  if (args.length !== op.n) {
    out('err BADARG');
    continue;
  }
  const res = op.run(args);
  if (res.ok) out('ok ' + res.verb + ' ' + res.n);
  else out('err ' + res.code);
}

out('#state');
const sorted = courses.slice().sort(function(a, b) {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
});
for (let i = 0; i < sorted.length; i++) {
  const c = sorted[i];
  out(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
}

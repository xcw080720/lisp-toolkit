const courses = [];
const out = [];
function emit(s) { out.push(s); }
function ok(v, n) { emit('ok ' + v + ' ' + n); }
function err(c) { emit('err ' + c); }
function isWord(s) { return s.length >= 1 && s.length <= 12 && !/\s/.test(s); }
function toInt(s) {
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}
function findCourse(name) {
  for (let i = 0; i < courses.length; i++) {
    if (courses[i].name === name) return courses[i];
  }
  return null;
}
function hasConflict(day, from, to, excludeName) {
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    if (excludeName !== null && c.name === excludeName) continue;
    if (c.day === day && from <= c.to && c.from <= to) return true;
  }
  return false;
}
for (let i = 2; i < process.argv.length; i++) {
  const raw = process.argv[i];
  const trimmed = raw.trim();
  const parts = trimmed === '' ? [] : trimmed.split(/\s+/);
  if (parts.length === 0) {
    err('BADARG');
    continue;
  }
  const cmd = parts[0];
  const args = parts.slice(1);
  if (cmd === 'add') {
    if (args.length !== 6) { err('BADARG'); continue; }
    const name = args[0];
    const teacher = args[1];
    const loc = args[2];
    const dayS = args[3];
    const fromS = args[4];
    const toS = args[5];
    if (!isWord(name) || !isWord(teacher) || !isWord(loc)) { err('BADARG'); continue; }
    const day = toInt(dayS);
    const from = toInt(fromS);
    const to = toInt(toS);
    if (day === null || from === null || to === null || day < 1 || day > 7 || from < 1 || from > 12 || to < 1 || to > 12 || to < from) { err('BADARG'); continue; }
    if (findCourse(name)) { err('DUP'); continue; }
    if (courses.length >= 20) { err('LIMIT'); continue; }
    if (hasConflict(day, from, to, null)) { err('CONFLICT'); continue; }
    courses.push({ name: name, teacher: teacher, loc: loc, day: day, from: from, to: to });
    ok('add', 1);
  } else if (cmd === 'del') {
    if (args.length !== 1) { err('BADARG'); continue; }
    const name = args[0];
    if (!isWord(name)) { err('BADARG'); continue; }
    let idx = -1;
    for (let j = 0; j < courses.length; j++) {
      if (courses[j].name === name) { idx = j; break; }
    }
    if (idx === -1) { err('NOTFOUND'); continue; }
    courses.splice(idx, 1);
    ok('del', 1);
  } else if (cmd === 'edit') {
    if (args.length !== 3) { err('BADARG'); continue; }
    const name = args[0];
    const teacher = args[1];
    const loc = args[2];
    if (!isWord(name) || !isWord(teacher) || !isWord(loc)) { err('BADARG'); continue; }
    const c = findCourse(name);
    if (!c) { err('NOTFOUND'); continue; }
    c.teacher = teacher;
    c.loc = loc;
    ok('edit', 1);
  } else if (cmd === 'move') {
    if (args.length !== 4) { err('BADARG'); continue; }
    const name = args[0];
    const dayS = args[1];
    const fromS = args[2];
    const toS = args[3];
    if (!isWord(name)) { err('BADARG'); continue; }
    const day = toInt(dayS);
    const from = toInt(fromS);
    const to = toInt(toS);
    if (day === null || from === null || to === null || day < 1 || day > 7 || from < 1 || from > 12 || to < 1 || to > 12 || to < from) { err('BADARG'); continue; }
    const c = findCourse(name);
    if (!c) { err('NOTFOUND'); continue; }
    if (hasConflict(day, from, to, name)) { err('CONFLICT'); continue; }
    c.day = day;
    c.from = from;
    c.to = to;
    ok('move', 1);
  } else if (cmd === 'swap') {
    if (args.length !== 2) { err('BADARG'); continue; }
    const n1 = args[0];
    const n2 = args[1];
    if (!isWord(n1) || !isWord(n2)) { err('BADARG'); continue; }
    const c1 = findCourse(n1);
    const c2 = findCourse(n2);
    if (!c1 || !c2) { err('NOTFOUND'); continue; }
    const d = c1.day;
    const f = c1.from;
    const t = c1.to;
    c1.day = c2.day;
    c1.from = c2.from;
    c1.to = c2.to;
    c2.day = d;
    c2.from = f;
    c2.to = t;
    ok('swap', 2);
  } else if (cmd === 'rename') {
    if (args.length !== 2) { err('BADARG'); continue; }
    const oldName = args[0];
    const newName = args[1];
    if (!isWord(oldName) || !isWord(newName)) { err('BADARG'); continue; }
    const c = findCourse(oldName);
    if (!c) { err('NOTFOUND'); continue; }
    if (findCourse(newName)) { err('DUP'); continue; }
    c.name = newName;
    ok('rename', 1);
  } else if (cmd === 'duplicate') {
    if (args.length !== 2) { err('BADARG'); continue; }
    const name = args[0];
    const newName = args[1];
    if (!isWord(name) || !isWord(newName)) { err('BADARG'); continue; }
    const c = findCourse(name);
    if (!c) { err('NOTFOUND'); continue; }
    if (findCourse(newName)) { err('DUP'); continue; }
    if (courses.length >= 20) { err('LIMIT'); continue; }
    courses.push({ name: newName, teacher: c.teacher, loc: c.loc, day: c.day, from: c.from, to: c.to });
    ok('duplicate', 1);
  } else if (cmd === 'trim') {
    if (args.length !== 2) { err('BADARG'); continue; }
    const dayS = args[0];
    const toS = args[1];
    const day = toInt(dayS);
    const to = toInt(toS);
    if (day === null || to === null || day < 1 || day > 7 || to < 1 || to > 12) { err('BADARG'); continue; }
    let count = 0;
    for (let j = 0; j < courses.length; j++) {
      const c = courses[j];
      if (c.day === day && c.from <= to && to < c.to) {
        c.to = to;
        count++;
      }
    }
    ok('trim', count);
  } else if (cmd === 'clear') {
    if (args.length !== 1) { err('BADARG'); continue; }
    const day = toInt(args[0]);
    if (day === null || day < 1 || day > 7) { err('BADARG'); continue; }
    let count = 0;
    for (let j = courses.length - 1; j >= 0; j--) {
      if (courses[j].day === day) {
        courses.splice(j, 1);
        count++;
      }
    }
    ok('clear', count);
  } else if (cmd === 'shift') {
    if (args.length !== 2) { err('BADARG'); continue; }
    const day = toInt(args[0]);
    const delta = toInt(args[1]);
    if (day === null || delta === null || day < 1 || day > 7) { err('BADARG'); continue; }
    const target = day + delta;
    if (target < 1 || target > 7) { err('BADARG'); continue; }
    let count = 0;
    for (let j = 0; j < courses.length; j++) {
      if (courses[j].day === day) {
        courses[j].day = target;
        count++;
      }
    }
    ok('shift', count);
  } else if (cmd === 'copy') {
    if (args.length !== 2) { err('BADARG'); continue; }
    const name = args[0];
    const dayS = args[1];
    if (!isWord(name)) { err('BADARG'); continue; }
    const day = toInt(dayS);
    if (day === null || day < 1 || day > 7) { err('BADARG'); continue; }
    const c = findCourse(name);
    if (!c) { err('NOTFOUND'); continue; }
    const newName = name + '_2';
    if (newName.length < 1 || newName.length > 12 || /\s/.test(newName)) { err('BADARG'); continue; }
    if (findCourse(newName)) { err('DUP'); continue; }
    if (courses.length >= 20) { err('LIMIT'); continue; }
    courses.push({ name: newName, teacher: c.teacher, loc: c.loc, day: day, from: c.from, to: c.to });
    ok('copy', 1);
  } else if (cmd === 'merge') {
    if (args.length !== 2) { err('BADARG'); continue; }
    const n1 = args[0];
    const n2 = args[1];
    if (!isWord(n1) || !isWord(n2)) { err('BADARG'); continue; }
    const c1 = findCourse(n1);
    const c2 = findCourse(n2);
    if (!c1 || !c2) { err('NOTFOUND'); continue; }
    if (c1 === c2) { err('BADARG'); continue; }
    c1.teacher = c2.teacher;
    c1.loc = c2.loc;
    const idx = courses.indexOf(c2);
    courses.splice(idx, 1);
    ok('merge', 2);
  } else if (cmd === 'sort') {
    if (args.length !== 0) { err('BADARG'); continue; }
    ok('sort', 0);
  } else if (cmd === 'filter') {
    if (args.length !== 1) { err('BADARG'); continue; }
    const day = toInt(args[0]);
    if (day === null || day < 1 || day > 7) { err('BADARG'); continue; }
    let count = 0;
    for (let j = 0; j < courses.length; j++) {
      if (courses[j].day === day) count++;
    }
    ok('filter', count);
  } else if (cmd === 'count') {
    if (args.length !== 0) { err('BADARG'); continue; }
    ok('count', courses.length);
  } else {
    err('BADARG');
  }
}
out.push('#state');
const sorted = courses.slice().sort(function(a, b) {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
});
for (let i = 0; i < sorted.length; i++) {
  const c = sorted[i];
  out.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
}
process.stdout.write(out.join('\n') + '\n');

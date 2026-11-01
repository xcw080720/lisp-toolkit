const argv = process.argv.slice(2);
let courses = [];
const out = [];

function emitOk(verb, n) {
  out.push('ok ' + verb + ' ' + n);
}

function emitErr(code) {
  out.push('err ' + code);
}

function isWord(s) {
  return typeof s === 'string' && s.length >= 1 && s.length <= 12 && !/\s/.test(s);
}

function isInt(s) {
  return typeof s === 'string' && /^-?[0-9]+$/.test(s);
}

function validDay(n) {
  return Number.isInteger(n) && n >= 1 && n <= 7;
}

function validTime(n) {
  return Number.isInteger(n) && n >= 1 && n <= 12;
}

function findCourse(name) {
  for (let i = 0; i < courses.length; i++) {
    if (courses[i].name === name) return courses[i];
  }
  return null;
}

function hasConflict(day, from, to, skipName) {
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    if (c.name === skipName) continue;
    if (c.day === day && from <= c.to && c.from <= to) return true;
  }
  return false;
}

for (let ci = 0; ci < argv.length; ci++) {
  const raw = argv[ci];
  const trimmed = raw.trim();
  if (trimmed === '') {
    emitErr('BADARG');
    continue;
  }
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];

  if (cmd === 'add') {
    if (parts.length !== 7) {
      emitErr('BADARG');
      continue;
    }
    const name = parts[1], teacher = parts[2], loc = parts[3];
    const dayS = parts[4], fromS = parts[5], toS = parts[6];
    if (!isWord(name) || !isWord(teacher) || !isWord(loc) || !isInt(dayS) || !isInt(fromS) || !isInt(toS)) {
      emitErr('BADARG');
      continue;
    }
    const day = parseInt(dayS, 10), from = parseInt(fromS, 10), to = parseInt(toS, 10);
    if (!validDay(day) || !validTime(from) || !validTime(to) || to < from) {
      emitErr('BADARG');
      continue;
    }
    if (findCourse(name) !== null) {
      emitErr('DUP');
      continue;
    }
    if (courses.length >= 20) {
      emitErr('LIMIT');
      continue;
    }
    if (hasConflict(day, from, to, null)) {
      emitErr('CONFLICT');
      continue;
    }
    courses.push({ name: name, teacher: teacher, loc: loc, day: day, from: from, to: to });
    emitOk('add', 1);
    continue;
  }

  if (cmd === 'del') {
    if (parts.length !== 2) {
      emitErr('BADARG');
      continue;
    }
    const name = parts[1];
    if (!isWord(name)) {
      emitErr('BADARG');
      continue;
    }
    let idx = -1;
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].name === name) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      emitErr('NOTFOUND');
      continue;
    }
    courses.splice(idx, 1);
    emitOk('del', 1);
    continue;
  }

  if (cmd === 'edit') {
    if (parts.length !== 4) {
      emitErr('BADARG');
      continue;
    }
    const name = parts[1], teacher = parts[2], loc = parts[3];
    if (!isWord(name) || !isWord(teacher) || !isWord(loc)) {
      emitErr('BADARG');
      continue;
    }
    const c = findCourse(name);
    if (c === null) {
      emitErr('NOTFOUND');
      continue;
    }
    c.teacher = teacher;
    c.loc = loc;
    emitOk('edit', 1);
    continue;
  }

  if (cmd === 'move') {
    if (parts.length !== 5) {
      emitErr('BADARG');
      continue;
    }
    const name = parts[1], dayS = parts[2], fromS = parts[3], toS = parts[4];
    if (!isWord(name) || !isInt(dayS) || !isInt(fromS) || !isInt(toS)) {
      emitErr('BADARG');
      continue;
    }
    const day = parseInt(dayS, 10), from = parseInt(fromS, 10), to = parseInt(toS, 10);
    if (!validDay(day) || !validTime(from) || !validTime(to) || to < from) {
      emitErr('BADARG');
      continue;
    }
    const c = findCourse(name);
    if (c === null) {
      emitErr('NOTFOUND');
      continue;
    }
    if (hasConflict(day, from, to, name)) {
      emitErr('CONFLICT');
      continue;
    }
    c.day = day;
    c.from = from;
    c.to = to;
    emitOk('move', 1);
    continue;
  }

  if (cmd === 'swap') {
    if (parts.length !== 3) {
      emitErr('BADARG');
      continue;
    }
    const a = parts[1], b = parts[2];
    if (!isWord(a) || !isWord(b)) {
      emitErr('BADARG');
      continue;
    }
    const ca = findCourse(a);
    const cb = findCourse(b);
    if (ca === null || cb === null) {
      emitErr('NOTFOUND');
      continue;
    }
    const tmpDay = ca.day, tmpFrom = ca.from, tmpTo = ca.to;
    ca.day = cb.day;
    ca.from = cb.from;
    ca.to = cb.to;
    cb.day = tmpDay;
    cb.from = tmpFrom;
    cb.to = tmpTo;
    emitOk('swap', 2);
    continue;
  }

  if (cmd === 'rename') {
    if (parts.length !== 3) {
      emitErr('BADARG');
      continue;
    }
    const oldName = parts[1], newName = parts[2];
    if (!isWord(oldName) || !isWord(newName)) {
      emitErr('BADARG');
      continue;
    }
    const c = findCourse(oldName);
    if (c === null) {
      emitErr('NOTFOUND');
      continue;
    }
    if (newName !== oldName && findCourse(newName) !== null) {
      emitErr('DUP');
      continue;
    }
    c.name = newName;
    emitOk('rename', 1);
    continue;
  }

  if (cmd === 'duplicate') {
    if (parts.length !== 3) {
      emitErr('BADARG');
      continue;
    }
    const name = parts[1], newName = parts[2];
    if (!isWord(name) || !isWord(newName)) {
      emitErr('BADARG');
      continue;
    }
    const src = findCourse(name);
    if (src === null) {
      emitErr('NOTFOUND');
      continue;
    }
    if (findCourse(newName) !== null) {
      emitErr('DUP');
      continue;
    }
    if (courses.length >= 20) {
      emitErr('LIMIT');
      continue;
    }
    courses.push({ name: newName, teacher: src.teacher, loc: src.loc, day: src.day, from: src.from, to: src.to });
    emitOk('duplicate', 1);
    continue;
  }

  if (cmd === 'trim') {
    if (parts.length !== 3) {
      emitErr('BADARG');
      continue;
    }
    const dayS = parts[1], toS = parts[2];
    if (!isInt(dayS) || !isInt(toS)) {
      emitErr('BADARG');
      continue;
    }
    const day = parseInt(dayS, 10), to = parseInt(toS, 10);
    if (!validDay(day) || !validTime(to)) {
      emitErr('BADARG');
      continue;
    }
    let count = 0;
    for (let i = 0; i < courses.length; i++) {
      const c = courses[i];
      if (c.day === day && c.from <= to && to < c.to) {
        c.to = to;
        count++;
      }
    }
    emitOk('trim', count);
    continue;
  }

  if (cmd === 'clear') {
    if (parts.length !== 2) {
      emitErr('BADARG');
      continue;
    }
    const dayS = parts[1];
    if (!isInt(dayS)) {
      emitErr('BADARG');
      continue;
    }
    const day = parseInt(dayS, 10);
    if (!validDay(day)) {
      emitErr('BADARG');
      continue;
    }
    let count = 0;
    const kept = [];
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].day === day) {
        count++;
      } else {
        kept.push(courses[i]);
      }
    }
    courses = kept;
    emitOk('clear', count);
    continue;
  }

  if (cmd === 'shift') {
    if (parts.length !== 3) {
      emitErr('BADARG');
      continue;
    }
    const dayS = parts[1], deltaS = parts[2];
    if (!isInt(dayS) || !isInt(deltaS)) {
      emitErr('BADARG');
      continue;
    }
    const day = parseInt(dayS, 10);
    const delta = parseInt(deltaS, 10);
    if (!validDay(day)) {
      emitErr('BADARG');
      continue;
    }
    const newDay = day + delta;
    if (!Number.isInteger(newDay) || newDay < 1 || newDay > 7) {
      emitErr('BADARG');
      continue;
    }
    let count = 0;
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].day === day) {
        courses[i].day = newDay;
        count++;
      }
    }
    emitOk('shift', count);
    continue;
  }

  if (cmd === 'copy') {
    if (parts.length !== 3) {
      emitErr('BADARG');
      continue;
    }
    const name = parts[1], dayS = parts[2];
    if (!isWord(name) || !isInt(dayS)) {
      emitErr('BADARG');
      continue;
    }
    const day = parseInt(dayS, 10);
    if (!validDay(day)) {
      emitErr('BADARG');
      continue;
    }
    const src = findCourse(name);
    if (src === null) {
      emitErr('NOTFOUND');
      continue;
    }
    const newName = src.name + '_2';
    if (!isWord(newName)) {
      emitErr('BADARG');
      continue;
    }
    if (findCourse(newName) !== null) {
      emitErr('DUP');
      continue;
    }
    if (courses.length >= 20) {
      emitErr('LIMIT');
      continue;
    }
    courses.push({ name: newName, teacher: src.teacher, loc: src.loc, day: day, from: src.from, to: src.to });
    emitOk('copy', 1);
    continue;
  }

  if (cmd === 'merge') {
    if (parts.length !== 3) {
      emitErr('BADARG');
      continue;
    }
    const a = parts[1], b = parts[2];
    if (!isWord(a) || !isWord(b)) {
      emitErr('BADARG');
      continue;
    }
    const ca = findCourse(a);
    const cb = findCourse(b);
    if (ca === null || cb === null) {
      emitErr('NOTFOUND');
      continue;
    }
    if (ca === cb) {
      emitOk('merge', 2);
      continue;
    }
    ca.teacher = cb.teacher;
    ca.loc = cb.loc;
    const kept = [];
    for (let i = 0; i < courses.length; i++) {
      if (courses[i] !== cb) kept.push(courses[i]);
    }
    courses = kept;
    emitOk('merge', 2);
    continue;
  }

  if (cmd === 'sort') {
    if (parts.length !== 1) {
      emitErr('BADARG');
      continue;
    }
    emitOk('sort', 0);
    continue;
  }

  if (cmd === 'filter') {
    if (parts.length !== 2) {
      emitErr('BADARG');
      continue;
    }
    const dayS = parts[1];
    if (!isInt(dayS)) {
      emitErr('BADARG');
      continue;
    }
    const day = parseInt(dayS, 10);
    if (!validDay(day)) {
      emitErr('BADARG');
      continue;
    }
    let count = 0;
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].day === day) count++;
    }
    emitOk('filter', count);
    continue;
  }

  if (cmd === 'count') {
    if (parts.length !== 1) {
      emitErr('BADARG');
      continue;
    }
    emitOk('count', courses.length);
    continue;
  }

  emitErr('BADARG');
}

out.push('#state');
const sorted = courses.slice().sort(function (a, b) {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
});
for (let i = 0; i < sorted.length; i++) {
  const c = sorted[i];
  out.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
}
process.stdout.write(out.join('\n') + '\n');

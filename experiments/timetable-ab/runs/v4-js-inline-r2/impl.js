'use strict';

const courses = [];
const output = [];

function findCourse(name) {
  for (let i = 0; i < courses.length; i++) {
    if (courses[i].name === name) return courses[i];
  }
  return null;
}

function isValidWord(value) {
  if (typeof value !== 'string') return false;
  if (value.length < 1 || value.length > 12) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c <= 32 || c === 127) return false;
  }
  return true;
}

function parseIntToken(text, allowNegative) {
  if (typeof text !== 'string') return null;
  const re = allowNegative ? /^[+-]?[0-9]+$/ : /^\+?[0-9]+$/;
  if (!re.test(text)) return null;
  const number = Number(text);
  if (!Number.isInteger(number)) return null;
  return number;
}

function hasConflict(day, from, to, excludeName) {
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    if (excludeName !== null && c.name === excludeName) continue;
    if (c.day === day && from <= c.to && c.from <= to) return true;
  }
  return false;
}

const commands = process.argv.slice(2);

for (let ci = 0; ci < commands.length; ci++) {
  const tokens = commands[ci].split(/\s+/).filter(function (part) {
    return part.length > 0;
  });
  const op = tokens.length > 0 ? tokens[0] : '';

  if (op === 'add') {
    if (tokens.length !== 7) {
      output.push('err BADARG');
      continue;
    }
    const name = tokens[1];
    const teacher = tokens[2];
    const loc = tokens[3];
    const day = parseIntToken(tokens[4], false);
    const from = parseIntToken(tokens[5], false);
    const to = parseIntToken(tokens[6], false);
    if (!isValidWord(name) || !isValidWord(teacher) || !isValidWord(loc) ||
        day === null || day < 1 || day > 7 ||
        from === null || from < 1 || from > 12 ||
        to === null || to < 1 || to > 12 || to < from) {
      output.push('err BADARG');
      continue;
    }
    if (findCourse(name) !== null) {
      output.push('err DUP');
      continue;
    }
    if (hasConflict(day, from, to, null)) {
      output.push('err CONFLICT');
      continue;
    }
    if (courses.length >= 20) {
      output.push('err LIMIT');
      continue;
    }
    courses.push({ name: name, teacher: teacher, loc: loc, day: day, from: from, to: to });
    output.push('ok add 1');
    continue;
  }

  if (op === 'del') {
    if (tokens.length !== 2) {
      output.push('err BADARG');
      continue;
    }
    const name = tokens[1];
    if (!isValidWord(name)) {
      output.push('err BADARG');
      continue;
    }
    let index = -1;
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].name === name) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      output.push('err NOTFOUND');
      continue;
    }
    courses.splice(index, 1);
    output.push('ok del 1');
    continue;
  }

  if (op === 'edit') {
    if (tokens.length !== 4) {
      output.push('err BADARG');
      continue;
    }
    const name = tokens[1];
    const teacher = tokens[2];
    const loc = tokens[3];
    if (!isValidWord(name) || !isValidWord(teacher) || !isValidWord(loc)) {
      output.push('err BADARG');
      continue;
    }
    const c = findCourse(name);
    if (c === null) {
      output.push('err NOTFOUND');
      continue;
    }
    c.teacher = teacher;
    c.loc = loc;
    output.push('ok edit 1');
    continue;
  }

  if (op === 'move') {
    if (tokens.length !== 5) {
      output.push('err BADARG');
      continue;
    }
    const name = tokens[1];
    const day = parseIntToken(tokens[2], false);
    const from = parseIntToken(tokens[3], false);
    const to = parseIntToken(tokens[4], false);
    if (!isValidWord(name) ||
        day === null || day < 1 || day > 7 ||
        from === null || from < 1 || from > 12 ||
        to === null || to < 1 || to > 12 || to < from) {
      output.push('err BADARG');
      continue;
    }
    const c = findCourse(name);
    if (c === null) {
      output.push('err NOTFOUND');
      continue;
    }
    if (hasConflict(day, from, to, name)) {
      output.push('err CONFLICT');
      continue;
    }
    c.day = day;
    c.from = from;
    c.to = to;
    output.push('ok move 1');
    continue;
  }

  if (op === 'swap') {
    if (tokens.length !== 3) {
      output.push('err BADARG');
      continue;
    }
    const aName = tokens[1];
    const bName = tokens[2];
    if (!isValidWord(aName) || !isValidWord(bName)) {
      output.push('err BADARG');
      continue;
    }
    const a = findCourse(aName);
    const b = findCourse(bName);
    if (a === null || b === null) {
      output.push('err NOTFOUND');
      continue;
    }
    if (a !== b) {
      const tempDay = a.day;
      const tempFrom = a.from;
      const tempTo = a.to;
      a.day = b.day;
      a.from = b.from;
      a.to = b.to;
      b.day = tempDay;
      b.from = tempFrom;
      b.to = tempTo;
    }
    output.push('ok swap 2');
    continue;
  }

  if (op === 'rename') {
    if (tokens.length !== 3) {
      output.push('err BADARG');
      continue;
    }
    const oldName = tokens[1];
    const newName = tokens[2];
    if (!isValidWord(oldName) || !isValidWord(newName)) {
      output.push('err BADARG');
      continue;
    }
    const c = findCourse(oldName);
    if (c === null) {
      output.push('err NOTFOUND');
      continue;
    }
    if (newName !== oldName && findCourse(newName) !== null) {
      output.push('err DUP');
      continue;
    }
    c.name = newName;
    output.push('ok rename 1');
    continue;
  }

  if (op === 'duplicate') {
    if (tokens.length !== 3) {
      output.push('err BADARG');
      continue;
    }
    const name = tokens[1];
    const newName = tokens[2];
    if (!isValidWord(name) || !isValidWord(newName)) {
      output.push('err BADARG');
      continue;
    }
    const src = findCourse(name);
    if (src === null) {
      output.push('err NOTFOUND');
      continue;
    }
    if (findCourse(newName) !== null) {
      output.push('err DUP');
      continue;
    }
    if (courses.length >= 20) {
      output.push('err LIMIT');
      continue;
    }
    courses.push({
      name: newName,
      teacher: src.teacher,
      loc: src.loc,
      day: src.day,
      from: src.from,
      to: src.to
    });
    output.push('ok duplicate 1');
    continue;
  }

  if (op === 'trim') {
    if (tokens.length !== 3) {
      output.push('err BADARG');
      continue;
    }
    const day = parseIntToken(tokens[1], false);
    const to = parseIntToken(tokens[2], false);
    if (day === null || day < 1 || day > 7 || to === null || to < 1 || to > 12) {
      output.push('err BADARG');
      continue;
    }
    let changed = 0;
    for (let i = 0; i < courses.length; i++) {
      const c = courses[i];
      if (c.day === day && c.from <= to && c.to > to) {
        c.to = to;
        changed++;
      }
    }
    output.push('ok trim ' + changed);
    continue;
  }

  if (op === 'clear') {
    if (tokens.length !== 2) {
      output.push('err BADARG');
      continue;
    }
    const day = parseIntToken(tokens[1], false);
    if (day === null || day < 1 || day > 7) {
      output.push('err BADARG');
      continue;
    }
    let removed = 0;
    for (let i = courses.length - 1; i >= 0; i--) {
      if (courses[i].day === day) {
        courses.splice(i, 1);
        removed++;
      }
    }
    output.push('ok clear ' + removed);
    continue;
  }

  if (op === 'shift') {
    if (tokens.length !== 3) {
      output.push('err BADARG');
      continue;
    }
    const day = parseIntToken(tokens[1], false);
    const delta = parseIntToken(tokens[2], true);
    if (day === null || day < 1 || day > 7 || delta === null) {
      output.push('err BADARG');
      continue;
    }
    const target = day + delta;
    if (target < 1 || target > 7) {
      output.push('err BADARG');
      continue;
    }
    let changed = 0;
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].day === day) {
        courses[i].day = target;
        changed++;
      }
    }
    output.push('ok shift ' + changed);
    continue;
  }

  if (op === 'copy') {
    if (tokens.length !== 3) {
      output.push('err BADARG');
      continue;
    }
    const name = tokens[1];
    const day = parseIntToken(tokens[2], false);
    if (!isValidWord(name) || day === null || day < 1 || day > 7) {
      output.push('err BADARG');
      continue;
    }
    const src = findCourse(name);
    if (src === null) {
      output.push('err NOTFOUND');
      continue;
    }
    if (courses.length >= 20) {
      output.push('err LIMIT');
      continue;
    }
    let newName = null;
    let suffixNumber = 2;
    while (newName === null) {
      const suffix = '_' + suffixNumber;
      let prefix = src.name;
      const maxPrefixLength = 12 - suffix.length;
      if (maxPrefixLength <= 0) {
        prefix = '';
      } else if (prefix.length > maxPrefixLength) {
        prefix = prefix.slice(0, maxPrefixLength);
      }
      const candidate = prefix + suffix;
      if (findCourse(candidate) === null) {
        newName = candidate;
      } else {
        suffixNumber++;
      }
    }
    courses.push({
      name: newName,
      teacher: src.teacher,
      loc: src.loc,
      day: day,
      from: src.from,
      to: src.to
    });
    output.push('ok copy 1');
    continue;
  }

  if (op === 'merge') {
    if (tokens.length !== 3) {
      output.push('err BADARG');
      continue;
    }
    const aName = tokens[1];
    const bName = tokens[2];
    if (!isValidWord(aName) || !isValidWord(bName)) {
      output.push('err BADARG');
      continue;
    }
    const a = findCourse(aName);
    const b = findCourse(bName);
    if (a === null || b === null) {
      output.push('err NOTFOUND');
      continue;
    }
    a.teacher = b.teacher;
    a.loc = b.loc;
    let index = -1;
    for (let i = 0; i < courses.length; i++) {
      if (courses[i] === b) {
        index = i;
        break;
      }
    }
    if (index >= 0) courses.splice(index, 1);
    output.push('ok merge 2');
    continue;
  }

  if (op === 'sort') {
    if (tokens.length !== 1) {
      output.push('err BADARG');
      continue;
    }
    output.push('ok sort 0');
    continue;
  }

  if (op === 'filter') {
    if (tokens.length !== 2) {
      output.push('err BADARG');
      continue;
    }
    const day = parseIntToken(tokens[1], false);
    if (day === null || day < 1 || day > 7) {
      output.push('err BADARG');
      continue;
    }
    let count = 0;
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].day === day) count++;
    }
    output.push('ok filter ' + count);
    continue;
  }

  if (op === 'count') {
    if (tokens.length !== 1) {
      output.push('err BADARG');
      continue;
    }
    output.push('ok count ' + courses.length);
    continue;
  }

  output.push('err BADARG');
}

output.push('#state');

const sorted = courses.slice();
sorted.sort(function (a, b) {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
});

for (let i = 0; i < sorted.length; i++) {
  const c = sorted[i];
  output.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
}

process.stdout.write(output.join('\n') + '\n');

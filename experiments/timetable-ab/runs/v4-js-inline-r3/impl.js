let courses = [];
let out = [];

function isPosInt(s) { return /^[0-9]+$/.test(s); }
function isInt(s) { return /^-?[0-9]+$/.test(s); }
function validWord(s) { return s.length >= 1 && s.length <= 12 && !/\s/.test(s); }
function findCourse(name) {
  for (let i = 0; i < courses.length; i++) {
    if (courses[i].name === name) return courses[i];
  }
  return null;
}
function hasConflict(day, from, to, excludeName) {
  for (let i = 0; i < courses.length; i++) {
    let c = courses[i];
    if (c.name === excludeName) continue;
    if (c.day === day && from <= c.to && to >= c.from) return true;
  }
  return false;
}

for (const cmd of process.argv.slice(2)) {
  let parts = cmd.trim().split(/\s+/);
  if (parts.length === 1 && parts[0] === '') parts = [];
  let verb = parts[0] || '';

  if (verb === 'add') {
    if (parts.length !== 7) { out.push('err BADARG'); continue; }
    let name = parts[1], teacher = parts[2], loc = parts[3];
    let dayS = parts[4], fromS = parts[5], toS = parts[6];
    if (!validWord(name) || !validWord(teacher) || !validWord(loc) ||
        !isPosInt(dayS) || !isPosInt(fromS) || !isPosInt(toS)) {
      out.push('err BADARG'); continue;
    }
    let day = parseInt(dayS, 10), from = parseInt(fromS, 10), to = parseInt(toS, 10);
    if (day < 1 || day > 7 || from < 1 || from > 12 || to < 1 || to > 12 || to < from) {
      out.push('err BADARG'); continue;
    }
    if (findCourse(name)) { out.push('err DUP'); continue; }
    if (courses.length >= 20) { out.push('err LIMIT'); continue; }
    if (hasConflict(day, from, to, null)) { out.push('err CONFLICT'); continue; }
    courses.push({ name: name, teacher: teacher, loc: loc, day: day, from: from, to: to });
    out.push('ok add 1');
  } else if (verb === 'del') {
    if (parts.length !== 2) { out.push('err BADARG'); continue; }
    let name = parts[1];
    if (!validWord(name)) { out.push('err BADARG'); continue; }
    let idx = -1;
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].name === name) { idx = i; break; }
    }
    if (idx === -1) { out.push('err NOTFOUND'); continue; }
    courses.splice(idx, 1);
    out.push('ok del 1');
  } else if (verb === 'edit') {
    if (parts.length !== 4) { out.push('err BADARG'); continue; }
    let name = parts[1], teacher = parts[2], loc = parts[3];
    if (!validWord(name) || !validWord(teacher) || !validWord(loc)) {
      out.push('err BADARG'); continue;
    }
    let c = findCourse(name);
    if (!c) { out.push('err NOTFOUND'); continue; }
    c.teacher = teacher;
    c.loc = loc;
    out.push('ok edit 1');
  } else if (verb === 'move') {
    if (parts.length !== 5) { out.push('err BADARG'); continue; }
    let name = parts[1], dayS = parts[2], fromS = parts[3], toS = parts[4];
    if (!validWord(name) || !isPosInt(dayS) || !isPosInt(fromS) || !isPosInt(toS)) {
      out.push('err BADARG'); continue;
    }
    let day = parseInt(dayS, 10), from = parseInt(fromS, 10), to = parseInt(toS, 10);
    if (day < 1 || day > 7 || from < 1 || from > 12 || to < 1 || to > 12 || to < from) {
      out.push('err BADARG'); continue;
    }
    let c = findCourse(name);
    if (!c) { out.push('err NOTFOUND'); continue; }
    if (hasConflict(day, from, to, name)) { out.push('err CONFLICT'); continue; }
    c.day = day;
    c.from = from;
    c.to = to;
    out.push('ok move 1');
  } else if (verb === 'swap') {
    if (parts.length !== 3) { out.push('err BADARG'); continue; }
    let aName = parts[1], bName = parts[2];
    if (!validWord(aName) || !validWord(bName)) { out.push('err BADARG'); continue; }
    let a = findCourse(aName);
    let b = findCourse(bName);
    if (!a || !b) { out.push('err NOTFOUND'); continue; }
    if (aName !== bName) {
      let tmpDay = a.day; a.day = b.day; b.day = tmpDay;
      let tmpFrom = a.from; a.from = b.from; b.from = tmpFrom;
      let tmpTo = a.to; a.to = b.to; b.to = tmpTo;
    }
    out.push('ok swap 2');
  } else if (verb === 'rename') {
    if (parts.length !== 3) { out.push('err BADARG'); continue; }
    let oldName = parts[1], newName = parts[2];
    if (!validWord(oldName) || !validWord(newName)) { out.push('err BADARG'); continue; }
    let c = findCourse(oldName);
    if (!c) { out.push('err NOTFOUND'); continue; }
    if (findCourse(newName)) { out.push('err DUP'); continue; }
    c.name = newName;
    out.push('ok rename 1');
  } else if (verb === 'duplicate') {
    if (parts.length !== 3) { out.push('err BADARG'); continue; }
    let name = parts[1], newName = parts[2];
    if (!validWord(name) || !validWord(newName)) { out.push('err BADARG'); continue; }
    let src = findCourse(name);
    if (!src) { out.push('err NOTFOUND'); continue; }
    if (findCourse(newName)) { out.push('err DUP'); continue; }
    if (courses.length >= 20) { out.push('err LIMIT'); continue; }
    courses.push({ name: newName, teacher: src.teacher, loc: src.loc, day: src.day, from: src.from, to: src.to });
    out.push('ok duplicate 1');
  } else if (verb === 'trim') {
    if (parts.length !== 3) { out.push('err BADARG'); continue; }
    let dayS = parts[1], toS = parts[2];
    if (!isPosInt(dayS) || !isPosInt(toS)) { out.push('err BADARG'); continue; }
    let day = parseInt(dayS, 10), to = parseInt(toS, 10);
    if (day < 1 || day > 7 || to < 1 || to > 12) { out.push('err BADARG'); continue; }
    let count = 0;
    for (let i = 0; i < courses.length; i++) {
      let c = courses[i];
      if (c.day === day && c.from <= to && to < c.to) {
        c.to = to;
        count++;
      }
    }
    out.push('ok trim ' + count);
  } else if (verb === 'clear') {
    if (parts.length !== 2) { out.push('err BADARG'); continue; }
    let dayS = parts[1];
    if (!isPosInt(dayS)) { out.push('err BADARG'); continue; }
    let day = parseInt(dayS, 10);
    if (day < 1 || day > 7) { out.push('err BADARG'); continue; }
    let count = 0;
    for (let i = courses.length - 1; i >= 0; i--) {
      if (courses[i].day === day) {
        courses.splice(i, 1);
        count++;
      }
    }
    out.push('ok clear ' + count);
  } else if (verb === 'shift') {
    if (parts.length !== 3) { out.push('err BADARG'); continue; }
    let dayS = parts[1], deltaS = parts[2];
    if (!isPosInt(dayS) || !isInt(deltaS)) { out.push('err BADARG'); continue; }
    let day = parseInt(dayS, 10), delta = parseInt(deltaS, 10);
    if (day < 1 || day > 7) { out.push('err BADARG'); continue; }
    let newDay = day + delta;
    if (newDay < 1 || newDay > 7) { out.push('err BADARG'); continue; }
    let count = 0;
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].day === day) {
        courses[i].day = newDay;
        count++;
      }
    }
    out.push('ok shift ' + count);
  } else if (verb === 'copy') {
    if (parts.length !== 3) { out.push('err BADARG'); continue; }
    let name = parts[1], dayS = parts[2];
    if (!validWord(name) || !isPosInt(dayS)) { out.push('err BADARG'); continue; }
    let day = parseInt(dayS, 10);
    if (day < 1 || day > 7) { out.push('err BADARG'); continue; }
    let src = findCourse(name);
    if (!src) { out.push('err NOTFOUND'); continue; }
    let newName = name + '_2';
    if (newName.length > 12) { out.push('err BADARG'); continue; }
    if (findCourse(newName)) { out.push('err DUP'); continue; }
    if (courses.length >= 20) { out.push('err LIMIT'); continue; }
    courses.push({ name: newName, teacher: src.teacher, loc: src.loc, day: day, from: src.from, to: src.to });
    out.push('ok copy 1');
  } else if (verb === 'merge') {
    if (parts.length !== 3) { out.push('err BADARG'); continue; }
    let aName = parts[1], bName = parts[2];
    if (!validWord(aName) || !validWord(bName)) { out.push('err BADARG'); continue; }
    let a = findCourse(aName);
    let b = findCourse(bName);
    if (!a || !b) { out.push('err NOTFOUND'); continue; }
    a.teacher = b.teacher;
    a.loc = b.loc;
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].name === bName) {
        courses.splice(i, 1);
        break;
      }
    }
    out.push('ok merge 2');
  } else if (verb === 'sort') {
    if (parts.length !== 1) { out.push('err BADARG'); continue; }
    courses.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    out.push('ok sort 0');
  } else if (verb === 'filter') {
    if (parts.length !== 2) { out.push('err BADARG'); continue; }
    let dayS = parts[1];
    if (!isPosInt(dayS)) { out.push('err BADARG'); continue; }
    let day = parseInt(dayS, 10);
    if (day < 1 || day > 7) { out.push('err BADARG'); continue; }
    let count = 0;
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].day === day) count++;
    }
    out.push('ok filter ' + count);
  } else if (verb === 'count') {
    if (parts.length !== 1) { out.push('err BADARG'); continue; }
    out.push('ok count ' + courses.length);
  } else {
    out.push('err BADARG');
  }
}

let sortedCourses = courses.slice().sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
out.push('#state');
for (let i = 0; i < sortedCourses.length; i++) {
  let c = sortedCourses[i];
  out.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
}
process.stdout.write(out.join('\n') + '\n');

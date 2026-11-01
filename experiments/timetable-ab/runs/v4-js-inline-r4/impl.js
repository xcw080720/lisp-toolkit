const cmds = process.argv.slice(2);
const state = [];
const out = [];

function isWord(s) {
  return typeof s === 'string' && s.length >= 1 && s.length <= 12 && !/\s/.test(s);
}

function toInt(s) {
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n)) return null;
  return n;
}

for (const cmd of cmds) {
  const trimmed = cmd.trim();
  const parts = trimmed === '' ? [] : trimmed.split(/\s+/);
  if (parts.length === 0) {
    out.push('err BADARG');
    continue;
  }
  const verb = parts[0];

  if (verb === 'add') {
    if (parts.length !== 7) {
      out.push('err BADARG');
      continue;
    }
    const name = parts[1], teacher = parts[2], loc = parts[3];
    const dayS = parts[4], fromS = parts[5], toS = parts[6];
    if (!isWord(name) || !isWord(teacher) || !isWord(loc)) {
      out.push('err BADARG');
      continue;
    }
    const day = toInt(dayS), from = toInt(fromS), to = toInt(toS);
    if (day === null || day < 1 || day > 7 || from === null || from < 1 || from > 12 || to === null || to < 1 || to > 12 || to < from) {
      out.push('err BADARG');
      continue;
    }
    if (state.some(c => c.name === name)) {
      out.push('err DUP');
      continue;
    }
    if (state.length >= 20) {
      out.push('err LIMIT');
      continue;
    }
    let conf = false;
    for (const c of state) {
      if (c.day === day && !(to < c.from || from > c.to)) {
        conf = true;
        break;
      }
    }
    if (conf) {
      out.push('err CONFLICT');
      continue;
    }
    state.push({ name, teacher, loc, day, from, to });
    out.push('ok add 1');

  } else if (verb === 'del') {
    if (parts.length !== 2) {
      out.push('err BADARG');
      continue;
    }
    const name = parts[1];
    if (!isWord(name)) {
      out.push('err BADARG');
      continue;
    }
    const idx = state.findIndex(c => c.name === name);
    if (idx === -1) {
      out.push('err NOTFOUND');
      continue;
    }
    state.splice(idx, 1);
    out.push('ok del 1');

  } else if (verb === 'edit') {
    if (parts.length !== 4) {
      out.push('err BADARG');
      continue;
    }
    const name = parts[1], teacher = parts[2], loc = parts[3];
    if (!isWord(name) || !isWord(teacher) || !isWord(loc)) {
      out.push('err BADARG');
      continue;
    }
    const c = state.find(c => c.name === name);
    if (!c) {
      out.push('err NOTFOUND');
      continue;
    }
    c.teacher = teacher;
    c.loc = loc;
    out.push('ok edit 1');

  } else if (verb === 'move') {
    if (parts.length !== 5) {
      out.push('err BADARG');
      continue;
    }
    const name = parts[1];
    const dayS = parts[2], fromS = parts[3], toS = parts[4];
    if (!isWord(name)) {
      out.push('err BADARG');
      continue;
    }
    const day = toInt(dayS), from = toInt(fromS), to = toInt(toS);
    if (day === null || day < 1 || day > 7 || from === null || from < 1 || from > 12 || to === null || to < 1 || to > 12 || to < from) {
      out.push('err BADARG');
      continue;
    }
    const c = state.find(c => c.name === name);
    if (!c) {
      out.push('err NOTFOUND');
      continue;
    }
    let conf = false;
    for (const o of state) {
      if (o === c) continue;
      if (o.day === day && !(to < o.from || from > o.to)) {
        conf = true;
        break;
      }
    }
    if (conf) {
      out.push('err CONFLICT');
      continue;
    }
    c.day = day;
    c.from = from;
    c.to = to;
    out.push('ok move 1');

  } else if (verb === 'swap') {
    if (parts.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    const a = parts[1], b = parts[2];
    if (!isWord(a) || !isWord(b)) {
      out.push('err BADARG');
      continue;
    }
    const ca = state.find(c => c.name === a);
    const cb = state.find(c => c.name === b);
    if (!ca || !cb) {
      out.push('err NOTFOUND');
      continue;
    }
    if (ca !== cb) {
      const da = ca.day, fa = ca.from, ta = ca.to;
      ca.day = cb.day;
      ca.from = cb.from;
      ca.to = cb.to;
      cb.day = da;
      cb.from = fa;
      cb.to = ta;
    }
    out.push('ok swap 2');

  } else if (verb === 'rename') {
    if (parts.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    const oldName = parts[1], newName = parts[2];
    if (!isWord(oldName) || !isWord(newName)) {
      out.push('err BADARG');
      continue;
    }
    const c = state.find(c => c.name === oldName);
    if (!c) {
      out.push('err NOTFOUND');
      continue;
    }
    if (state.some(x => x.name === newName)) {
      out.push('err DUP');
      continue;
    }
    c.name = newName;
    out.push('ok rename 1');

  } else if (verb === 'duplicate') {
    if (parts.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    const name = parts[1], newName = parts[2];
    if (!isWord(name) || !isWord(newName)) {
      out.push('err BADARG');
      continue;
    }
    const src = state.find(c => c.name === name);
    if (!src) {
      out.push('err NOTFOUND');
      continue;
    }
    if (state.some(c => c.name === newName)) {
      out.push('err DUP');
      continue;
    }
    if (state.length >= 20) {
      out.push('err LIMIT');
      continue;
    }
    state.push({ name: newName, teacher: src.teacher, loc: src.loc, day: src.day, from: src.from, to: src.to });
    out.push('ok duplicate 1');

  } else if (verb === 'trim') {
    if (parts.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    const dayS = parts[1], toS = parts[2];
    const day = toInt(dayS), to = toInt(toS);
    if (day === null || day < 1 || day > 7 || to === null || to < 1 || to > 12) {
      out.push('err BADARG');
      continue;
    }
    let count = 0;
    for (const c of state) {
      if (c.day === day && c.from <= to && to < c.to) {
        c.to = to;
        count++;
      }
    }
    out.push('ok trim ' + count);

  } else if (verb === 'clear') {
    if (parts.length !== 2) {
      out.push('err BADARG');
      continue;
    }
    const dayS = parts[1];
    const day = toInt(dayS);
    if (day === null || day < 1 || day > 7) {
      out.push('err BADARG');
      continue;
    }
    const before = state.length;
    for (let i = state.length - 1; i >= 0; i--) {
      if (state[i].day === day) {
        state.splice(i, 1);
      }
    }
    const count = before - state.length;
    out.push('ok clear ' + count);

  } else if (verb === 'shift') {
    if (parts.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    const dayS = parts[1], deltaS = parts[2];
    const day = toInt(dayS);
    const delta = toInt(deltaS);
    if (day === null || day < 1 || day > 7 || delta === null) {
      out.push('err BADARG');
      continue;
    }
    const newDay = day + delta;
    if (newDay < 1 || newDay > 7) {
      out.push('err BADARG');
      continue;
    }
    let count = 0;
    for (const c of state) {
      if (c.day === day) {
        c.day = newDay;
        count++;
      }
    }
    out.push('ok shift ' + count);

  } else if (verb === 'copy') {
    if (parts.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    const name = parts[1], dayS = parts[2];
    if (!isWord(name)) {
      out.push('err BADARG');
      continue;
    }
    const day = toInt(dayS);
    if (day === null || day < 1 || day > 7) {
      out.push('err BADARG');
      continue;
    }
    const src = state.find(c => c.name === name);
    if (!src) {
      out.push('err NOTFOUND');
      continue;
    }
    const newName = name + '_2';
    if (newName.length > 12) {
      out.push('err BADARG');
      continue;
    }
    if (state.some(c => c.name === newName)) {
      out.push('err DUP');
      continue;
    }
    if (state.length >= 20) {
      out.push('err LIMIT');
      continue;
    }
    state.push({ name: newName, teacher: src.teacher, loc: src.loc, day: day, from: src.from, to: src.to });
    out.push('ok copy 1');

  } else if (verb === 'merge') {
    if (parts.length !== 3) {
      out.push('err BADARG');
      continue;
    }
    const a = parts[1], b = parts[2];
    if (!isWord(a) || !isWord(b)) {
      out.push('err BADARG');
      continue;
    }
    if (a === b) {
      out.push('err BADARG');
      continue;
    }
    const ca = state.find(c => c.name === a);
    const cb = state.find(c => c.name === b);
    if (!ca || !cb) {
      out.push('err NOTFOUND');
      continue;
    }
    ca.teacher = cb.teacher;
    ca.loc = cb.loc;
    const idx = state.indexOf(cb);
    state.splice(idx, 1);
    out.push('ok merge 2');

  } else if (verb === 'sort') {
    if (parts.length !== 1) {
      out.push('err BADARG');
      continue;
    }
    out.push('ok sort 0');

  } else if (verb === 'filter') {
    if (parts.length !== 2) {
      out.push('err BADARG');
      continue;
    }
    const dayS = parts[1];
    const day = toInt(dayS);
    if (day === null || day < 1 || day > 7) {
      out.push('err BADARG');
      continue;
    }
    let count = 0;
    for (const c of state) {
      if (c.day === day) count++;
    }
    out.push('ok filter ' + count);

  } else if (verb === 'count') {
    if (parts.length !== 1) {
      out.push('err BADARG');
      continue;
    }
    out.push('ok count ' + state.length);

  } else {
    out.push('err BADARG');
  }
}

out.push('#state');
state.sort((a, b) => {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
});
for (const c of state) {
  out.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
}
process.stdout.write(out.join('\n') + '\n');

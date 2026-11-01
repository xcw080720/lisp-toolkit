'use strict';

const LIMIT = 20, DAY_MAX = 7, HOUR_MAX = 12, NAME_MAX = 12;
const SUFFIX = '_2';

const digits = s => /^[0-9]+$/.test(s);
const inRange = (s, lo, hi) => digits(s) && +s >= lo && +s <= hi;
const word = s => (s.length >= 1 && s.length <= NAME_MAX ? s : null);

const FIELD = {
  name: word,
  word: word,
  day: s => (inRange(s, 1, DAY_MAX) ? +s : null),
  hour: s => (inRange(s, 1, HOUR_MAX) ? +s : null),
  delta: s => (/^[+-]?[0-9]+$/.test(s) ? +s : null)
};

const pick = (S, n) => {
  for (let i = 0; i < S.length; i++) if (S[i].name === n) return S[i];
  return null;
};

const overlaps = (c, day, fr, to) =>
  c.day === day && !(c.to < fr || to < c.from);

const clash = (S, day, fr, to, skipA, skipB) => {
  for (let i = 0; i < S.length; i++) {
    const c = S[i];
    if (c === skipA || c === skipB) continue;
    if (overlaps(c, day, fr, to)) return true;
  }
  return false;
};

const make = (n, t, l, d, fr, to) => ({ name: n, teacher: t, loc: l, day: d, from: fr, to: to });

const OPS = {
  add: {
    sig: ['name', 'word', 'word', 'day', 'hour', 'hour'],
    ok: v => v[5] >= v[4],
    run(S, v) {
      if (pick(S, v[0])) return 'DUP';
      if (S.length >= LIMIT) return 'LIMIT';
      if (clash(S, v[3], v[4], v[5], null, null)) return 'CONFLICT';
      S.push(make(v[0], v[1], v[2], v[3], v[4], v[5]));
      return 1;
    }
  },

  del: {
    sig: ['name'],
    run(S, v) {
      const c = pick(S, v[0]);
      if (!c) return 'NOTFOUND';
      S.splice(S.indexOf(c), 1);
      return 1;
    }
  },

  edit: {
    sig: ['name', 'word', 'word'],
    run(S, v) {
      const c = pick(S, v[0]);
      if (!c) return 'NOTFOUND';
      c.teacher = v[1];
      c.loc = v[2];
      return 1;
    }
  },

  move: {
    sig: ['name', 'day', 'hour', 'hour'],
    ok: v => v[3] >= v[2],
    run(S, v) {
      const c = pick(S, v[0]);
      if (!c) return 'NOTFOUND';
      if (clash(S, v[1], v[2], v[3], c, null)) return 'CONFLICT';
      c.day = v[1];
      c.from = v[2];
      c.to = v[3];
      return 1;
    }
  },

  swap: {
    sig: ['name', 'name'],
    run(S, v) {
      const a = pick(S, v[0]), b = pick(S, v[1]);
      if (!a || !b) return 'NOTFOUND';
      if (a === b) return 2;
      if (clash(S, b.day, b.from, b.to, a, b)) return 'CONFLICT';
      if (clash(S, a.day, a.from, a.to, a, b)) return 'CONFLICT';
      const d = a.day, fr = a.from, to = a.to;
      a.day = b.day; a.from = b.from; a.to = b.to;
      b.day = d; b.from = fr; b.to = to;
      return 2;
    }
  },

  rename: {
    sig: ['name', 'name'],
    run(S, v) {
      const c = pick(S, v[0]);
      if (!c) return 'NOTFOUND';
      if (v[1] !== v[0] && pick(S, v[1])) return 'DUP';
      c.name = v[1];
      return 1;
    }
  },

  duplicate: {
    sig: ['name', 'name'],
    run(S, v) {
      const c = pick(S, v[0]);
      if (!c) return 'NOTFOUND';
      if (pick(S, v[1])) return 'DUP';
      if (S.length >= LIMIT) return 'LIMIT';
      S.push(make(v[1], c.teacher, c.loc, c.day, c.from, c.to));
      return 1;
    }
  },

  trim: {
    sig: ['day', 'hour'],
    run(S, v) {
      const day = v[0], to = v[1];
      let k = 0;
      for (let i = 0; i < S.length; i++) {
        const c = S[i];
        if (c.day === day && c.from <= to && to < c.to) {
          c.to = to;
          k++;
        }
      }
      return k;
    }
  },

  clear: {
    sig: ['day'],
    run(S, v) {
      const day = v[0];
      let k = 0;
      for (let i = S.length - 1; i >= 0; i--) {
        if (S[i].day === day) {
          S.splice(i, 1);
          k++;
        }
      }
      return k;
    }
  },

  shift: {
    sig: ['day', 'delta'],
    run(S, v) {
      const day = v[0], nd = day + v[1];
      if (nd < 1 || nd > DAY_MAX) return 'BADARG';
      let k = 0;
      for (let i = 0; i < S.length; i++) {
        if (S[i].day === day) {
          S[i].day = nd;
          k++;
        }
      }
      return k;
    }
  },

  copy: {
    sig: ['name', 'day'],
    run(S, v) {
      const c = pick(S, v[0]);
      if (!c) return 'NOTFOUND';
      const nn = c.name + SUFFIX;
      if (nn.length > NAME_MAX) return 'BADARG';
      if (pick(S, nn)) return 'DUP';
      if (S.length >= LIMIT) return 'LIMIT';
      if (clash(S, v[1], c.from, c.to, null, null)) return 'CONFLICT';
      S.push(make(nn, c.teacher, c.loc, v[1], c.from, c.to));
      return 1;
    }
  },

  merge: {
    sig: ['name', 'name'],
    run(S, v) {
      if (v[0] === v[1]) return 'BADARG';
      const a = pick(S, v[0]), b = pick(S, v[1]);
      if (!a || !b) return 'NOTFOUND';
      a.teacher = b.teacher;
      a.loc = b.loc;
      S.splice(S.indexOf(b), 1);
      return 2;
    }
  },

  sort: {
    sig: [],
    run(S, v) {
      S.sort((x, y) => byteCompare(x.name, y.name));
      return 0;
    }
  },

  filter: {
    sig: ['day'],
    run(S, v) {
      const day = v[0];
      let k = 0;
      for (let i = 0; i < S.length; i++) if (S[i].day === day) k++;
      return k;
    }
  },

  count: {
    sig: [],
    run(S, v) {
      return S.length;
    }
  }
};

function byteCompare(x, y) {
  const a = Buffer.from(x, 'utf8'), b = Buffer.from(y, 'utf8');
  const n = a.length < b.length ? a.length : b.length;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

function exec(S, cmd) {
  const tok = String(cmd).split(/\s+/).filter(x => x.length > 0);
  const verb = tok.length > 0 ? tok[0].toLowerCase() : '';
  const spec = Object.prototype.hasOwnProperty.call(OPS, verb) ? OPS[verb] : null;
  const args = tok.slice(1);
  if (!spec || args.length !== spec.sig.length) return 'err BADARG';
  const v = [];
  for (let i = 0; i < args.length; i++) {
    const x = FIELD[spec.sig[i]](args[i]);
    if (x === null) return 'err BADARG';
    v.push(x);
  }
  if (spec.ok && !spec.ok(v)) return 'err BADARG';
  const r = spec.run(S, v);
  return typeof r === 'number' ? 'ok ' + verb + ' ' + r : 'err ' + r;
}

const state = [];
const out = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) out.push(exec(state, argv[i]));
out.push('#state');
state.sort((x, y) => byteCompare(x.name, y.name));
for (let i = 0; i < state.length; i++) {
  const c = state[i];
  out.push(c.name + '|' + c.teacher + '|' + c.loc + '|' + c.day + '|' + c.from + '-' + c.to);
}
process.stdout.write(out.join('\n') + '\n');

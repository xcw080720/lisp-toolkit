'use strict';
var cmds = process.argv.slice(2);
var cs = [];
var i, j, t, v, n, f, o, cnt, ix, iy;
for (i = 0; i < cmds.length; i = i + 1) {
  t = cmds[i].trim().split(/\s+/);
  v = t[0];
  if (v === 'add') {
    if (t.length === 7 && /^[^\s]{1,12}$/.test(t[1]) && /^[^\s]{1,12}$/.test(t[2]) && /^[^\s]{1,12}$/.test(t[3]) && /^-?\d+$/.test(t[4]) && /^-?\d+$/.test(t[5]) && /^-?\d+$/.test(t[6]) && +t[4] >= 1 && +t[4] <= 7 && +t[5] >= 1 && +t[5] <= 12 && +t[6] >= 1 && +t[6] <= 12 && +t[6] >= +t[5]) {
      f = false;
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].name === t[1]) { f = true; }
      }
      if (f) {
        process.stdout.write('err DUP\n');
      } else {
        f = false;
        for (j = 0; j < cs.length; j = j + 1) {
          if (cs[j].day === +t[4] && +t[5] <= cs[j].to && cs[j].from <= +t[6]) { f = true; }
        }
        if (f) {
          process.stdout.write('err CONFLICT\n');
        } else if (cs.length >= 20) {
          process.stdout.write('err LIMIT\n');
        } else {
          cs.push({ name: t[1], teacher: t[2], loc: t[3], day: +t[4], from: +t[5], to: +t[6] });
          process.stdout.write('ok add 1\n');
        }
      }
    } else {
      process.stdout.write('err BADARG\n');
    }
  } else if (v === 'del') {
    if (t.length !== 2) {
      process.stdout.write('err BADARG\n');
    } else {
      ix = -1;
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].name === t[1] && ix < 0) { ix = j; }
      }
      if (ix < 0) {
        process.stdout.write('err NOTFOUND\n');
      } else {
        cs.splice(ix, 1);
        process.stdout.write('ok del 1\n');
      }
    }
  } else if (v === 'edit') {
    if (t.length === 4 && /^[^\s]{1,12}$/.test(t[2]) && /^[^\s]{1,12}$/.test(t[3])) {
      ix = -1;
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].name === t[1] && ix < 0) { ix = j; }
      }
      if (ix < 0) {
        process.stdout.write('err NOTFOUND\n');
      } else {
        cs[ix].teacher = t[2];
        cs[ix].loc = t[3];
        process.stdout.write('ok edit 1\n');
      }
    } else {
      process.stdout.write('err BADARG\n');
    }
  } else if (v === 'move') {
    if (t.length === 5 && /^-?\d+$/.test(t[2]) && /^-?\d+$/.test(t[3]) && /^-?\d+$/.test(t[4]) && +t[2] >= 1 && +t[2] <= 7 && +t[3] >= 1 && +t[3] <= 12 && +t[4] >= 1 && +t[4] <= 12 && +t[4] >= +t[3]) {
      ix = -1;
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].name === t[1] && ix < 0) { ix = j; }
      }
      if (ix < 0) {
        process.stdout.write('err NOTFOUND\n');
      } else {
        f = false;
        for (j = 0; j < cs.length; j = j + 1) {
          if (j !== ix && cs[j].day === +t[2] && +t[3] <= cs[j].to && cs[j].from <= +t[4]) { f = true; }
        }
        if (f) {
          process.stdout.write('err CONFLICT\n');
        } else {
          cs[ix].day = +t[2];
          cs[ix].from = +t[3];
          cs[ix].to = +t[4];
          process.stdout.write('ok move 1\n');
        }
      }
    } else {
      process.stdout.write('err BADARG\n');
    }
  } else if (v === 'swap') {
    if (t.length !== 3) {
      process.stdout.write('err BADARG\n');
    } else {
      ix = -1;
      iy = -1;
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].name === t[1] && ix < 0) { ix = j; }
      }
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].name === t[2] && iy < 0) { iy = j; }
      }
      if (ix < 0 || iy < 0) {
        process.stdout.write('err NOTFOUND\n');
      } else {
        n = cs[ix].day;
        cs[ix].day = cs[iy].day;
        cs[iy].day = n;
        n = cs[ix].from;
        cs[ix].from = cs[iy].from;
        cs[iy].from = n;
        n = cs[ix].to;
        cs[ix].to = cs[iy].to;
        cs[iy].to = n;
        process.stdout.write('ok swap 2\n');
      }
    }
  } else if (v === 'rename') {
    if (t.length === 3 && /^[^\s]{1,12}$/.test(t[2])) {
      ix = -1;
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].name === t[1] && ix < 0) { ix = j; }
      }
      if (ix < 0) {
        process.stdout.write('err NOTFOUND\n');
      } else {
        f = false;
        for (j = 0; j < cs.length; j = j + 1) {
          if (cs[j].name === t[2]) { f = true; }
        }
        if (f) {
          process.stdout.write('err DUP\n');
        } else {
          cs[ix].name = t[2];
          process.stdout.write('ok rename 1\n');
        }
      }
    } else {
      process.stdout.write('err BADARG\n');
    }
  } else if (v === 'duplicate') {
    if (t.length === 3 && /^[^\s]{1,12}$/.test(t[2])) {
      ix = -1;
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].name === t[1] && ix < 0) { ix = j; }
      }
      if (ix < 0) {
        process.stdout.write('err NOTFOUND\n');
      } else {
        f = false;
        for (j = 0; j < cs.length; j = j + 1) {
          if (cs[j].name === t[2]) { f = true; }
        }
        if (f) {
          process.stdout.write('err DUP\n');
        } else if (cs.length >= 20) {
          process.stdout.write('err LIMIT\n');
        } else {
          cs.push({ name: t[2], teacher: cs[ix].teacher, loc: cs[ix].loc, day: cs[ix].day, from: cs[ix].from, to: cs[ix].to });
          process.stdout.write('ok duplicate 1\n');
        }
      }
    } else {
      process.stdout.write('err BADARG\n');
    }
  } else if (v === 'trim') {
    if (t.length === 3 && /^-?\d+$/.test(t[1]) && /^-?\d+$/.test(t[2]) && +t[1] >= 1 && +t[1] <= 7 && +t[2] >= 1 && +t[2] <= 12) {
      cnt = 0;
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].day === +t[1] && cs[j].from <= +t[2] && +t[2] < cs[j].to) {
          cs[j].to = +t[2];
          cnt = cnt + 1;
        }
      }
      process.stdout.write('ok trim ' + cnt + '\n');
    } else {
      process.stdout.write('err BADARG\n');
    }
  } else if (v === 'clear') {
    if (t.length === 2 && /^-?\d+$/.test(t[1]) && +t[1] >= 1 && +t[1] <= 7) {
      cnt = 0;
      o = [];
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].day === +t[1]) {
          cnt = cnt + 1;
        } else {
          o.push(cs[j]);
        }
      }
      cs = o;
      process.stdout.write('ok clear ' + cnt + '\n');
    } else {
      process.stdout.write('err BADARG\n');
    }
  } else if (v === 'shift') {
    if (t.length === 3 && /^-?\d+$/.test(t[1]) && /^-?\d+$/.test(t[2]) && +t[1] >= 1 && +t[1] <= 7 && +t[1] + +t[2] >= 1 && +t[1] + +t[2] <= 7) {
      cnt = 0;
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].day === +t[1]) {
          cs[j].day = +t[1] + +t[2];
          cnt = cnt + 1;
        }
      }
      process.stdout.write('ok shift ' + cnt + '\n');
    } else {
      process.stdout.write('err BADARG\n');
    }
  } else if (v === 'copy') {
    if (t.length === 3 && /^-?\d+$/.test(t[2]) && +t[2] >= 1 && +t[2] <= 7) {
      ix = -1;
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].name === t[1] && ix < 0) { ix = j; }
      }
      if (ix < 0) {
        process.stdout.write('err NOTFOUND\n');
      } else if (cs.length >= 20) {
        process.stdout.write('err LIMIT\n');
      } else {
        cs.push({ name: t[1] + '_2', teacher: cs[ix].teacher, loc: cs[ix].loc, day: +t[2], from: cs[ix].from, to: cs[ix].to });
        process.stdout.write('ok copy 1\n');
      }
    } else {
      process.stdout.write('err BADARG\n');
    }
  } else if (v === 'merge') {
    if (t.length !== 3) {
      process.stdout.write('err BADARG\n');
    } else {
      ix = -1;
      iy = -1;
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].name === t[1] && ix < 0) { ix = j; }
      }
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].name === t[2] && iy < 0) { iy = j; }
      }
      if (ix < 0 || iy < 0) {
        process.stdout.write('err NOTFOUND\n');
      } else {
        cs[ix].teacher = cs[iy].teacher;
        cs[ix].loc = cs[iy].loc;
        cs.splice(iy, 1);
        process.stdout.write('ok merge 2\n');
      }
    }
  } else if (v === 'sort') {
    if (t.length !== 1) {
      process.stdout.write('err BADARG\n');
    } else {
      process.stdout.write('ok sort 0\n');
    }
  } else if (v === 'filter') {
    if (t.length === 2 && /^-?\d+$/.test(t[1]) && +t[1] >= 1 && +t[1] <= 7) {
      cnt = 0;
      for (j = 0; j < cs.length; j = j + 1) {
        if (cs[j].day === +t[1]) { cnt = cnt + 1; }
      }
      process.stdout.write('ok filter ' + cnt + '\n');
    } else {
      process.stdout.write('err BADARG\n');
    }
  } else if (v === 'count') {
    if (t.length !== 1) {
      process.stdout.write('err BADARG\n');
    } else {
      process.stdout.write('ok count ' + cs.length + '\n');
    }
  } else {
    process.stdout.write('err BADARG\n');
  }
}
process.stdout.write('#state\n');
o = [];
for (j = 0; j < cs.length; j = j + 1) {
  o.push(cs[j]);
}
o.sort(function (pa, pb) {
  if (pa.name < pb.name) { return -1; }
  if (pa.name > pb.name) { return 1; }
  return 0;
});
for (j = 0; j < o.length; j = j + 1) {
  process.stdout.write(o[j].name + '|' + o[j].teacher + '|' + o[j].loc + '|' + o[j].day + '|' + o[j].from + '-' + o[j].to + '\n');
}

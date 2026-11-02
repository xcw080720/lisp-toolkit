'use strict';

var courses = [];

function wrd(s) {
  return s.length >= 1 && s.length <= 12;
}

function num(s) {
  if (!/^-?[0-9]+$/.test(s)) {
    return null;
  }
  return parseInt(s, 10);
}

function at(n) {
  for (var i = 0; i < courses.length; i++) {
    if (courses[i].name === n) {
      return i;
    }
  }
  return -1;
}

function clash(d, f, t, skip) {
  for (var i = 0; i < courses.length; i++) {
    var c = courses[i];
    if (c.name === skip) {
      continue;
    }
    if (c.day !== d) {
      continue;
    }
    if (c.from <= t && f <= c.to) {
      return true;
    }
  }
  return false;
}

function snap() {
  var out = [];
  for (var i = 0; i < courses.length; i++) {
    var c = courses[i];
    out.push({ name: c.name, teacher: c.teacher, loc: c.loc, day: c.day, from: c.from, to: c.to });
  }
  return out;
}

function compressDay(d) {
  var list = [];
  for (var i = 0; i < courses.length; i++) {
    if (courses[i].day === d) {
      list.push(courses[i]);
    }
  }
  list.sort(function (x, y) {
    return x.from - y.from;
  });
  var changed = 0;
  for (var k = 0; k < list.length; k++) {
    var nf = k + 1;
    var nt = k + 2;
    if (list[k].from !== nf || list[k].to !== nt) {
      list[k].from = nf;
      list[k].to = nt;
      changed = changed + 1;
    }
  }
  return changed;
}

var argv = process.argv.slice(2);

for (var ci = 0; ci < argv.length; ci++) {
  var tk = argv[ci].replace(/^\s+/, '').replace(/\s+$/, '').split(/\s+/);
  if (tk.length === 1 && tk[0] === '') {
    tk = [];
  }
  var dry = false;
  if (tk.length > 0 && tk[0] === '--dry') {
    dry = true;
    tk = tk.slice(1);
  }
  if (tk.length === 0) {
    console.log('err BADARG');
    continue;
  }
  var verb = tk[0];
  var a = tk.slice(1);
  var pre = dry ? snap() : null;
  var r = null;

  if (verb === 'add') {
    if (a.length !== 6) {
      r = 'err BADARG';
    } else {
      var d = num(a[3]);
      var f = num(a[4]);
      var t = num(a[5]);
      if (!wrd(a[0]) || !wrd(a[1]) || !wrd(a[2]) || d === null || f === null || t === null || d < 1 || d > 7 || f < 1 || f > 12 || t < 1 || t > 12 || t < f) {
        r = 'err BADARG';
      } else if (at(a[0]) >= 0) {
        r = 'err DUP';
      } else if (courses.length >= 20) {
        r = 'err LIMIT';
      } else if (clash(d, f, t, '')) {
        r = 'err CONFLICT';
      } else {
        courses.push({ name: a[0], teacher: a[1], loc: a[2], day: d, from: f, to: t });
        r = 'ok add 1';
      }
    }
  } else if (verb === 'del') {
    if (a.length !== 1) {
      r = 'err BADARG';
    } else if (!wrd(a[0])) {
      r = 'err BADARG';
    } else {
      var pi = at(a[0]);
      if (pi < 0) {
        r = 'err NOTFOUND';
      } else {
        courses.splice(pi, 1);
        r = 'ok del 1';
      }
    }
  } else if (verb === 'edit') {
    if (a.length !== 3) {
      r = 'err BADARG';
    } else if (!wrd(a[0]) || !wrd(a[1]) || !wrd(a[2])) {
      r = 'err BADARG';
    } else {
      var ei = at(a[0]);
      if (ei < 0) {
        r = 'err NOTFOUND';
      } else {
        courses[ei].teacher = a[1];
        courses[ei].loc = a[2];
        r = 'ok edit 1';
      }
    }
  } else if (verb === 'move') {
    if (a.length !== 4) {
      r = 'err BADARG';
    } else {
      var md = num(a[1]);
      var mf = num(a[2]);
      var mt = num(a[3]);
      if (!wrd(a[0]) || md === null || mf === null || mt === null || md < 1 || md > 7 || mf < 1 || mf > 12 || mt < 1 || mt > 12 || mt < mf) {
        r = 'err BADARG';
      } else {
        var mi = at(a[0]);
        if (mi < 0) {
          r = 'err NOTFOUND';
        } else if (clash(md, mf, mt, a[0])) {
          r = 'err CONFLICT';
        } else {
          courses[mi].day = md;
          courses[mi].from = mf;
          courses[mi].to = mt;
          r = 'ok move 1';
        }
      }
    }
  } else if (verb === 'swap') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else if (!wrd(a[0]) || !wrd(a[1])) {
      r = 'err BADARG';
    } else {
      var si = at(a[0]);
      var sj = at(a[1]);
      if (si < 0 || sj < 0) {
        r = 'err NOTFOUND';
      } else {
        var sd = courses[si].day;
        var sf = courses[si].from;
        var st = courses[si].to;
        courses[si].day = courses[sj].day;
        courses[si].from = courses[sj].from;
        courses[si].to = courses[sj].to;
        courses[sj].day = sd;
        courses[sj].from = sf;
        courses[sj].to = st;
        r = 'ok swap 2';
      }
    }
  } else if (verb === 'rename') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else if (!wrd(a[0]) || !wrd(a[1])) {
      r = 'err BADARG';
    } else {
      var ri = at(a[0]);
      if (ri < 0) {
        r = 'err NOTFOUND';
      } else if (a[1] !== a[0] && at(a[1]) >= 0) {
        r = 'err DUP';
      } else {
        courses[ri].name = a[1];
        r = 'ok rename 1';
      }
    }
  } else if (verb === 'duplicate') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else if (!wrd(a[0]) || !wrd(a[1])) {
      r = 'err BADARG';
    } else {
      var di = at(a[0]);
      if (di < 0) {
        r = 'err NOTFOUND';
      } else if (false) {
        r = 'err DUP';
      } else {
        var dc = courses[di];
        courses.push({ name: a[1], teacher: dc.teacher, loc: dc.loc, day: dc.day, from: dc.from, to: dc.to });
        r = 'ok duplicate 1';
      }
    }
  } else if (verb === 'trim') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else {
      var td = num(a[0]);
      var tt = num(a[1]);
      if (td === null || tt === null || td < 1 || td > 7 || tt < 1 || tt > 12) {
        r = 'err BADARG';
      } else {
        var tc = 0;
        for (var ti = 0; ti < courses.length; ti++) {
          if (courses[ti].day === td && courses[ti].from <= tt && tt < courses[ti].to) {
            courses[ti].to = tt;
            tc = tc + 1;
          }
        }
        r = 'ok trim ' + tc;
      }
    }
  } else if (verb === 'clear') {
    if (a.length !== 1) {
      r = 'err BADARG';
    } else {
      var cd = num(a[0]);
      if (cd === null || cd < 1 || cd > 7) {
        r = 'err BADARG';
      } else {
        var cc = 0;
        var ckeep = [];
        for (var cl = 0; cl < courses.length; cl++) {
          if (courses[cl].day === cd) {
            cc = cc + 1;
          } else {
            ckeep.push(courses[cl]);
          }
        }
        courses = ckeep;
        r = 'ok clear ' + cc;
      }
    }
  } else if (verb === 'shift') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else {
      var hd = num(a[0]);
      var hdl = num(a[1]);
      if (hd === null || hdl === null || hd < 1 || hd > 7 || hd + hdl < 1 || hd + hdl > 7) {
        r = 'err BADARG';
      } else {
        var hc = 0;
        for (var hi = 0; hi < courses.length; hi++) {
          if (courses[hi].day === hd) {
            courses[hi].day = hd + hdl;
            hc = hc + 1;
          }
        }
        r = 'ok shift ' + hc;
      }
    }
  } else if (verb === 'copy') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else {
      var kd = num(a[1]);
      if (!wrd(a[0]) || kd === null || kd < 1 || kd > 7) {
        r = 'err BADARG';
      } else {
        var ki = at(a[0]);
        if (ki < 0) {
          r = 'err NOTFOUND';
        } else if (at(a[0] + '_2') >= 0) {
          r = 'err DUP';
        } else {
          var kc = courses[ki];
          courses.push({ name: a[0] + '_2', teacher: kc.teacher, loc: kc.loc, day: kd, from: kc.from, to: kc.to });
          r = 'ok copy 1';
        }
      }
    }
  } else if (verb === 'merge') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else if (!wrd(a[0]) || !wrd(a[1])) {
      r = 'err BADARG';
    } else {
      var gi = at(a[0]);
      var gj = at(a[1]);
      if (gi < 0 || gj < 0) {
        r = 'err NOTFOUND';
      } else {
        courses[gi].teacher = courses[gj].teacher;
        courses[gi].loc = courses[gj].loc;
        if (gi !== gj) {
          courses.splice(gj, 1);
        }
        r = 'ok merge 2';
      }
    }
  } else if (verb === 'sort') {
    if (a.length !== 0) {
      r = 'err BADARG';
    } else {
      r = 'ok sort 0';
    }
  } else if (verb === 'filter') {
    if (a.length !== 1) {
      r = 'err BADARG';
    } else {
      var fd = num(a[0]);
      if (fd === null || fd < 1 || fd > 7) {
        r = 'err BADARG';
      } else {
        var fc = 0;
        for (var fi = 0; fi < courses.length; fi++) {
          if (courses[fi].day === fd) {
            fc = fc + 1;
          }
        }
        r = 'ok filter ' + fc;
      }
    }
  } else if (verb === 'count') {
    if (a.length !== 0) {
      r = 'err BADARG';
    } else {
      r = 'ok count ' + courses.length;
    }
  } else if (verb === 'swapTeacher') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else if (!wrd(a[0]) || !wrd(a[1])) {
      r = 'err BADARG';
    } else {
      var wi = at(a[0]);
      var wj = at(a[1]);
      if (wi < 0 || wj < 0) {
        r = 'err NOTFOUND';
      } else {
        var wt = courses[wi].teacher;
        courses[wi].teacher = courses[wj].teacher;
        courses[wj].teacher = wt;
        r = 'ok swapteacher 2';
      }
    }
  } else if (verb === 'swapLoc') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else if (!wrd(a[0]) || !wrd(a[1])) {
      r = 'err BADARG';
    } else {
      var xi = at(a[0]);
      var xj = at(a[1]);
      if (xi < 0 || xj < 0) {
        r = 'err NOTFOUND';
      } else {
        var xl = courses[xi].loc;
        courses[xi].loc = courses[xj].loc;
        courses[xj].loc = xl;
        r = 'ok swaploc 2';
      }
    }
  } else if (verb === 'copyTo') {
    if (a.length !== 4) {
      r = 'err BADARG';
    } else {
      var yd = num(a[1]);
      var yf = num(a[2]);
      var yt = num(a[3]);
      if (!wrd(a[0]) || yd === null || yf === null || yt === null || yd < 1 || yd > 7 || yf < 1 || yf > 12 || yt < 1 || yt > 12 || yt < yf) {
        r = 'err BADARG';
      } else {
        var yi = at(a[0]);
        if (yi < 0) {
          r = 'err NOTFOUND';
        } else if (at(a[0] + '_3') >= 0) {
          r = 'err DUP';
        } else if (clash(yd, yf, yt, '')) {
          r = 'err CONFLICT';
        } else {
          var yc = courses[yi];
          courses.push({ name: a[0] + '_3', teacher: yc.teacher, loc: yc.loc, day: yd, from: yf, to: yt });
          r = 'ok copyto 1';
        }
      }
    }
  } else if (verb === 'truncate') {
    if (a.length !== 1) {
      r = 'err BADARG';
    } else {
      var nd = num(a[0]);
      if (nd === null || nd < 1 || nd > 7) {
        r = 'err BADARG';
      } else {
        var nl = [];
        for (var ni = 0; ni < courses.length; ni++) {
          if (courses[ni].day === nd) {
            nl.push(courses[ni]);
          }
        }
        var ns = null;
        for (var nk = 0; nk < nl.length; nk++) {
          if (ns === null || nl[nk].name < ns) {
            ns = nl[nk].name;
          }
        }
        var nkeep = [];
        for (var nm = 0; nm < courses.length; nm++) {
          if (courses[nm].day !== nd || courses[nm].name === ns) {
            nkeep.push(courses[nm]);
          }
        }
        courses = nkeep;
        r = 'ok truncate ' + (nl.length === 0 ? 0 : nl.length - 1);
      }
    }
  } else if (verb === 'keep') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else {
      var kd2 = num(a[0]);
      var kn = num(a[1]);
      if (kd2 === null || kn === null || kd2 < 1 || kd2 > 7 || kn < 0) {
        r = 'err BADARG';
      } else {
        var kl = [];
        for (var kk = 0; kk < courses.length; kk++) {
          if (courses[kk].day === kd2) {
            kl.push(courses[kk]);
          }
        }
        kl.sort(function (x, y) {
          if (x.name < y.name) {
            return -1;
          }
          if (x.name > y.name) {
            return 1;
          }
          return 0;
        });
        var gone = [];
        for (var kq = kn; kq < kl.length; kq++) {
          gone.push(kl[kq].name);
        }
        var kkeep = [];
        for (var kr = 0; kr < courses.length; kr++) {
          if (gone.indexOf(courses[kr].name) < 0) {
            kkeep.push(courses[kr]);
          }
        }
        courses = kkeep;
        r = 'ok keep ' + gone.length;
      }
    }
  } else if (verb === 'renameTeacher') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else if (!wrd(a[0]) || !wrd(a[1])) {
      r = 'err BADARG';
    } else {
      var rt = 0;
      for (var rq = 0; rq < courses.length; rq++) {
        if (courses[rq].teacher === a[0]) {
          courses[rq].teacher = a[1];
          rt = rt + 1;
        }
      }
      r = 'ok renameteacher ' + rt;
    }
  } else if (verb === 'renameLoc') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else if (!wrd(a[0]) || !wrd(a[1])) {
      r = 'err BADARG';
    } else {
      var rl = 0;
      for (var rp = 0; rp < courses.length; rp++) {
        if (courses[rp].loc === a[0]) {
          courses[rp].loc = a[1];
          rl = rl + 1;
        }
      }
      r = 'ok renameloc ' + rl;
    }
  } else if (verb === 'dedupe') {
    if (a.length !== 0) {
      r = 'err BADARG';
    } else {
      var didx = [];
      for (var db = 0; db < courses.length; db++) {
        didx.push(db);
      }
      didx.sort(function (p, q) {
        var A = courses[p];
        var B = courses[q];
        if (A.name < B.name) {
          return -1;
        }
        if (A.name > B.name) {
          return 1;
        }
        return 0;
      });
      var dkeys = [];
      var dkeep = [];
      var drop = 0;
      for (var dz = 0; dz < didx.length; dz++) {
        var dcur = courses[didx[dz]];
        var dkey = dcur.teacher + '|' + dcur.loc + '|' + dcur.day + '|' + dcur.from + '-' + dcur.to;
        if (dkeys.indexOf(dkey) >= 0) {
          drop = drop + 1;
        } else {
          dkeys.push(dkey);
          dkeep.push(dcur);
        }
      }
      courses = dkeep;
      r = 'ok dedupe ' + drop;
    }
  } else if (verb === 'compress') {
    if (a.length !== 1) {
      r = 'err BADARG';
    } else {
      var pd = num(a[0]);
      if (pd === null || pd < 1 || pd > 7) {
        r = 'err BADARG';
      } else {
        r = 'ok compress ' + compressDay(pd);
      }
    }
  } else if (verb === 'compact') {
    if (a.length !== 0) {
      r = 'err BADARG';
    } else {
      var pt = 0;
      for (var pc = 1; pc <= 7; pc++) {
        pt = pt + compressDay(pc);
      }
      r = 'ok compact ' + pt;
    }
  } else if (verb === 'mirror') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else {
      var md1 = num(a[0]);
      var md2 = num(a[1]);
      if (md1 === null || md2 === null || md1 < 1 || md1 > 7 || md2 < 1 || md2 > 7) {
        r = 'err BADARG';
      } else {
        var msrc = [];
        for (var mq = 0; mq < courses.length; mq++) {
          if (courses[mq].day === md1) {
            msrc.push(courses[mq]);
          }
        }
        var mdup = false;
        for (var mw = 0; mw < msrc.length; mw++) {
          if (at(msrc[mw].name + '_m') >= 0) {
            mdup = true;
          }
        }
        if (mdup) {
          r = 'err DUP';
        } else {
          for (var me = 0; me < msrc.length; me++) {
            courses.push({ name: msrc[me].name + '_m', teacher: msrc[me].teacher, loc: msrc[me].loc, day: md2, from: msrc[me].from, to: msrc[me].to });
          }
          r = 'ok mirror ' + msrc.length;
        }
      }
    }
  } else if (verb === 'absorb') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else if (!wrd(a[0]) || !wrd(a[1])) {
      r = 'err BADARG';
    } else {
      var ai = at(a[0]);
      var aj = at(a[1]);
      if (ai < 0 || aj < 0) {
        r = 'err NOTFOUND';
      } else {
        courses[ai].teacher = courses[aj].teacher;
        courses[ai].loc = courses[aj].loc;
        r = 'ok absorb 2';
      }
    }
  } else if (verb === 'swapDays') {
    if (a.length !== 2) {
      r = 'err BADARG';
    } else {
      var gd1 = num(a[0]);
      var gd2 = num(a[1]);
      if (gd1 === null || gd2 === null || gd1 < 1 || gd1 > 7 || gd2 < 1 || gd2 > 7) {
        r = 'err BADARG';
      } else {
        var gbefore = [];
        for (var gb = 0; gb < courses.length; gb++) {
          gbefore.push(courses[gb].day);
        }
        var gcnt = 0;
        for (var gs = 0; gs < courses.length; gs++) {
          if (courses[gs].day === gd1) {
            courses[gs].day = gd2;
            gcnt = gcnt + 1;
          } else if (courses[gs].day === gd2) {
            courses[gs].day = gd1;
            gcnt = gcnt + 1;
          }
        }
        var gbad = false;
        for (var gi2 = 0; gi2 < courses.length && !gbad; gi2++) {
          if (gbefore[gi2] !== gd1 && gbefore[gi2] !== gd2) {
            continue;
          }
          for (var gj2 = 0; gj2 < courses.length; gj2++) {
            if (gi2 === gj2) {
              continue;
            }
            if (courses[gi2].day === courses[gj2].day && courses[gi2].from <= courses[gj2].to && courses[gj2].from <= courses[gi2].to) {
              gbad = true;
              break;
            }
          }
        }
        if (gbad) {
          for (var gr = 0; gr < courses.length; gr++) {
            if (courses[gr].day === gd2 && (gbefore[gr] === gd1 || gbefore[gr] === gd2)) {
              courses[gr].day = gbefore[gr];
            }
          }
          r = 'err CONFLICT';
        } else {
          r = 'ok swapdays ' + gcnt;
        }
      }
    }
  } else if (verb === 'promote') {
    if (a.length !== 1) {
      r = 'err BADARG';
    } else if (!wrd(a[0])) {
      r = 'err BADARG';
    } else {
      var qi = at(a[0]);
      if (qi < 0) {
        r = 'err NOTFOUND';
      } else {
        var qc = courses[qi];
        for (var qf = 1; qf <= 11; qf++) {
          if (!clash(qc.day, qf, qf + 1, qc.name)) {
            qc.from = qf;
            qc.to = qf + 1;
            break;
          }
        }
        r = 'ok promote 1';
      }
    }
  } else if (verb === 'purge') {
    if (a.length !== 1) {
      r = 'err BADARG';
    } else if (!wrd(a[0])) {
      r = 'err BADARG';
    } else {
      var up = 0;
      var ukeep = [];
      for (var ub = 0; ub < courses.length; ub++) {
        if (courses[ub].teacher === a[0]) {
          up = up + 1;
        } else {
          ukeep.push(courses[ub]);
        }
      }
      courses = ukeep;
      r = 'ok purge ' + up;
    }
  } else {
    r = 'err BADARG';
  }

  if (dry) {
    courses = pre;
  }
  console.log(r);
}

var order = [];
for (var oi = 0; oi < courses.length; oi++) {
  order.push(courses[oi]);
}
order.sort(function (x, y) {
  if (x.name < y.name) {
    return -1;
  }
  if (x.name > y.name) {
    return 1;
  }
  return 0;
});
console.log('#state');
for (var oj = 0; oj < order.length; oj++) {
  console.log(order[oj].name + '|' + order[oj].teacher + '|' + order[oj].loc + '|' + order[oj].day + '|' + order[oj].from + '-' + order[oj].to);
}

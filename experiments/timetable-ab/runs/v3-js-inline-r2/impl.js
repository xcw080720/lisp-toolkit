'use strict';
const A = process.argv.slice(2);
const C = [];
let i = 0;
while (i < A.length) {
  const p = A[i].split(' ');
  const cmd = p[0];
  if (cmd === 'add') {
    if (p.length !== 7) console.log('err BADARG');
    else {
      const nm = p[1], tc = p[2], lc = p[3], ds = p[4], fs = p[5], ts = p[6];
      if (!/^[^ \t]{1,12}$/.test(nm) || !/^[^ \t]{1,12}$/.test(tc) || !/^[^ \t]{1,12}$/.test(lc) || !/^\d+$/.test(ds) || !/^\d+$/.test(fs) || !/^\d+$/.test(ts)) console.log('err BADARG');
      else {
        const dv = +ds, fv = +fs, tv = +ts;
        if (dv < 1 || dv > 7 || fv < 1 || fv > 12 || tv < 1 || tv > 12 || tv < fv) console.log('err BADARG');
        else {
          let d = false;
          for (let k = 0; k < C.length; k++) if (C[k].name === nm) d = true;
          if (d) console.log('err DUP');
          else if (C.length >= 20) console.log('err LIMIT');
          else {
            let c = false;
            for (let k = 0; k < C.length; k++) if (C[k].day === dv && C[k].from <= tv && fv <= C[k].to) c = true;
            if (c) console.log('err CONFLICT');
            else {
              C.push({ name: nm, teacher: tc, loc: lc, day: dv, from: fv, to: tv });
              console.log('ok add 1');
            }
          }
        }
      }
    }
  } else if (cmd === 'del') {
    if (p.length !== 2) console.log('err BADARG');
    else {
      let x = -1;
      for (let k = 0; k < C.length; k++) if (C[k].name === p[1]) x = k;
      if (x < 0) console.log('err NOTFOUND');
      else {
        C.splice(x, 1);
        console.log('ok del 1');
      }
    }
  } else if (cmd === 'edit') {
    if (p.length !== 4) console.log('err BADARG');
    else {
      const nm = p[1], tc = p[2], lc = p[3];
      if (!/^[^ \t]{1,12}$/.test(tc) || !/^[^ \t]{1,12}$/.test(lc)) console.log('err BADARG');
      else {
        let x = -1;
        for (let k = 0; k < C.length; k++) if (C[k].name === nm) x = k;
        if (x < 0) console.log('err NOTFOUND');
        else {
          C[x].teacher = tc;
          C[x].loc = lc;
          console.log('ok edit 1');
        }
      }
    }
  } else if (cmd === 'move') {
    if (p.length !== 5) console.log('err BADARG');
    else {
      const nm = p[1], ds = p[2], fs = p[3], ts = p[4];
      if (!/^\d+$/.test(ds) || !/^\d+$/.test(fs) || !/^\d+$/.test(ts)) console.log('err BADARG');
      else {
        const dv = +ds, fv = +fs, tv = +ts;
        if (dv < 1 || dv > 7 || fv < 1 || fv > 12 || tv < 1 || tv > 12 || tv < fv) console.log('err BADARG');
        else {
          let x = -1;
          for (let k = 0; k < C.length; k++) if (C[k].name === nm) x = k;
          if (x < 0) console.log('err NOTFOUND');
          else {
            let c = false;
            for (let k = 0; k < C.length; k++) if (k !== x && C[k].day === dv && C[k].from <= tv && fv <= C[k].to) c = true;
            if (c) console.log('err CONFLICT');
            else {
              C[x].day = dv;
              C[x].from = fv;
              C[x].to = tv;
              console.log('ok move 1');
            }
          }
        }
      }
    }
  } else if (cmd === 'swap') {
    if (p.length !== 3) console.log('err BADARG');
    else {
      let x = -1, y = -1;
      for (let k = 0; k < C.length; k++) {
        if (C[k].name === p[1]) x = k;
        if (C[k].name === p[2]) y = k;
      }
      if (x < 0 || y < 0) console.log('err NOTFOUND');
      else {
        const sd = C[x].day, sf = C[x].from, st = C[x].to;
        C[x].day = C[y].day;
        C[x].from = C[y].from;
        C[x].to = C[y].to;
        C[y].day = sd;
        C[y].from = sf;
        C[y].to = st;
        console.log('ok swap 2');
      }
    }
  } else if (cmd === 'rename') {
    if (p.length !== 3) console.log('err BADARG');
    else {
      const od = p[1], nw = p[2];
      if (!/^[^ \t]{1,12}$/.test(nw)) console.log('err BADARG');
      else {
        let x = -1, d = false;
        for (let k = 0; k < C.length; k++) {
          if (C[k].name === od) x = k;
          if (C[k].name === nw) d = true;
        }
        if (x < 0) console.log('err NOTFOUND');
        else if (d && nw !== od) console.log('err DUP');
        else {
          C[x].name = nw;
          console.log('ok rename 1');
        }
      }
    }
  } else if (cmd === 'duplicate') {
    if (p.length !== 3) console.log('err BADARG');
    else {
      const nm = p[1], nw = p[2];
      if (!/^[^ \t]{1,12}$/.test(nw)) console.log('err BADARG');
      else {
        let x = -1, d = false;
        for (let k = 0; k < C.length; k++) {
          if (C[k].name === nm) x = k;
          if (C[k].name === nw) d = true;
        }
        if (x < 0) console.log('err NOTFOUND');
        else if (d) console.log('err DUP');
        else if (C.length >= 20) console.log('err LIMIT');
        else {
          C.push({ name: nw, teacher: C[x].teacher, loc: C[x].loc, day: C[x].day, from: C[x].from, to: C[x].to });
          console.log('ok duplicate 1');
        }
      }
    }
  } else if (cmd === 'trim') {
    if (p.length !== 3) console.log('err BADARG');
    else {
      const ds = p[1], ts = p[2];
      if (!/^\d+$/.test(ds) || !/^\d+$/.test(ts)) console.log('err BADARG');
      else {
        const dv = +ds, tv = +ts;
        if (dv < 1 || dv > 7 || tv < 1 || tv > 12) console.log('err BADARG');
        else {
          let n = 0;
          for (let k = 0; k < C.length; k++) {
            if (C[k].day === dv && C[k].from <= tv && tv < C[k].to) {
              C[k].to = tv;
              n++;
            }
          }
          console.log('ok trim ' + n);
        }
      }
    }
  } else if (cmd === 'clear') {
    if (p.length !== 2) console.log('err BADARG');
    else {
      const ds = p[1];
      if (!/^\d+$/.test(ds) || +ds < 1 || +ds > 7) console.log('err BADARG');
      else {
        const dv = +ds;
        let n = 0;
        for (let k = C.length - 1; k >= 0; k--) {
          if (C[k].day === dv) {
            C.splice(k, 1);
            n++;
          }
        }
        console.log('ok clear ' + n);
      }
    }
  } else if (cmd === 'shift') {
    if (p.length !== 3) console.log('err BADARG');
    else {
      const ds = p[1], dd = p[2];
      if (!/^\d+$/.test(ds) || !/^-?\d+$/.test(dd)) console.log('err BADARG');
      else {
        const dv = +ds, ddv = +dd;
        if (dv < 1 || dv > 7 || dv + ddv < 1 || dv + ddv > 7) console.log('err BADARG');
        else {
          let n = 0;
          for (let k = 0; k < C.length; k++) {
            if (C[k].day === dv) {
              C[k].day = dv + ddv;
              n++;
            }
          }
          console.log('ok shift ' + n);
        }
      }
    }
  } else if (cmd === 'copy') {
    if (p.length !== 3) console.log('err BADARG');
    else {
      const nm = p[1], ds = p[2];
      if (!/^\d+$/.test(ds)) console.log('err BADARG');
      else {
        const dv = +ds;
        if (dv < 1 || dv > 7) console.log('err BADARG');
        else {
          let x = -1;
          for (let k = 0; k < C.length; k++) if (C[k].name === nm) x = k;
          if (x < 0) console.log('err NOTFOUND');
          else {
            const nw = nm + '_2';
            if (nw.length > 12) console.log('err BADARG');
            else if (C.length >= 20) console.log('err LIMIT');
            else {
              let d = false;
              for (let k = 0; k < C.length; k++) if (C[k].name === nw) d = true;
              if (d) console.log('err DUP');
              else {
                C.push({ name: nw, teacher: C[x].teacher, loc: C[x].loc, day: dv, from: C[x].from, to: C[x].to });
                console.log('ok copy 1');
              }
            }
          }
        }
      }
    }
  } else if (cmd === 'merge') {
    if (p.length !== 3) console.log('err BADARG');
    else {
      let x = -1, y = -1;
      for (let k = 0; k < C.length; k++) {
        if (C[k].name === p[1]) x = k;
        if (C[k].name === p[2]) y = k;
      }
      if (x < 0 || y < 0) console.log('err NOTFOUND');
      else {
        C[x].teacher = C[y].teacher;
        C[x].loc = C[y].loc;
        C.splice(y, 1);
        console.log('ok merge 2');
      }
    }
  } else if (cmd === 'sort') {
    if (p.length !== 1) console.log('err BADARG');
    else console.log('ok sort 0');
  } else if (cmd === 'filter') {
    if (p.length !== 2) console.log('err BADARG');
    else {
      const ds = p[1];
      if (!/^\d+$/.test(ds) || +ds < 1 || +ds > 7) console.log('err BADARG');
      else {
        const dv = +ds;
        let n = 0;
        for (let k = 0; k < C.length; k++) if (C[k].day === dv) n++;
        console.log('ok filter ' + n);
      }
    }
  } else if (cmd === 'count') {
    if (p.length !== 1) console.log('err BADARG');
    else console.log('ok count ' + C.length);
  } else {
    console.log('err BADARG');
  }
  i++;
}
const S = C.slice().sort(function (a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
});
console.log('#state');
for (let k = 0; k < S.length; k++) {
  console.log(S[k].name + '|' + S[k].teacher + '|' + S[k].loc + '|' + S[k].day + '|' + S[k].from + '-' + S[k].to);
}

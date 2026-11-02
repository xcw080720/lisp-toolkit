#!/usr/bin/env node
// 变异体矩阵：从 counterexamples/base-clean.js（84/84）派生一组「只坏一处」的实现，
// 逐个跑 check-v4，记录每个变异体让哪些判据变红。
//
// 目的不是「造一堆红的」，而是回答一个可量化的问题：
//   84 条内容判据里，有多少条**在世上存在一个能让它红的实现**？
// 没有反例的判据，只能算「从来没红过」，不能算「判据」。
//
// 用法： node tools/mutation-matrix.cjs [--only name,name]
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = path.join(__dirname, '..', 'experiments', 'timetable-ab');
const CE = path.join(HERE, 'counterexamples');
const BASE = path.join(CE, 'base-clean.js');
const argv = process.argv.slice(2);
const onlyArg = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',').map(s => s.trim()) : null; })();

const base = fs.readFileSync(BASE, 'utf8');

// 每条 patch：name / 说明 / 替换对（必须唯一命中）
const PATCHES = [
  { name: 'add-noclash', desc: 'add 不查时段冲突', pairs: [["} else if (clash(d, f, t, '')) {", '} else if (false) {']] },
  { name: 'add-day8', desc: 'add 允许 day=8', pairs: [['d < 1 || d > 7 || f < 1 || f > 12', 'd < 1 || d > 8 || f < 1 || f > 12']] },
  { name: 'add-tofrom', desc: 'add 不查 to<from', pairs: [['|| t < 1 || t > 12 || t < f)', '|| t < 1 || t > 12 || (t < f && false))']] },
  { name: 'del-notfound', desc: 'del 不存在返回 ok', pairs: [["      if (pi < 0) {\n        r = 'err NOTFOUND';", "      if (false) {\n        r = 'err NOTFOUND';"]] },
  { name: 'edit-notfound', desc: 'edit 不存在返回 ok', pairs: [["      var ei = at(a[0]);\n      if (ei < 0) {", "      var ei = at(a[0]);\n      if (false) {"]] },
  { name: 'move-noclash', desc: 'move 不查冲突', pairs: [["} else if (clash(md, mf, mt, a[0])) {", '} else if (false) {']] },
  { name: 'swap-half', desc: 'swap 只换 day 不换时段', pairs: [['courses[si].from = courses[sj].from;', 'courses[si].from = courses[si].from;']] },
  { name: 'rename-nodup', desc: 'rename 不查重名', pairs: [['} else if (a[1] !== a[0] && at(a[1]) >= 0) {', '} else if (false) {']] },
  { name: 'duplicate-nodup', desc: 'duplicate 不查重名', pairs: [["      } else if (at(a[1]) >= 0) {", '      } else if (false) {']] },
  { name: 'trim-direction', desc: 'trim 改 from 而不是 to', pairs: [['courses[ti].to = tt;', 'courses[ti].from = tt;']] },
  { name: 'trim-noop', desc: 'trim 什么都不改', pairs: [["if (courses[ti].day === td && courses[ti].from <= tt && tt < courses[ti].to) {", 'if (false) {']] },
  { name: 'clear-noop', desc: 'clear 不删课程', pairs: [['courses = ckeep;', 'courses = courses;']] },

  // —— 第二批：落在其余命令族上 ——
  { name: 'shift-direction', desc: 'shift 方向反了', pairs: [['courses[hi].day = hd + hdl;', 'courses[hi].day = hd - hdl;']] },
  { name: 'shift-bounds', desc: 'shift 不查越界', pairs: [['hd + hdl < 1 || hd + hdl > 7', 'false']] },
  { name: 'copy-name', desc: 'copy 生成的副本名不是 name_2', pairs: [["name: a[0] + '_2'", "name: a[0] + '_X'"]] },
  { name: 'merge-keep', desc: 'merge 不删被并的那门', pairs: [['courses.splice(gj, 1);', 'void 0;']] },
  { name: 'filter-count', desc: 'filter 报全表数而不是该天数', pairs: [["r = 'ok filter ' + fc;", "r = 'ok filter ' + courses.length;"]] },
  { name: 'count-fixed', desc: 'count 恒报 0', pairs: [["r = 'ok count ' + courses.length;", "r = 'ok count 0';"]] },
  { name: 'copyto-noclash', desc: 'copyTo 不查时段冲突', pairs: [["} else if (clash(yd, yf, yt, '')) {", '} else if (false) {']] },
  { name: 'copyto-nodup', desc: 'copyTo 不查重名', pairs: [["} else if (at(a[0] + '_3') >= 0) {", '} else if (false) {']] },
  { name: 'truncate-keepall', desc: 'truncate 不删任何课', pairs: [['if (courses[nm].day !== nd || courses[nm].name === ns) {', 'if (true) {']] },
  { name: 'keep-keepall', desc: 'keep 不删任何课', pairs: [['for (var kq = kn; kq < kl.length; kq++) {', 'for (var kq = kl.length; kq < kl.length; kq++) {']] },
  { name: 'renameteacher-noop', desc: 'renameTeacher 不改', pairs: [['courses[rq].teacher = a[1];', 'courses[rq].teacher = courses[rq].teacher;']] },
  { name: 'renameloc-noop', desc: 'renameLoc 不改', pairs: [['courses[rp].loc = a[1];', 'courses[rp].loc = courses[rp].loc;']] },
  { name: 'empty-cmd-ok', desc: '空命令串不报 BADARG', pairs: [["console.log('err BADARG');", "console.log('ok count 0');"]] },

  // —— 第三批：落在 op 25-30 的收尾命令上 ——
  { name: 'dedupe-noop', desc: 'dedupe 不删重复', pairs: [['courses = dkeep;', 'courses = courses;']] },
  { name: 'compress-noop', desc: 'compress 不重排', pairs: [["r = 'ok compress ' + compressDay(pd);", "r = 'ok compress 0';"]] },
  { name: 'compact-noop', desc: 'compact 不重排', pairs: [['pt = pt + compressDay(pc);', 'pt = pt + 0;']] },
  { name: 'mirror-wrongday', desc: 'mirror 复制到源日而不是目标日', pairs: [['day: md2, from: msrc[me].from', 'day: md1, from: msrc[me].from']] },
  { name: 'mirror-nodup', desc: 'mirror 不查重名', pairs: [["if (at(msrc[mw].name + '_m') >= 0) {", 'if (false) {']] },
  { name: 'absorb-noop', desc: 'absorb 不改 a 的教师/地点', pairs: [['courses[ai].teacher = courses[aj].teacher;', 'courses[ai].teacher = courses[ai].teacher;']] },
  { name: 'swapdays-noop', desc: 'swapDays 不换日', pairs: [['courses[gs].day = gd2;', 'courses[gs].day = gd1;']] },
];

const targets = onlyArg ? PATCHES.filter(p => onlyArg.includes(p.name)) : PATCHES;
const results = [];
const t0 = Date.now();

for (const p of targets) {
  let src = base;
  let applied = 0;
  for (const [from, to] of p.pairs) {
    const n = src.split(from).length - 1;
    if (n !== 1) {
      console.error(`[skip] ${p.name}: 锚点命中 ${n} 次（应为 1）：${JSON.stringify(from.slice(0, 50))}`);
      src = null;
      break;
    }
    src = src.replace(from, to);
    applied++;
  }
  if (src === null) continue;

  const file = path.join(CE, 'mut-' + p.name + '.js');
  fs.writeFileSync(file, src, 'utf8');

  const r = spawnSync(process.execPath, [path.join(HERE, 'check-v4.cjs'), '--impl', file], {
    encoding: 'utf8', env: { ...process.env, SBCL_WSL: process.env.SBCL_WSL || 'kali-linux' }, timeout: 300000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+)\s*\/\s*(\d+)\s*通过（fail=(\d+)\s+crash=(\d+)）/);
  const reds = [...out.matchAll(/^#\s*(\d+)\s+(FAIL|CRASH)/mg)].map(x => Number(x[1])).sort((a, b) => a - b);
  results.push({
    name: p.name, desc: p.desc, applied,
    pass: m ? Number(m[1]) : -1, total: m ? Number(m[2]) : -1,
    fail: m ? Number(m[3]) : -1, crash: m ? Number(m[4]) : -1,
    reds, exit: r.status,
  });
  console.log(`${p.name.padEnd(20)} ${String(m ? m[1] + '/' + m[2] : 'ERR').padEnd(8)} reds=${reds.length}  ${reds.map(i => '#' + i).join(' ')}`);
}

// 从未变红的判据
const all = [...new Set(results.flatMap(x => x.reds))];
const covered = new Set(all);
console.log(`\n覆盖 ${covered.size}/84 条判据`);

// --only 是部分跑：绝不能覆盖全量 matrix.tsv（会悄悄把 25 行缩成 7 行）
const suffix = onlyArg ? '.partial' : '';
fs.writeFileSync(path.join(CE, 'matrix' + suffix + '.tsv'),
  ['mutant\tdesc\tpass\ttotal\tfail\tcrash\treds\texit']
    .concat(results.map(x => [x.name, x.desc, x.pass, x.total, x.fail, x.crash, x.reds.map(i => '#' + i).join(' '), x.exit].join('\t')))
    .join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(CE, 'matrix' + suffix + '.json'),
  JSON.stringify({ generated_at: new Date().toISOString(), base: 'base-clean.js', results, covered: [...covered].sort((a, b) => a - b) }, null, 2) + '\n', 'utf8');
console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)} s；产物 counterexamples/matrix${suffix}.tsv`);

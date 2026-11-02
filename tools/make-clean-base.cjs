#!/usr/bin/env node
// 造一个「干净基线」：把 full-js-inline 里 6 个驼峰 ok 输出改成小写，
// 得到 84/84。所有反例都从它派生，这样任一条红都只可能来自反例本身，
// 不会混进 #37/#38/#39/#42/#43/#49 那 6 条驼峰噪音。
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = path.join(__dirname, '..', 'experiments', 'timetable-ab');
const SRC = path.join(HERE, 'runs', 'full-js-inline', 'impl.js');
const OUT = path.join(HERE, 'counterexamples', 'base-clean.js');

fs.mkdirSync(path.dirname(OUT), { recursive: true });

const MAP = {
  swapTeacher: 'swapteacher',
  swapLoc: 'swaploc',
  copyTo: 'copyto',
  renameTeacher: 'renameteacher',
  renameLoc: 'renameloc',
  swapDays: 'swapdays',
};

let s = fs.readFileSync(SRC, 'utf8');
let n = 0;
for (const [camel, lower] of Object.entries(MAP)) {
  const re = new RegExp("'ok " + camel + " ", 'g');
  const before = s;
  s = s.replace(re, "'ok " + lower + " ");
  if (s !== before) n++;
}
fs.writeFileSync(OUT, s, 'utf8');
console.log(`写出 ${path.relative(process.cwd(), OUT)}（替换 ${n}/6 处驼峰输出）`);

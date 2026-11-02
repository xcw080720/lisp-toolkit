#!/usr/bin/env node
// 修正 description 里两个会立刻过期的计数：编年史行数、FREEZE 记录数。
'use strict';
const fs = require('fs');
const path = require('path');

const R = path.join(__dirname, '..');
const p = path.join(R, '.zenodo.json');
const j = JSON.parse(fs.readFileSync(p, 'utf8'));

const lines = fs.readFileSync(path.join(R, 'docs', 'experiment-report.md'), 'utf8').split(/\r?\n/).length;

const before = j.description;
j.description = j.description
  .replace(/an append-only chronicle \(\d+ lines, E-01 through E-04\)/, `an append-only chronicle (${lines} lines, E-01 through E-05)`)
  .replace(/frozen specifications \(\d+ FREEZE records\)/, 'frozen specifications with recorded sha256 freeze hashes');

if (j.description === before) {
  console.error('没有替换成功：检查 description 的原文');
  process.exit(1);
}
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('chronicle lines ->', lines);
console.log(j.description.match(/[^.]*chronicle[^.]*\./)[0]);
console.log(j.description.match(/[^.]*frozen specifications[^.]*\./)[0]);

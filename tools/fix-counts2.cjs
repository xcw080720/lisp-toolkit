#!/usr/bin/env node
// 会变的计数不要写进对外摘要：行数改一次过时一次。
// 这里把 description 的行数去掉，只留区间（E-01 through E-05）；notes 里那句 "now 2678" 同样去掉绝对数。
'use strict';
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', '.zenodo.json');
const j = JSON.parse(fs.readFileSync(p, 'utf8'));

j.description = j.description.replace(/an append-only chronicle \(\d+ lines, E-01 through E-05\)/, 'an append-only chronicle (E-01 through E-05)');
j.notes = j.notes.replace(/a 2318-line chronicle \(now 2678\)/, 'a chronicle whose stated line count had stopped matching the file');

fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('description has line count:', /chronicle \(\d+ lines/.test(j.description));
console.log('notes has stale count:', /2318-line chronicle \(now \d+\)/.test(j.notes));

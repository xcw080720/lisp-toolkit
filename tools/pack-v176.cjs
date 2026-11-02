#!/usr/bin/env node
// 打发布包：整个 lisp-toolkit（排除 .git / node_modules / archive-zips / tmp / 编译产物）。
// 用 Windows 自带的 bsdtar：`-a` 按扩展名选格式，中文路径与条目数都不出问题。
// 输出 archive-zips/lisp-toolkit-<version>.zip 与 .sha256。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PARENT = path.join(ROOT, '..');
const ver = JSON.parse(fs.readFileSync(path.join(ROOT, '.zenodo.json'), 'utf8')).version;
const outDir = path.join(ROOT, 'archive-zips');
fs.mkdirSync(outDir, { recursive: true });
const zipPath = path.join(outDir, `lisp-toolkit-${ver}.zip`);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const args = [
  '-a', '-c', '-f', zipPath,
  '--exclude=lisp-toolkit/.git',
  '--exclude=lisp-toolkit/node_modules',
  '--exclude=lisp-toolkit/archive-zips',
  '--exclude=lisp-toolkit/tmp',
  '--exclude=lisp-toolkit/experiments/timetable-ab/tmp',
  '--exclude=lisp-toolkit/experiments/timetable-ab/baseline-v17.prev',
  '--exclude=lisp-toolkit/tmp/blind-176',
  '--exclude=lisp-toolkit/tmp/blind-176b',
  '--exclude=lisp-toolkit/tmp/blind-176c',
  '--exclude=*.fasl', '--exclude=*.fas', '--exclude=*.lib', '--exclude=*.err',
  'lisp-toolkit',
];
const r = spawnSync('tar.exe', args, { cwd: PARENT, encoding: 'utf8' });
if (r.status !== 0) {
  console.error('tar 失败', r.status, r.stderr);
  process.exit(1);
}

const list = spawnSync('tar.exe', ['-tf', zipPath], { encoding: 'utf8' });
const entries = (list.stdout || '').trim().split(/\r?\n/).filter(Boolean);
const buf = fs.readFileSync(zipPath);
const sha = crypto.createHash('sha256').update(buf).digest('hex');
fs.writeFileSync(zipPath + '.sha256', sha + '  ' + path.basename(zipPath) + '\n', 'utf8');

console.log('zip    = ' + path.relative(PARENT, zipPath));
console.log('entries= ' + entries.length);
console.log('bytes  = ' + buf.length);
console.log('sha256 = ' + sha);
const must = [
  'lisp-toolkit/.zenodo.json',
  'lisp-toolkit/CITATION.cff',
  'lisp-toolkit/docs/RELEASE-NOTES-v1.7.6.md',
  'lisp-toolkit/docs/RELEASE-NOTES-INDEX.md',
  'lisp-toolkit/docs/VERSION-MAP.md',
  'lisp-toolkit/experiments/timetable-ab/counterexamples/base-clean.js',
  'lisp-toolkit/experiments/timetable-ab/counterexamples/matrix.tsv',
  'lisp-toolkit/experiments/timetable-ab/baseline-v17/results.tsv',
  'lisp-toolkit/experiments/timetable-ab/gate.cjs',
];
const missing = must.filter(m => !entries.includes(m));
console.log(missing.length ? '缺少: ' + missing.join(', ') : '必备文件全部在包内');
if (missing.length) process.exitCode = 1;

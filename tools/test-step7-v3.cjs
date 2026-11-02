#!/usr/bin/env node
// 第七步第三版验证（提取法 + 首处版本号 + version 形态）：
//   A   全部 v1.7.60            → FAIL（description 里没有 v1.7.6）
//   B0  只改第一处 v1.7.60      → FAIL（第一处版本号不是 1.7.6）★ 新增检查
//   B1  两边 version 都写 1.7   → FAIL（version 不是三段式）★ 新增检查
//   B   作者顺序颠倒、集合相同  → PASS
//   C   一方多一人              → FAIL
//   D   全部还原                → PASS
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const R = path.join(__dirname, '..');
const GP = path.join(R, 'experiments', 'timetable-ab', 'gate.cjs');
const Z = path.join(R, '.zenodo.json');
const C = path.join(R, 'CITATION.cff');
const enc = 'utf8';

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rawZ = fs.readFileSync(Z, enc);
const rawC = fs.readFileSync(C, enc);
const shaZ0 = sha(Z), shaC0 = sha(C);

function runGate(label) {
  const r = spawnSync(process.execPath, [GP, '--closure-only'], {
    cwd: R, encoding: 'utf8', env: { ...process.env, SBCL_WSL: process.env.SBCL_WSL || 'kali-linux' },
    timeout: 300000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const line = (out.split(/\r?\n/).find(l => l.includes('发布元数据')) || '(没找到)').trim();
  console.log(`\n[${label}] exit=${r.status}`);
  console.log('  ' + line);
  return r.status;
}
const restore = () => { fs.writeFileSync(Z, rawZ); fs.writeFileSync(C, rawC); };
const writeZ = (j) => fs.writeFileSync(Z, JSON.stringify(j, null, 2) + '\n', enc);

// A：全部替换
{
  const j = JSON.parse(rawZ.toString('utf8'));
  const n = j.description.split('v1.7.6').length - 1;
  j.description = j.description.split('v1.7.6').join('v1.7.60');
  writeZ(j);
  console.log(`A: 替换 ${n} 处`);
  runGate('A  全部 v1.7.60  期望 FAIL');
  restore();
}

// B0：只改第一处
{
  const j = JSON.parse(rawZ.toString('utf8'));
  j.description = j.description.replace('Current state (v1.7.6', 'Current state (v1.7.60');
  writeZ(j);
  console.log('\nB0: 只改第一处，第二处保留');
  runGate('B0 仅首处 v1.7.60 期望 FAIL');
  restore();
}

// B1：两边 version 都写短
{
  const j = JSON.parse(rawZ.toString('utf8'));
  j.version = '1.7';
  writeZ(j);
  let c = rawC.toString('utf8').replace('version: "1.7.6"', 'version: "1.7"');
  fs.writeFileSync(C, c, enc);
  console.log('\nB1: 两边 version 都写成 1.7');
  runGate('B1 version=1.7     期望 FAIL');
  restore();
}

// B：顺序颠倒
{
  const j = JSON.parse(rawZ.toString('utf8'));
  j.creators = [...j.creators, { name: '测试乙', affiliation: 'test' }];
  writeZ(j);
  const c = rawC.toString('utf8').replace('authors:\n  - name: "许宸玮"',
    'authors:\n  - name: "测试乙"\n    affiliation: "test"\n  - name: "许宸玮"');
  fs.writeFileSync(C, c, enc);
  console.log('\nB: 作者顺序颠倒');
  runGate('B  顺序颠倒      期望 PASS');
  restore();
}

// C：集合不同
{
  const j = JSON.parse(rawZ.toString('utf8'));
  j.creators = [...j.creators, { name: '测试乙', affiliation: 'test' }];
  writeZ(j);
  console.log('\nC: creators 多一人');
  runGate('C  集合不同      期望 FAIL');
  restore();
}

// D：还原
console.log('\nD: 还原');
const st = runGate('D  还原          期望 PASS');
console.log('\n最终 sha 一致 =', sha(Z) === shaZ0 && sha(C) === shaC0);
console.log('exit(D) =', st);

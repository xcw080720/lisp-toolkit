#!/usr/bin/env node
// 第七步收紧后的三次验证：
//   A  版本号 v1.7.60（子串能混过）→ 现在必须 FAIL
//   B  作者顺序颠倒（集合相同）    → 现在必须 PASS（旧的有序比较会 FAIL）
//   C  一方多一个作者（集合不同）  → 必须 FAIL
// 每次改完都还原并核对 sha256。
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
  const line = (out.split(/\r?\n/).find(l => l.includes('发布元数据')) || '(没找到发布元数据行)').trim();
  console.log(`\n[${label}] exit=${r.status}`);
  console.log('  ' + line);
  return { exit: r.status, line };
}

function restore() {
  fs.writeFileSync(Z, rawZ);
  fs.writeFileSync(C, rawC);
}

// ---------- A：v1.7.60 ----------
{
  const j = JSON.parse(rawZ.toString('utf8'));
  // 必须全部替换：description 里有两处 v1.7.6（"Current state" 与 "v1.7.5-v1.7.6"），
  // 只改一处时另一处仍会让检查 PASS——那是测试没改干净，不是判据漏判。
  const hits = j.description.split('v1.7.6').length - 1;
  j.description = j.description.split('v1.7.6').join('v1.7.60');
  fs.writeFileSync(Z, JSON.stringify(j, null, 2) + '\n', enc);
  console.log(`A: 替换 ${hits} 处 v1.7.6 -> v1.7.60`);
  runGate('A  v1.7.60');
  restore();
  console.log('   还原 sha 一致 =', sha(Z) === shaZ0 && sha(C) === shaC0);
}

// ---------- B：顺序颠倒，集合相同 ----------
{
  const j = JSON.parse(rawZ.toString('utf8'));
  j.creators = [...j.creators, { name: '测试乙', affiliation: 'test' }];
  fs.writeFileSync(Z, JSON.stringify(j, null, 2) + '\n', enc);
  let c = rawC.toString('utf8').replace('authors:\n  - name: "许宸玮"',
    'authors:\n  - name: "测试乙"\n    affiliation: "test"\n  - name: "许宸玮"');
  fs.writeFileSync(C, c, enc);
  runGate('B  authors 顺序颠倒 / creators 顺序相反');
  restore();
  console.log('   还原 sha 一致 =', sha(Z) === shaZ0 && sha(C) === shaC0);
}

// ---------- C：一方多一个作者 ----------
{
  const j = JSON.parse(rawZ.toString('utf8'));
  j.creators = [...j.creators, { name: '测试乙', affiliation: 'test' }];
  fs.writeFileSync(Z, JSON.stringify(j, null, 2) + '\n', enc);
  runGate('C  creators 多一人 / authors 不变');
  restore();
  console.log('   还原 sha 一致 =', sha(Z) === shaZ0 && sha(C) === shaC0);
}

// ---------- 收尾 ----------
runGate('D  还原后应 PASS');
console.log('\n最终 sha 一致 =', sha(Z) === shaZ0 && sha(C) === shaC0);
console.log('zenodo sha =', shaZ0);
console.log('citation sha =', shaC0);

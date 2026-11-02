#!/usr/bin/env node
// 验证前导零拒绝：两边 version 都写 01.7.6 → 必须 FAIL（形态校验）
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
const rawZ = fs.readFileSync(Z, enc), rawC = fs.readFileSync(C, enc);
const s0 = sha(Z), c0 = sha(C);

function run(label) {
  const r = spawnSync(process.execPath, [GP, '--closure-only'], {
    cwd: R, encoding: 'utf8', env: { ...process.env, SBCL_WSL: process.env.SBCL_WSL || 'kali-linux' }, timeout: 300000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const line = (out.split(/\r?\n/).find(l => l.includes('发布元数据')) || '(没找到)').trim();
  console.log(`\n[${label}] exit=${r.status}\n  ${line}`);
}

// 基线
run('Z0 基线          期望 PASS');

// 前导零
{
  const j = JSON.parse(rawZ.toString('utf8'));
  j.version = '01.7.6';
  fs.writeFileSync(Z, JSON.stringify(j, null, 2) + '\n', enc);
  fs.writeFileSync(C, rawC.toString('utf8').replace('version: "1.7.6"', 'version: "01.7.6"'), enc);
  run('Z1 version=01.7.6 期望 FAIL');
  fs.writeFileSync(Z, rawZ); fs.writeFileSync(C, rawC);
}

run('Z2 还原          期望 PASS');
console.log('\n还原一致 =', sha(Z) === s0 && sha(C) === c0);

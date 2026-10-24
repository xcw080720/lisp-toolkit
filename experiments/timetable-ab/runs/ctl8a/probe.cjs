'use strict';
const { spawnSync } = require('child_process');
const r = spawnSync(process.env.SBCL, ['--script', 'probe.lisp'], { encoding: 'utf8' });
console.log('status=', r.status);
console.log('stdout JSON.stringify =', JSON.stringify(r.stdout));
console.log('stderr =', JSON.stringify(r.stderr));
const line = (r.stdout || '').trim().split('\n').pop();
try { const o = JSON.parse(line); console.log('parsed ok, name===目标 ?', o.x === '数据结构🐋'); }
catch (e) { console.log('parse fail', e.message); }

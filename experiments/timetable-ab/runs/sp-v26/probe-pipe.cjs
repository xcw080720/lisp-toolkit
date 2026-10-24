// pipe 编码探针：确认 emoji / 中文经 spawnSync 管道后仍是 UTF-8
const { spawnSync } = require('child_process');
const r = spawnSync(process.env.SBCL, ['--script', 'probe.lisp', 'x'], { encoding: 'utf8' });
const s = (r.stdout || '').trim();
console.log(JSON.stringify(s));
const m = s.match(/raw=\[(.*?)\]/);
console.log('emoji ok:', m && m[1] === '数据结构\u{1F40B}');

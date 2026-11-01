// ref-matrix.cjs —— 复核用：自建证据表（不写任何被判据审计的文件）
// 1) 逐条核对 runs/closure-mutants/* 与源实现的**实际**差异（不信任生成脚本的说法）
// 2) 对每个变异跑 check-scale.cjs + check-closure.cjs，保存原始输出
// 用法: node tmp/referee/ref-matrix.cjs [js|cl|all]
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const HERE = path.resolve(__dirname, '..', '..');
const OUT = path.join(HERE, 'runs', 'closure-mutants');
const ENV = { ...process.env, SBCL_WSL: process.env.SBCL_WSL || 'kali-linux' };

function diffSummary(srcPath, mutPath) {
  const a = fs.readFileSync(srcPath, 'utf8').split('\n');
  const b = fs.readFileSync(mutPath, 'utf8').split('\n');
  // 简单对齐：找出第一处不同，然后尝试「删除一行」对齐
  const marks = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (a[i + 1] === b[j]) { marks.push({ at: i + 1, op: 'del', src: a[i] }); i++; continue; }
    if (a[i] === b[j + 1]) { marks.push({ at: i + 1, op: 'ins', mut: b[j] }); j++; continue; }
    marks.push({ at: i + 1, op: 'sub', src: a[i], mut: b[j] }); i++; j++;
    if (marks.length > 6) break;
  }
  return marks;
}

const which = (process.argv[2] || 'all');
const M = {
  js: [['js-L1', 'scale-js/impl.js', 'js-L1.js'], ['js-L30', 'scale-js/impl.js', 'js-L30.js'],
       ['js-L99', 'scale-js/impl.js', 'js-L99.js'], ['js-L157', 'scale-js/impl.js', 'js-L157.js'],
       ['js-L216', 'scale-js/impl.js', 'js-L216.js']],
  cl: [['cl-L127', 'scale-lisp/impl.lisp', 'cl-L127.lisp'], ['cl-L200', 'scale-lisp/impl.lisp', 'cl-L200.lisp'],
       ['cl-L282', 'scale-lisp/impl.lisp', 'cl-L282.lisp'], ['cl-L427', 'scale-lisp/impl.lisp', 'cl-L427.lisp'],
       ['cl-L444', 'scale-lisp/impl.lisp', 'cl-L444.lisp']],
};
const rows = [];
const head = which === 'all' ? [...M.js, ...M.cl] : M[which];

for (const [id, srcRel, mutName] of head) {
  const src = path.join(HERE, 'runs', srcRel);
  const mut = path.join(OUT, mutName);
  const d = diffSummary(src, mut);
  const s = spawnSync(process.execPath, [path.join(HERE, 'check-scale.cjs'), '--impl', mut], { encoding: 'utf8', env: ENV, timeout: 900000 });
  const c = spawnSync(process.execPath, [path.join(HERE, 'check-closure.cjs'), '--impl', mut], { encoding: 'utf8', env: ENV, timeout: 900000 });
  fs.writeFileSync(path.join(__dirname, id + '.scale.log'), s.stdout || '');
  fs.writeFileSync(path.join(__dirname, id + '.closure.log'), c.stdout || '');
  const sm = (s.stdout || '').match(/--\s*(\d+) passed,\s*(\d+) failed/);
  const cm = (c.stdout || '').match(/--\s*(\d+) passed,\s*(\d+) failed/);
  const scaleFails = [...(s.stdout || '').matchAll(/\[FAIL\] #([\d.]+)/g)].map(x => x[1]);
  const cloFails = [...(c.stdout || '').matchAll(/\[FAIL\] (K\d) .*?→ (.*)$/gm)].map(x => x[1] + ' :: ' + x[2].trim());
  rows.push({
    id,
    diff: d.map(x => (x.op === 'del' ? 'L' + x.at + ' 删「' + (x.src || '').trim().slice(0, 70) + '」'
      : x.op === 'sub' ? 'L' + x.at + ' 「' + (x.src || '').trim().slice(0, 50) + '」→「' + (x.mut || '').trim().slice(0, 50) + '」'
      : 'L' + x.at + ' 插入「' + (x.mut || '').trim().slice(0, 60) + '」')).join(' ; ') + ' [' + d.length + ' 处]',
    scale: sm ? (+sm[1] + +sm[2]) + ' 条: ' + sm[1] + ' passed/' + sm[2] + ' failed' : 'ERR(no summary)',
    scaleFails: scaleFails.join(',') || '—',
    closure: cm ? (+cm[1] + +cm[2]) + ' 条: ' + cm[1] + ' passed/' + cm[2] + ' failed' : 'ERR(no summary)',
    cloFails: cloFails.join(' | ') || '—',
  });
  console.log(id + '  实际差异: ' + rows[rows.length - 1].diff);
  console.log(id + '  check-scale: ' + rows[rows.length - 1].scale + '  红: ' + rows[rows.length - 1].scaleFails);
  console.log(id + '  check-closure: ' + rows[rows.length - 1].closure + '  红: ' + rows[rows.length - 1].cloFails);
  console.log('');
}
fs.writeFileSync(path.join(__dirname, 'ref-matrix-' + which + '.tsv'),
  ['mutant\tactual_diff\tscale_cnt\tscale_fails\tclosure_cnt\tclosure_fails']
    .concat(rows.map(r => [r.id, r.diff, r.scale, r.scaleFails, r.closure, r.cloFails].join('\t'))).join('\n') + '\n', 'utf8');
console.log('→ tmp/referee/ref-matrix-' + which + '.tsv');

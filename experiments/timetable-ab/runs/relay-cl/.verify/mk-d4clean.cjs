const fs=require('fs');
const enc='utf8';
let t=fs.readFileSync('.verify/impl.d5.lisp',enc);
const rep=(a,b)=>{ if(!t.includes(a)) throw new Error('MISS '+a.slice(0,50)); t=t.split(a).join(b); };
// 把 D5 的三处改动退回，得到干净的「只有 D4」快照
rep("(let ((log '()) (n 0) (i 0) (k 0))","(let ((log '()) (n 0) (i 0))");
rep("      (incf k)                                  ; k：这条 op 在 ops 里的序号（含被 skip 的）\n","");
rep('(fmt "~d) ~a [+~d]" i msg k)','(fmt "~d) ~a" i msg)');
fs.writeFileSync('.verify/impl.d4clean.lisp',t,enc);
const d3=fs.readFileSync('.verify/impl.d3.lisp',enc).length, d4=fs.readFileSync('.verify/impl.d4clean.lisp',enc).length, d5=fs.readFileSync('.verify/impl.d5.lisp',enc).length, fin=fs.readFileSync('impl.lisp',enc).length;
console.log(`d3=${d3} d4clean=${d4} d5=${d5} final=${fin}`);
console.log(`D4 +${d4-d3}  D5 +${d5-d4}  D6 +${fin-d5}  total +${fin-d3}`);
const cnt=(p)=>fs.readFileSync(p,enc).split('\n').length;
console.log(`lines: d3=${cnt('.verify/impl.d3.lisp')} d4clean=${cnt('.verify/impl.d4clean.lisp')} d5=${cnt('.verify/impl.d5.lisp')} final=${cnt('impl.lisp')}`);

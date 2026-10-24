const fs=require('fs');
let t=fs.readFileSync('impl.lisp','utf8');
const rep=(a,b)=>{ if(!t.includes(a)) throw new Error('MISS: '+a.slice(0,60)); t=t.split(a).join(b); };
// 1) defstruct 去掉 hits
rep('weeks tag (hits 0))','weeks tag)');
// 2) clone-course 去掉 :hits
rep('\n               :hits (course-hits c)','');
// 3) matched 去掉 incf
rep(`(mapcar (lambda (c) (incf (course-hits c)) c)
            (remove-if-not (lambda (c) (search p (course-name c) :test #'char=)) *courses*))))`,
    `(remove-if-not (lambda (c) (search p (course-name c) :test #'char=)) *courses*)))`);
// 4) 删掉 D6 的三行注释（从 ";; D6：" 到 "(defun matched" 之前）
const cA=t.indexOf(';; D6：'), cB=t.indexOf('(defun matched',cA);
if(cA<0||cB<0) throw new Error('MISS comment block');
t=t.slice(0,cA)+t.slice(cB);
// 5) stats 还原
const sA=t.indexOf('(defop "stats" ()'), sB=t.indexOf(';;; ============ 6.5');
if(sA<0||sB<0) throw new Error('MISS stats block');
t=t.slice(0,sA)+`(defop "stats" ()
  (let ((slots (loop for c in *courses*
                     sum (max 0 (1+ (- (course-pto c) (course-pfrom c)))))))
    (values 0 (fmt "共 ~a 门课，~a 个时段被占" (length *courses*) slots))))

`+t.slice(sB);
fs.writeFileSync('.verify/impl.d5.lisp',t,'utf8');
console.log('wrote .verify/impl.d5.lisp, len',t.length);

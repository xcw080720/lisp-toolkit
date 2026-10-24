// probe-shapes.cjs — 证明 24 个 op 各自挂在哪个形状上（= 它们真是 family 生成的）
'use strict';
const fs = require('fs');
let s = fs.readFileSync('impl.lisp', 'utf8');
s = s.replace(/\(main\)\s*$/, '');
s += `
(format t "~&op 名 -> 形状（哪个 family 生成的）~%")
(dolist (n (op-names))
  (format t "  ~a -> ~a~%" n (op-shape n)))
(format t "~&op 总数: ~a~%" (length (op-names)))
(format t "~&存在的形状宏: ~a~%"
        (remove nil (mapcar (lambda (m) (and (macro-function m) m))
                            '(defop defop-raw defop-match-edit defop-table-wide
                              defop-readonly-stat defop-cross-ref))))
`;
fs.writeFileSync('probe-shapes.lisp', s);
console.log('wrote probe-shapes.lisp');

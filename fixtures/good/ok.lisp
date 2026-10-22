;;;; 正例：括号平衡、format 参数够、普通字符串里没有指令
;;;; 期望：check-parens 与 check-format 都通过

(defun h (x y s)
  (format t "x=~a y=~a~%" x y)
  (write-string "plain text, no directive" s)
  (format nil "~{~a~^, ~}" (list x y)))

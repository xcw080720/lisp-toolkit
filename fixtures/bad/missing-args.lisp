;;;; 控制串要 2 个参数，只给了 1 个 → 运行期 "No more arguments"
;;;; 期望：check-format 报这一行

(defun f (x)
  (format t "a=~a b=~a" x))

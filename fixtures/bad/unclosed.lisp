;;;; 故意少一个右括号：最后一行少一层
;;;; 期望：check-parens 报"最外层没闭合的 form 起于第 4 行"

(defmacro demo (name args &body body)
  (let ((cache (gensym "CACHE")))
    `(let ((,cache (make-hash-table)))
       (defun ,name ,args
         (or (gethash 'x ,cache)
             (setf (gethash 'x ,cache) (progn ,@body))))))

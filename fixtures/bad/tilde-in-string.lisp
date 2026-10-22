;;;; 把 ~% 写进 write-string 的普通字符串：write-string 不解析指令
;;;; 期望：check-format 报这一行

(defun g (s)
  (write-string "line~%next" s))

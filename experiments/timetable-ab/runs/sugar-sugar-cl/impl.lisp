;;;; impl.lisp —— sugar 形态
;;;; 强制：loop / format / dolist + 高阶函数（mapcar、remove-if-not）
;;;; 全文件只用糖写：无显式循环宏、无手写递归、无字符串拼接原语

(defun sum-by (lst key)
  "按 KEY 分组对 :V 求和；KEY 缺失的项跳过；返回按 key 升序的 alist。"
  (let* ((items (remove-if-not (lambda (item) (getf item key)) lst))
         (keys  (remove-duplicates (mapcar (lambda (item) (getf item key)) items)
                                   :test #'equal)))
    (loop for k in (sort keys #'<)
          collect (cons k (loop for item in lst
                                when (equal (getf item key) k)
                                  sum (or (getf item :v) 0))))))

(defun pick (obj path)
  "按 'a.b.c' 取值；任一段缺失或为 nil 时返回 nil。"
  (let ((segs (loop for start = 0 then (1+ pos)
                    for pos = (position #\. path :start start)
                    collect (subseq path start pos)
                    while pos)))
    (dolist (seg segs obj)
      (setf obj (getf obj (intern (string-upcase seg) :keyword)))
      (when (null obj) (return nil)))))

(defvar *day-name*
  '("周一" "周二" "周三" "周四" "周五" "周六" "周日"))

(defun fmt (lst)
  "按 day、periodFrom 升序拼成 \"周一 1-2 高数；周二 3-4 英语\"；空表返回 \"\"。"
  (format nil "~{~a~^；~}"
          (mapcar (lambda (e)
                    (format nil "~a ~a-~a ~a"
                            (nth (1- (getf e :day)) *day-name*)
                            (getf e :pf)
                            (getf e :pt)
                            (getf e :name)))
                  (sort (copy-list lst)
                        (lambda (a b)
                          (or (< (getf a :day) (getf b :day))
                              (and (= (getf a :day) (getf b :day))
                                   (< (getf a :pf) (getf b :pf)))))))))

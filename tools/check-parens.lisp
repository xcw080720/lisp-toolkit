;;;; tool/check-parens.lisp --- 结构化括号检查（报行号 + 报"哪个 form 没闭上"）
;;;; 用法： sbcl --script tool/check-parens.lisp FILE [FILE...]
;;;; 退出码 = 有问题的文件数（0 = 全过）
;;;;
;;;; 为什么需要它：SBCL 对"少一个右括号"只报
;;;;   end of file on <stream> (in form starting at line N)
;;;; 深层嵌套时你知道"某个 form 起了头没闭"，但不知道是哪一个。

(in-package :cl-user)

(defun slurp (path)
  (with-open-file (s path :direction :input :external-format :utf-8)
    (let* ((n (file-length s))
           (buf (make-string (max 1 n)))
           (got (read-sequence buf s)))
      (subseq buf 0 got))))

(defun blank? (c) (find c '(#\Space #\Tab #\Newline #\Return #\Page)))

(defun alnum-name-char? (c)
  (or (alphanumericp c) (char= c #\-) (char= c #\_)))

(defun scan (text)
  "返回两个列表：(未闭合的开括号 位置) 与 (多余的闭括号 位置)。位置用 (line . col)。"
  (let ((n (length text)) (i 0) (line 1) (col 1)
        (stack '()) (unclosed '()) (extra '()))
    (labels ((advance ()
               (when (< i n)
                 (if (char= (char text i) #\Newline)
                     (progn (incf line) (setf col 1))
                     (incf col))
                 (incf i)))
             (here () (cons line col)))
      (loop while (< i n)
            do (let ((c (char text i)))
                 (cond
                   ;; 行注释
                   ((char= c #\;)
                    (loop while (and (< i n) (not (char= (char text i) #\Newline)))
                          do (advance)))
                   ;; 块注释 #| ... |#
                   ((and (char= c #\#) (< (1+ i) n) (char= (char text (1+ i)) #\|))
                    (advance) (advance)
                    (loop while (and (< i n)
                                     (not (and (char= (char text i) #\|)
                                               (< (1+ i) n)
                                               (char= (char text (1+ i)) #\#))))
                          do (advance))
                    (advance) (advance))
                   ;; 字符串
                   ((char= c #\")
                    (advance)
                    (loop while (and (< i n) (not (char= (char text i) #\")))
                          do (if (char= (char text i) #\\)
                                 (progn (advance) (advance))
                                 (advance)))
                    (advance))
                   ;; |符号名|
                   ((char= c #\|)
                    (advance)
                    (loop while (and (< i n) (not (char= (char text i) #\|)))
                          do (advance))
                    (advance))
                   ;; 字符字面量 #\x / #\Space / #\(
                   ((and (char= c #\#) (< (1+ i) n) (char= (char text (1+ i)) #\\))
                    (advance) (advance)
                    (cond ((>= i n) nil)
                          ((alnum-name-char? (char text i))
                           (loop while (and (< i n) (alnum-name-char? (char text i)))
                                 do (advance)))
                          (t (advance))))
                   ;; 开括号
                   ((find c '(#\( #\[ #\{))
                    (push (list c (here)) stack)
                    (when (sb-ext:posix-getenv "CPTRACE")
                      (format t "~&TRACE push ~a:~a (~a 层)~%" line col (length stack)))
                    (advance))
                   ;; 闭括号
                   ((find c '(#\) #\] #\}))
                    (when (sb-ext:posix-getenv "CPTRACE")
                      (format t "~&TRACE pop  ~a:~a (~a 层)~%" line col (length stack)))
                    (if (null stack)
                        (push (here) extra)
                        (pop stack))
                    (advance))
                   (t (advance)))))
      (dolist (s stack) (push (second s) unclosed))
      (values (nreverse unclosed) (nreverse extra)))))

(defun check-file (path)
  "返回问题条数。报三件事：最外层没闭合的 form、最内层没闭合的括号、多余的闭括号。"
  (let ((text (slurp path)))
    (multiple-value-bind (unclosed extra) (scan text)
      (if (and (null unclosed) (null extra))
          (progn (format t "~&[ok  ] ~a~%" path) 0)
          (progn
            (format t "~&[FAIL] ~a~%" path)
            (when unclosed
              (let ((outer (first unclosed)) (inner (car (last unclosed))))
                (format t "       最外层没闭合的 form 起于：第 ~a 行第 ~a 列~%"
                        (car outer) (cdr outer))
                (when (> (length unclosed) 1)
                  (format t "       最内层没闭合的括号在：第 ~a 行第 ~a 列（共 ~a 个未闭合）~%"
                          (car inner) (cdr inner) (length unclosed)))
                (when (sb-ext:posix-getenv "CPDEBUG")
                  (format t "       [debug] 全部未闭合：~{~a~^ ~}~%"
                          (mapcar (lambda (p) (format nil "~a:~a" (car p) (cdr p))) unclosed)))))
            (dolist (p extra)
              (format t "       多余的闭括号：第 ~a 行第 ~a 列~%" (car p) (cdr p)))
            1)))))


(defun directory-parts (p)
  "如果 p 指的是一个已存在的目录，返回它的 directory 组件；否则 NIL。"
  (let ((base (or (pathname-directory p) '(:relative)))
        (name (pathname-name p))
        (type (pathname-type p)))
    (cond
      ((and (null name) (null type))
       (and (probe-file p) base))
      ((and name (null type)
            (probe-file (make-pathname :directory (append base (list name))
                                       :name nil :type nil)))
       (append base (list name)))
      (t nil))))

(defun expand-targets (args)
  "参数可以是文件或目录；目录展开成其下所有 .lisp（递归）。"
  (loop for a in args
        append (let* ((p (pathname a))
                      (parts (directory-parts p)))
                 (if parts
                     (sort (directory (make-pathname
                                       :directory (append parts '(:wild-inferiors))
                                       :name :wild :type "lisp"))
                           #'string< :key #'namestring)
                     (list p)))))

(let ((args (cdr sb-ext:*posix-argv*)))
  (when (null args)
    (format t "usage: sbcl --script tools/check-parens.lisp PATH [PATH...]~%")
    (sb-ext:exit :code 2 :abort nil))
  (let* ((files (expand-targets args))
         (bad 0))
    (dolist (f files) (incf bad (check-file f)))
    (format t "~&-- ~a 个文件，~a 个有问题~%" (length files) bad)
    (finish-output)
    (sb-ext:exit :code bad :abort nil)))
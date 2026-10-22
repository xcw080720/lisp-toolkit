;;;; tool/check-format.lisp --- 格式串静态检查
;;;; 用法： sbcl --script tool/check-format.lisp FILE [FILE...]
;;;; 退出码 = 有问题的文件数
;;;;
;;;; 查两类真实事故（本轮都撞过）：
;;;;   1) 控制串里的指令比参数多 → 运行期 "No more arguments"
;;;;   2) 把 ~ 指令写进普通字符串 → write-string/princ 不解析，输出里直接出现 "~%"
;;;;
;;;; 原则：宁可少报，不可误报——只数"确定吃参数"的指令，其余一律当 0。

(in-package :cl-user)

(defun slurp (path)
  (with-open-file (s path :direction :input :external-format :utf-8)
    (let* ((n (file-length s))
           (buf (make-string (max 1 n)))
           (got (read-sequence buf s)))
      (subseq buf 0 got))))

(defun line-of (text pos)
  (1+ (count #\Newline text :end (min pos (length text)))))

(defun directive-params-end (ctrl i)
  "从 ~ 之后跳过参数（数字、逗号、'x、+ - @ : #），返回指令字符的位置。"
  (let ((n (length ctrl)) (j i))
    (loop while (and (< j n)
                     (or (digit-char-p (char ctrl j))
                         (member (char ctrl j) '(#\, #\' #\+ #\- #\@ #\: #\#))))
          do (incf j))
    j))

(defun count-required-args (ctrl)
  "控制串至少要几个参数（保守估计，绝不虚高）。"
  (let ((n (length ctrl)) (i 0) (need 0) (brace 0) (bracket 0))
    (loop while (< i n)
          do (if (char/= (char ctrl i) #\~)
                 (incf i)
                 (let* ((j (directive-params-end ctrl (1+ i)))
                        (d (and (< j n) (char-upcase (char ctrl j)))))
                   (cond ((eql d #\{) (incf need) (incf brace))
                         ((eql d #\}) (when (plusp brace) (decf brace)))
                         ((eql d #\[) (incf need) (incf bracket))
                         ((eql d #\]) (when (plusp bracket) (decf bracket)))
                         ((eql d #\<) (incf need))
                         ((eql d #\?) (incf need 2))
                         ((and (zerop brace) (zerop bracket)
                               (member d '(#\A #\S #\D #\B #\O #\X #\R #\P
                                           #\C #\F #\E #\G #\$)))
                          (incf need)))
                   (setf i (1+ j)))))
    need))

(defparameter *format-heads* '("FORMAT" "ERROR" "WARN" "CERROR" "SIMPLE-ERROR"))
(defparameter *plain-heads* '("WRITE-STRING" "WRITE-LINE" "PRINC" "PRIN1" "PRINT" "WRITE"))

(defun head-name (sym) (string-upcase (symbol-name sym)))

(defvar *findings* '())

(defun ensure-packages (text)
  "把 text 里的 pkg:sym / pkg::sym 补全：建包 + intern + export。
   我们只是 lint，不需要真加载项目；补全后 reader 就不会因包/符号缺失而中断。"
  (let ((i 0) (n (length text)))
    (labels ((sym-char? (c)
               (or (alphanumericp c)
                   (member c '(#\- #\+ #\* #\_ #\< #\> #\% #\& #\? #\! #\.)))))
      (loop while (< i n)
            do (if (alpha-char-p (char text i))
                   (let ((start i))
                     (loop while (and (< i n)
                                      (or (alphanumericp (char text i))
                                          (member (char text i) '(#\- #\_ #\.))))
                           do (incf i))
                     (when (and (< i n) (char= (char text i) #\:))
                       (let ((pkg (or (find-package (string-upcase (subseq text start i)))
                                      (make-package (string-upcase (subseq text start i))
                                                    :use '(:cl)))))
                         (incf i)
                         (when (and (< i n) (char= (char text i) #\:)) (incf i))
                         (let ((s0 i))
                           (loop while (and (< i n) (sym-char? (char text i))) do (incf i))
                           (when (> i s0)
                             (let ((sym (string-upcase (subseq text s0 i))))
                               (unless (nth-value 1 (find-symbol sym pkg))
                                 (export (intern sym pkg) pkg))))))))
                   (incf i))))))

(defun add-finding (msg text pos file)
  (push (list file (line-of text pos) msg) *findings*))

(defun check-format-call (form text pos file)
  "form 是 format 家族调用：控制串 + 参数个数对不上就报。"
  (let* ((args (rest form))
         (idx (position-if #'stringp args))
         (ctrl (and idx (nth idx args)))
         (given (and idx (- (length args) idx 1)))
         (need (and ctrl (count-required-args ctrl))))
    (when (and ctrl given (< given need))
      (add-finding (format nil "~a: 控制串要 ~a 个参数，只给了 ~a 个 —— ~s"
                           (head-name (first form)) need given ctrl)
                   text pos file))))

(defun check-plain-output (form text pos file)
  "form 是 write-string/princ 之类：字面量里带 ~ 就是写错了函数。"
  (dolist (a (rest form))
    (when (and (stringp a) (find #\~ a))
      (add-finding (format nil "~a: 字面量里有 ~~ 指令，但这个函数不解析格式串 —— ~s"
                           (head-name (first form)) a)
                   text pos file))))

(defun walk-list (lst text pos file)
  "逐个元素递归；用 cdr 走，点对也不会炸。"
  (loop for rest = lst then (cdr rest)
        while (consp rest)
        do (check-form (car rest) text pos file)))

(defun check-form (form text pos file)
  "递归扫一个 form。"
  (cond
    ((atom form) nil)
    ((and (symbolp (first form)) (member (head-name (first form)) *format-heads* :test #'string=))
     (check-format-call form text pos file)
     (walk-list (rest form) text pos file))
    ((and (symbolp (first form)) (member (head-name (first form)) *plain-heads* :test #'string=))
     (check-plain-output form text pos file)
     (walk-list (rest form) text pos file))
    (t
     (walk-list form text pos file))))

(defun check-file (path)
  (let* ((*findings* '())
         (text (slurp path))
         (*package* (or (find-package "LINT-SCRATCH")
                        (make-package "LINT-SCRATCH" :use '(:cl))))
         (*read-eval* nil)
         (s (make-string-input-stream text))
         (nforms 0))
    (ensure-packages text)
    (handler-case
        (loop for pos = (file-position s)
              for form = (read s nil :eof)
              until (eq form :eof)
              do (incf nforms)
                 (check-form form text pos path))
      (error (e)
        (add-finding (format nil "读取失败（先跑 check-parens）：~a" e)
                     text (file-position s) path)))
    (if (null *findings*)
        (progn (format t "~&[ok  ] ~a（~a 个顶层 form）~%" path nforms) 0)
        (progn
          (format t "~&[FAIL] ~a~%" path)
          (dolist (f (nreverse *findings*))
            (format t "       第 ~a 行：~a~%" (second f) (third f)))
          1))))


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
    (format t "usage: sbcl --script tools/check-format.lisp PATH [PATH...]~%")
    (sb-ext:exit :code 2 :abort nil))
  (let* ((files (expand-targets args))
         (bad 0))
    (dolist (f files) (incf bad (check-file f)))
    (format t "~&-- ~a 个文件，~a 个有问题~%" (length files) bad)
    (finish-output)
    (sb-ext:exit :code bad :abort nil)))
;;;; check-encoding.lisp --- BOM 与脚本非 ASCII 检查（可移植，无外部依赖）
;;;; 用法： sbcl --script tools/check-encoding.lisp PATH [PATH...]   (文件或目录)
;;;; 退出码 = 有问题的文件数
;;;;
;;;; 两道门：
;;;;   1) .lisp/.md/.sh/.cmd/.ps1 里出现 BOM —— SBCL 的 reader 会把 BOM 当符号字符，
;;;;      报 "The variable ﻿ is unbound"，而且看不出来是哪来的。
;;;;   2) .ps1/.cmd/.sh 里出现非 ASCII —— PowerShell 5.1 把无 BOM 的 .ps1 按 GBK 读，
;;;;      中文注释的字节可能吞掉换行，脚本"少跑一段"却不报错。

(in-package :cl-user)

(defun bom-p (path)
  (with-open-file (s path :direction :input :element-type '(unsigned-byte 8))
    (let ((buf (make-array 3 :element-type '(unsigned-byte 8) :initial-element 0)))
      (and (= 3 (read-sequence buf s))
           (= (aref buf 0) #xEF) (= (aref buf 1) #xBB) (= (aref buf 2) #xBF)))))

(defun non-ascii-count (path)
  "返回非 ASCII 字符数；读不了（不是合法 UTF-8）返回 :unreadable。"
  (handler-case
      (with-open-file (s path :direction :input :external-format :utf-8)
        (loop for ch = (read-char s nil nil)
              while ch
              count (char> ch (code-char 127))))
    (error () :unreadable)))

(defun script-file-p (path)
  (member (string-downcase (or (pathname-type path) ""))
          '("ps1" "cmd" "bat" "sh") :test #'string=))

(defun text-file-p (path)
  (member (string-downcase (or (pathname-type path) ""))
          '("lisp" "asd" "md" "ps1" "cmd" "bat" "sh") :test #'string=))

(defun directory-parts (p)
  "如果 p 指的是一个已存在的目录，返回它的 directory 组件；否则 NIL。"
  (let ((base (or (pathname-directory p) '(:relative)))
        (name (pathname-name p))
        (type (pathname-type p)))
    (cond
      ((and (null name) (null type)) (and (probe-file p) base))
      ((and name (null type)
            (probe-file (make-pathname :directory (append base (list name))
                                       :name nil :type nil)))
       (append base (list name)))
      (t nil))))

(defun expand-targets (args)
  (loop for a in args
        append (let* ((p (pathname a))
                      (parts (directory-parts p)))
                 (if parts
                     (sort (directory (make-pathname
                                       :directory (append parts '(:wild-inferiors))
                                       :name :wild :type :wild))
                           #'string< :key #'namestring)
                     (list p)))))

(defun check-file (path)
  (let ((bad 0))
    (when (and (text-file-p path) (bom-p path))
      (format t "~&[FAIL] BOM: ~a~%" path)
      (incf bad))
    (when (script-file-p path)
      (let ((n (non-ascii-count path)))
        (cond ((eq n :unreadable)
               (format t "~&[FAIL] 不是合法 UTF-8（脚本只能是 ASCII）: ~a~%" path)
               (incf bad))
              ((plusp n)
               (format t "~&[FAIL] 脚本里有 ~a 个非 ASCII 字符: ~a~%" n path)
               (incf bad)))))
    bad))

(let ((args (cdr sb-ext:*posix-argv*)))
  (when (null args)
    (format t "usage: sbcl --script tools/check-encoding.lisp PATH [PATH...]~%")
    (sb-ext:exit :code 2 :abort nil))
  (let* ((files (expand-targets args))
         (bad 0))
    (dolist (f files) (incf bad (check-file f)))
    (if (zerop bad)
        (format t "~&[ok  ] ~a 个文件：无 BOM、脚本全 ASCII~%" (length files))
        (format t "~&-- ~a 个文件，~a 个有问题~%" (length files) bad))
    (finish-output)
    (sb-ext:exit :code bad :abort nil)))

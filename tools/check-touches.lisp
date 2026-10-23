;;;; check-touches.lisp -- 静态检查：同一份知识散落在几处
;;;; 用法: sbcl --script tools/check-touches.lisp FILE [--strict]
;;;;
;;;; 原理（来自实测）：一个 op 的名字如果以字符串字面量形式出现 >= 3 次，
;;;; 几乎必然意味着它的知识被复制到了分发/名册/文案/日志等多处——
;;;; 这正是"每加一个 op 要改 N 处"的根源，也是宏/表驱动要消除的东西。
;;;;
;;;; 输出：每个可疑字面量 + 出现行号。--strict 时有问题则退出码 1。

(defun read-all-text (path)
  (with-open-file (in path :external-format :utf-8)
    (let ((s (make-string (file-length in))))
      (subseq s 0 (read-sequence s in)))))

;;; 扫出所有双引号字符串字面量（跳过 ; 注释与 #\" 转义），返回 ((字面量 . 行号) ...)
(defun string-literals (text)
  "返回 ((字面量 . 行号) ...)。用显式 in-str 标志，避免 buf 为 nil 时的歧义。"
  (let ((out '()) (line 1) (i 0) (n (length text))
        (buf (make-array 0 :element-type 'character :adjustable t :fill-pointer 0))
        (in-str nil))
    (flet ((flush ()
             (push (cons (coerce (subseq buf 0 (fill-pointer buf)) 'string) line) out)
             (setf (fill-pointer buf) 0)))
      (loop while (< i n) do
        (let ((c (char text i)))
          (cond
            ((char= c #\Newline)
             (when in-str (flush) (setf in-str nil))
             (incf line) (incf i))
            ((and (char= c #\;) (not in-str))
             (loop while (and (< i n) (not (char= (char text i) #\Newline))) do (incf i)))
            ((char= c #\")
             (if in-str (progn (flush) (setf in-str nil)) (setf in-str t))
             (incf i))
            (in-str (vector-push-extend c buf) (incf i))
            (t (incf i))))))
    (nreverse out)))

(defun group-literals (lits)
  (let ((h (make-hash-table :test #'equal)))
    (dolist (p lits)
      (push (cdr p) (gethash (car p) h)))
    h))

(defun main ()
  (let* ((args (rest sb-ext:*posix-argv*))
         (strict (member "--strict" args :test #'string=))
         (path (find-if (lambda (a) (not (string= a "--strict"))) args)))
    (unless path
      (format t "usage: sbcl --script check-touches.lisp FILE [--strict]~%")
      (sb-ext:exit :code 2))
    (unless (probe-file path)
      (format t "[ERROR] 找不到文件: ~a~%" path)
      (sb-ext:exit :code 2))
    (let* ((lits (string-literals (read-all-text path)))
           (h (group-literals lits))
           (suspects '()))
      (maphash (lambda (k lines)
                 (when (and (>= (length lines) 3)
                            (>= (length k) 2))     ; 太短的字面量（如 "a"）噪声大
                   (push (cons k (nreverse lines)) suspects)))
               h)
      (setf suspects (sort suspects (lambda (a b) (> (length (cdr a)) (length (cdr b))))))
      (format t "~&check-touches: ~a~%" path)
      (format t "字符串字面量 ~d 个，去重 ~d 个~%" (length lits) (hash-table-count h))
      (if (null suspects)
          (format t "[OK] 没有字面量出现 >=3 次：知识大概率是单源的。~%")
          (progn
            (format t "[WARN] 以下字面量出现 >=3 次，可能被复制到了多处：~%")
            (dolist (s suspects)
              (format t "  ~s  出现 ~d 次  行 ~{~d~^,~}~%"
                      (car s) (length (cdr s)) (cdr s)))
            (format t "~%提示：op 名出现在分发/名册/文案/日志多处 = 每加一个 op 要改 N 处。~%")
            (format t "      注意：出现在 (defop ...) 声明里是正常的；出现在 cond/名册/日志里才是复制。~%")
            (format t "      用 defop 一类宏把它压成一处（见 skills/lisp-defop/SKILL.md）。~%")))
      (when (and strict suspects) (sb-ext:exit :code 1)))))

(main)

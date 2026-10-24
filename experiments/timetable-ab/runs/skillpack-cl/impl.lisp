;;;; impl.lisp — 课表 ops 执行器（scale 臂，判据 --only 1..9）
;;;; 结构：
;;;;   1) JSON 读（递归下降，对象用保序 alist）
;;;;   2) JSON 写（全非 ASCII 落成 \uXXXX，规避 stdout 编码坑）
;;;;   3) 模型：course = 保序 alist，唯一写入口 (set-fld)
;;;;   4) defop：一条声明长出「登记 + 必需字段校验 + 分派」，op 知识只写一处
;;;;   5) 引擎：先整批校验 op 名，再逐条执行，最后按契约出 JSON

(defpackage :tt (:use :cl))
(in-package :tt)

;;; ============================ 1. JSON 读 ============================

(defun j-str (s i)
  "s[i] 是 #\"。返回 (values 字符串 下一个位置)。"
  (let ((n (length s))
        (out (make-string-output-stream))
        (i (1+ i)))
    (loop
      (when (>= i n) (error "JSON: 字符串未闭合"))
      (let ((c (char s i)))
        (cond
          ((char= c #\") (return (values (get-output-stream-string out) (1+ i))))
          ((char= c #\\)
           (let ((e (char s (1+ i))))
             (setf i (+ i 2))
             (case e
               (#\u
                (let ((code (parse-integer s :start i :end (+ i 4) :radix 16)))
                  (setf i (+ i 4))
                  (cond
                    ((and (<= #xD800 code #xDBFF)
                          (<= (+ i 6) n)
                          (char= (char s i) #\\)
                          (char= (char s (1+ i)) #\u))
                     (let ((lo (parse-integer s :start (+ i 2) :end (+ i 6) :radix 16)))
                       (setf i (+ i 6))
                       (write-char (code-char (+ #x10000
                                                 (* (- code #xD800) #x400)
                                                 (- lo #xDC00)))
                                   out)))
                    (t (write-char (code-char code) out)))))
               (#\n (write-char #\Newline out))
               (#\t (write-char #\Tab out))
               (#\r (write-char #\Return out))
               (#\b (write-char #\Backspace out))
               (#\f (write-char #\Page out))
               (t (write-char e out)))))
          (t (write-char c out) (setf i (1+ i))))))))

(defun j-num (s i)
  (let ((n (length s)) (start i))
    (loop while (and (< i n)
                     (or (digit-char-p (char s i))
                         (member (char s i) '(#\- #\+ #\. #\e #\E))))
          do (incf i))
    (let ((tok (subseq s start i)))
      (values (if (or (find #\. tok) (find #\e tok) (find #\E tok))
                  (let ((*read-eval* nil)) (read-from-string tok))
                  (parse-integer tok))
              i))))

(defun j-obj (s i)
  (let ((pairs '()) (i (1+ i)))
    (loop
      (setf i (skip-ws s i))
      (when (char= (char s i) #\}) (return (values (nreverse pairs) (1+ i))))
      (multiple-value-bind (k i2) (j-str s i)
        (setf i (skip-ws s i2))
        (unless (char= (char s i) #\:) (error "JSON: 缺冒号"))
        (multiple-value-bind (v i3) (j-val s (1+ i))
          (push (cons k v) pairs)
          (setf i (skip-ws s i3))
          (when (char= (char s i) #\,) (setf i (1+ i))))))))

(defun j-arr (s i)
  (let ((items '()) (i (1+ i)))
    (loop
      (setf i (skip-ws s i))
      (when (char= (char s i) #\]) (return (values (coerce (nreverse items) 'vector) (1+ i))))
      (multiple-value-bind (v i2) (j-val s i)
        (push v items)
        (setf i (skip-ws s i2))
        (when (char= (char s i) #\,) (setf i (1+ i)))))))

(defun skip-ws (s i)
  (let ((n (length s)))
    (loop while (and (< i n)
                     (member (char s i) '(#\Space #\Tab #\Newline #\Return) :test #'char=))
          do (incf i))
    i))

(defun j-val (s i)
  (setf i (skip-ws s i))
  (let ((c (char s i)))
    (cond
      ((char= c #\{) (j-obj s i))
      ((char= c #\[) (j-arr s i))
      ((char= c #\") (j-str s i))
      ((char= c #\t) (values t (+ i 4)))
      ((char= c #\f) (values nil (+ i 5)))
      ((char= c #\n) (values :null (+ i 4)))
      (t (j-num s i)))))

(defun jparse (str)
  (multiple-value-bind (v i) (j-val str 0)
    (declare (ignore i))
    v))

(defun slurp (path)
  (with-open-file (in path :direction :input :external-format :utf-8)
    (with-output-to-string (out)
      (loop for c = (read-char in nil nil)
            while c
            do (write-char c out)))))

;;; ============================ 2. JSON 写 ============================

(defun out-str (s stream)
  "非 ASCII 一律写成 \\uXXXX：stdout 编码永远是 ASCII，判据读回来仍是同样的字符。"
  (write-char #\" stream)
  (loop for c across s
        for code = (char-code c)
        do (cond
             ((char= c #\") (write-string "\\\"" stream))
             ((char= c #\\) (write-string "\\\\" stream))
             ((< code 32) (format stream "\\u~4,'0x" code))
             ((< code 127) (write-char c stream))
             (t (format stream "\\u~4,'0x" code))))
  (write-char #\" stream))

(defun out-obj (al stream)
  (write-char #\{ stream)
  (loop for pair in al
        for first = t then nil
        do (unless first (write-char #\, stream))
           (out-str (car pair) stream)
           (write-char #\: stream)
           (out-val (cdr pair) stream))
  (write-char #\} stream))

(defun out-arr (vec stream)
  (write-char #\[ stream)
  (loop for i from 0 below (length vec)
        do (when (> i 0) (write-char #\, stream))
           (out-val (aref vec i) stream))
  (write-char #\] stream))

(defun out-val (v stream)
  (cond
    ((eq v t) (write-string "true" stream))
    ((null v) (write-string "null" stream))
    ((eq v :null) (write-string "null" stream))
    ((stringp v) (out-str v stream))
    ((integerp v) (format stream "~d" v))
    ((vectorp v) (out-arr v stream))
    ((and (consp v) (consp (car v))) (out-obj v stream))
    (t (error "不能序列化：~s" v))))

;;; ============================ 3. 模型 ============================

(defparameter +keys+ '("name" "teacher" "location" "day" "periodFrom" "periodTo" "weeks" "tag"))

(defun fld (al key) (cdr (assoc key al :test #'string=)))

(defun set-fld (obj key val)
  "唯一写入口。返回 T 表示值真的变了。"
  (let ((pair (assoc key obj :test #'string=)))
    (cond
      (pair (let ((old (cdr pair)))
              (setf (cdr pair) val)
              (not (equal old val))))
      (t (nconc obj (list (cons key val))) t))))

(defun clamp-day (d)
  (max 1 (min 7 (if (integerp d) d 1))))

(defun default-weeks ()
  (list (cons "type" "range") (cons "from" 1) (cons "to" 16)))

(defun norm-weeks (w)
  (if (and (listp w) (consp w))
      w
      (default-weeks)))

(defun norm-course (al)
  "把输入对象规范化成固定键序的 course；缺字段补默认值。"
  (let ((tag (fld al "tag")))
    (list (cons "name" (let ((v (fld al "name"))) (if (stringp v) v "")))
          (cons "teacher" (let ((v (fld al "teacher"))) (if (stringp v) v "")))
          (cons "location" (let ((v (fld al "location"))) (if (stringp v) v "")))
          (cons "day" (clamp-day (fld al "day")))
          (cons "periodFrom" (let ((v (fld al "periodFrom"))) (if (integerp v) v 1)))
          (cons "periodTo" (let ((v (fld al "periodTo"))) (if (integerp v) v 2)))
          (cons "weeks" (norm-weeks (fld al "weeks")))
          (cons "tag" (cond ((null tag) :null) ((eq tag :null) :null) (t tag))))))

;;; ============================ 4. defop ============================

(defvar *ops* '()
  "op 名册：((名字 必需字段 执行体) ...)。名字与必需字段都从这一条声明长出，
   没有第二处手写名单要同步。")

(defmacro defop (name need &body body)
  "一条声明登记一个 op。need 里有任何一个字段缺失/为 null，整条 op 不执行。"
  (declare (type list need))
  `(push (list ,name ',need (lambda (op) ,@body)) *ops*))

(defun op-entry (name)
  (and (stringp name) (assoc name *ops* :test #'string=)))

(defun present-p (op key)
  (let ((v (fld op key)))
    (and v (not (eq v :null)))))

(defun missing-fields (need op)
  (remove-if (lambda (k) (present-p op k)) need))

;;; ---- 状态 ----
(defvar *courses* #())
(defvar *log* '())
(defvar *n* 0)

(defun note! (fmt &rest args)
  (push (apply #'format nil fmt args) *log*))

(defun name-of (c) (fld c "name"))

(defun hits (match)
  "名字含 match 的所有 course（按当前顺序）。"
  (remove-if-not (lambda (c) (and (stringp (name-of c))
                                  (search (if (stringp match) match (format nil "~a" match))
                                          (name-of c))))
                 (coerce *courses* 'list)))

;;; ---- 5 个 op：每个只在这里出现一次 ----

(defop "add" ("course")
  (let ((c (norm-course (fld op "course"))))
    (set-fld c "day" (clamp-day (fld c "day")))
    (setf *courses* (concatenate 'vector *courses* (vector c)))
    (incf *n*)
    (note! "加「~a」到周~a 第~a-~a 节" (name-of c) (fld c "day")
           (fld c "periodFrom") (fld c "periodTo"))))

(defop "del" ("match")
  (let* ((m (fld op "match"))
         (h (hits m))
         (k (length h)))
    (if (zerop k)
        (note! "没找到「~a」" m)
        (progn
          (setf *courses* (coerce (remove-if (lambda (c) (member c h :test #'eq))
                                             (coerce *courses* 'list))
                                  'vector))
          (incf *n* k)
          (note! "删「~a」~a 门" m k)))))

(defop "edit" ("match" "set")
  (let* ((m (fld op "match"))
         (set (fld op "set"))
         (h (hits m))
         (changed 0))
    (dolist (c h)
      (let ((chg nil))
        (dolist (pair set)
          (let ((k (car pair)) (v (cdr pair)))
            (cond
              ((not (member k +keys+ :test #'string=)) nil)
              ((string= k "day")
               (when (set-fld c "day" (clamp-day v)) (setf chg t)))
              ((string= k "tag")
               (when (set-fld c "tag" (cond ((null v) :null) ((eq v :null) :null) (t v)))
                 (setf chg t)))
              ((string= k "weeks")
               (when (set-fld c "weeks" (norm-weeks v)) (setf chg t)))
              (t (when (set-fld c k v) (setf chg t))))))
        (when chg (incf changed))))
    (incf *n* changed)
    (note! "改「~a」~a 门" m changed)))

(defop "move" ("match" "day" "periodFrom" "periodTo")
  (let* ((m (fld op "match"))
         (d (clamp-day (fld op "day")))
         (pf (fld op "periodFrom"))
         (pt (fld op "periodTo"))
         (pf (if (integerp pf) pf 1))
         (pt (if (integerp pt) pt pf))
         (h (hits m)))
    (dolist (c h)
      (set-fld c "day" d)
      (set-fld c "periodFrom" pf)
      (set-fld c "periodTo" (max pf pt)))
    (incf *n* (length h))
    (note! "移「~a」~a 门到周~a 第~a-~a 节" m (length h) d pf (max pf pt))))

(defop "swap" ("match" "with")
  (let* ((a (hits (fld op "match")))
         (b (hits (fld op "with"))))
    (if (and (= 1 (length a)) (= 1 (length b)))
        (let ((x (first a)) (y (first b)))
          (when (not (eq x y))
            (loop for k in '("day" "periodFrom" "periodTo")
                  do (let ((vx (fld x k)))
                       (set-fld x k (fld y k))
                       (set-fld y k vx)))
            (incf *n* 2))
          (note! "互换「~a」↔「~a」" (name-of x) (name-of y)))
        (note! "互换跳过：「~a」或「~a」两侧没有各命中恰好 1 门"
               (fld op "match") (fld op "with")))))

;;; ============================ 5. 引擎 ============================

(defun run-one (entry op)
  (let ((missing (missing-fields (second entry) op)))
    (if missing
        (note! "跳过 ~a：缺 ~{~a~^/~}" (first entry) missing)
        (funcall (third entry) op))))

(defun numbered (lines)
  (loop for line in lines
        for i from 1
        collect (format nil "~d) ~a" i line)))

(defun emit-json (ops-text courses log-lines n)
  (let ((stream *standard-output*))
    (out-obj (list (cons "opsText" ops-text)
                   (cons "courses" courses)
                   (cons "log" (coerce log-lines 'vector))
                   (cons "n" n))
             stream)
    (terpri stream)
    (finish-output stream)))

(defun main ()
  (let* ((path (car (last sb-ext:*posix-argv*)))
         (data (jparse (slurp path)))
         (raw-ops (fld data "ops"))
         (ops (if (vectorp raw-ops) raw-ops #()))
         (raw-courses (fld data "courses"))
         (courses (map 'vector #'norm-course
                       (if (vectorp raw-courses) raw-courses #())))
         (*courses* courses)
         (*log* '())
         (*n* 0))
    (let ((bad (find-if (lambda (o) (null (op-entry (fld o "op"))))
                        (coerce ops 'list))))
      (cond
        ;; 空 ops
        ((zerop (length ops))
         (emit-json "" courses '() 0))
        ;; 未知 op：整批拒绝，课表原样
        (bad
         (emit-json "" courses
                    (list (format nil "拒绝：未知 op ~a" (fld bad "op")))
                    0))
        ;; 正常执行
        (t
         (loop for o across ops
               do (run-one (op-entry (fld o "op")) o))
         (let ((lines (numbered (reverse *log*))))
           (emit-json (format nil "~{~a~^~%~}" lines) *courses* lines *n*)))))))

(main)

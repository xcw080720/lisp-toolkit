;;;; impl.lisp — 课表 ops 执行器（规模臂骨架，5 个 op：add/del/edit/move/swap）
;;;; 入口：(sbcl --script impl.lisp INPUT.json)，从 argv 最后一个元素取路径，向 stdout 打 JSON。
;;;; 用 Defop 宏把「一个 op 的知识」压成一处：注册、名册、分发、日志通道全部由宏长出。

(defpackage :tt (:use :cl))
(in-package :tt)

;;; ============================================================
;;; 一、JSON 值模型
;;;   对象  = (:obj (KEY . VAL) ...)   —— alist，保持输入键序
;;;   数组  = (:arr VAL ...)
;;;   标量  = string / integer / double / :true / :false / :null
;;; 空对象与空数组必须可区分 → 一律带标签，不用 nil 表示。
;;; ============================================================

(defun jobj (pairs) (cons :obj pairs))
(defun jarr (items) (cons :arr items))
(defun obj-p (v) (and (consp v) (eq (car v) :obj)))
(defun arr-p (v) (and (consp v) (eq (car v) :arr)))

(defun fld (o k)
  "读对象字段；缺失返回 NIL。"
  (and (obj-p o) (cdr (assoc k (cdr o) :test #'equal))))

(defun has-key (o k)
  (and (obj-p o) (assoc k (cdr o) :test #'equal) t))

(defun set-fld (o k v)
  "写字段：已有则原位改（键序不变），无则追加。这是唯一的写入通道。"
  (let ((cell (assoc k (cdr o) :test #'equal)))
    (if cell
        (setf (cdr cell) v)
        (setf (cdr o) (append (cdr o) (list (cons k v)))))
    o))

;;; ============================================================
;;; 二、读：递归下降，一个函数 + 一个游标
;;; ============================================================

(defun jws (s i)
  (loop while (and (< i (length s))
                   (member (char s i) '(#\Space #\Tab #\Newline #\Return)))
        do (incf i)
        finally (return i)))

(defun jhex (s i)
  (let ((v 0))
    (dotimes (k 4)
      (setf v (+ (* v 16) (digit-char-p (char s (+ i k)) 16))))
    v))

(defun jstr (s i)
  "i 指在开引号上。返回 (values 字符串 下一个下标)。"
  (let ((n (length s)) (out (make-string-output-stream)))
    (incf i)                                   ; 跳开引号
    (loop
      (when (>= i n) (error "字符串未闭合"))
      (let ((ch (char s i)))
        (cond
          ((char= ch #\") (return))
          ((char= ch #\\)
           (incf i)
           (let ((e (char s i)))
             (case e
               (#\" (write-char #\" out))
               (#\\ (write-char #\\ out))
               (#\/ (write-char #\/ out))
               (#\b (write-char #\Backspace out))
               (#\f (write-char #\Page out))
               (#\n (write-char #\Newline out))
               (#\r (write-char #\Return out))
               (#\t (write-char #\Tab out))
               (#\u
                (let ((hi (jhex s (1+ i))))
                  (incf i 4)
                  (if (and (<= #xd800 hi) (<= hi #xdbff)
                           (char= (char s (1+ i)) #\\)
                           (char= (char s (+ i 2)) #\u))
                      ;; 代理对：高 4 位已读，再读低 4 位，拼成增补平面字符
                      (let ((lo (jhex s (+ i 3))))
                        (incf i 6)
                        (write-char
                         (code-char (+ #x10000
                                       (ash (- hi #xd800) 10)
                                       (- lo #xdc00)))
                         out))
                      (write-char (code-char hi) out))))
               (t (write-char e out))))
           (incf i))
          (t (write-char ch out) (incf i)))))
    (values (get-output-stream-string out) (1+ i))))

(defun jnum (s i)
  "数字：整数 / 小数 / 指数。整型返回 integer，带小数点或指数返回 double。"
  (let ((start i) (n (length s)) (is-float nil))
    (when (and (< i n) (member (char s i) '(#\- #\+))) (incf i))
    (loop while (and (< i n) (digit-char-p (char s i))) do (incf i))
    (when (and (< i n) (char= (char s i) #\.))
      (setf is-float t) (incf i)
      (loop while (and (< i n) (digit-char-p (char s i))) do (incf i)))
    (when (and (< i n) (member (char s i) '(#\e #\E)))
      (setf is-float t) (incf i)
      (when (and (< i n) (member (char s i) '(#\- #\+))) (incf i))
      (loop while (and (< i n) (digit-char-p (char s i))) do (incf i)))
    (let* ((tok (subseq s start i))
           (*read-eval* nil))
      (values (if is-float
                  (let* ((t2 (substitute #\d #\E (substitute #\d #\e tok)))
                         (t3 (if (find #\d t2) t2 (concatenate 'string t2 "d0"))))
                    (read-from-string t3))
                  (read-from-string tok))
              i))))

(defun jval (s i)
  "分派：{ [ \" t f n -/+数字"
  (let ((n (length s)))
    (when (>= i n) (error "意外的输入结束"))
    (case (char s i)
      (#\{ (let ((pairs nil))
             (incf i) (setf i (jws s i))
             (if (char= (char s i) #\})
                 (values (jobj nil) (1+ i))
                 ;; 第一对交给续读函数：jval-obj-rest 自己负责后续每个 , 键:值
                 (jval-obj-rest s i pairs))))
      (#\[ (let ((items nil))
             (incf i) (setf i (jws s i))
             (if (char= (char s i) #\])
                 (values (jarr nil) (1+ i))
                 (progn
                   (loop
                     (multiple-value-bind (v i2) (jval s (jws s i))  ; 元素
                       (push v items) (setf i (jws s i2)))
                     (unless (char= (char s i) #\,) (return))         ; 循环体内
                     (incf i) (setf i (jws s i)))
                   (values (jarr (nreverse items)) (jws s (1+ i)))))))
      (#\" (jstr s i))          ; jstr 自己负责跳过开引号，这里不能再 +1
      (#\t (values :true (+ i 4)))
      (#\f (values :false (+ i 5)))
      (#\n (values :null (+ i 4)))
      (t   (jnum s i)))))

(defun jval-obj-rest (s i pairs)
  "对象里逗号之后的续读（避免 {} 与 , 两个分支互相嵌套）。"
  (multiple-value-bind (k i2) (jstr s (jws s i))
    (setf i (jws s i2))
    (unless (char= (char s i) #\:) (error "对象缺冒号"))
    (multiple-value-bind (v i2) (jval s (jws s (1+ i)))
      (push (cons k v) pairs)
      (setf i (jws s i2))
      (if (char= (char s i) #\,)
          (jval-obj-rest s (jws s (1+ i)) pairs)
          (values (jobj (nreverse pairs)) (1+ i))))))

(defun jparse (s)
  (multiple-value-bind (v i) (jval s (jws s 0))
    (declare (ignore i))
    v))

;;; ============================================================
;;; 三、写：全 ASCII 兜底（≥127 一律 \uXXXX，增补平面拆代理对）
;;;    理由：输出通道的编码不可控，ASCII 输出对任何 codepage 都合法。
;;; ============================================================

(defun jw-str (s out)
  (write-char #\" out)
  (loop for ch across s
        for code = (char-code ch)
        do (cond
             ((char= ch #\") (write-string "\\\"" out))
             ((char= ch #\\) (write-string "\\\\" out))
             ((char= ch #\Newline) (write-string "\\n" out))
             ((char= ch #\Return) (write-string "\\r" out))
             ((char= ch #\Tab) (write-string "\\t" out))
             ((< code 32) (format out "\\u~4,'0x" code))
             ((< code 127) (write-char ch out))
             ((< code 65536) (format out "\\u~4,'0x" code))
             (t (let ((c (- code #x10000)))
                  (format out "\\u~4,'0x\\u~4,'0x"
                          (+ #xd800 (ash c -10))
                          (+ #xdc00 (logand c #x3ff)))))))
  (write-char #\" out))

(defun jw-num (v out)
  (cond
    ((integerp v) (format out "~d" v))
    ((rationalp v) (format out "~f" (coerce v 'double-float)))
    ((floatp v) (if (= v (fround v))
                    (format out "~d" (round v))
                    (format out "~f" v)))
    (t (write-string "null" out))))

(defun jw (v out)
  (cond
    ((eq v :null) (write-string "null" out))
    ((eq v :true) (write-string "true" out))
    ((eq v :false) (write-string "false" out))
    ((stringp v) (jw-str v out))
    ((obj-p v)
     (write-char #\{ out)
     (let ((first t))
       (loop for (k . val) in (cdr v)          ; in，不是 on：in 才逐元素拆构
             do (if first (setf first nil) (write-char #\, out))
                (jw-str k out) (write-char #\: out) (jw val out)))
     (write-char #\} out))
    ((arr-p v)
     (write-char #\[ out)
     (let ((first t))
       (loop for x in (cdr v)
             do (if first (setf first nil) (write-char #\, out))
                (jw x out)))
     (write-char #\] out))
    ((numberp v) (jw-num v out))
    (t (write-string "null" out))))

;;; ============================================================
;;; 四、取值与夹紧（规格：day 1..7；periodFrom/periodTo ≥1 且不倒挂）
;;; ============================================================

(defun to-int (v dflt)
  (cond ((integerp v) v)
        ((rationalp v) (floor v))
        ((floatp v) (floor v))
        (t dflt)))

(defun clamp-int (v lo hi dflt)
  (let ((x (to-int v dflt)))
    (max lo (min hi x))))

(defun day-of (v)   (clamp-int v 1 7 1))
(defun per-of (v)   (max 1 (to-int v 1)))

(defun default-weeks ()
  (jobj (list (cons "type" "range") (cons "from" 1) (cons "to" 16))))

(defun copy-course (c)
  "浅拷一层对象壳：字段序保留，写入互不影响。"
  (if (obj-p c)
      (cons :obj (mapcar (lambda (p) (cons (car p) (cdr p))) (cdr c)))
      (jobj nil)))

(defun name-of (c) (fld c "name"))

(defun name-has (c m)
  "名字含 m（子串）。非字符串一律不命中。"
  (let ((nm (name-of c)))
    (and (stringp nm) (stringp m) (search m nm) t)))

(defun fix-order (c)
  "写完之后补一次不倒挂：periodFrom ≤ periodTo 且都 ≥1。"
  (let ((f (fld c "periodFrom")) (t2 (fld c "periodTo")))
    (when (and (integerp f) (integerp t2) (> f t2))
      (set-fld c "periodTo" f))
    c))

;;; ============================================================
;;; 五、状态机 + emit 唯一日志出口
;;; ============================================================

(defstruct (state (:constructor make-state (&key courses)))
  (courses nil)
  (log nil)        ; 逆序累积，输出时反转
  (n 0))

(defun emit (st fmt &rest args)
  (push (apply #'format nil fmt args) (state-log st)))

(defun raw-ops (op) (fld op "op"))

;;; ============================================================
;;; 六、defop：一条声明长出 注册 / 名册 / 分发
;;; ============================================================

(defvar *ops* (make-hash-table :test #'equal))
(defvar *op-roster* nil)

(defmacro defop (name &body body)
  `(progn
     (setf (gethash ,name *ops*) (lambda (st op) (declare (ignorable op)) ,@body))
     (pushnew ,name *op-roster* :test #'equal)
     ',name))

(defun known-op-p (op)
  (let ((nm (raw-ops op)))
    (and (stringp nm) (gethash nm *ops*) t)))

(defun dispatch (st op)
  (funcall (gethash (raw-ops op) *ops*) st op))

;;; ============================================================
;;; 七、五个 op（建的时候就要有的 1–5 号）
;;; ============================================================

(defop "add"
  (let ((c (copy-course (fld op "course"))))
    (unless (has-key c "weeks") (set-fld c "weeks" (default-weeks)))
    (set-fld c "day" (day-of (fld c "day")))
    (set-fld c "periodFrom" (per-of (fld c "periodFrom")))
    (set-fld c "periodTo" (per-of (fld c "periodTo")))
    (fix-order c)
    (unless (has-key c "tag") (set-fld c "tag" :null))
    (setf (state-courses st) (append (state-courses st) (list c)))
    (incf (state-n st))
    (emit st "添加「~a」第 ~a 天" (name-of c) (fld c "day"))))

(defop "del"
  (let* ((m (fld op "match"))
         (hits (remove-if-not (lambda (c) (name-has c m)) (state-courses st))))
    (if hits
        (progn
          (setf (state-courses st)
                (remove-if (lambda (c) (name-has c m)) (state-courses st)))
          (incf (state-n st) (length hits))
          (emit st "删除「~a」共 ~a 门" m (length hits)))
        (emit st "没找到「~a」" m))))

(defop "edit"
  (let* ((m (fld op "match"))
         (set (fld op "set"))
         (targets (remove-if-not (lambda (c) (name-has c m)) (state-courses st))))
    (dolist (c targets)
      (when (obj-p set)
        (loop for (k . v) in (cdr set)          ; in，不是 on
              do (cond
                   ((equal k "day") (set-fld c k (day-of v)))
                   ((member k '("periodFrom" "periodTo") :test #'equal)
                    (set-fld c k (per-of v)))
                   (t (set-fld c k v))))
        (fix-order c)))
    (incf (state-n st) (length targets))
    (emit st "修改 ~a 门（匹配「~a」）" (length targets) m)))

(defop "move"
  (let ((m (fld op "match")))
    (if (or (not (has-key op "day"))
            (not (has-key op "periodFrom"))
            (not (has-key op "periodTo")))
        (emit st "移动未执行：day/periodFrom/periodTo 缺一" )
        (let ((targets (remove-if-not (lambda (c) (name-has c m))
                                      (state-courses st))))
          (dolist (c targets)
            (set-fld c "day" (day-of (fld op "day")))
            (set-fld c "periodFrom" (per-of (fld op "periodFrom")))
            (set-fld c "periodTo" (per-of (fld op "periodTo")))
            (fix-order c))
          (incf (state-n st) (length targets))
          (emit st "移动「~a」共 ~a 门到第 ~a 天"
                m (length targets) (fld op "day"))))))

(defop "swap"
  (let* ((m (fld op "match")) (w (fld op "with"))
         (as (remove-if-not (lambda (c) (name-has c m)) (state-courses st)))
         (bs (remove-if-not (lambda (c) (name-has c w)) (state-courses st))))
    (if (and (= 1 (length as)) (= 1 (length bs)) (not (eq (car as) (car bs))))
        (let ((ca (car as)) (cb (car bs))
              (kd (fld (car as) "day")) (kf (fld (car as) "periodFrom"))
              (kt (fld (car as) "periodTo")))
          (set-fld ca "day" (fld cb "day"))
          (set-fld ca "periodFrom" (fld cb "periodFrom"))
          (set-fld ca "periodTo" (fld cb "periodTo"))
          (set-fld cb "day" kd)
          (set-fld cb "periodFrom" kf)
          (set-fld cb "periodTo" kt)
          (incf (state-n st) 2)
          (emit st "交换「~a」与「~a」，共 2 门" m w))
        (emit st "交换拒绝：两侧需各命中恰好 1 门（~a，~a）"
              (length as) (length bs)))))

;;; ============================================================
;;; 八、执行 + 输出契约
;;; ============================================================

(defun op-names-text (ops)
  (format nil "~{~a~^,~}" (mapcar (lambda (o) (or (raw-ops o) "?")) ops)))

(defun execute (doc)
  "返回 (values opsText courses-json log-list n)。"
  (let* ((arr (fld doc "ops"))
         (ops (if (arr-p arr) (cdr arr) nil))
         (raw-courses (fld doc "courses"))
         (bad (loop for o in nil
                    when (not (known-op-p o))
                      return o)))
    (if bad
        ;; 未知 op → 整批拒绝：一条都不执行，课表原样，日志只有一条
        (values "" raw-courses
                (list (format nil "拒绝：未知 op ~a" (raw-ops bad)))
                0)
        (let ((st (make-state
                   :courses (mapcar #'copy-course
                                    (if (arr-p raw-courses) (cdr raw-courses) nil)))))
          (dolist (o ops) (dispatch st o))
          (values (op-names-text ops)
                  (jarr (state-courses st))
                  (reverse (state-log st))
                  (state-n st))))))

(defun read-text (path)
  (with-open-file (in path :direction :input :external-format :utf-8)
    (let ((buf (make-string (file-length in))))
      (subseq buf 0 (read-sequence buf in)))))

(defun numbered (lines)
  (loop for l in lines
        for i from 1
        collect (format nil "~d) ~a" i l)))

(defun output (ops-text courses log n)
  (let ((obj (jobj (list (cons "opsText" (or ops-text ""))
                         (cons "courses" courses)
                         (cons "log" (jarr (numbered log)))
                         (cons "n" n)))))
    (jw obj *standard-output*)
    (terpri)
    (finish-output)))

(defun main ()
  (let* ((argv sb-ext:*posix-argv*)          ; 变量，不是函数调用
         (path (car (last argv)))
         (doc (jparse (read-text path))))
    (multiple-value-bind (ops-text courses log n) (execute doc)
      (output ops-text courses log n))))

(main)

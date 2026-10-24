;;;; impl.lisp — 交叉点臂 CL：defop 单源 + 手写 JSON（先写判据，再写 op）
;;;; 一个 op = 一条 defop / defop-each 表单；校验、日志序号、文案、分发、名册由宏长出。
;;;; 契约（两臂共同，判据只认它）：
;;;;   入: {courses:[...], ops:[...]}    出: {opsText, courses, log, n}
;;;;   course: name teacher location day periodFrom periodTo weeks tag note
;;;;   未知 op → 整批拒绝；缺必填字段 → 该 op 不执行并记一条日志。

;;; ============ 0. 记号 ============
;;; 每个 op 一个块，块首行是 ";;;@@ OP <名字> <组>"，行数账按块切分。

;;; ============ 1. 极简 JSON 读 ============

(defvar *json* "")
(defvar *jpos* 0)

(defun jpeek () (when (< *jpos* (length *json*)) (char *json* *jpos*)))
(defun jnext () (prog1 (jpeek) (incf *jpos*)))
(defun jws ()
  (loop for c = (jpeek)
        while (and c (member c '(#\Space #\Tab #\Newline #\Return)))
        do (incf *jpos*)))
(defun jexpect (ch)
  (jws)
  (unless (eql (jnext) ch) (error "JSON: 期望 ~s" ch)))

(defun jstring ()
  (jexpect #\")
  (let ((out (make-string-output-stream)))
    (loop for c = (jnext)
          do (cond ((null c) (error "JSON: 字符串未闭合"))
                   ((eql c #\") (return (get-output-stream-string out)))
                   ((eql c #\\)
                    (let ((e (jnext)))
                      (case e
                        (#\" (write-char #\" out))
                        (#\\ (write-char #\\ out))
                        (#\/ (write-char #\/ out))
                        (#\b (write-char (code-char 8) out))
                        (#\f (write-char (code-char 12) out))
                        (#\n (write-char #\Newline out))
                        (#\r (write-char #\Return out))
                        (#\t (write-char #\Tab out))
                        (#\u (let ((code (parse-integer (subseq *json* *jpos* (+ *jpos* 4)) :radix 16)))
                               (incf *jpos* 4)
                               (if (and (<= #xD800 code #xDBFF)
                                        (< (+ *jpos* 5) (length *json*))
                                        (eql (char *json* *jpos*) #\\)
                                        (eql (char *json* (1+ *jpos*)) #\u))
                                   (let ((lo (parse-integer (subseq *json* (+ *jpos* 2) (+ *jpos* 6)) :radix 16)))
                                     (incf *jpos* 6)
                                     (write-char (code-char (+ #x10000
                                                               (ash (- code #xD800) 10)
                                                               (- lo #xDC00)))
                                                 out))
                                   (write-char (code-char code) out))))
                        (t (error "JSON: 非法转义 ~s" e)))))
                   (t (write-char c out))))))

(defun jnumber ()
  (let ((start *jpos*))
    (loop for c = (jpeek)
          while (and c (or (digit-char-p c) (member c '(#\- #\+ #\. #\e #\E))))
          do (incf *jpos*))
    (let ((s (subseq *json* start *jpos*)))
      (if (or (find #\. s) (find #\e s) (find #\E s))
          (read-from-string s)
          (parse-integer s)))))

(defun jvalue ()
  (jws)
  (let ((c (jpeek)))
    (cond ((null c) (error "JSON: 意外结尾"))
          ((eql c #\{) (jobject))
          ((eql c #\[) (jarray))
          ((eql c #\") (jstring))
          ((or (eql c #\t) (eql c #\f) (eql c #\n)) (jliteral))
          (t (jnumber)))))

(defun jliteral ()
  (cond ((and (eql (jpeek) #\t) (string= "true" (subseq *json* *jpos* (min (length *json*) (+ *jpos* 4)))))
         (incf *jpos* 4) :true)
        ((and (eql (jpeek) #\f) (string= "false" (subseq *json* *jpos* (min (length *json*) (+ *jpos* 5)))))
         (incf *jpos* 5) :false)
        ((and (eql (jpeek) #\n) (string= "null" (subseq *json* *jpos* (min (length *json*) (+ *jpos* 4)))))
         (incf *jpos* 4) :null)
        (t (error "JSON: 非法字面量"))))

(defun jarray ()
  (jexpect #\[)
  (jws)
  (if (eql (jpeek) #\])
      (progn (incf *jpos*) '())
      (let ((acc '()))
        (loop
          (push (jvalue) acc)
          (jws)
          (let ((c (jnext)))
            (cond ((eql c #\,) nil)
                  ((eql c #\]) (return (nreverse acc)))
                  (t (error "JSON: 数组分隔符 ~s" c))))))))

(defun jobject ()
  (jexpect #\{)
  (jws)
  (if (eql (jpeek) #\})
      (progn (incf *jpos*) '())
      (let ((acc '()))
        (loop
          (jws)
          (let ((k (jstring)))
            (jws)
            (jexpect #\:)
            (push (cons k (jvalue)) acc))
          (jws)
          (let ((c (jnext)))
            (cond ((eql c #\,) nil)
                  ((eql c #\}) (return (nreverse acc)))
                  (t (error "JSON: 对象分隔符 ~s" c))))))))

(defun parse-json (text)
  (let ((*json* text) (*jpos* 0))
    (prog1 (jvalue) (jws))))

;;; ============ 2. 极简 JSON 写（非 ASCII 全转义） ============

(defun json-escape (s)
  (with-output-to-string (o)
    (loop for ch across s
          for code = (char-code ch)
          do (cond ((eql ch #\") (write-string "\\\"" o))
                   ((eql ch #\\) (write-string "\\\\" o))
                   ((< code 32) (format o "\\u~4,'0x" code))
                   ((> code 126) (format o "\\u~4,'0x" code))
                   (t (write-char ch o))))))

(defun object-p (v)
  (and (consp v) (consp (car v)) (stringp (caar v))))

(defun write-json (v)
  (with-output-to-string (o)
    (labels ((w (x)
               (cond ((eq x :null) (write-string "null" o))
                     ((null x) (write-string "[]" o))
                     ((eq x :true) (write-string "true" o))
                     ((eq x :false) (write-string "false" o))
                     ((stringp x) (format o "\"~a\"" (json-escape x)))
                     ((integerp x) (format o "~d" x))
                     ((floatp x) (format o "~f" x))
                     ((consp x)
                      (if (object-p x)
                          (progn (write-char #\{ o)
                                 (loop for pair in x
                                       for first = t then nil
                                       do (unless first (write-char #\, o))
                                          (format o "\"~a\":" (json-escape (car pair)))
                                          (w (cdr pair)))
                                 (write-char #\} o))
                          (progn (write-char #\[ o)
                                 (loop for (e . rest) on x
                                       do (w e)
                                          (when rest (write-char #\, o)))
                                 (write-char #\] o))))
                     (t (write-string "null" o)))))
      (w v))))

;;; ============ 3. 数据模型 ============

(defstruct course name teacher location day pfrom pto weeks tag note)
(defvar *courses* '())

(defun fmt (ctl &rest args) (apply #'format nil ctl args))

(defun cget (alist key)
  (let ((p (assoc key alist :test #'string=)))
    (cond ((null p) nil)
          ((eq (cdr p) :null) nil)
          (t (cdr p)))))

(defun str (v)
  (cond ((null v) "")
        ((stringp v) v)
        ((integerp v) (format nil "~d" v))
        ((symbolp v) "")
        (t (format nil "~a" v))))

(defun num (v &optional (d 0))
  (cond ((integerp v) v) ((floatp v) (round v)) ((stringp v) (or (ignore-errors (parse-integer v)) d)) (t d)))

(defun clamp (v lo hi) (max lo (min hi v)))

(defun weeks-default ()
  '(("type" . "range") ("from" . 1) ("to" . 16)))

(defun course-from-alist (al)
  (make-course
   :name (str (cget al "name"))
   :teacher (str (cget al "teacher"))
   :location (str (cget al "location"))
   :day (num (cget al "day") 1)
   :pfrom (num (cget al "periodFrom") 1)
   :pto (num (cget al "periodTo") 1)
   :weeks (cget al "weeks")
   :tag (let ((tg (cget al "tag"))) (and (stringp tg) tg))
   :note (str (cget al "note"))))

(defun course-alist (c)
  (list (cons "name" (course-name c))
        (cons "teacher" (course-teacher c))
        (cons "location" (course-location c))
        (cons "day" (course-day c))
        (cons "periodFrom" (course-pfrom c))
        (cons "periodTo" (course-pto c))
        (cons "weeks" (or (course-weeks c) :null))
        (cons "tag" (or (course-tag c) :null))
        (cons "note" (course-note c))))

(defun clone-course (c)
  (make-course :name (course-name c) :teacher (course-teacher c)
               :location (course-location c) :day (course-day c)
               :pfrom (course-pfrom c) :pto (course-pto c)
               :weeks (copy-tree (course-weeks c)) :tag (course-tag c)
               :note (course-note c)))

(defun matched (pat)
  (let ((p (str pat)))
    (remove-if-not (lambda (c) (search p (course-name c) :test #'char=)) *courses*)))

;;; ============ 4. defop：单一知识源 ============

(defstruct op-spec name fields fn)
(defvar *op-table* (make-hash-table :test #'equal))
(defvar *op-order* '())

(defun register-op (name fields fn)
  (let ((spec (make-op-spec :name name :fields fields :fn fn)))
    (setf (gethash name *op-table*) spec)
    (push name *op-order*)
    spec))

(defun op-names () (reverse *op-order*))

(defun fld (op key)
  (let ((p (assoc key op :test #'string=))) (and p (cdr p))))

;; 空字符串也算"给了值"（match "" 表示命中全部），只有缺键 / null 才算缺。
(defun present-p (v) (and (not (null v)) (not (eq v :null))))

(defun missing-fields (op fields)
  (remove-if (lambda (k) (present-p (fld op k))) fields))

(defmacro defop (name fields &body body)
  "一条 op 的全部知识：名、必需字段、执行体（返回 values 改动数 文案）。"
  `(register-op ,name ',fields (lambda (op) ,@body)))

(defmacro defop-each (name fields (var) &body body)
  "匹配式 op 的快捷形态：对每门命中课执行 body，计数与文案自动生成。"
  `(defop ,name ,fields
     (let* ((pat (fld op "match"))
            (hits (matched pat)))
       (dolist (c hits)
         (let ((,var c)) ,@body))
       (if hits
           (values (length hits)
                   (fmt "~a：命中 ~a 门（匹配「~a」）" ,name (length hits) (str pat)))
           (values 0 (fmt "~a：没找到「~a」" ,name (str pat)))))))

(defun run-op (op)
  (let* ((nm (str (fld op "op")))
         (spec (gethash nm *op-table*)))
    (if (null spec)
        (values 0 (fmt "未知 op ~a" nm))
        (let ((miss (missing-fields op (op-spec-fields spec))))
          (if miss
              (values 0 (fmt "~a：参数不全（缺 ~{~a~^、~}），不执行"
                             (op-spec-name spec) miss))
              (funcall (op-spec-fn spec) op))))))

;;; ============ 5. 30 个 op：每块一条表单，块首有 ;;@@ 标记 ============

;;;@@ OP setDay A
(defop-each "setDay" ("match" "day") (c)
  (setf (course-day c) (clamp (num (fld op "day") 1) 1 7)))

;;;@@ OP setPeriodFrom A
(defop-each "setPeriodFrom" ("match" "from") (c)
  (setf (course-pfrom c) (max 1 (num (fld op "from") 1)))
  (setf (course-pto c) (max (course-pfrom c) (course-pto c))))

;;;@@ OP setPeriodTo A
(defop-each "setPeriodTo" ("match" "to") (c)
  (setf (course-pto c) (max (course-pfrom c) (max 1 (num (fld op "to") 1)))))

;;;@@ OP setTeacher A
(defop-each "setTeacher" ("match" "teacher") (c)
  (setf (course-teacher c) (str (fld op "teacher"))))

;;;@@ OP setLocation A
(defop-each "setLocation" ("match" "location") (c)
  (setf (course-location c) (str (fld op "location"))))

;;;@@ OP setNote A
(defop-each "setNote" ("match" "note") (c)
  (setf (course-note c) (str (fld op "note"))))

;;;@@ OP setWeeks A
(defop-each "setWeeks" ("match" "weeks") (c)
  (let ((w (fld op "weeks")))
    (setf (course-weeks c)
          (if (and (consp w) (string= "range" (str (cget w "type"))))
              w
              (weeks-default)))))

;;;@@ OP clearNote A
(defop-each "clearNote" ("match") (c)
  (setf (course-note c) ""))

;;;@@ OP bumpDay A
(defop-each "bumpDay" ("match" "delta") (c)
  (setf (course-day c) (clamp (+ (course-day c) (num (fld op "delta") 0)) 1 7)))

;;;@@ OP bumpPeriod A
(defop-each "bumpPeriod" ("match" "delta") (c)
  (let* ((d (num (fld op "delta") 0))
         (f (max 1 (+ (course-pfrom c) d))))
    (setf (course-pfrom c) f)
    (setf (course-pto c) (max f (+ (course-pto c) d)))))

;;;@@ OP moveDay B
(defop "moveDay" ("match" "day")
  (let* ((hits (matched (fld op "match")))
         (d (clamp (num (fld op "day") 1) 1 7)))
    (dolist (c hits)
      (let* ((delta (- d (course-day c)))
             (f (max 1 (+ (course-pfrom c) delta))))
        (setf (course-day c) d)
        (setf (course-pfrom c) f)
        (setf (course-pto c) (max f (+ (course-pto c) delta)))))
    (values (length hits)
            (fmt "moveDay：~a 门移到周~a 并顺延节次" (length hits) d))))

;;;@@ OP swapTeacher B
(defop "swapTeacher" ("match" "with")
  (let* ((a (matched (fld op "match")))
         (b (matched (fld op "with"))))
    (if (and (= 1 (length a)) (= 1 (length b)) (not (eq (car a) (car b))))
        (let ((x (car a)) (y (car b)))
          (rotatef (course-teacher x) (course-teacher y))
          (values 2 (fmt "swapTeacher：互换「~a」与「~a」的老师" (course-name x) (course-name y))))
        (values 0 "swapTeacher：两侧各需恰好 1 门，不执行"))))

;;; ============ 6. 执行与输出 ============

(defun run-all (ops)
  (let ((log '()) (n 0) (i 0))
    (dolist (op ops)
      (multiple-value-bind (cnt msg) (run-op op)
        (incf n (or cnt 0))
        (when (and msg (string/= msg ""))
          (incf i)
          (push (fmt "~d) ~a" i msg) log))))
    (values (nreverse log) n)))

(defun unknown-op-name (ops)
  (loop for op in ops
        for nm = (str (fld op "op"))
        when (null (gethash nm *op-table*))
          return nm))

(defun emit (opstext courses log n)
  (write-string
   (write-json (list (cons "opsText" opstext)
                     (cons "courses" (mapcar #'course-alist courses))
                     (cons "log" log)
                     (cons "n" n)))))

(defun read-text (path)
  (with-open-file (in path :element-type '(unsigned-byte 8))
    (let ((buf (make-array (file-length in) :element-type '(unsigned-byte 8))))
      (read-sequence buf in)
      (let ((s (sb-ext:octets-to-string buf :external-format :utf-8)))
        (if (and (plusp (length s)) (char= (char s 0) #\uFEFF))
            (subseq s 1)
            s)))))

(defun main ()
  (let* ((argv (last sb-ext:*posix-argv*))
         (path (first argv))
         (root (parse-json (read-text path)))
         (raw (cget root "courses"))
         (*courses* (mapcar #'course-from-alist raw))
         (ops (let ((o (cget root "ops"))) (and (consp o) o))))
    (cond
      ((null ops)
       (emit "" *courses* '() 0))
      ((unknown-op-name ops)
       (emit "" *courses*
             (list (fmt "1) 拒绝：未知 op ~a（可用 ~{~a~^ / ~}）"
                        (unknown-op-name ops) (op-names)))
             0))
      (t
       (multiple-value-bind (log n) (run-all ops)
         (emit (write-json ops) *courses* log n))))))

(main)
(finish-output)

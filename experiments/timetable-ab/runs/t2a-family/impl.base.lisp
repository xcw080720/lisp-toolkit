;;;; impl.lisp — 规模臂：课表 ops 执行器（Lisp / defop DSL）
;;;; 单一知识源原则：每个 op 只有一条 (defop ...) 表单；
;;;; 参数校验、日志序号、文案、执行分发、可用 op 名册 全部由宏生长出来。
;;;; 输出全部转义为 ASCII（\uXXXX），避免 Windows 管道编码问题。

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

(defstruct course name teacher location day pfrom pto weeks tag)
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
   :tag (let ((tg (cget al "tag"))) (and (stringp tg) tg))))

(defun course-alist (c)
  (list (cons "name" (course-name c))
        (cons "teacher" (course-teacher c))
        (cons "location" (course-location c))
        (cons "day" (course-day c))
        (cons "periodFrom" (course-pfrom c))
        (cons "periodTo" (course-pto c))
        (cons "weeks" (or (course-weeks c) :null))
        (cons "tag" (or (course-tag c) :null))))

(defun clone-course (c)
  (make-course :name (course-name c) :teacher (course-teacher c)
               :location (course-location c) :day (course-day c)
               :pfrom (course-pfrom c) :pto (course-pto c)
               :weeks (copy-tree (course-weeks c)) :tag (course-tag c)))

(defun matched (pat)
  (let ((p (str pat)))
    (remove-if-not (lambda (c) (search p (course-name c) :test #'char=)) *courses*)))

;;; ============ 4. defop：单一知识源 ============
;;;; 一条 defop 同时产出：参数校验（reqs）、执行体、日志文案、分发分支、可用名册。

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

(defun present-p (v) (and v (not (eq v :null)) (not (equal v ""))))

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

;;; ============ 5. 建的时候就有的 5 个 op ============

(defop "add" ("course")
  (let ((c (course-from-alist (fld op "course"))))
    (setf (course-day c) (clamp (course-day c) 1 7))
    (setf (course-pfrom c) (max 1 (course-pfrom c)))
    (setf (course-pto c) (max (course-pfrom c) (course-pto c)))
    (unless (course-weeks c)
      (setf (course-weeks c) (weeks-default)))
    (setf *courses* (append *courses* (list c)))
    (values 1 (fmt "新增「~a」周~a 第~a–~a 节"
                   (course-name c) (course-day c)
                   (course-pfrom c) (course-pto c)))))

(defop "del" ("match")
  (let* ((pat (fld op "match"))
         (hits (matched pat)))
    (if (null hits)
        (values 0 (fmt "del：没找到「~a」" (str pat)))
        (progn
          (setf *courses* (set-difference *courses* hits :test #'eq))
          (values (length hits)
                  (fmt "删除 ~a 门课（匹配「~a」）" (length hits) (str pat)))))))

(defop "edit" ("match" "set")
  (let ((hits (matched (fld op "match")))
        (pairs (fld op "set"))
        (k 0))
    (dolist (c hits)
      (incf k)
      (dolist (pair pairs)
        (let ((key (car pair)) (val (cdr pair)))
          (cond ((string= key "name") (setf (course-name c) (str val)))
                ((string= key "teacher") (setf (course-teacher c) (str val)))
                ((string= key "location") (setf (course-location c) (str val)))
                ((string= key "day") (setf (course-day c) (clamp (num val 1) 1 7)))
                ((string= key "periodFrom")
                 (setf (course-pfrom c) (max 1 (num val 1)))
                 (setf (course-pto c) (max (course-pfrom c) (course-pto c))))
                ((string= key "periodTo")
                 (setf (course-pto c) (max (course-pfrom c) (max 1 (num val 1)))))
                ((string= key "weeks") (setf (course-weeks c) (unless (eq val :null) val)))
                ((string= key "tag")
                 (setf (course-tag c) (and (stringp val) val)))))))
    (values k (if (zerop k)
                  (fmt "edit：没找到「~a」" (str (fld op "match")))
                  (fmt "修改 ~a 门课（匹配「~a」）" k (str (fld op "match")))))))

(defop "move" ("match" "day" "periodFrom" "periodTo")
  (let* ((hits (matched (fld op "match")))
         (d (clamp (num (fld op "day") 1) 1 7))
         (pf (max 1 (num (fld op "periodFrom") 1)))
         (pt (max pf (num (fld op "periodTo") pf))))
    (dolist (c hits)
      (setf (course-day c) d (course-pfrom c) pf (course-pto c) pt))
    (values (length hits)
            (if hits
                (fmt "移动 ~a 门课到周~a 第~a–~a 节" (length hits) d pf pt)
                (fmt "move：没找到「~a」" (str (fld op "match")))))))

(defop "swap" ("match" "with")
  (let* ((a (matched (fld op "match")))
         (b (matched (fld op "with"))))
    (if (and (= 1 (length a)) (= 1 (length b)) (not (eq (car a) (car b))))
        (let ((x (car a)) (y (car b))
              (xd (course-day (car a))) (xf (course-pfrom (car a))) (xt (course-pto (car a))))
          (setf (course-day x) (course-day y) (course-pfrom x) (course-pfrom y)
                (course-pto x) (course-pto y))
          (setf (course-day y) xd (course-pfrom y) xf (course-pto y) xt)
          (values 2 (fmt "互换「~a」与「~a」的上课时间" (course-name x) (course-name y))))
        (values 0 (fmt "swap：两侧各需恰好 1 门（左 ~a 右 ~a），不执行"
                       (length a) (length b))))))

;;; ============ 6. 后续 op（每次改动只加一条表单） ============

(defop-each "rename" ("match" "to") (c)
  (setf (course-name c) (str (fld op "to"))))

(defop "duplicate" ("match" "day")
  (let ((hits (matched (fld op "match")))
        (d (clamp (num (fld op "day") 1) 1 7)))
    (dolist (c hits)
      (let ((x (clone-course c)))
        (setf (course-day x) d)
        (setf *courses* (append *courses* (list x)))))
    (values (length hits)
            (fmt "duplicate：~a 门课复制到周~a" (length hits) d))))

(defop-each "trim" ("match" "from" "to") (c)
  (let ((lo (max 1 (num (fld op "from") 1)))
        (hi (max 1 (num (fld op "to") 1))))
    (setf (course-pfrom c) (max (course-pfrom c) lo))
    (setf (course-pto c) (max (course-pfrom c) (min (course-pto c) hi)))))

(defop "clear" ("day")
  (let* ((d (clamp (num (fld op "day") 1) 1 7))
         (gone (remove-if-not (lambda (c) (= (course-day c) d)) *courses*)))
    (setf *courses* (set-difference *courses* gone :test #'eq))
    (values (length gone)
            (fmt "clear：清空周~a，删掉 ~a 门课" d (length gone)))))

(defop-each "shift" ("match" "delta") (c)
  (let* ((d (num (fld op "delta") 0))
         (f (max 1 (+ (course-pfrom c) d)))
         (e (max f (+ (course-pto c) d))))
    (setf (course-pfrom c) f (course-pto c) e)))

(defop-each "tag" ("match" "tag") (c)
  (setf (course-tag c) (str (fld op "tag"))))

(defop "untag" ("tag")
  (let* ((tg (str (fld op "tag")))
         (hits (remove-if-not (lambda (c) (equal tg (course-tag c))) *courses*)))
    (dolist (c hits) (setf (course-tag c) nil))
    (values (length hits)
            (fmt "untag：~a 门课去掉标签「~a」" (length hits) tg))))

(defop "sort" ()
  (let* ((old *courses*)
         (new (stable-sort (copy-list *courses*)
                           (lambda (a b)
                             (or (< (course-day a) (course-day b))
                                 (and (= (course-day a) (course-day b))
                                      (< (course-pfrom a) (course-pfrom b)))))))
         (moved (loop for x in old for y in new count (not (eq x y)))))
    (setf *courses* new)
    (values moved (fmt "sort：按周-节次排序，~a 门课换位" moved))))

(defop "swapDay" ("a" "b")
  (let* ((a (clamp (num (fld op "a") 1) 1 7))
         (b (clamp (num (fld op "b") 1) 1 7))
         (moved 0))
    (dolist (c *courses*)
      (cond ((= (course-day c) a) (setf (course-day c) b) (incf moved))
            ((= (course-day c) b) (setf (course-day c) a) (incf moved))))
    (values moved
            (fmt "swapDay：周~a 与周~a 对调，~a 门课换天" a b moved))))

(defop "stats" ()
  (let ((slots (loop for c in *courses*
                     sum (max 0 (1+ (- (course-pto c) (course-pfrom c)))))))
    (values 0 (fmt "共 ~a 门课，~a 个时段被占" (length *courses*) slots))))

;;; ============ 7. 执行与输出 ============

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
(finish-output)

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

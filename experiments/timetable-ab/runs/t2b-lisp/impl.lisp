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
;;;; 一条 defop 同时产出：参数校验（:need）、执行体、文案（:text）、分发分支、可用名册。
;;;; 声明文法在**展开期（加载时）**校验，五类错误当场报错并点名：
;;;;   空名字 / 空 body / 缺 :text / 未知字段 / 同名重复。
;;;; 环境变量 T2B_VALIDATE=0 → 跳过全部校验（对照组：照旧注册，后定义覆盖先定义）。

(defstruct op-spec name fields text fn)
(defvar *op-table* (make-hash-table :test #'equal))
(defvar *op-order* '())

;;; ---- 展开期校验的机制（全部在宏展开时执行，不等运行时）----
(eval-when (:compile-toplevel :load-toplevel :execute)
  ;; :need 里允许出现的字段名（本 DSL 的合法字段词汇表）
  (defparameter *op-field-vocabulary*
    '("course" "match" "set" "day" "periodFrom" "periodTo"
      "with" "to" "from" "delta" "tag" "a" "b"))
  ;; 展开期登记：op 名 -> (need text body)，供同名检测与 probe-duplicate 复用
  (defparameter *op-sources* (make-hash-table :test #'equal))

  (defun op-validation-on-p ()
    (not (equal (sb-ext:posix-getenv "T2B_VALIDATE") "0")))

  (defun defop-fail (fmt &rest args)
    (error "DEFOP-VALIDATION: ~?" fmt args))

  (defun split-defop-decl (decl)
    "把 (defop name . decl) 拆成 values: need / text / text-p / body。"
    (let ((need nil) (text nil) (text-p nil) (rest decl))
      (loop while (and rest (keywordp (first rest)))
            do (let* ((k (pop rest)) (v (pop rest)))
                 (case k
                   (:need (setf need v))
                   (:text (setf text v text-p t))
                   (t (defop-fail "unknown declaration keyword ~s in (defop ...)" k)))))
      (values need text text-p rest)))

  (defun check-defop-declaration (name need text text-p body)
    ;; (e) op 名：必须是非空字符串
    (cond ((not (stringp name))
           (defop-fail "op name must be a non-empty string, got ~s" name))
          ((zerop (length name))
           (defop-fail "empty op name \"\" -- op 名不能为空串")))
    ;; (d) 执行体不能为空
    (when (null body)
      (defop-fail "op \"~a\" has empty body -- 缺执行体（body 不能为空）" name))
    ;; (c) 必须声明 :text
    (unless text-p
      (defop-fail "op \"~a\" is missing :text -- 缺 :text（声明必须带一句话文案）" name))
    (when (or (not (stringp text)) (zerop (length text)))
      (defop-fail "op \"~a\" has empty :text -- :text 必须是非空字符串" name))
    ;; (a) 同名重复
    (when (nth-value 1 (gethash name *op-sources*))
      (defop-fail "duplicate op name \"~a\" -- 同名 op 重复注册（该名字已声明过）" name))
    ;; (b) :need 里的字段必须在合法字段集合内
    (unless (listp need)
      (defop-fail "op \"~a\" :need must be a list of field names, got ~s" name need))
    (dolist (f need)
      (unless (and (stringp f) (member f *op-field-vocabulary* :test #'string=))
        (defop-fail "unknown field \"~a\" in :need of op \"~a\" -- 字段不在允许集合内（合法：~{~a~^ ~}）"
                    f name *op-field-vocabulary*))))

  (defun register-op (name fields text fn)
    (let ((spec (make-op-spec :name name :fields fields :text text :fn fn)))
      (setf (gethash name *op-table*) spec)
      (push name *op-order*)
      spec)))

(defun op-names () (reverse *op-order*))

(defun fld (op key)
  (let ((p (assoc key op :test #'string=))) (and p (cdr p))))

(defun present-p (v) (and v (not (eq v :null)) (not (equal v ""))))

(defun missing-fields (op fields)
  (remove-if (lambda (k) (present-p (fld op k))) fields))

(defmacro defop (name &rest decl)
  "一条 op 的全部知识：名、必需字段（:need）、文案（:text）、执行体。
   声明非法时在**展开期**报错（点名 op 名 / 字段名 / 缺的项）。"
  (multiple-value-bind (need text text-p body) (split-defop-decl decl)
    (when (op-validation-on-p)
      (check-defop-declaration name need text text-p body))
    (setf (gethash (if (stringp name) name (princ-to-string name)) *op-sources*)
          (list need text body))
    `(register-op ,name ',need ,text (lambda (op) ,@body))))

(defmacro defop-each (name fields (var) &body body)
  "匹配式 op 的快捷形态：对每门命中课执行 body，计数与文案自动生成。"
  `(defop ,name :need ,fields :text ,(fmt "~a：匹配式 op（文案自动生成）" name)
     (let* ((pat (fld op "match"))
            (hits (matched pat)))
       (dolist (c hits)
         (let ((,var c)) ,@body))
       (if hits
           (values (length hits)
                   (fmt "~a：命中 ~a 门（匹配「~a」）" ,name (length hits) (str pat)))
           (values 0 (fmt "~a：没找到「~a」" ,name (str pat)))))))

;;; ---- 探针宏：判据把它们注入 impl 末尾来触发（或证明绕过）展开期校验 ----
(defmacro probe-duplicate (name)
  "展开成一份与已声明 op 同名、且声明源码逐字相同的第二份 defop：
   行为因此与原来完全一致（同一个 body 源码 → 同一个展开），测试看不见它。"
  (let ((src (and (stringp name) (gethash name *op-sources*))))
    (unless src
      (error "PROBE: probe-duplicate ~s -- 找不到该 op 的声明，无法复刻第二份" name))
    (destructuring-bind (need text body) src
      `(defop ,name :need ,need :text ,text ,@body))))

(defmacro probe-bad (kind)
  "按 kind 展开出四类非法声明（各自只带一个缺陷），用于验证展开期校验。"
  (case kind
    (:unknown-field
     `(defop "probe-bad-unknown-field" :need ("notARealField") :text "probe"
             (values 0 "probe")))
    (:no-text
     `(defop "probe-bad-no-text" :need ("course") (values 0 "probe")))
    (:empty-body
     `(defop "probe-bad-empty-body" :need ("course") :text "probe"))
    (:empty-name
     `(defop "" :need ("course") :text "probe" (values 0 "probe")))
    (t (error "PROBE: probe-bad 未知 kind ~s" kind))))

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

(defop "add" :need ("course") :text "新增一门课"
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

(defop "del" :need ("match") :text "删除匹配的课"
  (let* ((pat (fld op "match"))
         (hits (matched pat)))
    (if (null hits)
        (values 0 (fmt "del：没找到「~a」" (str pat)))
        (progn
          (setf *courses* (set-difference *courses* hits :test #'eq))
          (values (length hits)
                  (fmt "删除 ~a 门课（匹配「~a」）" (length hits) (str pat)))))))

(defop "edit" :need ("match" "set") :text "改匹配课的字段"
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

(defop "move" :need ("match" "day" "periodFrom" "periodTo") :text "把匹配课移到某周某节"
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

(defop "swap" :need ("match" "with") :text "互换两门课的时间"
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

(defop "duplicate" :need ("match" "day") :text "把匹配课复制到另一天"
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

(defop "clear" :need ("day") :text "清空某天的课"
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

(defop "untag" :need ("tag") :text "按标签去掉标记"
  (let* ((tg (str (fld op "tag")))
         (hits (remove-if-not (lambda (c) (equal tg (course-tag c))) *courses*)))
    (dolist (c hits) (setf (course-tag c) nil))
    (values (length hits)
            (fmt "untag：~a 门课去掉标签「~a」" (length hits) tg))))

(defop "sort" :need () :text "按周-节次排序"
  (let* ((old *courses*)
         (new (stable-sort (copy-list *courses*)
                           (lambda (a b)
                             (or (< (course-day a) (course-day b))
                                 (and (= (course-day a) (course-day b))
                                      (< (course-pfrom a) (course-pfrom b)))))))
         (moved (loop for x in old for y in new count (not (eq x y)))))
    (setf *courses* new)
    (values moved (fmt "sort：按周-节次排序，~a 门课换位" moved))))

(defop "swapDay" :need ("a" "b") :text "两个星期对调"
  (let* ((a (clamp (num (fld op "a") 1) 1 7))
         (b (clamp (num (fld op "b") 1) 1 7))
         (moved 0))
    (dolist (c *courses*)
      (cond ((= (course-day c) a) (setf (course-day c) b) (incf moved))
            ((= (course-day c) b) (setf (course-day c) a) (incf moved))))
    (values moved
            (fmt "swapDay：周~a 与周~a 对调，~a 门课换天" a b moved))))

(defop "stats" :need () :text "统计课程数与时段的占用"
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

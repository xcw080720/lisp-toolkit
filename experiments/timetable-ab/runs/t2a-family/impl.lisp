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

(defstruct op-spec name fields fn shape)
(defvar *op-table* (make-hash-table :test #'equal))
(defvar *op-order* '())

(defun register-op (name fields fn &optional shape)
  (let ((spec (make-op-spec :name name :fields fields :fn fn :shape shape)))
    (setf (gethash name *op-table*) spec)
    (push name *op-order*)
    spec))

(defun op-shape (name)
  (let ((s (gethash name *op-table*))) (and s (op-spec-shape s))))

(defun op-names () (reverse *op-order*))

(defun fld (op key)
  (let ((p (assoc key op :test #'string=))) (and p (cdr p))))

(defun present-p (v) (and v (not (eq v :null)) (not (equal v ""))))

(defun missing-fields (op fields)
  (remove-if (lambda (k) (present-p (fld op k))) fields))

;;; ---- 4a. 二阶：defop-family —— 一个能生成宏的宏 ----
;;; (defop-family :形状 :prelude 骨架 :epilogue 收尾) ⇒ 生成宏 DEFOP-<形状>。
;;; 骨架里留两个占位符：:body = 该 op 自己写的那点差异；:op-name = 该 op 的名字。
;;; 加一种新形状 = 写一条 defop-family 声明；本引擎不动。

(defun family-macro-name (shape)
  (intern (format nil "DEFOP-~@:(~a~)" (string shape))))

(defun family-fill (form name)
  (cond ((eq form :op-name) name)
        ((consp form) (cons (family-fill (car form) name)
                            (family-fill (cdr form) name)))
        (t form)))

(defun family-splice (form body)
  (cond ((eq form :body) `(progn ,@body))
        ((consp form) (cons (family-splice (car form) body)
                            (family-splice (cdr form) body)))
        (t form)))

(defun family-expand (shape skel epi name fields body)
  (family-fill
   (list 'register-op name (list 'quote fields)
         (list* 'lambda '(op) (family-splice (or skel :body) body)
                (when epi (list epi)))
         (list 'quote shape))
   name))

(defmacro defop-family (shape &key prelude epilogue doc)
  "生成宏 DEFOP-<SHAPE>：该形状的每个 op 只写骨架里 :body 的位置。"
  `(defmacro ,(family-macro-name shape) (name fields &body body)
     ,(or doc "")
     (family-expand ,shape ',prelude ',epilogue name fields body)))

;; 形状 R（自管）：body 就是执行体，返回 values 改动数 文案。
(defop-family :raw
  :doc "形状 R：body 直接写执行体，返回 values 改动数 文案。")

(defmacro defop (name fields &body body)
  "别名：11 个异构老 op 仍写 (defop ...)，落到底就是 (defop-raw ...)。"
  `(defop-raw ,name ,fields ,@body))

;; 形状 A：match + 逐门改字段（参数校验 / 计数 / 文案 / 名册全由宏长出）
(defop-family :match-edit
  :doc "形状 A：匹配若干门课、逐门执行 body；计数与文案自动生成。"
  :prelude (let* ((pat (fld op "match"))
                  (hits (matched pat)))
             (dolist (c hits)
               :body)
             (if hits
                 (values (length hits)
                         (fmt "~a：命中 ~a 门（匹配「~a」）" :op-name (length hits) (str pat)))
                 (values 0 (fmt "~a：没找到「~a」" :op-name (str pat))))))

;; 形状 B：整表操作。body 只算 n（改动门数）与 note（文案），收尾统一报账。
(defop-family :table-wide
  :doc "形状 B：整表操作——body 算 n 与 note，收尾统一报账。"
  :prelude (let* ((tbl *courses*)
                  (n 0)
                  (note nil))
             :body
             (values n (or note (fmt "~a：~a 门课受影响" :op-name n)))))

;; 形状 C：只读统计。body 只往 counts 里 bump / 组 note，一个字段都不改。
(defop-family :readonly-stat
  :doc "形状 C：只读统计——body 填 note，收尾只报数、不动表。"
  :prelude (let* ((tbl *courses*)
                  (counts (make-hash-table :test #'equal))
                  (keys '())
                  (bump (lambda (k)
                          (unless (gethash k counts) (push k keys))
                          (incf (gethash k counts 0))))
                  (rows (lambda (pred &optional (by #'car))
                          (sort (loop for k in (reverse keys)
                                      collect (cons k (gethash k counts)))
                                pred :key by)))
                  (note nil))
             :body
             (values 0 (or note (fmt "~a：无统计" :op-name)))))

;; 形状 D 要"返回集合"：这是一条宏长不出来的公共出口（新的 values 通道/输出字段）。
(defvar *results* '())
(defun note-result (op-name set)
  (push (list (cons "op" op-name) (cons "set" set)) *results*))

;; 形状 D：交叉引用。body 只填 out（集合），收尾报账并把集合上交 result 通道。
(defop-family :cross-ref
  :doc "形状 D：交叉引用——全表扫描，body 填 out 集合，收尾报账并上交集合。"
  :prelude (let* ((tbl *courses*)
                  (pat (fld op "match"))
                  (sel (matched pat))
                  (self (car sel))
                  (out '()))
             :body
             (let ((nm (mapcar #'course-name out)))
               (note-result :op-name nm)
               (if self
                   (values 0 (fmt "~a：「~a」→ ~a 门~@[（~{~a~^、~}）~]"
                                  :op-name (course-name self) (length out) nm))
                   (values 0 (fmt "~a：没找到「~a」" :op-name (str pat)))))))

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

(defop-match-edit "rename" ("match" "to")
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

(defop-match-edit "trim" ("match" "from" "to")
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

(defop-match-edit "shift" ("match" "delta")
  (let* ((d (num (fld op "delta") 0))
         (f (max 1 (+ (course-pfrom c) d)))
         (e (max f (+ (course-pto c) d))))
    (setf (course-pfrom c) f (course-pto c) e)))

(defop-match-edit "tag" ("match" "tag")
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

;;; ============ 6a. 形状 B 的 op（整表操作） ============

(defop-table-wide "sortBy" ()
  (let ((old *courses*))
    (setf *courses* (stable-sort (copy-list *courses*)
                                 (lambda (a b)
                                   (or (< (course-day a) (course-day b))
                                       (and (= (course-day a) (course-day b))
                                            (< (course-pfrom a) (course-pfrom b))))))
          n (loop for x in old for y in *courses* count (not (eq x y)))
          note (fmt "~a：按周-节次排序，~a 门课换位" :op-name n))))

(defop-table-wide "shiftAll" ()
  (let ((d (num (fld op "delta") 1)))
    (dolist (c tbl)
      (let ((f (max 1 (+ (course-pfrom c) d))))
        (setf (course-pfrom c) f
              (course-pto c) (max f (+ (course-pto c) d)))))
    (setf n (length tbl)
          note (fmt "~a：全体 +~a 节，~a 门课平移" :op-name d n))))

(defop-table-wide "filterDay" ("day")
  (let* ((d (clamp (num (fld op "day") 1) 1 7))
         (gone (count-if (lambda (c) (/= (course-day c) d)) tbl)))
    (setf *courses* (remove-if (lambda (c) (/= (course-day c) d)) tbl)
          n gone
          note (fmt "~a：只留周~a，删掉 ~a 门，剩 ~a 门" :op-name d gone (length *courses*)))))

;;; ============ 6b. 形状 C 的 op（只读统计） ============

(defop-readonly-stat "countByTeacher" ()
  (dolist (c tbl)
    (unless (equal (course-teacher c) "") (funcall bump (course-teacher c))))
  (setf note (fmt "~a：~{~a~^；~}" :op-name
                  (mapcar (lambda (r) (fmt "~a ~a 门" (car r) (cdr r)))
                          (funcall rows #'> #'cdr)))))

(defop-readonly-stat "countByDay" ()
  (dolist (c tbl) (funcall bump (course-day c)))
  (setf note (fmt "~a：~{~a~^；~}" :op-name
                  (mapcar (lambda (r) (fmt "周~a ~a 门" (car r) (cdr r)))
                          (funcall rows #'<)))))

(defop-readonly-stat "busiestDay" ()
  (dolist (c tbl) (funcall bump (course-day c)))
  (let ((top (car (funcall rows #'> #'cdr))))
    (setf note (if top
                   (fmt "~a：周~a 最忙，~a 门" :op-name (car top) (cdr top))
                   (fmt "~a：课表是空的" :op-name)))))

;;; ============ 6c. 形状 D 的 op（交叉引用，返回集合） ============

(defop-cross-ref "conflictOf" ("match")
  (when self
    (setf out (remove-if (lambda (c)
                           (or (eq c self)
                               (/= (course-day c) (course-day self))
                               (< (course-pto c) (course-pfrom self))
                               (< (course-pto self) (course-pfrom c))))
                         tbl))))

(defop-cross-ref "sameTeacher" ("match")
  (when (and self (string/= (course-teacher self) ""))
    (setf out (remove-if (lambda (c)
                           (or (eq c self)
                               (string/= (course-teacher c) (course-teacher self))))
                         tbl))))

(defop-cross-ref "sameName" ("match")
  (when self
    (setf out (remove-if (lambda (c)
                           (or (eq c self)
                               (string/= (course-name c) (course-name self))))
                         tbl))))

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
                     (cons "result" (reverse *results*))
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

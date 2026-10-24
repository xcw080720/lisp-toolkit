;;;; impl.lisp — 第二轮（会议室预订领域，同样 30 op）
;;;; 契约不变：{courses, ops} → {opsText, courses, log, n}
;;;; 每块一条 defop，块首 ;;@@ OP；判据复用 check-crossover.cjs。

;;; ---- JSON 读（复用 lisp-json 写法）----
(defvar *json* "") (defvar *jpos* 0)
(defun jpeek () (when (< *jpos* (length *json*)) (char *json* *jpos*)))
(defun jnext () (prog1 (jpeek) (incf *jpos*)))
(defun jws () (loop for c = (jpeek) while (and c (member c '(#\Space #\Tab #\Newline #\Return))) do (incf *jpos*)))
(defun jexpect (ch) (jws) (unless (eql (jnext) ch) (error "JSON ~s" ch)))
(defun jstring ()
  (jexpect #\")
  (let ((o (make-string-output-stream)))
    (loop for c = (jnext) do
      (cond ((null c) (error "JSON 字符串未闭合"))
            ((eql c #\") (return (get-output-stream-string o)))
            ((eql c #\\) (let ((e (jnext)))
                           (case e (#\" (write-char #\" o)) (#\\ (write-char #\\ o)) (#\/ (write-char #\/ o))
                                 (#\n (write-char #\Newline o)) (#\r (write-char #\Return o)) (#\t (write-char #\Tab o))
                                 (#\b (write-char (code-char 8) o)) (#\f (write-char (code-char 12) o))
                                 (#\u (let ((k (parse-integer (subseq *json* *jpos* (+ *jpos* 4)) :radix 16)))
                                        (incf *jpos* 4) (write-char (code-char k) o)))
                                 (t (error "JSON 转义 ~s" e)))))
            (t (write-char c o))))))
(defun jnumber ()
  (let ((s *jpos*))
    (loop for c = (jpeek) while (and c (or (digit-char-p c) (member c '(#\- #\+ #\. #\e #\E)))) do (incf *jpos*))
    (let ((x (subseq *json* s *jpos*)))
      (if (or (find #\. x) (find #\e x) (find #\E x)) (read-from-string x) (parse-integer x)))))
(defun jliteral ()
  (let ((s (subseq *json* *jpos* (min (length *json*) (+ *jpos* 4)))))
    (cond ((string= s "true") (incf *jpos* 4) :true)
          ((string= s "null") (incf *jpos* 4) :null)
          ((string= s "fals") (incf *jpos* 5) :false)
          (t (error "JSON 字面量")))))
(defun jvalue ()
  (jws)
  (let ((c (jpeek)))
    (cond ((null c) (error "JSON 结束"))
          ((eql c #\{) (jobject)) ((eql c #\[) (jarray)) ((eql c #\") (jstring))
          ((or (eql c #\t) (eql c #\f) (eql c #\n)) (jliteral))
          (t (jnumber)))))
(defun jarray ()
  (jexpect #\[) (jws)
  (if (eql (jpeek) #\]) (progn (incf *jpos*) '())
      (let ((acc '()))
        (loop (push (jvalue) acc) (jws)
              (let ((c (jnext)))
                (cond ((eql c #\,) nil) ((eql c #\]) (return (nreverse acc))) (t (error "数组 ~s" c))))))))
(defun jobject ()
  (jexpect #\{) (jws)
  (if (eql (jpeek) #\}) (progn (incf *jpos*) '())
      (let ((acc '()))
        (loop (jws) (let ((k (jstring))) (jws) (jexpect #\:) (push (cons k (jvalue)) acc)) (jws)
              (let ((c (jnext)))
                (cond ((eql c #\,) nil) ((eql c #\}) (return (nreverse acc))) (t (error "对象 ~s" c))))))))
(defun parse-json (text) (let ((*json* text) (*jpos* 0)) (prog1 (jvalue) (jws))))

;;; ---- JSON 写 ----
(defun json-escape (s)
  (with-output-to-string (o)
    (loop for ch across s for k = (char-code ch) do
      (cond ((eql ch #\") (write-string "\\\"" o)) ((eql ch #\\) (write-string "\\\\" o))
            ((or (< k 32) (> k 126)) (format o "\\u~4,'0x" k)) (t (write-char ch o))))))
(defun object-p (v) (and (consp v) (consp (car v)) (stringp (caar v))))
(defun write-json (v)
  (with-output-to-string (o)
    (labels ((w (x)
               (cond ((eq x :null) (write-string "null" o)) ((null x) (write-string "[]" o))
                     ((eq x :true) (write-string "true" o)) ((eq x :false) (write-string "false" o))
                     ((stringp x) (format o "\"~a\"" (json-escape x)))
                     ((integerp x) (format o "~d" x)) ((floatp x) (format o "~f" x))
                     ((consp x)
                      (if (object-p x)
                          (progn (write-char #\{ o)
                                 (loop for p in x for f = t then nil do (unless f (write-char #\, o))
                                       (format o "\"~a\":" (json-escape (car p))) (w (cdr p)))
                                 (write-char #\} o))
                          (progn (write-char #\[ o)
                                 (loop for (e . r) on x do (w e) (when r (write-char #\, o)))
                                 (write-char #\] o))))
                     (t (write-string "null" o)))))
      (w v))))

;;; ---- 数据模型（会议室：name=会议名 teacher=负责人 location=会议室）----
(defstruct booking name teacher location day pfrom pto weeks tag note)
(defvar *bookings* '())
(defun fmt (c &rest a) (apply #'format nil c a))
(defun cget (al k) (let ((p (assoc k al :test #'string=))) (cond ((null p) nil) ((eq (cdr p) :null) nil) (t (cdr p)))))
(defun str (v) (cond ((null v) "") ((stringp v) v) ((integerp v) (format nil "~d" v)) ((symbolp v) "") (t (format nil "~a" v))))
(defun num (v &optional (d 0)) (cond ((integerp v) v) ((floatp v) (round v)) ((stringp v) (or (ignore-errors (parse-integer v)) d)) (t d)))
(defun clamp (v lo hi) (max lo (min hi v)))
(defun weeks-default () '(("type" . "range") ("from" . 1) ("to" . 16)))
(defun booking-from-alist (al)
  (make-booking :name (str (cget al "name")) :teacher (str (cget al "teacher")) :location (str (cget al "location"))
             :day (num (cget al "day") 1) :pfrom (num (cget al "periodFrom") 1) :pto (num (cget al "periodTo") 1)
             :weeks (cget al "weeks") :tag (let ((x (cget al "tag"))) (and (stringp x) x)) :note (str (cget al "note"))))
(defun booking-alist (c)
  (list (cons "name" (booking-name c)) (cons "teacher" (booking-teacher c)) (cons "location" (booking-location c))
        (cons "day" (booking-day c)) (cons "periodFrom" (booking-pfrom c)) (cons "periodTo" (booking-pto c))
        (cons "weeks" (or (booking-weeks c) :null)) (cons "tag" (or (booking-tag c) :null)) (cons "note" (booking-note c))))
(defun clone-room (c)
  (make-booking :name (booking-name c) :teacher (booking-teacher c) :location (booking-location c) :day (booking-day c)
             :pfrom (booking-pfrom c) :pto (booking-pto c) :weeks (copy-tree (booking-weeks c)) :tag (booking-tag c) :note (booking-note c)))
(defun matched (pat) (let ((p (str pat))) (remove-if-not (lambda (c) (search p (booking-name c) :test #'char=)) *bookings*)))

;;; ---- defop ----
(defstruct op name fields fn)
(defvar *ops* (make-hash-table :test #'equal))
(defvar *op-order* '())
(defun register (n f fn) (setf (gethash n *ops*) (make-op :name n :fields f :fn fn)) (push n *op-order*) n)
(defun op-names () (reverse *op-order*))
(defun fld (op k) (let ((p (assoc k op :test #'string=))) (and p (cdr p))))
(defun given-p (v) (and (not (null v)) (not (eq v :null))))
(defun missing (op fs) (remove-if (lambda (k) (given-p (fld op k))) fs))
(defmacro defop (n fields &body body) `(register ,n ',fields (lambda (op) ,@body)))
(defmacro defop-each (n fields (v) &body body)
  `(defop ,n ,fields
     (let* ((pat (fld op "match")) (hits (matched pat)))
       (dolist (c hits) (let ((,v c)) ,@body))
       (if hits (values (length hits) (fmt "~a：命中 ~a 场会议" ,n (length hits)))
           (values 0 (fmt "~a：没有匹配的会议" ,n))))))
(defun run-op (op)
  (let* ((nm (str (fld op "op"))) (spec (gethash nm *ops*)))
    (if (null spec) (values 0 (fmt "未知 op ~a" nm))
        (let ((ms (missing op (op-fields spec))))
          (if ms (values 0 (fmt "~a：参数不全（缺 ~{~a~^、~}），不执行" nm ms))
              (funcall (op-fn spec) op))))))

;;; ---- 30 个 op ----

;;;@@ OP setDay A
(defop-each "setDay" ("match" "day") (c) (setf (booking-day c) (clamp (num (fld op "day") 1) 1 7)))

;;;@@ OP setPeriodFrom A
(defop-each "setPeriodFrom" ("match" "from") (c)
  (setf (booking-pfrom c) (max 1 (num (fld op "from") 1)))
  (setf (booking-pto c) (max (booking-pfrom c) (booking-pto c))))

;;;@@ OP setPeriodTo A
(defop-each "setPeriodTo" ("match" "to") (c)
  (setf (booking-pto c) (max (booking-pfrom c) (max 1 (num (fld op "to") 1)))))

;;;@@ OP setTeacher A
(defop-each "setTeacher" ("match" "teacher") (c) (setf (booking-teacher c) (str (fld op "teacher"))))

;;;@@ OP setLocation A
(defop-each "setLocation" ("match" "location") (c) (setf (booking-location c) (str (fld op "location"))))

;;;@@ OP setNote A
(defop-each "setNote" ("match" "note") (c) (setf (booking-note c) (str (fld op "note"))))

;;;@@ OP setWeeks A
(defop-each "setWeeks" ("match" "weeks") (c)
  (let ((w (fld op "weeks")))
    (setf (booking-weeks c) (if (and (consp w) (string= "range" (str (cget w "type")))) w (weeks-default)))))

;;;@@ OP clearNote A
(defop-each "clearNote" ("match") (c) (setf (booking-note c) ""))

;;;@@ OP bumpDay A
(defop-each "bumpDay" ("match" "delta") (c)
  (setf (booking-day c) (clamp (+ (booking-day c) (num (fld op "delta") 0)) 1 7)))

;;;@@ OP bumpPeriod A
(defop-each "bumpPeriod" ("match" "delta") (c)
  (let* ((d (num (fld op "delta") 0)) (f (max 1 (+ (booking-pfrom c) d))))
    (setf (booking-pfrom c) f) (setf (booking-pto c) (max f (+ (booking-pto c) d)))))

;;;@@ OP moveDay B
(defop "moveDay" ("match" "day")
  (let* ((hits (matched (fld op "match"))) (d (clamp (num (fld op "day") 1) 1 7)))
    (dolist (c hits)
      (let* ((delta (- d (booking-day c))) (f (max 1 (+ (booking-pfrom c) delta))))
        (setf (booking-day c) d) (setf (booking-pfrom c) f) (setf (booking-pto c) (max f (+ (booking-pto c) delta)))))
    (values (length hits) (fmt "moveDay：~a 场移到周~a" (length hits) d))))

;;;@@ OP swapTeacher B
(defop "swapTeacher" ("match" "with")
  (let* ((a (matched (fld op "match"))) (b (matched (fld op "with"))))
    (if (and (= 1 (length a)) (= 1 (length b)) (not (eq (car a) (car b))))
        (let ((x (car a)) (y (car b)))
          (rotatef (booking-teacher x) (booking-teacher y))
          (values 2 "swapTeacher：两位负责人互换"))
        (values 0 "swapTeacher：两侧各需恰好 1 场，不执行"))))

;;;@@ OP copyWeeks B
(defop "copyWeeks" ("match" "with")
  (let* ((a (matched (fld op "match"))) (b (matched (fld op "with"))))
    (if (and (= 1 (length a)) (= 1 (length b)) (not (eq (car a) (car b))))
        (progn (setf (booking-weeks (car b)) (copy-tree (booking-weeks (car a))))
               (values 1 "copyWeeks：A 的周次抄给 B"))
        (values 0 "copyWeeks：两侧各需恰好 1 场，不执行"))))

;;;@@ OP mergeCourses B
(defop "mergeCourses" ()
  (let ((groups (make-hash-table :test #'equal)) (order '()))
    (dolist (c *bookings*)
      (unless (gethash (booking-name c) groups) (push (booking-name c) order))
      (push c (gethash (booking-name c) groups)))
    (let ((removed 0) (keep '()))
      (dolist (n (reverse order))
        (let* ((g (nreverse (gethash n groups))) (head (car g)))
          (when (> (length g) 1)
            (let ((rs (mapcar #'booking-weeks g)))
              (when (every (lambda (w) (and (consp w) (string= "range" (str (cget w "type"))))) rs)
                (setf (booking-weeks head)
                      (list (cons "type" "range")
                            (cons "from" (apply #'min (mapcar (lambda (w) (num (cget w "from") 1)) rs)))
                            (cons "to" (apply #'max (mapcar (lambda (w) (num (cget w "to") 16)) rs)))))))
            (incf removed (1- (length g))))
          (push head keep)))
      (setf *bookings* (nreverse keep))
      (values removed (fmt "mergeCourses：同名合并，去掉 ~a 场" removed)))))

;;;@@ OP splitCourse B
(defop "splitCourse" ("match")
  (let ((hits (matched (fld op "match"))))
    (if (/= 1 (length hits)) (values 0 "splitCourse：需要恰好命中 1 场，不执行")
        (let* ((c (car hits)) (pf (booking-pfrom c)) (pt (booking-pto c)))
          (if (<= pt pf) (values 0 "splitCourse：只有 1 节，不拆")
              (let* ((mid (floor (+ pf pt) 2)) (x (clone-room c)))
                (setf (booking-pfrom x) (1+ mid) (booking-pto x) pt)
                (setf (booking-pto c) mid)
                (setf *bookings* (append *bookings* (list x)))
                (values 1 (fmt "splitCourse：拆成 ~a–~a 与 ~a–~a" pf mid (1+ mid) pt))))))))

;;;@@ OP rotateDay B
(defop "rotateDay" ()
  (let ((n (length *bookings*)))
    (dolist (c *bookings*) (setf (booking-day c) (1+ (mod (booking-day c) 7))))
    (values n (fmt "rotateDay：~a 场整周环移" n))))

;;;@@ OP trimWeeks B
(defop-each "trimWeeks" ("match" "from" "to") (c)
  (let* ((ws (or (booking-weeks c) (weeks-default)))
         (lo (num (cget ws "from") 1)) (hi (num (cget ws "to") 16))
         (f (num (fld op "from") lo)) (to (num (fld op "to") hi))
         (a (max lo (min f to))) (b (min hi (max f to))))
    (when (<= a b) (setf (booking-weeks c) (list (cons "type" "range") (cons "from" a) (cons "to" b))))))

;;;@@ OP padWeeks B
(defop-each "padWeeks" ("match" "to") (c)
  (let* ((ws (or (booking-weeks c) (weeks-default)))
         (lo (num (cget ws "from") 1)) (hi (max (num (cget ws "to") 16) (num (fld op "to") 16))))
    (setf (booking-weeks c) (list (cons "type" "range") (cons "from" lo) (cons "to" hi)))))

;;;@@ OP renumber B
(defop "renumber" ()
  (let ((changed 0))
    (dotimes (d 7)
      (let* ((day (1+ d))
             (cs (stable-sort (remove-if-not (lambda (c) (= (booking-day c) day)) (copy-list *bookings*)) #'< :key #'booking-pfrom))
             (cur 1))
        (dolist (c cs)
          (let ((span (- (booking-pto c) (booking-pfrom c))))
            (unless (= (booking-pfrom c) cur) (incf changed))
            (setf (booking-pfrom c) cur) (setf (booking-pto c) (+ cur span)) (setf cur (1+ (booking-pto c)))))))
    (values changed (fmt "renumber：~a 场节次重排" changed))))

;;;@@ OP sortByName B
(defop "sortByName" ()
  (let* ((old *bookings*) (new (stable-sort (copy-list *bookings*) #'string< :key #'booking-name)))
    (setf *bookings* new)
    (values (loop for a in old for b in new count (not (eq a b))) "sortByName：按会议名排序")))

;;;@@ OP bulkMark C
(defop-each "bulkMark" ("match" "tag") (c) (setf (booking-tag c) (str (fld op "tag"))))

;;;@@ OP bulkClear C
(defop-each "bulkClear" ("match") (c) (setf (booking-tag c) nil))

;;;@@ OP bulkShift C
(defop "bulkShift" ("delta")
  (let* ((d (num (fld op "delta") 0)) (pat (fld op "match"))
         (hits (if (given-p pat) (matched pat) (copy-list *bookings*))))
    (dolist (c hits)
      (let ((f (max 1 (+ (booking-pfrom c) d))))
        (setf (booking-pfrom c) f) (setf (booking-pto c) (max f (+ (booking-pto c) d)))))
    (values (length hits) (fmt "bulkShift：~a 场平移 ~a" (length hits) d))))

;;;@@ OP bulkCopy C
(defop "bulkCopy" ("match" "toDay")
  (let* ((hits (matched (fld op "match"))) (d (clamp (num (fld op "toDay") 1) 1 7)))
    (dolist (c hits)
      (let ((x (clone-room c))) (setf (booking-day x) d) (setf *bookings* (append *bookings* (list x)))))
    (values (length hits) (fmt "bulkCopy：~a 场复制到周~a" (length hits) d))))

;;;@@ OP filterDay C
(defop "filterDay" ("day")
  (let* ((d (clamp (num (fld op "day") 1) 1 7))
         (gone (remove-if-not (lambda (c) (/= (booking-day c) d)) *bookings*)))
    (setf *bookings* (set-difference *bookings* gone :test #'eq))
    (values (length gone) (fmt "filterDay：只留周~a" d))))

;;;@@ OP dropWeek C
(defop "dropWeek" ("week")
  (let ((w (num (fld op "week") 1)) (n 0))
    (dolist (c *bookings*)
      (let* ((ws (or (booking-weeks c) (weeks-default)))
             (lo (num (cget ws "from") 1)) (hi (num (cget ws "to") 16)))
        (cond ((or (< w lo) (> w hi)) nil)
              ((= lo hi) nil)
              ((= w lo) (setf (booking-weeks c) (list (cons "type" "range") (cons "from" (1+ lo)) (cons "to" hi))) (incf n))
              (t (setf (booking-weeks c) (list (cons "type" "range") (cons "from" lo) (cons "to" (1- w)))) (incf n)))))
    (values n (fmt "dropWeek：删第 ~a 周" w))))

;;;@@ OP keepWeek C
(defop "keepWeek" ("week")
  (let ((w (clamp (num (fld op "week") 1) 1 52)) (n 0))
    (dolist (c *bookings*)
      (setf (booking-weeks c) (list (cons "type" "range") (cons "from" w) (cons "to" w)))
      (incf n))
    (values n (fmt "keepWeek：只留第 ~a 周" w))))

;;; ============ 6. 执行与输出 ============
;;; ---- 执行与输出 ----
(defun run-all (ops)
  (let ((log '()) (n 0) (i 0))
    (dolist (op ops)
      (multiple-value-bind (cnt msg) (run-op op)
        (incf n (or cnt 0))
        (when (and msg (string/= msg "")) (incf i) (push (fmt "~d) ~a" i msg) log))))
    (values (nreverse log) n)))
(defun unknown-op (ops)
  (loop for op in ops for nm = (str (fld op "op")) when (null (gethash nm *ops*)) return nm))
(defun emit (opstext rooms log n)
  (write-string (write-json (list (cons "opsText" opstext) (cons "courses" (mapcar #'booking-alist rooms))
                                  (cons "log" log) (cons "n" n)))))
(defun read-text (path)
  (with-open-file (in path :element-type '(unsigned-byte 8))
    (let ((buf (make-array (file-length in) :element-type '(unsigned-byte 8))))
      (read-sequence buf in)
      (let ((s (sb-ext:octets-to-string buf :external-format :utf-8)))
        (if (and (plusp (length s)) (char= (char s 0) #\uFEFF)) (subseq s 1) s)))))
(defun main ()
  (let* ((path (first (last sb-ext:*posix-argv*)))
         (root (parse-json (read-text path)))
         (raw (cget root "courses"))
         (*bookings* (mapcar #'booking-from-alist raw))
         (ops (let ((o (cget root "ops"))) (and (consp o) o))))
    (cond ((null ops) (emit "" *bookings* '() 0))
          ((unknown-op ops) (emit "" *bookings* (list (fmt "1) 拒绝：未知 op ~a" (unknown-op ops))) 0))
          (t (multiple-value-bind (log n) (run-all ops) (emit (write-json ops) *bookings* log n))))))
(main)
(finish-output)

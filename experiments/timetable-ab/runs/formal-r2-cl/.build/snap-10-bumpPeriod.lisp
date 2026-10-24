;;;; formal-r2-cl — 会议室预订 30 op 执行器（defop 宏单源 + 手写 JSON）
;;;; 领域：会议室预订。name=会议名 teacher=负责人 location=会议室，其余字段同契约。
;;;; 契约：in {courses:[...], ops:[...]}  out {opsText, courses, log, n}
;;;; 规则：未知 op 整批拒绝；缺必填字段跳过该 op 并记日志；日志 k) 编号；n=改动数之和；day 夹 1..7

;;; ============ 1. JSON 读写（手写，零依赖）
(defstruct (jobj (:constructor %mkobj (pairs))) (pairs nil))
(defstruct (jarr (:constructor %mkarr (items))) (items nil))

(defun j-obj (&rest kvs)
  (%mkobj (loop for (k v) on kvs by #'cddr collect (cons k v))))

(defvar *js* "")
(defvar *ji* 0)

(defun j-peek () (and (< *ji* (length *js*)) (char *js* *ji*)))
(defun j-adv () (prog1 (j-peek) (incf *ji*)))
(defun j-ch= (ch) (let ((c (j-peek))) (and c (char= c ch))))
(defun j-ws ()
  (loop while (let ((c (j-peek))) (and c (member c '(#\Space #\Tab #\Newline #\Return))))
        do (incf *ji*)))
(defun j-fail (msg) (error "JSON 解析失败：~a（位置 ~a）" msg *ji*))

(defun j-parse (text) (let ((*js* text) (*ji* 0)) (j-parse-value)))

(defun j-parse-value ()
  (j-ws)
  (let ((c (j-peek)))
    (cond ((null c) (j-fail "提前结束"))
          ((char= c #\{) (j-parse-obj))
          ((char= c #\[) (j-parse-arr))
          ((char= c #\") (j-parse-str))
          ((char= c #\t) (j-lit "true" :true))
          ((char= c #\f) (j-lit "false" :false))
          ((char= c #\n) (j-lit "null" :null))
          (t (j-parse-num)))))

(defun j-lit (word val)
  (unless (string= (subseq *js* *ji* (min (length *js*) (+ *ji* (length word)))) word)
    (j-fail (format nil "期望 ~a" word)))
  (incf *ji* (length word))
  val)

(defun j-parse-obj ()
  (j-adv)
  (let ((pairs '()))
    (loop
      (j-ws)
      (cond
        ((j-ch= #\}) (j-adv) (return))
        (t
         (let ((k (j-parse-str)))
           (j-ws)
           (unless (j-ch= #\:) (j-fail "期望冒号"))
           (j-adv)
           (push (cons k (j-parse-value)) pairs))
         (j-ws)
         (cond ((j-ch= #\,) (j-adv))
               ((j-ch= #\}) (j-adv) (return))
               (t (j-fail "期望逗号或右花括号"))))))
    (%mkobj (nreverse pairs))))

(defun j-parse-arr ()
  (j-adv)
  (let ((items '()))
    (loop
      (j-ws)
      (cond
        ((j-ch= #\]) (j-adv) (return))
        (t
         (push (j-parse-value) items)
         (j-ws)
         (cond ((j-ch= #\,) (j-adv))
               ((j-ch= #\]) (j-adv) (return))
               (t (j-fail "期望逗号或右方括号"))))))
    (%mkarr (nreverse items))))

(defun j-parse-str ()
  (j-adv)
  (let ((out (make-string-output-stream)))
    (loop
      (let ((c (j-adv)))
        (cond ((null c) (j-fail "字符串未闭合"))
              ((char= c #\") (return (get-output-stream-string out)))
              ((char= c #\\) (j-escape-into out (j-adv)))
              (t (write-char c out)))))))

(defun j-hex4 ()
  (let ((s (subseq *js* *ji* (min (length *js*) (+ *ji* 4)))))
    (unless (= (length s) 4) (j-fail "\\u 缺位"))
    (incf *ji* 4)
    (parse-integer s :radix 16)))

(defun j-escape-into (out c)
  (cond ((null c) (j-fail "转义未完成"))
        ((char= c #\u)
         (let ((code (j-hex4)))
           (cond ((<= #xD800 code #xDBFF)
                  (if (and (j-ch= #\\) (< (1+ *ji*) (length *js*))
                           (char= (char *js* (1+ *ji*)) #\u))
                      (progn (incf *ji* 2)
                             (let ((lo (j-hex4)))
                               (write-char (code-char (+ #x10000 (ash (- code #xD800) 10)
                                                         (- lo #xDC00)))
                                           out)))
                      (write-char (code-char code) out)))
                 (t (write-char (code-char code) out)))))
        ((char= c #\n) (write-char #\Newline out))
        ((char= c #\t) (write-char #\Tab out))
        ((char= c #\r) (write-char #\Return out))
        ((char= c #\b) (write-char (code-char 8) out))
        ((char= c #\f) (write-char (code-char 12) out))
        ((char= c #\/) (write-char #\/ out))
        ((char= c #\\) (write-char #\\ out))
        ((char= c #\") (write-char #\" out))
        (t (write-char c out))))

(defun j-parse-num ()
  (let ((start *ji*))
    (loop for c = (j-peek) while (and c (find c "-+.eE0123456789")) do (incf *ji*))
    (let ((s (subseq *js* start *ji*)))
      (when (string= s "") (j-fail "非法数字"))
      (if (find-if (lambda (c) (find c ".eE")) s)
          (let ((*read-eval* nil)) (read-from-string s))
          (parse-integer s)))))

(defun j-escape-str (s out)
  (write-char #\" out)
  (loop for ch across s
        for code = (char-code ch) do
        (cond ((char= ch #\") (write-string "\\\"" out))
              ((char= ch #\\) (write-string "\\\\" out))
              ((< code 32) (format out "\\u~4,'0X" code))
              ((> code 127)
               (if (> code #xFFFF)
                   (format out "\\u~4,'0X\\u~4,'0X"
                           (+ #xD800 (ash (- code #x10000) -10))
                           (+ #xDC00 (logand (- code #x10000) #x3FF)))
                   (format out "\\u~4,'0X" code)))
              (t (write-char ch out))))
  (write-char #\" out))

(defun j-emit (v out)
  (cond ((eq v :true) (write-string "true" out))
        ((eq v :false) (write-string "false" out))
        ((or (eq v :null) (null v)) (write-string "null" out))
        ((stringp v) (j-escape-str v out))
        ((numberp v) (format out "~a" v))
        ((jobj-p v)
         (write-char #\{ out)
         (loop for (k . val) in (jobj-pairs v) for first = t then nil
               do (unless first (write-char #\, out))
                  (j-escape-str k out) (write-char #\: out) (j-emit val out))
         (write-char #\} out))
        ((jarr-p v)
         (write-char #\[ out)
         (loop for (item . rest) on (jarr-items v)
               do (j-emit item out) (when rest (write-char #\, out)))
         (write-char #\] out))
        (t (error "无法输出 ~s" v))))

(defun jget (o k &optional (default :missing))
  (if (jobj-p o)
      (let ((p (assoc k (jobj-pairs o) :test #'string=)))
        (if p (cdr p) default))
      default))

(defun jhas (o k) (and (jobj-p o) (not (eq (jget o k) :missing))))

(defun jset (o k v)
  (let ((p (assoc k (jobj-pairs o) :test #'string=)))
    (if p
        (setf (cdr p) v)
        (setf (jobj-pairs o) (append (jobj-pairs o) (list (cons k v)))))
    v))

(defun j-eq (a b)
  (cond ((and (stringp a) (stringp b)) (string= a b))
        ((and (numberp a) (numberp b)) (= a b))
        ((and (jobj-p a) (jobj-p b))
         (and (= (length (jobj-pairs a)) (length (jobj-pairs b)))
              (every (lambda (p)
                       (let ((q (assoc (car p) (jobj-pairs b) :test #'string=)))
                         (and q (j-eq (cdr p) (cdr q)))))
                     (jobj-pairs a))))
        ((and (jarr-p a) (jarr-p b))
         (and (= (length (jarr-items a)) (length (jarr-items b)))
              (every #'j-eq (jarr-items a) (jarr-items b))))
        ((eq a b) t)
        (t nil)))

;;; ============ 2. 记录（会议室预订）与取值工具
(defstruct (course (:constructor mk-course (&key name teacher location day pfrom pto weeks tag note)))
  (name "") (teacher "") (location "") (day 1) (pfrom 1) (pto 2) (weeks nil) (tag :null) (note ""))

(defun j-str (v) (cond ((stringp v) v) ((numberp v) (format nil "~a" v)) (t "")))
(defun j-int (v &optional (d 0)) (if (numberp v) (round v) d))
(defun clamp (v lo hi) (max lo (min hi v)))
(defun mk-range (lo hi) (j-obj "type" "range" "from" lo "to" hi))

(defun rng (w)
  (when (and (jobj-p w) (string= (j-str (jget w "type" "")) "range"))
    (values (j-int (jget w "from" 1) 1) (j-int (jget w "to" 2) 2))))

(defun course-of (j)
  (let ((w (jget j "weeks" :null))
        (tg (jget j "tag" :null)))
    (mk-course :name (j-str (jget j "name" ""))
               :teacher (j-str (jget j "teacher" ""))
               :location (j-str (jget j "location" ""))
               :day (j-int (jget j "day" 1) 1)
               :pfrom (j-int (jget j "periodFrom" 1) 1)
               :pto (j-int (jget j "periodTo" 2) 2)
               :weeks (if (eq w :missing) (mk-range 1 16) w)
               :tag (cond ((eq tg :missing) :null) ((null tg) :null) (t tg))
               :note (j-str (jget j "note" "")))))

(defun course-to-j (c)
  (j-obj "name" (course-name c)
         "teacher" (course-teacher c)
         "location" (course-location c)
         "day" (course-day c)
         "periodFrom" (course-pfrom c)
         "periodTo" (course-pto c)
         "weeks" (course-weeks c)
         "tag" (course-tag c)
         "note" (course-note c)))

(defun hit (c m) (or (not (stringp m)) (string= m "") (string= (course-name c) m)))
(defun sel (cs m) (remove-if-not (lambda (c) (hit c m)) cs))
(defun show-match (m) (if (or (not (stringp m)) (string= m "")) "全部" m))

;;; ============ 3. defop 单源：注册表 + 必填字段 + 参数绑定
(defvar *op-table* (make-hash-table :test #'equal))

(defparameter *arg-defaults*
  '(("match" . "") ("with" . "") ("teacher" . "") ("location" . "") ("note" . "")
    ("tag" . "") ("day" . 1) ("from" . 1) ("to" . 2) ("delta" . 0)
    ("week" . 1) ("toDay" . 1) ("weeks" . :null)))

(defun arg-default (name)
  (let ((p (assoc name *arg-defaults* :test #'string=))) (if p (cdr p) nil)))

(defun op-arg (op name)
  (let ((v (jget op name :missing)))
    (if (or (eq v :missing) (eq v :null)) (arg-default name) v)))

(defmacro defop (op-name group reqs &body body)
  `(setf (gethash (string-downcase ,op-name) *op-table*)
         (list :group ,group :req ',reqs
               :fn (lambda (ctx op)
                     (declare (ignorable ctx op))
                     (let ,(mapcar (lambda (r) `(,(intern (string-upcase r)) (op-arg op ,r))) reqs)
                       (declare (ignorable ,@(mapcar (lambda (r) (intern (string-upcase r))) reqs)))
                       ,@body)))))

;;; ============ 4. 执行器内核：上下文 / 分派 / 输出
(defstruct (ctx (:constructor mk-ctx (courses))) (courses nil) (n 0) (log nil) (ops-text nil))

(defun note (ctx text) (push text (ctx-log ctx)))

(defun apply-one (ctx op)
  (let* ((name (j-str (jget op "op" "")))
         (entry (gethash (string-downcase name) *op-table*))
         (missing (and entry (remove-if (lambda (r) (jhas op r)) (getf entry :req)))))
    (cond
      ((null entry) (note ctx (format nil "未知 op ~a，未执行" name)))
      (missing (note ctx (format nil "跳过 ~a：缺必填字段 ~{~a~^、~}" name missing)))
      (t (multiple-value-bind (dn text cs) (funcall (getf entry :fn) ctx op)
           (setf (ctx-courses ctx) cs)
           (incf (ctx-n ctx) dn)
           (note ctx text)
           (push (format nil "~a -> 改 ~a 处" name dn) (ctx-ops-text ctx)))))))

(defun run-batch (input)
  (let* ((carr (jget input "courses" nil))
         (oarr (jget input "ops" nil))
         (cjs (if (jarr-p carr) (jarr-items carr) '()))
         (ojs (if (jarr-p oarr) (jarr-items oarr) '()))
         (ctx (mk-ctx (mapcar #'course-of cjs)))
         (unknown (remove-if (lambda (o) (gethash (string-downcase (j-str (jget o "op" ""))) *op-table*)) ojs)))
    (if unknown
        (note ctx (format nil "未知 op：~{~a~^、~}，整批拒绝（~a 条 op 全不执行）"
                          (mapcar (lambda (o) (j-str (jget o "op" ""))) unknown) (length ojs)))
        (dolist (o ojs) (apply-one ctx o)))
    ctx))

(defun out-json (ctx)
  (j-obj "opsText" (format nil "~{~a~%~}" (reverse (ctx-ops-text ctx)))
         "courses" (%mkarr (mapcar #'course-to-j (ctx-courses ctx)))
         "log" (%mkarr (loop for line in (reverse (ctx-log ctx)) for k from 1
                             collect (format nil "~a) ~a" k line)))
         "n" (ctx-n ctx)))

;;; ============ 5. 30 个 op（A 组纯横切 / B 组复合 / C 组批处理）
;;;@@ OP setDay A
;; 不变量：命中课 day 夹到 1..7，其余字段不动
(defop "setDay" "A" ("match" "day")
  (let ((k 0) (nv (clamp (j-int day 1) 1 7)))
    (dolist (c (ctx-courses ctx))
      (when (hit c match)
        (unless (eql nv (course-day c)) (incf k) (setf (course-day c) nv))))
    (values k (format nil "setDay ~a day→~a，改 ~a 门" (show-match match) nv k) (ctx-courses ctx))))

;;;@@ OP setPeriodFrom A
;; 不变量：periodFrom 抬到 [1, periodTo]，periodTo 不动
(defop "setPeriodFrom" "A" ("match" "from")
  (let ((k 0))
    (dolist (c (ctx-courses ctx))
      (when (hit c match)
        (let ((nv (clamp (j-int from 1) 1 (max 1 (min 12 (course-pto c))))))
          (unless (eql nv (course-pfrom c)) (incf k) (setf (course-pfrom c) nv)))))
    (values k (format nil "setPeriodFrom ~a from=~a，改 ~a 门" (show-match match) from k)
            (ctx-courses ctx))))

;;;@@ OP setPeriodTo A
;; 不变量：periodTo 夹到 [periodFrom, 12]，periodFrom 不动
(defop "setPeriodTo" "A" ("match" "to")
  (let ((k 0))
    (dolist (c (ctx-courses ctx))
      (when (hit c match)
        (let ((nv (clamp (j-int to 2) (course-pfrom c) 12)))
          (unless (eql nv (course-pto c)) (incf k) (setf (course-pto c) nv)))))
    (values k (format nil "setPeriodTo ~a to=~a，改 ~a 门" (show-match match) to k)
            (ctx-courses ctx))))

;;;@@ OP setTeacher A
;; 不变量：命中课负责人改成给定值，值相等不计改动
(defop "setTeacher" "A" ("match" "teacher")
  (let ((k 0) (nv (j-str teacher)))
    (dolist (c (ctx-courses ctx))
      (when (hit c match)
        (unless (string= nv (course-teacher c)) (incf k) (setf (course-teacher c) nv))))
    (values k (format nil "setTeacher ~a → ~a，改 ~a 门" (show-match match) nv k)
            (ctx-courses ctx))))

;;;@@ OP setLocation A
;; 不变量：命中课会议室改成给定值
(defop "setLocation" "A" ("match" "location")
  (let ((k 0) (nv (j-str location)))
    (dolist (c (ctx-courses ctx))
      (when (hit c match)
        (unless (string= nv (course-location c)) (incf k) (setf (course-location c) nv))))
    (values k (format nil "setLocation ~a → ~a，改 ~a 门" (show-match match) nv k)
            (ctx-courses ctx))))

;;;@@ OP setNote A
;; 不变量：命中课备注改成给定值
(defop "setNote" "A" ("match" "note")
  (let ((k 0) (nv (j-str note)))
    (dolist (c (ctx-courses ctx))
      (when (hit c match)
        (unless (string= nv (course-note c)) (incf k) (setf (course-note c) nv))))
    (values k (format nil "setNote ~a → ~a，改 ~a 门" (show-match match) nv k)
            (ctx-courses ctx))))

;;;@@ OP setWeeks A
;; 不变量：命中课周次整体换成给定区间对象（保持 type/from/to 键序）
(defop "setWeeks" "A" ("match" "weeks")
  (let ((k 0))
    (if (not (jobj-p weeks))
        (values 0 "setWeeks 的 weeks 不是区间对象，跳过" (ctx-courses ctx))
        (progn
          (dolist (c (ctx-courses ctx))
            (when (hit c match)
              (unless (j-eq (course-weeks c) weeks) (incf k) (setf (course-weeks c) weeks))))
          (values k (format nil "setWeeks ~a 周次已替换，改 ~a 门" (show-match match) k)
                  (ctx-courses ctx))))))

;;;@@ OP clearNote A
;; 不变量：命中课备注清成空串
(defop "clearNote" "A" ("match")
  (let ((k 0))
    (dolist (c (ctx-courses ctx))
      (when (hit c match)
        (unless (string= "" (course-note c)) (incf k) (setf (course-note c) ""))))
    (values k (format nil "clearNote ~a，清 ~a 门" (show-match match) k) (ctx-courses ctx))))

;;;@@ OP bumpDay A
;; 不变量：命中课 day+delta 后夹到 1..7
(defop "bumpDay" "A" ("match" "delta")
  (let ((k 0) (d (j-int delta 0)))
    (dolist (c (ctx-courses ctx))
      (when (hit c match)
        (let ((nv (clamp (+ (course-day c) d) 1 7)))
          (unless (eql nv (course-day c)) (incf k) (setf (course-day c) nv)))))
    (values k (format nil "bumpDay ~a delta=~a，改 ~a 门" (show-match match) d k) (ctx-courses ctx))))

;;;@@ OP bumpPeriod A
;; 不变量：命中课 from/to 同加 delta 后各夹到 1..12，且 to≥from
(defop "bumpPeriod" "A" ("match" "delta")
  (let ((k 0) (d (j-int delta 0)))
    (dolist (c (ctx-courses ctx))
      (when (hit c match)
        (let* ((nf (clamp (+ (course-pfrom c) d) 1 12))
               (nt (max nf (clamp (+ (course-pto c) d) 1 12))))
          (unless (and (eql nf (course-pfrom c)) (eql nt (course-pto c)))
            (incf k) (setf (course-pfrom c) nf (course-pto c) nt)))))
    (values k (format nil "bumpPeriod ~a delta=~a，改 ~a 门" (show-match match) d k)
            (ctx-courses ctx))))

;;; ============ 6. 执行器：读入 JSON → 跑 op → 输出 JSON
(defun find-input ()
  (let* ((args (rest *posix-argv*))
         (cands (remove-if-not (lambda (a) (and (stringp a) (search ".json" a))) args)))
    (or (first (last cands)) (error "缺输入 JSON 文件"))))

(defun slurp (path)
  (with-open-file (in path :direction :input :external-format :utf-8)
    (let ((buf (make-string (file-length in))))
      (subseq buf 0 (read-sequence buf in)))))

(let* ((path (find-input))
       (input (j-parse (slurp path)))
       (ctx (run-batch input)))
  (j-emit (out-json ctx) *standard-output*)
  (terpri)
  (finish-output))

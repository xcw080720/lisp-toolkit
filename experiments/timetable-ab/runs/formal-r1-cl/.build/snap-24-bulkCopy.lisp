;;; impl.lisp — 交叉点实验 · 臂 2（CL 臂，正式轮）
;;; 单源：一条 op = 一条 (defop ...) 表单；校验 / 可用名册 / 分发 / 文案 / 日志序号由宏长出。
;;; JSON 读写手写（读：递归下降；写：非 ASCII 一律 \uXXXX，避免 Windows 管道编码坑）。

(defvar *courses* '())          ; 当前课程表（plist 列表，就地改写）
(defvar *n-changes* 0)          ; 各 op 改动数之和
(defvar *log-rev* '())          ; 日志（逆序）
(defvar *ops-text-rev* '())     ; opsText（逆序）
(defvar *op-table* (make-hash-table :test #'equal))  ; op 名 -> (组 . 执行体)
(defvar *op-names* '())                              ; 可用名册（由 defop 长出）

;;; ============ 1. 手写 JSON 读
(defun slurp (path)
  (with-open-file (s path :external-format :utf-8 :element-type 'character)
    (let ((out (make-string-output-stream)))
      (loop for ch = (read-char s nil :eof) until (eq ch :eof) do (write-char ch out))
      (get-output-stream-string out))))

(defun jparse (str)
  (let ((i 0) (n (length str)))
    (labels ((cur () (and (< i n) (char str i)))
             (ws () (loop while (and (< i n) (member (char str i) '(#\Space #\Tab #\Newline #\Return))) do (incf i)))
             (pval ()
               (ws)
               (let ((c (cur)))
                 (cond ((null c) (error "json: 意外结束"))
                       ((char= c #\{) (pobj))
                       ((char= c #\[) (parr))
                       ((char= c #\") (pstr))
                       ((char= c #\t) (incf i 4) :true)
                       ((char= c #\f) (incf i 5) :false)
                       ((char= c #\n) (incf i 4) :null)
                       (t (pnum)))))
             (pobj ()
               (incf i)
               (ws)
               (if (eql (cur) #\})
                   (progn (incf i) '())
                   (let ((acc '()))
                     (loop
                       (ws)
                       (let ((k (pstr)))
                         (ws) (incf i)
                         (push (intern (string-upcase k) :keyword) acc)
                         (push (pval) acc))
                       (ws)
                       (let ((c (cur))) (incf i) (when (char= c #\}) (return))))
                     (nreverse acc))))
             (parr ()
               (incf i)
               (ws)
               (if (eql (cur) #\])
                   (progn (incf i) '())
                   (let ((acc '()))
                     (loop
                       (push (pval) acc)
                       (ws)
                       (let ((c (cur))) (incf i) (when (char= c #\]) (return))))
                     (nreverse acc))))
             (pstr ()
               (incf i)
               (let ((out (make-string-output-stream)))
                 (loop
                   (let ((c (char str i))) (incf i)
                     (cond ((char= c #\") (return))
                           ((char= c #\\)
                            (let ((e (char str i))) (incf i)
                              (case e
                                (#\" (write-char #\" out))
                                (#\\ (write-char #\\ out))
                                (#\/ (write-char #\/ out))
                                (#\b (write-char #\Backspace out))
                                (#\f (write-char #\Page out))
                                (#\n (write-char #\Newline out))
                                (#\r (write-char #\Return out))
                                (#\t (write-char #\Tab out))
                                (#\u (let ((code (parse-integer str :start i :end (+ i 4) :radix 16)))
                                       (incf i 4)
                                       (write-char (code-char code) out))))))
                           (t (write-char c out)))))
                 (get-output-stream-string out)))
             (pnum ()
               (let ((start i))
                 (loop while (and (< i n) (find (char str i) "-+.eE0123456789")) do (incf i))
                 (let ((tok (subseq str start i)))
                   (if (find-if (lambda (c) (find c ".eE")) tok)
                       (read-from-string tok)
                       (parse-integer tok))))))
      (pval))))

;;; ============ 2. 手写 JSON 写（非 ASCII -> \uXXXX）
(defun jstr (x)
  (with-output-to-string (o)
    (write-char #\" o)
    (loop for ch across (as-str x) do
      (let ((code (char-code ch)))
        (cond ((char= ch #\") (write-string "\\\"" o))
              ((char= ch #\\) (write-string "\\\\" o))
              ((or (< code 32) (> code 126))
               (if (> code #xFFFF)
                   (let ((v (- code #x10000)))
                     (format o "\\u~4,'0x\\u~4,'0x"
                             (+ #xD800 (ash v -10)) (+ #xDC00 (logand v #x3FF))))
                   (format o "\\u~4,'0x" code)))
              (t (write-char ch o)))))
    (write-char #\" o)))

(defun jweeks (w)
  (if (consp w)
      (format nil "{\"type\":~a,\"from\":~d,\"to\":~d}" (jstr (getf w :type)) (getf w :from) (getf w :to))
      "null"))

(defun jcourse (c)
  (format nil "{\"name\":~a,\"teacher\":~a,\"location\":~a,\"day\":~d,\"periodFrom\":~d,\"periodTo\":~d,\"weeks\":~a,\"tag\":~a,\"note\":~a}"
          (jstr (getf c :name)) (jstr (getf c :teacher)) (jstr (getf c :location))
          (getf c :day) (getf c :periodfrom) (getf c :periodto)
          (jweeks (getf c :weeks))
          (let ((g (getf c :tag))) (if (or (null g) (eq g :null)) "null" (jstr g)))
          (jstr (getf c :note))))

;;; ============ 3. 课程表模型与工具
(defun as-str (x) (cond ((stringp x) x) ((null x) "") ((eq x :null) "") (t (princ-to-string x))))
(defun clamp (x lo hi) (max lo (min hi x)))
(defun mkweeks (f t2) (list :type "range" :from f :to t2))
(defun weeks-from (w) (if (consp w) (or (getf w :from) 1) 1))
(defun weeks-to (w) (if (consp w) (or (getf w :to) 16) 16))

(defun norm-course (p)
  (list :name (as-str (getf p :name))
        :teacher (as-str (getf p :teacher))
        :location (as-str (getf p :location))
        :day (or (getf p :day) 1)
        :periodfrom (or (getf p :periodfrom) 1)
        :periodto (or (getf p :periodto) 2)
        :weeks (let ((w (getf p :weeks))) (if (consp w) (mkweeks (weeks-from w) (weeks-to w)) :null))
        :tag (let ((g (getf p :tag))) (if (or (null g) (eq g :null)) :null g))
        :note (as-str (getf p :note))))

(defun param (op key default)
  (let ((v (getf op (intern (string-upcase key) :keyword) :__miss)))
    (if (or (eq v :__miss) (eq v :null)) default v)))

(defun param-p (op key)
  (let ((v (getf op (intern (string-upcase key) :keyword) :__miss)))
    (not (or (eq v :__miss) (eq v :null)))))

(defun hit (m)
  (if (or (null m) (string= m ""))
      *courses*
      (remove-if-not (lambda (c) (string= (getf c :name) (as-str m))) *courses*)))

(defun put (c key val)                       ; 改了返回 t
  (unless (equal (getf c key) val) (setf (getf c key) val) t))

(defun change-count (lst fn)                 ; 命中集合里动了几门
  (let ((k 0)) (dolist (c (copy-list lst) k) (when (funcall fn c) (incf k)))))

(defun shift-periods (c delta)
  (let ((a (put c :periodfrom (clamp (+ (getf c :periodfrom) delta) 1 12))))
    (let ((nt (max (getf c :periodfrom) (min 12 (+ (getf c :periodto) delta)))))
      (or (put c :periodto nt) a))))

(defun op-note (name group cnt)
  (push (format nil "[~a] ~a 动 ~d 处" group name cnt) *ops-text-rev*))

(defun op-skip (name key)
  (push (format nil "~a：缺必填字段「~a」，该 op 未执行" name key) *log-rev*)
  0)

;;; ============ 4. defop 宏（单源：校验 + 名册 + 分发 + 文案）
(defun pkey (sym)
  (let ((s (string-downcase (symbol-name sym))))
    (cond ((string= s "other") "with")
          ((string= s "to-day") "toDay")
          (t s))))

(defun split-defop-spec (spec)
  (let ((kw '()))
    (loop while (and (consp spec) (keywordp (car spec)))
          do (let ((k (pop spec)) (v (pop spec))) (setf kw (append kw (list k v)))))
    (values kw spec)))

(defmacro defop (name group &rest spec)
  (multiple-value-bind (kw body) (split-defop-spec spec)
    (let ((requires (getf kw :requires))
          (match (getf kw :match t)))
      (let ((opv (gensym "OP")) (cnt (gensym "CNT")) (blk (gensym "BLK")))
    `(progn
       (pushnew ,name *op-names* :test #'equal)
       (setf (gethash ,name *op-table*)
             (cons ,group
                   (lambda (,opv)
                     (block ,blk
                       (dolist (k ',requires)
                         (unless (param-p ,opv (pkey k))
                           (return-from ,blk (op-skip ,name (pkey k)))))
                       (let (,@(when match `((match (param ,opv "match" ""))))
                               ,@(loop for k in requires collect `(,k (param ,opv (pkey ',k) nil))))
                         (declare (ignorable ,@(when match '(match)) ,@requires))
                         (let ((,cnt (progn ,@body)))
                           (op-note ,name ,group ,cnt)
                           ,cnt)))))))))))

;;; ============ 5. 30 条 op
;;;@@ OP setDay A
(defop "setDay" "A" :requires (day)
  (change-count (hit match) (lambda (c) (put c :day (clamp day 1 7)))))

;;;@@ OP setPeriodFrom A
(defop "setPeriodFrom" "A" :requires (from)
  (change-count (hit match)
                (lambda (c)
                  (let ((a (put c :periodfrom (clamp from 1 12))))
                    (put c :periodto (max (getf c :periodfrom) (getf c :periodto)))
                    a))))

;;;@@ OP setPeriodTo A
(defop "setPeriodTo" "A" :requires (to)
  (change-count (hit match)
                (lambda (c) (put c :periodto (max (getf c :periodfrom) (clamp to 1 12))))))

;;;@@ OP setTeacher A
(defop "setTeacher" "A" :requires (teacher)
  (change-count (hit match) (lambda (c) (put c :teacher (as-str teacher)))))

;;;@@ OP setLocation A
(defop "setLocation" "A" :requires (location)
  (change-count (hit match) (lambda (c) (put c :location (as-str location)))))

;;;@@ OP setNote A
(defop "setNote" "A" :requires (note)
  (change-count (hit match) (lambda (c) (put c :note (as-str note)))))

;;;@@ OP setWeeks A
(defop "setWeeks" "A" :requires (weeks)
  (change-count (hit match)
                (lambda (c) (put c :weeks (mkweeks (weeks-from weeks) (weeks-to weeks))))))

;;;@@ OP clearNote A
(defop "clearNote" "A"
  (change-count (hit match) (lambda (c) (put c :note ""))))

;;;@@ OP bumpDay A
(defop "bumpDay" "A" :requires (delta)
  (change-count (hit match)
                (lambda (c) (put c :day (clamp (+ (getf c :day) delta) 1 7)))))

;;;@@ OP bumpPeriod A
(defop "bumpPeriod" "A" :requires (delta)
  (change-count (hit match) (lambda (c) (shift-periods c delta))))

;;;@@ OP moveDay B
(defop "moveDay" "B" :requires (day)
  (change-count (hit match)
                (lambda (c)
                  (let* ((old (getf c :day)) (new (clamp day 1 7)) (d (- new old)))
                    (let ((a (put c :day new)))
                      (if (/= d 0)
                          (progn (shift-periods c d) t)
                          a))))))

;;;@@ OP swapTeacher B
(defop "swapTeacher" "B" :requires (other)
  (let ((a (first (hit match))) (b (first (hit (as-str other)))))
    (if (and a b (not (eq a b)))
        (let ((ta (getf a :teacher)))
          (setf (getf a :teacher) (getf b :teacher)
                (getf b :teacher) ta)
          2)
        (progn (push "swapTeacher：两门课没有都命中，未执行" *log-rev*) 0))))

;;;@@ OP copyWeeks B
(defop "copyWeeks" "B" :requires (other)
  (let ((a (first (hit match))) (b (first (hit (as-str other)))))
    (if (and a b)
        (progn (setf (getf b :weeks) (mkweeks (weeks-from (getf a :weeks)) (weeks-to (getf a :weeks)))) 1)
        (progn (push "copyWeeks：两门课没有都命中，未执行" *log-rev*) 0))))

;;;@@ OP mergeCourses B
(defop "mergeCourses" "B"
  (let ((out '()) (removed 0) (idx (make-hash-table :test #'equal)))
    (dolist (c *courses*)
      (let ((prev (gethash (getf c :name) idx)))
        (if prev
            (progn (setf (getf prev :weeks)
                         (mkweeks (min (weeks-from (getf prev :weeks)) (weeks-from (getf c :weeks)))
                                  (max (weeks-to (getf prev :weeks)) (weeks-to (getf c :weeks)))))
                   (incf removed))
            (progn (setf (gethash (getf c :name) idx) c)
                   (setf out (append out (list c)))))))
    (setf *courses* out)
    removed))

;;;@@ OP splitCourse B
(defop "splitCourse" "B"
  (let ((targets (hit match)) (out '()) (k 0))
    (dolist (c *courses*)
      (if (and (member c targets) (>= (- (getf c :periodto) (getf c :periodfrom)) 1))
          (let* ((f (getf c :periodfrom)) (tt (getf c :periodto))
                 (half (floor (1+ (- tt f)) 2))
                 (c1 (copy-list c)) (c2 (copy-list c)))
            (setf (getf c1 :periodto) (+ f half -1))
            (setf (getf c2 :periodfrom) (+ f half))
            (setf out (append out (list c1 c2)))
            (incf k))
          (setf out (append out (list c)))))
    (setf *courses* out)
    k))

;;;@@ OP rotateDay B
(defop "rotateDay" "B"
  (change-count *courses* (lambda (c) (put c :day (1+ (mod (getf c :day) 7))))))

;;;@@ OP trimWeeks B
(defop "trimWeeks" "B" :requires (from to)
  (change-count (hit match)
                (lambda (c)
                  (let ((nf (max (weeks-from (getf c :weeks)) from))
                        (nt (min (weeks-to (getf c :weeks)) to)))
                    (if (<= nf nt) (put c :weeks (mkweeks nf nt)) nil)))))

;;;@@ OP padWeeks B
(defop "padWeeks" "B" :requires (to)
  (change-count (hit match)
                (lambda (c)
                  (let ((nf (min (weeks-from (getf c :weeks)) to))
                        (nt (max (weeks-to (getf c :weeks)) to)))
                    (put c :weeks (mkweeks nf nt))))))

;;;@@ OP renumber B
(defop "renumber" "B"
  (let ((k 0)
        (days (sort (remove-duplicates (mapcar (lambda (c) (getf c :day)) *courses*)) #'<)))
    (dolist (d days)
      (let* ((cs (remove-if-not (lambda (c) (= (getf c :day) d)) *courses*))
             (sorted (stable-sort (copy-list cs) #'< :key (lambda (c) (getf c :periodfrom))))
             (cur 1))
        (dolist (c sorted)
          (let ((span (max 1 (1+ (- (getf c :periodto) (getf c :periodfrom))))))
            (let ((a (put c :periodfrom cur)))
              (let ((b (put c :periodto (+ cur span -1))))
                (when (or a b) (incf k))))
            (incf cur span)))))
    k))

;;;@@ OP sortByName B
(defop "sortByName" "B"
  (let* ((before (copy-list *courses*))
         (sorted (stable-sort (copy-list *courses*) #'string< :key (lambda (c) (getf c :name))))
         (k 0))
    (loop for a in before for b in sorted unless (eq a b) do (incf k))
    (setf *courses* sorted)
    k))

;;;@@ OP bulkMark C
(defop "bulkMark" "C" :requires (tag)
  (change-count (hit match) (lambda (c) (put c :tag (as-str tag)))))

;;;@@ OP bulkClear C
(defop "bulkClear" "C"
  (change-count (hit match) (lambda (c) (put c :tag :null))))

;;;@@ OP bulkShift C
(defop "bulkShift" "C" :requires (delta)
  (change-count *courses* (lambda (c) (shift-periods c delta))))

;;;@@ OP bulkCopy C
(defop "bulkCopy" "C" :requires (to-day)
  (let ((new '()) (k 0))
    (dolist (c (copy-list (hit match)))
      (let ((d (copy-list c)))
        (setf (getf d :day) (clamp to-day 1 7))
        (push d new)
        (incf k)))
    (setf *courses* (append *courses* (nreverse new)))
    k))

;;; ============ 6. 执行与输出
(defun numbered-log ()
  (loop for l in (reverse *log-rev*) for i from 1 collect (format nil "~d) ~a" i l)))

(defun render (courses log n)
  (format nil "{\"opsText\":~a,\"courses\":[~{~a~^,~}],\"log\":[~{~a~^,~}],\"n\":~d}"
          (jstr (format nil "~{~a~^~%~}" (reverse *ops-text-rev*)))
          (mapcar #'jcourse courses)
          (mapcar #'jstr log)
          n))

(defun main ()
  (let* ((path (car (last sb-ext:*posix-argv*)))
         (in (jparse (slurp path)))
         (raw (getf in :courses))
         (ops (getf in :ops)))
    (let ((*courses* (mapcar #'norm-course raw))
          (*n-changes* 0) (*log-rev* '()) (*ops-text-rev* '()))
      (let ((bad (find-if (lambda (op) (not (gethash (as-str (param op "op" "")) *op-table*))) ops)))
        (if bad
            (progn (setf *log-rev*
                         (list (format nil "未知 op：~a，整批拒绝（可用：~{~a~^/~}）"
                                       (as-str (param bad "op" ""))
                                       (sort (copy-list *op-names*) #'string<))))
                   (setf *ops-text-rev* '()))
            (dolist (op ops)
              (let* ((nm (as-str (param op "op" "")))
                     (entry (gethash nm *op-table*)))
                (incf *n-changes* (funcall (cdr entry) op))))))
      (format t "~a~%" (render *courses* (numbered-log) *n-changes*)))))

(main)

;;;; impl.lisp — 任务 A：大学课表（中文）
;;;; 用法: sbcl --script impl.lisp input.json   → stdout 打印一个 JSON 对象
;;;;
;;;; 结构：
;;;;   1. JSON 读（字符级递归下降，对象用有序 alist 包装以保留键序）
;;;;   2. JSON 写（非 ASCII 一律 \uXXXX 转义，stdout 恒为纯 ASCII）
;;;;   3. 数据访问 / 夹取工具
;;;;   4. add / del / edit / move 四个 op
;;;;   5. 入口

(in-package :cl-user)

;;; ---------------------------------------------------------------
;;; 1. 有序 JSON 对象模型：jobj = 保序 alist，jarr = list
;;; ---------------------------------------------------------------

(defstruct (jobj (:constructor mk-jobj (pairs))) pairs)
(defstruct (jarr (:constructor mk-jarr (items))) items)

(defun parse-json (s)
  "JSON 文本 → jobj（对象，保序）/ jarr（数组）/ string / number / t / nil / :null。"
  (let ((i 0) (n (length s)))
    (labels
        ((skip-ws ()
           (loop while (and (< i n)
                            (member (char s i) '(#\Space #\Tab #\Newline #\Return)
                                    :test #'char=))
                 do (incf i)))
         (read-string ()
           (incf i)                                    ; 跳过开头的 "
           (let ((buf (make-string-output-stream)))
             (loop
               (when (>= i n) (error "JSON: unterminated string"))
               (let ((ch (char s i)))
                 (cond ((char= ch #\") (incf i) (return))
                       ((char= ch #\\)
                        (incf i)
                        (let ((e (and (< i n) (char s i))))
                          (incf i)
                          (case e
                            (#\n (write-char #\Newline buf))
                            (#\t (write-char #\Tab buf))
                            (#\r (write-char #\Return buf))
                            (#\b (write-char #\Backspace buf))
                            (#\f (write-char #\Page buf))
                            (#\u (let ((code (parse-integer s :start i
                                                              :end (min n (+ i 4))
                                                              :radix 16)))
                                   (incf i 4)
                                   (let ((c1 (code-char code)))
                                     (if (and c1 (<= #xD800 code #xDBFF)
                                              (< (+ i 6) (1+ n))
                                              (char= (char s i) #\\)
                                              (char= (char s (1+ i)) #\u))
                                         ;; 代理对：合并成一个字符
                                         (let* ((lo (parse-integer s :start (+ i 2)
                                                                   :end (min n (+ i 6))
                                                                   :radix 16))
                                                (hi (- code #xD800))
                                                (li (- lo #xDC00))
                                                (cp (+ #x10000 (* hi #x400) li))
                                                (c2 (code-char cp)))
                                           (incf i 6)
                                           (write-char (or c2 #\?) buf))
                                         (write-char (or c1 #\?) buf)))))
                            (t (when e (write-char e buf))))))
                       (t (write-char ch buf) (incf i)))))
             (get-output-stream-string buf)))
         (read-number ()
           (let ((start i))
             (loop while (and (< i n)
                              (find (char s i) "-+.eE0123456789" :test #'char=))
                   do (incf i))
             (let ((tok (subseq s start i)))
               (if (or (find #\. tok) (find #\e tok) (find #\E tok))
                   (let ((*read-default-float-format* 'double-float))
                     (read-from-string tok))
                   (parse-integer tok)))))
         (value ()
           (skip-ws)
           (when (>= i n) (error "JSON: unexpected EOF"))
           (let ((ch (char s i)))
             (cond ((char= ch #\{) (object))
                   ((char= ch #\[) (array))
                   ((char= ch #\") (read-string))
                   ((char= ch #\t) (incf i 4) t)
                   ((char= ch #\f) (incf i 5) nil)
                   ((char= ch #\n) (incf i 4) :null)
                   (t (read-number)))))
         (object ()
           (incf i)                                     ; 跳过 {
           (skip-ws)
           (if (and (< i n) (char= (char s i) #\}))
               (progn (incf i) (mk-jobj '()))
               (let ((pairs '()))
                 (loop
                   (skip-ws)
                   (unless (and (< i n) (char= (char s i) #\"))
                     (error "JSON: object key must be a string"))
                   (let ((k (read-string)))
                     (skip-ws)
                     (unless (and (< i n) (char= (char s i) #\:))
                       (error "JSON: expected colon"))
                     (incf i)
                     (push (cons k (value)) pairs))
                   (skip-ws)
                   (cond ((and (< i n) (char= (char s i) #\,)) (incf i))
                         ((and (< i n) (char= (char s i) #\}))
                          (incf i)
                          (return (mk-jobj (nreverse pairs))))
                         (t (error "JSON: bad object separator")))))))
         (array ()
           (incf i)                                     ; 跳过 [
           (skip-ws)
           (if (and (< i n) (char= (char s i) #\]))
               (progn (incf i) (mk-jarr '()))
               (let ((items '()))
                 (loop
                   (push (value) items)
                   (skip-ws)
                   (cond ((and (< i n) (char= (char s i) #\,)) (incf i))
                         ((and (< i n) (char= (char s i) #\]))
                          (incf i)
                          (return (mk-jarr (nreverse items))))
                         (t (error "JSON: bad array separator"))))))))
      (value))))

;;; ---------------------------------------------------------------
;;; 2. 写 JSON（纯 ASCII：>=127 的字符一律 \uXXXX，避开 Windows 编码坑）
;;; ---------------------------------------------------------------

(defun write-json-string (s out)
  (write-char #\" out)
  (loop for ch across s
        do (let ((c (char-code ch)))
             (cond ((char= ch #\") (write-string "\\\"" out))
                   ((char= ch #\\) (write-string "\\\\" out))
                   ((char= ch #\Newline) (write-string "\\n" out))
                   ((char= ch #\Return) (write-string "\\r" out))
                   ((char= ch #\Tab) (write-string "\\t" out))
                   ((< c 32) (format out "\\u~4,'0x" c))
                   ((< c 127) (write-char ch out))
                   ((<= c #xFFFF) (format out "\\u~4,'0x" c))
                   (t (let* ((cp (- c #x10000))
                             (hi (+ #xD800 (ash cp -10)))
                             (lo (+ #xDC00 (logand cp #x3FF))))
                        (format out "\\u~4,'0x\\u~4,'0x" hi lo))))))
  (write-char #\" out))

(defun write-json (v out)
  (cond ((jobj-p v)
         (write-char #\{ out)
         (let ((first t))
           (dolist (pair (jobj-pairs v))
             (unless first (write-char #\, out))
             (setf first nil)
             (write-json-string (car pair) out)
             (write-char #\: out)
             (write-json (cdr pair) out)))
         (write-char #\} out))
        ((jarr-p v)
         (write-char #\[ out)
         (let ((first t))
           (dolist (item (jarr-items v))
             (unless first (write-char #\, out))
             (setf first nil)
             (write-json item out)))
         (write-char #\] out))
        ((stringp v) (write-json-string v out))
        ((eq v t) (write-string "true" out))
        ((eq v :null) (write-string "null" out))
        ((null v) (write-string "false" out))
        ((integerp v) (format out "~d" v))
        ((numberp v)
         (let ((d (coerce v 'double-float)))
           (if (= d (ffloor d))
               (format out "~d" (truncate d))
               (format out "~f" d))))
        (t (write-json-string (format nil "~a" v) out))))

;;; ---------------------------------------------------------------
;;; 3. 访问 / 夹取工具
;;; ---------------------------------------------------------------

(defparameter *days* #("" "周一" "周二" "周三" "周四" "周五" "周六" "周日"))

(defun jget (o key &optional default)
  (if (jobj-p o)
      (let ((pair (assoc key (jobj-pairs o) :test #'equal)))
        (if pair (cdr pair) default))
      default))

(defun jhas (o key)
  (and (jobj-p o) (assoc key (jobj-pairs o) :test #'equal) t))

(defun jset (o key val)
  "有则原位改（键序不变），无则追加到末尾。"
  (let ((pair (assoc key (jobj-pairs o) :test #'equal)))
    (if pair
        (setf (cdr pair) val)
        (setf (jobj-pairs o) (append (jobj-pairs o) (list (cons key val)))))
    val))

(defun jnum (v &optional default)
  (if (numberp v) (round v) default))

(defun clamp (lo hi v) (min hi (max lo v)))

(defun weekday-name (d)
  (if (and (integerp d) (<= 1 d 7))
      (aref *days* d)
      (format nil "周~a" d)))

(defun jstr (v &optional (default ""))
  (cond ((stringp v) v)
        ((or (null v) (eq v :null)) default)
        ((numberp v) (format nil "~a" v))
        (t default)))

(defun match-courses (courses kw)
  "名字包含 kw 的课；kw 为空 → 无命中。"
  (let ((k (and (stringp kw) (string-trim '(#\Space #\Tab) kw))))
    (if (or (null k) (zerop (length k)))
        '()
        (remove-if-not (lambda (c)
                         (let ((nm (jget c "name" "")))
                           (and (stringp nm) (search k nm))))
                       courses))))

(defun valid-weeks-p (w)
  (and (jobj-p w)
       (member (jget w "type") '("all" "range" "odd" "even" "list") :test #'equal)
       t))

(defun default-weeks (total-weeks)
  (mk-jobj (list (cons "type" "range")
                 (cons "from" 1)
                 (cons "to" total-weeks))))

;;; ---------------------------------------------------------------
;;; 4. op 语义
;;; ---------------------------------------------------------------

(defun apply-set (c set)
  "只改 set 里出现的键：day 夹到 1..7；periodFrom/To < 1 保留原值。"
  (dolist (pair (jobj-pairs set))
    (let ((k (car pair)) (v (cdr pair)))
      (cond
        ((equal k "day")
         (when (numberp v) (jset c "day" (clamp 1 7 (round v)))))
        ((member k '("periodFrom" "periodTo") :test #'equal)
         (when (and (numberp v) (>= v 1)) (jset c k (round v))))
        ((eq v :null) nil)
        (t (jset c k v))))))

(defun add-course (op total-weeks)
  "把 op 的 course 规范成 7 个字段（+ 额外键），缺 weeks 时补 range 1..total-weeks。"
  (let* ((c (jget op "course"))
         (c (if (jobj-p c) c (mk-jobj '())))
         (name (jget c "name"))
         (day (clamp 1 7 (or (jnum (jget c "day")) 1)))
         (pf (max 1 (or (jnum (jget c "periodFrom")) 1)))
         (pt (max 1 (or (jnum (jget c "periodTo")) pf)))
         (w (jget c "weeks"))
         (extra (remove-if
                 (lambda (p)
                   (member (car p)
                           '("name" "teacher" "location" "day" "periodFrom"
                             "periodTo" "weeks" "totalWeeks")
                           :test #'equal))
                 (jobj-pairs c))))
    (when (or (not (stringp name)) (zerop (length name)))
      (return-from add-course (values nil nil)))
    (values (mk-jobj (append
                      (list (cons "name" name)
                            (cons "teacher" (jstr (jget c "teacher" "")))
                            (cons "location" (jstr (jget c "location" "")))
                            (cons "day" day)
                            (cons "periodFrom" pf)
                            (cons "periodTo" pt)
                            (cons "weeks" (if (valid-weeks-p w)
                                              w
                                              (default-weeks total-weeks))))
                      extra))
            name)))

(defun move-args-ok (op)
  (and (jobj-p op)
       (numberp (jget op "day" :absent))
       (numberp (jget op "periodFrom" :absent))
       (numberp (jget op "periodTo" :absent))))

(defun apply-one (courses op total-weeks)
  "返回 (values 新课表 生效条数 日志文案或nil)。"
  (let ((kind (and (jobj-p op) (jget op "op"))))
    (cond
      ((not (stringp kind))
       (values courses 0 (format nil "未知操作「~a」" (jstr kind "?"))))

      ((string= kind "add")
       (multiple-value-bind (course name) (add-course op total-weeks)
         (if (null course)
             (values courses 0 "有一条 add 没写课程名")
             (values (append courses (list course)) 1
                     (format nil "加了「~a」" name)))))

      ((string= kind "del")
       (let* ((m (jget op "match"))
              (m (if (stringp m) m ""))
              (hit (match-courses courses m)))
         (if (null hit)
             (values courses 0 (format nil "没找到「~a」" m))
             (values (remove-if (lambda (c) (member c hit :test #'eq)) courses)
                     (length hit)
                     (format nil "删掉 ~a 条「~a」" (length hit) m)))))

      ((string= kind "edit")
       (let* ((m (jget op "match"))
              (m (if (stringp m) m ""))
              (hit (match-courses courses m)))
         (if (null hit)
             (values courses 0 (format nil "没找到「~a」" m))
             (let ((set (jget op "set")))
               (unless (jobj-p set) (setf set (mk-jobj '())))
               (dolist (c hit) (apply-set c set))
               (values courses (length hit)
                       (format nil "改了 ~a 条「~a」" (length hit) m))))))

      ((string= kind "move")
       (let* ((m (jget op "match"))
              (m (if (stringp m) m ""))
              (hit (match-courses courses m)))
         (cond
           ((null hit)
            (values courses 0 (format nil "没找到「~a」" m)))
           ((not (move-args-ok op))
            (values courses 0 (format nil "move 参数不全（match/day/periodFrom/periodTo），跳过「~a」" m)))
           (t
            (dolist (c hit)
              (jset c "day" (clamp 1 7 (round (jget op "day"))))
              (dolist (k '("periodFrom" "periodTo"))
                (let ((v (jget op k)))
                  (when (and (numberp v) (>= v 1)) (jset c k (round v))))))
            (values courses (length hit)
                    (format nil "挪了 ~a 条「~a」" (length hit) m))))))

      (t (values courses 0 (format nil "未知操作「~a」" kind))))))

;;; ---------------------------------------------------------------
;;; 5. 确认文案
;;; ---------------------------------------------------------------

(defun edit-part (op)
  (let* ((set (jget op "set"))
         (set (if (jobj-p set) set (mk-jobj '())))
         (p '()))
    (let ((v (jget set "day" :absent)))
      (when (and (not (eq v :absent)) (numberp v))
        (push (weekday-name (clamp 1 7 (round v))) p)))
    (let ((v (jget set "periodFrom" :absent)))
      (when (and (not (eq v :absent)) (numberp v) (>= v 1))
        (push (format nil "第~a-~a节" (round v)
                      (let ((pt (jget set "periodTo" :absent)))
                        (if (and (not (eq pt :absent)) (numberp pt) (>= pt 1))
                            (round pt)
                            (round v))))
              p)))
    (let ((v (jget set "periodFrom" :absent))
          (pt (jget set "periodTo" :absent)))
      (when (and (or (eq v :absent) (not (numberp v)) (< v 1))
                 (not (eq pt :absent)) (numberp pt) (>= pt 1))
        (push (format nil "到第~a节" (round pt)) p)))
    (let ((v (jget set "location" :absent)))
      (when (and (not (eq v :absent)) (stringp v) (plusp (length v)))
        (push v p)))
    (let ((v (jget set "teacher" :absent)))
      (when (and (not (eq v :absent)) (stringp v) (plusp (length v)))
        (push v p)))
    (when (jhas set "weeks") (push "周次改过" p))
    (if p (format nil "~{~a~^ ~}" (nreverse p)) "（没写具体值）")))

(defun move-part (op)
  (let ((d (jget op "day" :absent))
        (pf (jget op "periodFrom" :absent))
        (pt (jget op "periodTo" :absent)))
    (format nil "~a 第~a-~a节"
            (weekday-name (clamp 1 7 (round d)))
            (round pf)
            (round pt))))

(defun one-op-text (op)
  (let ((kind (and (jobj-p op) (jget op "op"))))
    (cond
      ((not (stringp kind)) nil)
      ((string= kind "del")
       (format nil "删掉「~a」" (jstr (jget op "match") "?")))
      ((string= kind "add")
       (let ((c (jget op "course")))
         (format nil "加「~a」" (if (jobj-p c) (jstr (jget c "name") "?") "?"))))
      ((string= kind "edit")
       (format nil "把「~a」改成 ~a" (jstr (jget op "match") "?") (edit-part op)))
      ((string= kind "move")
       (if (move-args-ok op)
           (format nil "把「~a」挪到 ~a" (jstr (jget op "match") "?") (move-part op))
           nil))
      (t (format nil "~a" kind)))))

;;; ---------------------------------------------------------------
;;; 6. 入口
;;; ---------------------------------------------------------------

(defun read-file-utf8 (path)
  (with-open-file (in path :direction :input :external-format :utf-8
                           :if-does-not-exist :error)
    (let ((buf (make-string-output-stream)))
      (loop for ch = (read-char in nil nil)
            while ch
            do (write-char ch buf))
      (get-output-stream-string buf))))

(defun run (input)
  (let* ((courses (let ((c (jget input "courses")))
                    (if (jarr-p c) (copy-list (jarr-items c)) '())))
         (ops (let ((o (jget input "ops")))
                (if (jarr-p o) (jarr-items o) '())))
         (tw (or (let ((v (jget input "totalWeeks")))
                   (if (and (numberp v) (>= v 1)) (round v)))
                 (loop for op in ops
                       for v = (and (jobj-p op) (jget op "totalWeeks"))
                       when (and (numberp v) (>= v 1)) return (round v))
                 16))
         (texts '())
         (log '())
         (n 0))
    (dolist (op ops)
      (multiple-value-bind (next k msg) (apply-one courses op tw)
        (setf courses next)
        (incf n k)
        (when msg (push msg log))))
    (setf texts (remove nil (mapcar #'one-op-text ops)))
    (let ((out (make-string-output-stream)))
      (write-json (mk-jobj (list (cons "opsText" (format nil "~{~a~^；~}" texts))
                                 (cons "courses" (mk-jarr courses))
                                 (cons "log" (mk-jarr (nreverse log)))
                                 (cons "n" n)))
                  out)
      (get-output-stream-string out))))

(defun script-arg ()
  "sbcl --script impl.lisp input.json → *posix-argv* = (sbcl.exe input.json)。
     取最后一个非选项参数（兼容 Unix/Linux 下仍带脚本名的情况）。"
  (or (loop for a in (reverse (or #+sbcl sb-ext:*posix-argv* '()))
            when (and a (plusp (length a)) (char/= (char a 0) #\-)
                      (not (string-equal a "impl.lisp")))
              return a)
      (car (last (or #+sbcl sb-ext:*posix-argv* '())))))

(defun main ()
  (let* ((path (script-arg)))
    (when (or (null path) (string= path "") (string= path "--script"))
      (format *error-output* "usage: sbcl --script impl.lisp <input.json>~%")
      (finish-output)
      (sb-ext:exit :code 2 :abort nil))
    (let ((result (run (parse-json (read-file-utf8 path)))))
      (write-string result)
      (terpri))
    (finish-output)
    (sb-ext:exit :code 0 :abort nil)))

(main)

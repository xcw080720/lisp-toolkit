;;;; impl.lisp — 任务 A：大学课表（中文）
;;;; 用法: sbcl --script impl.lisp <input.json>
;;;; 向 stdout 打印一个 JSON 对象: {opsText, courses, log, n}

;;; ============================ 基础类型 ============================

(defstruct (jobj (:constructor jmake (pairs))) pairs)   ; pairs: alist (key . value)，保序
(defstruct (jarr (:constructor jamake (items))) items)

(defvar *src* "")
(defvar *pos* 0)
(defvar *len* 0)

;;; ============================ JSON 解析 ============================

(defun cur () (when (< *pos* *len*) (char *src* *pos*)))

(defun skip-ws ()
  (loop while (and (< *pos* *len*)
                   (member (char *src* *pos*) '(#\Space #\Tab #\Newline #\Return)))
        do (incf *pos*)))

(defun hex4 ()
  (let ((v (parse-integer *src* :start *pos* :end (+ *pos* 4) :radix 16)))
    (incf *pos* 4)
    v))

(defun parse-string ()
  (incf *pos*)                          ; 跳过开引号
  (let ((out (make-string-output-stream)))
    (loop
      (let ((c (cur)))
        (cond
          ((null c) (error "JSON: 字符串未闭合"))
          ((char= c #\")
           (incf *pos*)
           (return (get-output-stream-string out)))
          ((char= c #\\)
           (incf *pos*)
           (let ((e (cur)))
             (when (null e) (error "JSON: 转义未闭合"))
             (incf *pos*)
             (case e
               (#\" (write-char #\" out))
               (#\\ (write-char #\\ out))
               (#\/ (write-char #\/ out))
               (#\b (write-char (code-char 8) out))
               (#\f (write-char (code-char 12) out))
               (#\n (write-char #\Newline out))
               (#\r (write-char #\Return out))
               (#\t (write-char #\Tab out))
               (#\u
                (let ((code (hex4)))
                  (cond
                    ((and (>= code #xD800) (<= code #xDBFF)
                          (< (1+ *pos*) *len*)
                          (char= (char *src* *pos*) #\\)
                          (char= (char *src* (1+ *pos*)) #\u))
                     (incf *pos* 2)
                     (let ((lo (hex4)))
                       (write-char (code-char (+ #x10000
                                                 (* (- code #xD800) #x400)
                                                 (- lo #xDC00)))
                                   out)))
                    (t (write-char (code-char code) out)))))
               (t (write-char e out)))))
          (t (write-char c out) (incf *pos*)))))))

(defun parse-number ()
  (let ((start *pos*))
    (loop while (and (< *pos* *len*)
                     (find (char *src* *pos*) "+-0123456789.eE"))
          do (incf *pos*))
    (let ((tok (subseq *src* start *pos*)))
      (if (or (find #\. tok) (find #\e tok) (find #\E tok))
          (let ((*read-default-float-format* 'double-float))
            (coerce (read-from-string tok) 'double-float))
          (parse-integer tok)))))

(defun parse-array ()
  (incf *pos*)                          ; 跳过 [
  (let ((items '()))
    (skip-ws)
    (if (and (cur) (char= (cur) #\]))
        (progn (incf *pos*) (jamake (nreverse items)))
        (loop
          (push (parse-value) items)
          (skip-ws)
          (let ((c (cur)))
            (cond ((null c) (error "JSON: 数组未闭合"))
                  ((char= c #\,) (incf *pos*) (skip-ws))
                  (t (incf *pos*) (return (jamake (nreverse items))))))))))

(defun parse-object ()
  (incf *pos*)                          ; 跳过 {
  (let ((pairs '()))
    (skip-ws)
    (if (and (cur) (char= (cur) #\}))
        (progn (incf *pos*) (jmake (nreverse pairs)))
        (loop
          (skip-ws)
          (unless (and (cur) (char= (cur) #\")) (error "JSON: 期望 key"))
          (let ((k (parse-string)))
            (skip-ws)
            (unless (and (cur) (char= (cur) #\:)) (error "JSON: 期望冒号"))
            (incf *pos*)
            (skip-ws)
            (push (cons k (parse-value)) pairs))
          (skip-ws)
          (let ((c (cur)))
            (cond ((null c) (error "JSON: 对象未闭合"))
                  ((char= c #\,) (incf *pos*))
                  (t (incf *pos*) (return (jmake (nreverse pairs))))))))))

(defun parse-value ()
  (skip-ws)
  (let ((c (cur)))
    (cond
      ((null c) (error "JSON: 意外结束"))
      ((char= c #\{) (parse-object))
      ((char= c #\[) (parse-array))
      ((char= c #\") (parse-string))
      ((char= c #\t) (incf *pos* 4) :true)
      ((char= c #\f) (incf *pos* 5) :false)
      ((char= c #\n) (incf *pos* 4) :null)
      (t (parse-number)))))

(defun json-parse (text)
  (setf *src* text
        *pos* 0
        *len* (length text))
  ;; 容忍 UTF-8 BOM
  (when (and (> *len* 0) (char= (char *src* 0) (code-char #xFEFF)))
    (setf *pos* 1))
  (parse-value))

;;; ============================ 对象工具 ============================

(defun obj-get (o k)
  (let ((p (assoc k (jobj-pairs o) :test #'equal)))
    (if p (cdr p) nil)))

(defun obj-has (o k)
  (and (jobj-p o) (not (null (assoc k (jobj-pairs o) :test #'equal)))))

(defun obj-set (o k v)
  (let ((pairs (jobj-pairs o)))
    (if (assoc k pairs :test #'equal)
        (jmake (mapcar (lambda (p) (if (equal (car p) k) (cons k v) p)) pairs))
        (jmake (append pairs (list (cons k v)))))))

;;; ============================ JSON 输出 ============================

(defun json-write-string (s out)
  (write-char #\" out)
  (loop for ch across s
        for code = (char-code ch)
        do (cond
             ((= code 34) (write-string "\\\"" out))
             ((= code 92) (write-string "\\\\" out))
             ((= code 8) (write-string "\\b" out))
             ((= code 12) (write-string "\\f" out))
             ((= code 10) (write-string "\\n" out))
             ((= code 13) (write-string "\\r" out))
             ((= code 9) (write-string "\\t" out))
             ((< code 32) (format out "\\u~4,'0x" code))
             ;; 非 ASCII 一律 \\uXXXX（含代理对），保证输出纯 ASCII
             ((< code 127) (write-char ch out))
             ((<= code #xFFFF) (format out "\\u~4,'0x" code))
             (t (let ((v (- code #x10000)))
                  (format out "\\u~4,'0x\\u~4,'0x"
                          (+ #xD800 (floor v #x400))
                          (+ #xDC00 (mod v #x400)))))))
  (write-char #\" out))

(defun json-out (v out)
  (cond
    ((jobj-p v)
     (write-char #\{ out)
     (let ((first t))
       (dolist (p (jobj-pairs v))
         (if first (setf first nil) (write-char #\, out))
         (json-write-string (car p) out)
         (write-char #\: out)
         (json-out (cdr p) out)))
     (write-char #\} out))
    ((jarr-p v)
     (write-char #\[ out)
     (let ((first t))
       (dolist (x (jarr-items v))
         (if first (setf first nil) (write-char #\, out))
         (json-out x out)))
     (write-char #\] out))
    ((stringp v) (json-write-string v out))
    ((integerp v) (format out "~d" v))
    ((floatp v) (let ((*read-default-float-format* 'double-float))
                  (princ (coerce v 'double-float) out)))
    ((eq v :true) (write-string "true" out))
    ((eq v :false) (write-string "false" out))
    ((eq v :null) (write-string "null" out))
    (t (error "无法序列化: ~s" v))))

(defun json-string (v)
  (with-output-to-string (out) (json-out v out)))

;;; ============================ 课表模型 ============================

(defparameter *field-order* '("name" "teacher" "location" "day" "periodFrom" "periodTo" "weeks"))
(defparameter *weeks-order* '("type" "from" "to" "list"))

(defun reorder (o order)
  (if (not (jobj-p o))
      o
      (let ((pairs (jobj-pairs o))
            (head '())
            (tail '()))
        (dolist (k order)
          (let ((p (assoc k pairs :test #'equal)))
            (when p (push p head))))
        (dolist (p pairs)
          (unless (member (car p) order :test #'equal)
            (push p tail)))
        (jmake (append (nreverse head) (nreverse tail))))))

(defun normalize-weeks (w)
  (if (jobj-p w) (reorder w *weeks-order*) w))

(defun normalize-course (c)
  (let ((c (if (obj-has c "weeks")
               (obj-set c "weeks" (normalize-weeks (obj-get c "weeks")))
               c)))
    (reorder c *field-order*)))

(defun course-name (c)
  (let ((v (obj-get c "name")))
    (if (stringp v) v "")))

(defun name-match-p (c m)
  (and (> (length m) 0)
       (and (search m (course-name c) :test #'char-equal) t)))

(defun str-or (v d)
  (if (stringp v) v d))

(defun clamp-day (v)
  (if (integerp v) (max 1 (min 7 v)) v))

(defun clamp-period (new old)
  ;; 至少 1：小于 1 视为无效，保留原值
  (if (and (integerp new) (< new 1)) old new))

(defun make-new-course (raw total-weeks)
  (let* ((pf (if (obj-has raw "periodFrom") (obj-get raw "periodFrom") 1))
         (pt (if (obj-has raw "periodTo") (obj-get raw "periodTo") pf))
         (weeks (if (obj-has raw "weeks")
                    (obj-get raw "weeks")
                    (jmake (list (cons "type" "range")
                                 (cons "from" 1)
                                 (cons "to" total-weeks)))))
         (base (jmake (list (cons "name" (obj-get raw "name"))
                            (cons "teacher" (str-or (obj-get raw "teacher") ""))
                            (cons "location" (str-or (obj-get raw "location") ""))
                            (cons "day" (if (obj-has raw "day") (obj-get raw "day") 1))
                            (cons "periodFrom" pf)
                            (cons "periodTo" pt)
                            (cons "weeks" weeks)))))
    ;; 保留原始对象里额外的键
    (dolist (p (jobj-pairs raw))
      (unless (member (car p) *field-order* :test #'equal)
        (setf base (obj-set base (car p) (cdr p)))))
    (normalize-course base)))

(defun apply-set (course set total-weeks)
  (declare (ignore total-weeks))
  (let ((c course))
    (dolist (p (jobj-pairs set))
      (let ((k (car p)) (v (cdr p)))
        (cond
          ((equal k "weeks") (setf c (obj-set c "weeks" (normalize-weeks v))))
          ((equal k "day") (setf c (obj-set c "day" (clamp-day v))))
          ((equal k "periodFrom")
           (setf c (obj-set c "periodFrom" (clamp-period v (obj-get c "periodFrom")))))
          ((equal k "periodTo")
           (setf c (obj-set c "periodTo" (clamp-period v (obj-get c "periodTo")))))
          (t (setf c (obj-set c k v))))))
    c))

(defun apply-move (course day pf pt)
  (let ((c course))
    (setf c (obj-set c "day" (clamp-day day)))
    (setf c (obj-set c "periodFrom" (clamp-period pf (obj-get c "periodFrom"))))
    (setf c (obj-set c "periodTo" (clamp-period pt (obj-get c "periodTo"))))
    c))

(defun count-matches (courses m)
  (count-if (lambda (c) (name-match-p c m)) courses))

;;; ============================ 主逻辑 ============================

(defun run (input)
  (let* ((in-courses (obj-get input "courses"))
         (courses (if (jarr-p in-courses) (copy-list (jarr-items in-courses)) '()))
         (ops-raw (obj-get input "ops"))
         (ops (if (jarr-p ops-raw) (jarr-items ops-raw) '()))
         (total-weeks (let ((tw (obj-get input "totalWeeks")))
                        (if (integerp tw) tw 16)))
         (n 0)
         (texts '())
         (logs '()))
    (dolist (op ops)
      (let* ((kind-raw (if (jobj-p op) (obj-get op "op") op))
             (kind (cond ((stringp kind-raw) kind-raw)
                         (kind-raw (format nil "~a" kind-raw))
                         (t "")))
             (m (str-or (obj-get op "match") "")))
        (cond
          ;; ---------------- add ----------------
          ((equal kind "add")
           (let ((raw (obj-get op "course")))
             (cond
               ((not (jobj-p raw))
                (push "add 缺少 course，已跳过" logs))
               ((not (and (obj-has raw "name") (stringp (obj-get raw "name"))
                          (> (length (obj-get raw "name")) 0)))
                (push "add 缺少 name，已跳过" logs))
               (t
                (let ((c (make-new-course raw total-weeks)))
                  (setf courses (append courses (list c)))
                  (incf n 1)
                  (push (format nil "加「~a」" (course-name c)) texts)
                  (push (format nil "加了「~a」" (course-name c)) logs))))))

          ;; ---------------- del ----------------
          ((equal kind "del")
           (let ((hits (count-matches courses m)))
             (if (or (zerop (length m)) (zerop hits))
                 (push (format nil "没找到「~a」" m) logs)
                 (progn
                   (setf courses (remove-if (lambda (c) (name-match-p c m)) courses))
                   (incf n hits)
                   (push (format nil "删掉「~a」" m) texts)
                   (push (format nil "删掉 ~d 条「~a」" hits m) logs)))))

          ;; ---------------- edit ----------------
          ((equal kind "edit")
           (let ((set (obj-get op "set")))
             (cond
               ((not (jobj-p set))
                (push (format nil "「~a」的 edit 缺少 set，已跳过" m) logs))
               (t
                (let ((hits (count-matches courses m)))
                  (if (or (zerop (length m)) (zerop hits))
                      (progn
                        (push (format nil "改「~a」" m) texts)
                        (push (format nil "没找到「~a」" m) logs))
                      (progn
                        (setf courses
                              (mapcar (lambda (c)
                                        (if (name-match-p c m)
                                            (apply-set c set total-weeks)
                                            c))
                                      courses))
                        (incf n hits)
                        (push (format nil "改「~a」" m) texts)
                        (push (format nil "改了 ~d 条「~a」" hits m) logs))))))))

          ;; ---------------- move ----------------
          ((equal kind "move")
           (if (not (and (obj-has op "day") (obj-has op "periodFrom") (obj-has op "periodTo")))
               (push (format nil "「~a」的 move 缺少 day/periodFrom/periodTo，未执行" m) logs)
               (let ((hits (count-matches courses m)))
                 (if (or (zerop (length m)) (zerop hits))
                     (progn
                       (push (format nil "挪「~a」" m) texts)
                       (push (format nil "没找到「~a」" m) logs))
                     (progn
                       (setf courses
                             (mapcar (lambda (c)
                                       (if (name-match-p c m)
                                           (apply-move c
                                                       (obj-get op "day")
                                                       (obj-get op "periodFrom")
                                                       (obj-get op "periodTo"))
                                           c))
                                     courses))
                       (incf n hits)
                       (push (format nil "挪「~a」" m) texts)
                       (push (format nil "挪了 ~d 条「~a」" hits m) logs))))))

          ;; ---------------- 未知 op ----------------
          (t
           (push (format nil "未知操作「~a」，已跳过" kind) logs)))))

    (jmake
     (list (cons "opsText" (format nil "~{~a~^；~}" (nreverse texts)))
           (cons "courses" (jamake (mapcar #'normalize-course courses)))
           (cons "log" (jamake (nreverse logs)))
           (cons "n" n)))))

;;; ============================ 入口 ============================

(defun read-file-utf8 (path)
  (with-open-file (in path :element-type '(unsigned-byte 8))
    (let ((bytes (make-array (file-length in) :element-type '(unsigned-byte 8))))
      (read-sequence bytes in)
      (sb-ext:octets-to-string bytes :external-format :utf-8))))

(defun write-stdout-utf8 (text)
  ;; text 已保证是纯 ASCII（非 ASCII 字符全部 \uXXXX 转义），任何编码都能安全输出
  (write-string text *standard-output*)
  (finish-output *standard-output*))

(defun main ()
  (let* ((args sb-ext:*posix-argv*)
         (path (car (last args))))
    (when (or (null path) (string= path "--script") (string= path (car args)))
      (write-stdout-utf8 "{\"opsText\":\"\",\"courses\":[],\"log\":[\"缺少输入文件\"],\"n\":0}")
      (sb-ext:exit :code 1))
    (let* ((input (json-parse (read-file-utf8 path)))
           (result (run input)))
      (write-stdout-utf8 (json-string result))
      (sb-ext:exit :code 0))))

(main)

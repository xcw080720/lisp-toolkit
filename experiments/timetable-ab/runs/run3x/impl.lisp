;;; impl.lisp — 任务 A：大学课表（SBCL --script impl.lisp input.json）
;;;
;;; 结构要点：每个 op 的「参数校验 / opsText 文案 / 日志文案 / 执行逻辑」由同一个
;;; (defop ...) 声明长出，不手写四份。加一个新 op = 多写一条 defop，别处零改动。

;;; ---------------------------------------------------------------- 极小 JSON

(defstruct (rdr (:constructor mk-rdr (s &optional (i 0)))) s i)

(defun r-peek (r) (let ((i (rdr-i r))) (when (< i (length (rdr-s r))) (char (rdr-s r) i))))
(defun r-jump (r n) (incf (rdr-i r) n))
(defun r-ws (r)
  (loop for c = (r-peek r)
        while (and c (member c '(#\Space #\Tab #\Newline #\Return)))
        do (r-jump r 1)))

(defun r-hex4 (r)
  (parse-integer (subseq (rdr-s r) (rdr-i r) (+ 4 (rdr-i r))) :radix 16)
  (r-jump r 4))

(defun r-str (r)
  (r-jump r 1)                                  ; 开引号
  (let ((buf (make-string-output-stream)))
    (loop for c = (r-peek r)
          do (cond ((null c) (error "json: 字符串未闭合"))
                   ((char= c #\") (r-jump r 1) (return (get-output-stream-string buf)))
                   ((char= c #\\)
                    (r-jump r 1)
                    (let ((e (r-peek r)))
                      (r-jump r 1)
                      (write-char
                       (case e (#\n #\Newline) (#\t #\Tab) (#\r #\Return) (#\b #\Backspace)
                             (#\f #\Page) (#\u (let ((cp (r-hex4 r)))
                                                 (if (<= #xD800 cp #xDBFF)
                                                     (let ((lo (progn (r-jump r 2) (r-hex4 r))))
                                                       (code-char (+ #x10000
                                                                     (* (- cp #xD800) #x400)
                                                                     (- lo #xDC00))))
                                                     (code-char cp))))
                             (t e))
                       buf)))
                   (t (write-char c buf) (r-jump r 1))))))

(defun r-num (r)
  (let ((st (rdr-i r)))
    (loop for c = (r-peek r)
          while (and c (or (digit-char-p c) (member c '(#\- #\+ #\. #\e #\E))))
          do (r-jump r 1))
    (let* ((tok (subseq (rdr-s r) st (rdr-i r)))
           (v (read-from-string tok)))
      (if (and (floatp v) (= v (fround v)) (null (position #\. tok))) (round v) v))))

(defun r-arr (r)
  (r-jump r 1)                                  ; [
  (let ((acc '()))
    (r-ws r)
    (if (eql (r-peek r) #\])
        (progn (r-jump r 1) '())
        (loop (push (r-val r) acc)
              (r-ws r)
              (let ((c (r-peek r)))
                (cond ((eql c #\,) (r-jump r 1))
                      ((eql c #\]) (r-jump r 1) (return (nreverse acc)))
                      (t (error "json: 数组语法"))))))))

(defun r-obj (r)
  (r-jump r 1)                                  ; {
  (let ((h (make-hash-table :test #'equal)))
    (r-ws r)
    (if (eql (r-peek r) #\})
        (progn (r-jump r 1) h)
        (loop (r-ws r)
              (let ((k (r-str r)))
                (r-ws r) (r-jump r 1)           ; :
                (setf (gethash k h) (r-val r)))
              (r-ws r)
              (let ((c (r-peek r)))
                (cond ((eql c #\,) (r-jump r 1))
                      ((eql c #\}) (r-jump r 1) (return h))
                      (t (error "json: 对象语法"))))))))

(defun r-val (r)
  (r-ws r)
  (let ((c (r-peek r)))
    (cond ((null c) (error "json: 提前结束"))
          ((eql c #\{) (r-obj r))
          ((eql c #\[) (r-arr r))
          ((eql c #\") (r-str r))
          ((or (eql c #\-) (digit-char-p c)) (r-num r))
          ((eql c #\t) (r-jump r 4) t)
          ((eql c #\f) (r-jump r 5) nil)
          ((eql c #\n) (r-jump r 4) nil)
          (t (error "json: 非法字符 ~c" c)))))

(defun read-json-file (path)
  (with-open-file (s path :element-type '(unsigned-byte 8))
    (let ((buf (make-array (max 1 (file-length s)) :element-type '(unsigned-byte 8))))
      (read-sequence buf s)
      (let* ((str (sb-ext:octets-to-string buf :external-format :utf-8))
             (txt (if (and (plusp (length str)) (= (char-code (char str 0)) #xFEFF))
                      (subseq str 1) str)))
        (r-val (mk-rdr txt))))))

;;; ---------------------------------------------------------------- JSON 输出

(defun esc (s)
  "输出纯 ASCII 的 JSON 字符串：非 ASCII 一律 \\uXXXX 转义，规避 Windows 控制台编码。"
  (with-output-to-string (o)
    (write-char #\" o)
    (loop for c across s
          for code = (char-code c)
          do (cond ((= code 34) (write-string "\\\"" o))
                   ((= code 92) (write-string "\\\\" o))
                   ((= code 10) (write-string "\\n" o))
                   ((= code 9) (write-string "\\t" o))
                   ((= code 13) (write-string "\\r" o))
                   ((< code 32) (format o "\\u~4,'0x" code))
                   ((< code 127) (write-char c o))
                   ((< code #x10000) (format o "\\u~4,'0x" code))
                   (t (let ((v (- code #x10000)))
                        (format o "\\u~4,'0x\\u~4,'0x"
                                (+ #xD800 (ash v -10))
                                (+ #xDC00 (logand v #x3FF)))))))
    (write-char #\" o)))

(defun join-str (sep items)
  (with-output-to-string (o)
    (loop for (x . rest) on items
          do (write-string x o)
             (when rest (write-string sep o)))))

(defun j-num (n) (format nil "~d" (round n)))

(defun j-obj (pairs)
  (concatenate 'string "{" (join-str ","
            (mapcar (lambda (p) (concatenate 'string (esc (car p)) ":" (cdr p))) pairs))
               "}"))

(defun j-arr-str (items) (concatenate 'string "[" (join-str "," items) "]"))

(defun emit (str)
  (write-string str *standard-output*)
  (finish-output *standard-output*))

;;; ---------------------------------------------------------------- 取字段

(defun gv (h k) (and (hash-table-p h) (gethash k h)))
(defun jget (h &rest ks) (let ((v h)) (dolist (k ks v) (setf v (gv v k)))))

(defun inum (v d)
  (cond ((integerp v) v) ((numberp v) (round v)) ((and (stringp v) (every #'digit-char-p v) (plusp (length v))) (parse-integer v)) (t d)))

(defun sstr (v d) (if (stringp v) v d))

(defvar *total-weeks* 16)

;;; 一门课 = 哈希表，键固定：name teacher location day periodFrom periodTo [weeks]
(defun norm-weeks (w)
  (let ((h (make-hash-table :test #'equal)))
    (when (hash-table-p w)
      (setf (gethash "type" h) (sstr (gv w "type") "all"))
      (cond ((equal (gv w "type") "list")
             (setf (gethash "list" h) (mapcar (lambda (x) (inum x 0)) (or (gv w "list") '()))))
            (t (setf (gethash "from" h) (inum (gv w "from") 1)
                     (gethash "to" h) (inum (gv w "to") *total-weeks*)))))
    h))

(defun norm-course (c)
  (let ((h (make-hash-table :test #'equal)))
    (setf (gethash "name" h) (sstr (gv c "name") "")
          (gethash "teacher" h) (sstr (gv c "teacher") "")
          (gethash "location" h) (sstr (gv c "location") "")
          (gethash "day" h) (min 7 (max 1 (inum (gv c "day") 1)))
          (gethash "periodFrom" h) (max 1 (inum (gv c "periodFrom") 1))
          (gethash "periodTo" h) (max 1 (inum (gv c "periodTo") (max 1 (inum (gv c "periodFrom") 1)))))
    (when (gv c "weeks") (setf (gethash "weeks" h) (norm-weeks (gv c "weeks"))))
    (let ((ro (gv c "remindOffsets")))
      (setf (gethash "remindOffsets" h)
            (if (listp ro)
                (mapcar (lambda (x) (max 0 (inum x 0))) (subseq ro 0 (min 3 (length ro))))
                '())))
    h))

(defun j-weeks (w)
  (j-obj (if (equal (gv w "type") "list")
             (list (cons "type" (esc (gv w "type")))
                   (cons "list" (j-arr-str (mapcar #'j-num (gv w "list")))))
             (list (cons "type" (esc (gv w "type")))
                   (cons "from" (j-num (gv w "from")))
                   (cons "to" (j-num (gv w "to")))))))

(defun j-course (c)
  (let ((pairs (list (cons "name" (esc (gv c "name")))
                     (cons "teacher" (esc (gv c "teacher")))
                     (cons "location" (esc (gv c "location")))
                     (cons "day" (j-num (gv c "day")))
                     (cons "periodFrom" (j-num (gv c "periodFrom")))
                     (cons "periodTo" (j-num (gv c "periodTo"))))))
    (when (gv c "weeks") (setf pairs (append pairs (list (cons "weeks" (j-weeks (gv c "weeks")))))))
    (when (gv c "remindOffsets")
      (setf pairs (append pairs (list (cons "remindOffsets"
                                            (j-arr-str (mapcar #'j-num (gv c "remindOffsets"))))))))
    (j-obj pairs)))

;;; ---------------------------------------------------------------- op DSL
;;;
;;; (defop 名字 (:need 路径... :text 模板 (路径...)) body...)
;;; 一条声明同时长出：
;;;   1) 结构化参数校验（:need 逐路径判空，缺哪条就报哪条）
;;;   2) opsText 确认文案（:text 模板 + 路径取参）
;;;   3) 日志文案（缺参 / 未知 op 由框架统一出；成功日志由 body 出）
;;;   4) 执行逻辑（body）

(defstruct op name need text run)

(defvar *ops* (make-hash-table :test #'equal))

(defun miss-desc (op path)
  (if (listp path)
      (format nil "~{~a~^.~}" path)
      (format nil "~a" path)))

(defun op-missing (op opjson)
  (let ((bad nil))
    (dolist (path (op-need op))
      (let ((v (apply #'jget (append (list opjson) (if (listp path) path (list path))))))
        (when (null v) (push (miss-desc op path) bad))))
    (when bad (join-str "、" (nreverse bad)))))

(defmacro defop (name (&key need text) &body body)
  (let ((args (mapcar (lambda (path) `(jget opjson ,@(if (listp path) path (list path))))
                      (cdr text))))
    `(setf (gethash ,name *ops*)
           (make-op
            :name ,name
            :need ',need
            :text (lambda (opjson) (format nil ,(car text) ,@args))
            :run (lambda (opjson courses)
                   (declare (ignorable opjson courses))
                   ,@body)))))

(defun run-op (opjson courses)
  "→ (values courses hits log-text-or-nil opsText-or-nil)"
  (let* ((key (gv opjson "op"))
         (op (and (stringp key) (gethash key *ops*))))
    (cond
      ((null op) (values courses 0 (format nil "未知操作「~a」，已跳过" key) nil))
      ((op-missing op opjson)
       (values courses 0
               (format nil "跳过「~a」：缺少 ~a" (op-name op) (op-missing op opjson))
               nil))
      (t (multiple-value-bind (cs hits log) (funcall (op-run op) opjson courses)
           (values cs hits log (funcall (op-text op) opjson)))))))

;;; 时间夹取规则（edit / move 共用）
(defun fix-day (v old) (min 7 (max 1 (inum v old))))
(defun fix-per (v old) (let ((x (inum v nil))) (if (and x (>= x 1)) x old)))

;;; ---- add ----
(defop "add" (:need ("course" ("course" "name"))
              :text ("加「~a」~@[（带提醒）~]" ("course" "name") ("course" "remindOffsets")))
  (let ((name (sstr (jget opjson "course" "name") "")))
    (if (string= name "")
        (values courses 0 "跳过「add」：name 不能为空")
        (let ((c (norm-course (gv opjson "course"))))
          (unless (gv c "weeks")
            (setf (gethash "weeks" c)
                  (let ((w (make-hash-table :test #'equal)))
                    (setf (gethash "type" w) "range")
                    (setf (gethash "from" w) 1)
                    (setf (gethash "to" w) *total-weeks*)
                    w)))
          (let ((ro (gv (gv opjson "course") "remindOffsets")))
            (values (append courses (list c)) 1
                    (if (and (listp ro) (> (length ro) 3))
                        (list (format nil "加了「~a」" name) "提醒点太多，只留 3 个")
                        (format nil "加了「~a」" name))))))))

;;; ---- del ----
(defop "del" (:need ("match") :text ("删掉「~a」" ("match")))
  (let ((m (sstr (gv opjson "match") "")))
    (let ((hits 0) (keep '()))
      (dolist (c courses)
        (if (and (plusp (length m)) (search m (gv c "name")))
            (incf hits)
            (push c keep)))
      (if (zerop hits)
          (values courses 0 (format nil "没找到「~a」" m))
          (values (nreverse keep) hits (format nil "删掉 ~d 条「~a」" hits m))))))

;;; ---- edit ----
(defun weeks-ok (w)
  "set.weeks 合法值：type∈all|range|odd|even|list；range/odd/even 要 from+to；list 要 list 数组。"
  (let ((ty (and (hash-table-p w) (sstr (gv w "type") ""))))
    (cond ((null ty) nil)
          ((string= ty "all") t)
          ((member ty '("range" "odd" "even") :test #'string=)
           (and (integerp (inum (gv w "from") nil)) (integerp (inum (gv w "to") nil))))
          ((string= ty "list") (listp (gv w "list")))
          (t nil))))

(defun apply-set (c set)
  (dolist (k '("name" "teacher" "location" "day" "periodFrom" "periodTo"))
    (when (nth-value 1 (gethash k set))
      (setf (gethash k c)
            (cond ((string= k "day") (fix-day (gv set k) (gv c k)))
                  ((member k '("periodFrom" "periodTo") :test #'string=)
                   (fix-per (gv set k) (gv c k)))
                  (t (sstr (gv set k) (gv c k)))))))
  (when (nth-value 1 (gethash "weeks" set))
    (if (weeks-ok (gv set "weeks"))
        (progn (setf (gethash "weeks" c) (norm-weeks (gv set "weeks"))) nil)
        "周次格式不对，跳过")))

(defop "edit" (:need ("match" "set") :text ("改「~a」" ("match")))
  (let ((m (sstr (gv opjson "match") "")) (set (gv opjson "set")) (hits 0) (wl '()))
    (dolist (c courses)
      (when (search m (gv c "name"))
        (incf hits)
        (let ((w (apply-set c set))) (when w (push w wl)))))
    (if (zerop hits)
        (values courses 0 (format nil "没找到「~a」" m))
        (values courses hits
                (append (list (format nil "改了 ~d 条「~a」" hits m)) (nreverse wl))))))

;;; ---- move ----
(defop "move" (:need ("match" "day" "periodFrom" "periodTo")
                :text ("移「~a」到周~a 第~a-~a节" ("match") ("day") ("periodFrom") ("periodTo")))
  (let ((m (sstr (gv opjson "match") ""))
        (d (gv opjson "day")) (pf (gv opjson "periodFrom")) (pt (gv opjson "periodTo"))
        (hits 0))
    (dolist (c courses)
      (when (search m (gv c "name"))
        (incf hits)
        (setf (gethash "day" c) (fix-day d (gv c "day"))
              (gethash "periodFrom" c) (fix-per pf (gv c "periodFrom"))
              (gethash "periodTo" c) (fix-per pt (gv c "periodTo")))))
    (if (zerop hits)
        (values courses 0 (format nil "没找到「~a」" m))
        (values courses hits
                (format nil "调了 ~d 条「~a」到周~a 第~a-~a节"
                        hits m (fix-day d 1) (fix-per pf 1) (fix-per pt 1))))))

;;; ---- swap ----
(defop "swap" (:need ("match" "with") :text ("换「~a」和「~a」的时间" ("match") ("with")))
  (let* ((m (sstr (gv opjson "match") ""))
         (w (sstr (gv opjson "with") ""))
         (a (remove-if-not (lambda (c) (search m (gv c "name"))) courses))
         (b (remove-if-not (lambda (c) (search w (gv c "name"))) courses)))
    (cond ((/= (length a) 1)
           (values courses 0 (format nil "跳过「swap」：「~a」命中 ~d 门，要恰好 1 门" m (length a))))
          ((/= (length b) 1)
           (values courses 0 (format nil "跳过「swap」：「~a」命中 ~d 门，要恰好 1 门" w (length b))))
          ((eq (car a) (car b))
           (values courses 0 (format nil "跳过「swap」：「~a」和「~a」是同一门" m w)))
          (t (rotatef (gethash "day" (car a)) (gethash "day" (car b)))
             (rotatef (gethash "periodFrom" (car a)) (gethash "periodFrom" (car b)))
             (rotatef (gethash "periodTo" (car a)) (gethash "periodTo" (car b)))
             (values courses 2
                     (format nil "换了「~a」和「~a」的时间" (gv (car a) "name") (gv (car b) "name")))))))

;;; ---------------------------------------------------------------- 主流程

(defun main ()
  (let* ((path (car (last sb-ext:*posix-argv*)))
         (input (read-json-file path))
         (courses (mapcar #'norm-course (or (gv input "courses") '())))
         (ops (or (gv input "ops") '()))
         (*total-weeks* (inum (gv input "totalWeeks") 16))
         (texts '()) (logs '()) (n 0))
    (let ((bad (find-if-not (lambda (o) (and (stringp (gv o "op")) (gethash (gv o "op") *ops*)))
                            ops)))
      (if bad
          (push (format nil "拒绝：未知 op ~a" (gv bad "op")) logs)
          (dolist (opjson ops)
            (multiple-value-bind (cs hits log text) (run-op opjson courses)
              (setf courses cs)
              (incf n hits)
              (when text (push text texts))
              (if (listp log)
                  (dolist (l log) (push l logs))
                  (when log (push log logs)))))))
    (emit (j-obj (list (cons "opsText" (esc (join-str "；" (nreverse texts))))
                       (cons "courses" (j-arr-str (mapcar #'j-course courses)))
                       (cons "log" (j-arr-str (let ((i 0))
                                                (mapcar (lambda (s)
                                                          (esc (format nil "~d) ~a" (incf i) s)))
                                                        (nreverse logs)))))
                       (cons "n" (j-num n)))))))

(main)

;;;; impl.lisp —— 课表 ops 执行器（表驱动 + 单一漏斗）
;;;; 入口：读 argv[1] 的 JSON 文件，向 stdout 打印一个 JSON。
;;;;
;;;; 三条结构决定：
;;;;  1. JSON 的对象/数组/true/false/null 全部打标签（:obj :arr :true :false :null）——
;;;;     nil 在 CL 里同时是"空表/空对象/假"，不打标签就分不清 {} 和 null。
;;;;  2. 输出沿用镜像自带的 UTF-8（实测 (:UTF-8 :REPLACEMENT …)），非 ASCII 不转义，
;;;;     所以不存在把 emoji 写成 \u1F40B 的可能。
;;;;  3. 所有 op 走 execute 一个漏斗：日志编号与 n 计数只在那里产生，
;;;;     op 只回答"我干了什么"，不碰编号。

;;; ============ 一、JSON 读 ============

(defvar *src* "")
(defvar *pos* 0)

(defun ch-at (k) (and (< k (length *src*)) (char *src* k)))
(defun peek-ch () (ch-at *pos*))
(defun jfail (msg) (error "JSON 解析失败 @~d：~a" *pos* msg))

(defun skip-ws ()
  (loop while (and (peek-ch) (member (peek-ch) '(#\Space #\Tab #\Newline #\Return)))
        do (incf *pos*)))

(defun read-hex4 ()
  (let ((v 0))
    (dotimes (k 4)
      (let ((d (and (peek-ch) (digit-char-p (peek-ch) 16))))
        (unless d (jfail "\\u 需要 4 位十六进制"))
        (setf v (+ (* v 16) d))
        (incf *pos*)))
    v))

(defun j-string ()
  (unless (eql (peek-ch) #\") (jfail "期望字符串"))
  (incf *pos*)
  (let ((out (make-string-output-stream)))
    (loop
      (let ((c (peek-ch)))
        (cond ((null c) (jfail "字符串未闭合"))
              ((eql c #\") (incf *pos*) (return (get-output-stream-string out)))
              ((eql c #\\)
               (incf *pos*)
               (let ((e (peek-ch)))
                 (incf *pos*)
                 (case e
                   (#\" (write-char #\" out))
                   (#\\ (write-char #\\ out))
                   (#\/ (write-char #\/ out))
                   (#\b (write-char #\Backspace out))
                   (#\f (write-char #\Page out))
                   (#\n (write-char #\Newline out))
                   (#\r (write-char #\Return out))
                   (#\t (write-char #\Tab out))
                   (#\u (let ((cp (read-hex4)))
                          ;; 增补平面：单个 \u 只有 4 位，必须由代理对还原成一个码点
                          (if (and (<= #xD800 cp #xDBFF)
                                   (eql (peek-ch) #\\) (eql (ch-at (1+ *pos*)) #\u))
                              (progn
                                (incf *pos* 2)
                                (let ((lo (read-hex4)))
                                  (if (<= #xDC00 lo #xDFFF)
                                      (write-char (code-char (+ #x10000
                                                                (* (- cp #xD800) #x400)
                                                                (- lo #xDC00)))
                                                  out)
                                      (progn (write-char (code-char cp) out)
                                             (write-char (code-char lo) out)))))
                              (write-char (code-char cp) out))))
                   (t (jfail "未知转义")))))
              (t (write-char c out) (incf *pos*)))))))

(defun j-number ()
  (let ((start *pos*) (is-float nil))
    (when (member (peek-ch) '(#\- #\+)) (incf *pos*))
    (loop while (and (peek-ch) (digit-char-p (peek-ch))) do (incf *pos*))
    (when (eql (peek-ch) #\.)
      (setf is-float t) (incf *pos*)
      (loop while (and (peek-ch) (digit-char-p (peek-ch))) do (incf *pos*)))
    (when (member (peek-ch) '(#\e #\E))
      (setf is-float t) (incf *pos*)
      (when (member (peek-ch) '(#\+ #\-)) (incf *pos*))
      (loop while (and (peek-ch) (digit-char-p (peek-ch))) do (incf *pos*)))
    (let ((txt (subseq *src* start *pos*)))
      (if is-float
          (let ((*read-default-float-format* 'double-float) (*read-eval* nil))
            (coerce (read-from-string txt) 'double-float))
          (parse-integer txt)))))

(defun expect-lit (lit)
  (unless (string= (subseq *src* *pos* (min (length *src*) (+ *pos* (length lit)))) lit)
    (jfail (format nil "期望 ~a" lit)))
  (incf *pos* (length lit)))

(defun j-object ()
  (incf *pos*)                          ; 吃 {
  (let ((pairs '()))
    (skip-ws)
    (if (eql (peek-ch) #\})
        (progn (incf *pos*) (cons :obj nil))
        (loop
          (skip-ws)
          (let ((k (j-string)))
            (skip-ws)
            (unless (eql (peek-ch) #\:) (jfail "对象里期望 :"))
            (incf *pos*)
            (push (list k (j-value)) pairs))
          (skip-ws)
          (let ((c (peek-ch)))
            (cond ((eql c #\,) (incf *pos*))
                  ((eql c #\}) (incf *pos*) (return (cons :obj (nreverse pairs))))
                  (t (jfail "对象里期望 , 或 }"))))))))

(defun j-array ()
  (incf *pos*)                          ; 吃 [
  (let ((items '()))
    (skip-ws)
    (if (eql (peek-ch) #\])
        (progn (incf *pos*) (cons :arr nil))
        (loop
          (push (j-value) items)
          (skip-ws)
          (let ((c (peek-ch)))
            (cond ((eql c #\,) (incf *pos*))
                  ((eql c #\]) (incf *pos*) (return (cons :arr (nreverse items))))
                  (t (jfail "数组里期望 , 或 ]"))))))))

(defun j-value ()
  (skip-ws)
  (let ((c (peek-ch)))
    (cond ((null c) (jfail "意外结束"))
          ((eql c #\{) (j-object))
          ((eql c #\[) (j-array))
          ((eql c #\") (j-string))
          ((eql c #\t) (expect-lit "true") :true)
          ((eql c #\f) (expect-lit "false") :false)
          ((eql c #\n) (expect-lit "null") :null)
          (t (j-number)))))

(defun jparse (text)
  (setf *src* text *pos* 0)
  (let ((v (j-value)))
    (skip-ws)
    v))

;;; ============ 二、JSON 写 ============

(defun jw-str (s)
  (with-output-to-string (o)
    (write-char #\" o)
    (loop for ch across s
          for code = (char-code ch) do
          (cond ((eql ch #\") (write-string "\\\"" o))
                ((eql ch #\\) (write-string "\\\\" o))
                ((< code 32)
                 (case ch
                   (#\Newline (write-string "\\n" o))
                   (#\Return (write-string "\\r" o))
                   (#\Tab (write-string "\\t" o))
                   (#\Backspace (write-string "\\b" o))
                   (#\Page (write-string "\\f" o))
                   (t (format o "\\u~4,'0x" code))))
                ;; 其余原样：*standard-output* 本身就是 UTF-8，emoji 直接落地
                (t (write-char ch o))))
    (write-char #\" o)))

(defun jw-num (x)
  (if (integerp x)
      (princ-to-string x)
      (let* ((s (format nil "~,10f" x))
             (dot (position #\. s)))
        (if (null dot)
            s
            (let ((tail (string-right-trim "0" (subseq s (1+ dot)))))
              (concatenate 'string (subseq s 0 (1+ dot))
                           (if (string= tail "") "0" tail)))))))

(defun jw (v)
  (cond ((stringp v) (jw-str v))
        ((integerp v) (princ-to-string v))
        ((floatp v) (jw-num v))
        ((eq v :true) "true")
        ((eq v :false) "false")
        ((eq v :null) "null")
        ((null v) "null")
        ((and (consp v) (eq (car v) :obj))
         (format nil "{~{~a~^,~}}"
                 (mapcar (lambda (p) (format nil "~a:~a" (jw-str (first p)) (jw (second p))))
                         (cdr v))))
        ((and (consp v) (eq (car v) :arr))
         (format nil "[~{~a~^,~}]" (mapcar #'jw (cdr v))))
        (t "null")))

;;; ============ 三、课程模型（alist，键是字符串）============

(defvar *courses* nil)

(defun jget (obj key)
  (let ((p (assoc key (cdr obj) :test #'string=))) (and p (second p))))
(defun cget (c key)
  (let ((p (assoc key c :test #'string=))) (and p (second p))))
(defun cset (c key v)
  (let ((p (assoc key c :test #'string=)))
    (if p (setf (second p) v) (nconc c (list (list key v)))))
  v)
(defun name-of (c) (let ((v (cget c "name"))) (if (stringp v) v "")))

(defun as-int (v &optional (d 0))
  (cond ((integerp v) v)
        ((floatp v) (round v))
        ((stringp v) (or (ignore-errors (parse-integer v :junk-allowed t)) d))
        (t d)))
(defun day-ok (v) (max 1 (min 7 (as-int v 1))))
(defun period-ok (v) (max 1 (as-int v 1)))

(defun fix-course (c)
  "把一门课的 day / periodFrom / periodTo 收进合法域；倒挂就抬 periodTo。"
  (cset c "day" (day-ok (cget c "day")))
  (let ((f (period-ok (cget c "periodFrom")))
        (t2 (period-ok (cget c "periodTo"))))
    (when (< t2 f) (setf t2 f))
    (cset c "periodFrom" f)
    (cset c "periodTo" t2))
  c)

(defun dflt-weeks () (list :obj (list "type" "range") (list "from" 1) (list "to" 16)))

(defun match-courses (pat)
  (if (not (stringp pat))
      nil
      (remove-if-not (lambda (c) (search pat (name-of c))) *courses*)))

;;; ============ 四、op：每个只回答（文案、改动条数）============

(defun op-add (op)
  (let ((raw (jget op "course")))
    (if (not (and (consp raw) (eq (car raw) :obj)))
        (values "加：缺少 course，未执行" 0)
        (let ((c (copy-tree (cdr raw))))
          (unless (cget c "weeks") (cset c "weeks" (dflt-weeks)))
          (fix-course c)
          (setf *courses* (nconc *courses* (list c)))
          (values (format nil "加「~a」" (name-of c)) 1)))))

(defun op-del (op)
  (let* ((pat (jget op "match"))
         (hits (match-courses pat))
         (k (length hits)))
    (if (zerop k)
        (values (format nil "没找到「~a」" (if (stringp pat) pat "")) 0)
        (progn
          (setf *courses* (remove-if (lambda (c) (member c hits)) *courses*))
          (values (format nil "删「~a」~d 门" pat k) k)))))

(defun op-edit (op)
  (let* ((pat (jget op "match"))
         (set (jget op "set"))
         (hits (match-courses pat)))
    (if (or (null hits) (not (and (consp set) (eq (car set) :obj))))
        (values (format nil "改「~a」：没找到" (if (stringp pat) pat "")) 0)
        (let ((changed 0))
          (dolist (c hits)
            (let ((before (copy-tree c)))
              (dolist (p (cdr set)) (cset c (first p) (second p)))
              (fix-course c)
              (unless (equal before c) (incf changed))))
          (values (format nil "改「~a」键：~{~a~^/~}" pat (mapcar #'first (cdr set)))
                  changed)))))

(defun op-move (op)
  (let ((pat (jget op "match")) (d (jget op "day"))
        (f (jget op "periodFrom")) (t2 (jget op "periodTo")))
    (if (or (not (stringp pat)) (null d) (null f) (null t2)
            (member :null (list d f t2)))
        (values "移动：三件套不全，未执行" 0)
        (let ((hits (match-courses pat)))
          (dolist (c hits)
            (cset c "day" d) (cset c "periodFrom" f) (cset c "periodTo" t2)
            (fix-course c))
          (values (format nil "移动「~a」~d 门到第~a天 ~a-~a 节" pat (length hits) d f t2)
                  (length hits))))))

(defun op-swap (op)
  (let* ((a (match-courses (jget op "match")))
         (b (match-courses (jget op "with"))))
    (if (or (/= (length a) 1) (/= (length b) 1) (eql (car a) (car b)))
        (values "互换：两侧各需恰好命中 1 门，未执行" 0)
        (let ((x (car a)) (y (car b)))
          (dolist (k '("day" "periodFrom" "periodTo"))
            (let ((vx (cget x k)) (vy (cget y k)))
              (cset x k vy) (cset y k vx)))
          (values (format nil "互换「~a」与「~a」" (name-of x) (name-of y)) 2)))))

(defun op-stats (op)
  (declare (ignore op))
  (let ((slots 0))
    (dolist (c *courses*)
      (incf slots (+ 1 (- (period-ok (cget c "periodTo"))
                          (period-ok (cget c "periodFrom"))))))
    (values (format nil "共 ~d 门课，~d 个时段被占" (length *courses*) slots) 0)))

;;; ============ 五、名册（唯一的 op 名单，别在别处再抄一遍）============

(defparameter *ops*
  (list (cons "add" #'op-add)
        (cons "del" #'op-del)
        (cons "edit" #'op-edit)
        (cons "move" #'op-move)
        (cons "swap" #'op-swap)
        (cons "stats" #'op-stats)))

(defun op-handler (name)
  (and (stringp name) (cdr (assoc name *ops* :test #'string=))))

(defun op-name-text (o)
  (let ((v (and (consp o) (eq (car o) :obj) (jget o "op"))))
    (cond ((stringp v) v) ((null v) "?") (t (jw v)))))

;;; ============ 六、单一漏斗 ============

(defun execute (ops)
  "返回 (values opsText log n)。日志编号只在这里生成。"
  (let ((log '()) (texts '()) (n 0) (i 0))
    (dolist (o ops)
      (incf i)
      (multiple-value-bind (txt cnt) (funcall (op-handler (jget o "op")) o)
        (incf n cnt)
        (push txt texts)
        (push (format nil "~d) ~a" i txt) log)))
    (values (format nil "~{~a~^~%~}" (nreverse texts))
            (nreverse log)
            n)))

;;; ============ 七、入口 ============

(defun slurp (path)
  (with-open-file (s path :external-format :utf-8 :element-type 'character)
    (let ((o (make-string-output-stream)))
      (loop for ch = (read-char s nil nil) while ch do (write-char ch o))
      (let ((str (get-output-stream-string o)))
        ;; 别把 BOM 当代码读
        (if (and (plusp (length str)) (= (char-code (char str 0)) #xFEFF))
            (subseq str 1)
            str)))))

(defun emit (ops-text log n)
  (let ((doc (list :obj
                   (list "opsText" ops-text)
                   (list "courses" (cons :arr (mapcar (lambda (c) (cons :obj c)) *courses*)))
                   (list "log" (cons :arr log))
                   (list "n" n))))
    (write-string (jw doc))
    (terpri)))

(defun main ()
  (let* ((path (second sb-ext:*posix-argv*))
         (doc (if path (jparse (slurp path)) (list :obj nil)))
         (cin (jget doc "courses"))
         (oin (jget doc "ops"))
         ;; 内部表示是"裸 alist"：进了门就把 :obj 标签摘掉，出门再戴回去
         (*courses* (if (and (consp cin) (eq (car cin) :arr))
                        (mapcar (lambda (c) (copy-tree (cdr c))) (cdr cin))
                        nil))
         (ops (if (and (consp oin) (eq (car oin) :arr)) (cdr oin) nil))
         (bad (find-if-not (lambda (o) (and (consp o) (eq (car o) :obj) (op-handler (jget o "op"))))
                           ops)))
    (cond ((null ops) (emit "" nil 0))          ; 空 ops：什么都不做
          ;; 整包拒绝：只要有一条未知 op，*courses* 一条都不动，正好原样输出
          (bad (emit "" (list (format nil "1) 拒绝：未知 op ~a" (op-name-text bad))) 0))
          (t (multiple-value-bind (txt log n) (execute ops)
               (emit txt log n))))))

(main)

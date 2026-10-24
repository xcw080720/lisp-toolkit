;; impl.lisp — scale 臂前 5 个 op（add / del / edit / move / swap）
;; 调用： sbcl --script impl.lisp input.json  →  stdout 一个 JSON
;; 数据模型：对象一律 (:obj ("键" . 值) ...) 保序；数组为普通 list；null 为 :null
;; 口径：运行期不依赖 REPL；REPL 只在开发期问运行时。

(defvar *src* "")
(defvar *pos* 0)
(defvar *courses* nil)
(defvar *log* nil)                      ; 逆序累积

;; ---------- JSON 读 ----------
(defun peekc () (and (< *pos* (length *src*)) (char *src* *pos*)))

(defun skipws ()
  (loop while (member (peekc) '(#\Space #\Tab #\Newline #\Return)) do (incf *pos*)))

(defun jstring ()
  (incf *pos*)
  (let ((out (make-string-output-stream)))
    (loop for c = (prog1 (peekc) (incf *pos*))
          until (or (null c) (char= c #\"))
          do (if (char= c #\\)
                 (let ((e (prog1 (peekc) (incf *pos*))))
                   (write-char (case e
                                 (#\n #\Newline) (#\t #\Tab) (#\r #\Return)
                                 (#\b #\Backspace) (#\f #\Page)
                                 (#\u (prog1 (code-char (parse-integer *src* :start *pos*
                                                                       :end (+ *pos* 4) :radix 16))
                                            (incf *pos* 4)))
                                 (t e))
                               out))
                 (write-char c out)))
    (get-output-stream-string out)))

(defun jnumber ()
  (let ((start *pos*))
    (loop while (and (peekc) (find (peekc) "+-.0123456789eE")) do (incf *pos*))
    (let ((tok (subseq *src* start *pos*)))
      (if (find-if (lambda (c) (find c ".eE")) tok)
          (let ((*read-default-float-format* 'double-float)) (read-from-string tok))
          (parse-integer tok)))))

(defun jobject ()
  (incf *pos*)
  (let ((pairs '()))
    (loop
      (skipws)
      (when (char= (peekc) #\}) (incf *pos*) (return))
      (when (char= (peekc) #\,) (incf *pos*) (skipws))
      (let ((k (jstring)))
        (skipws) (incf *pos*)
        (push (cons k (jvalue)) pairs)))
    (cons :obj (nreverse pairs))))

(defun jarray ()
  (incf *pos*)
  (let ((items '()))
    (loop
      (skipws)
      (when (char= (peekc) #\]) (incf *pos*) (return))
      (when (char= (peekc) #\,) (incf *pos*) (skipws))
      (push (jvalue) items))
    (nreverse items)))

(defun jvalue ()
  (skipws)
  (let ((c (peekc)))
    (cond ((char= c #\{) (jobject))
          ((char= c #\[) (jarray))
          ((char= c #\") (jstring))
          ((char= c #\t) (incf *pos* 4) :true)
          ((char= c #\f) (incf *pos* 5) :false)
          ((char= c #\n) (incf *pos* 4) :null)
          (t (jnumber)))))

(defun jparse (s) (setf *src* s *pos* 0) (jvalue))

;; ---------- JSON 写（直出 UTF-8；本机 stdout external-format 实测 :UTF-8） ----------
(defun wstr (s)
  (write-char #\")
  (loop for c across s do
    (case c (#\" (write-string "\\\""))
          (#\\ (write-string "\\\\"))
          (#\Newline (write-string "\\n"))
          (#\Tab (write-string "\\t"))
          (#\Return (write-string "\\r"))
          (t (write-char c))))
  (write-char #\"))

(defun jw (v)
  (cond ((eq v :null) (write-string "null"))
        ((eq v :true) (write-string "true"))
        ((eq v :false) (write-string "false"))
        ((stringp v) (wstr v))
        ((integerp v) (format t "~d" v))
        ((numberp v) (format t "~f" v))
        ((and (consp v) (eq (car v) :obj))
         (write-char #\{)
         (loop for p in (cdr v) for i from 0
               do (when (> i 0) (write-char #\,)) (wstr (car p)) (write-char #\:) (jw (cdr p)))
         (write-char #\}))
        ((listp v)
         (write-char #\[)
         (loop for x in v for i from 0
               do (when (> i 0) (write-char #\,)) (jw x))
         (write-char #\]))
        (t (write-string "null"))))

;; ---------- 对象存取（alist，保序） ----------
(defun g (o k)
  (let ((p (and (consp o) (assoc k (cdr o) :test #'equal))))
    (if p (cdr p) :null)))

(defun setk (o k v)
  (let ((p (assoc k (cdr o) :test #'equal)))
    (if p
        (setf (cdr p) v)
        (setf (cdr o) (append (cdr o) (list (cons k v)))))
    v))

(defun nz (v d) (if (numberp v) v d))
(defun sx (v) (if (stringp v) v ""))
(defun clampday (n) (max 1 (min 7 (round n))))
(defun has (name m) (and (search m name) t))
(defun cname (c) (sx (g c "name")))
(defun note (text) (push text *log*))

(defun fix-periods (pf pt)              ; 1 ≤ periodFrom ≤ periodTo
  (let ((a (max 1 (round pf))) (b (max 1 (round pt))))
    (list a (max a b))))

;; ---------- 5 个 op：各返回"实际改动条数" ----------
(defun op-add (op)
  (let* ((c (g op "course"))
         (nm (cname c))
         (d (clampday (nz (g c "day") 1)))
         (ps (fix-periods (nz (g c "periodFrom") 1) (nz (g c "periodTo") 1)))
         (w (g c "weeks")))
    (setf *courses*
          (append *courses*
                  (list (list :obj
                              (cons "name" nm)
                              (cons "teacher" (sx (g c "teacher")))
                              (cons "location" (sx (g c "location")))
                              (cons "day" d)
                              (cons "periodFrom" (first ps))
                              (cons "periodTo" (second ps))
                              (cons "weeks" (if (eq w :null)
                                                (list :obj (cons "type" "range")
                                                      (cons "from" 1) (cons "to" 16))
                                                w))
                              (cons "tag" (g c "tag"))))))
    (note (format nil "add \"~a\" day ~d 第~d-~d节" nm d (first ps) (second ps)))
    1))

(defun op-del (op)
  (let* ((m (sx (g op "match")))
         (hit (remove-if-not (lambda (c) (has (cname c) m)) *courses*)))
    (setf *courses* (remove-if (lambda (c) (has (cname c) m)) *courses*))
    (note (if hit
              (format nil "del \"~a\" 命中~d门" m (length hit))
              (format nil "del \"~a\" 没找到" m)))
    (length hit)))

(defun op-edit (op)
  (let* ((m (sx (g op "match")))
         (set (g op "set"))
         (hit (remove-if-not (lambda (c) (has (cname c) m)) *courses*)))
    (dolist (c hit)
      (let ((d (g set "day")))
        (unless (eq d :null) (setk c "day" (clampday d))))
      (dolist (k '("name" "teacher" "location" "periodFrom" "periodTo" "weeks" "tag"))
        (let ((v (g set k)))
          (unless (eq v :null) (setk c k v)))))
    (note (if hit
              (format nil "edit \"~a\" 改了~d门" m (length hit))
              (format nil "edit \"~a\" 没找到" m)))
    (length hit)))

(defun op-move (op)
  (let ((m (sx (g op "match"))) (d (g op "day"))
        (pf (g op "periodFrom")) (pt (g op "periodTo")))
    (if (not (every #'numberp (list d pf pt)))
        (progn (note (format nil "move \"~a\" 缺 day/periodFrom/periodTo，不执行" m)) 0)
        (let ((hit (remove-if-not (lambda (c) (has (cname c) m)) *courses*))
              (ps (fix-periods pf pt))
              (dd (clampday d)))
          (dolist (c hit)
            (setk c "day" dd)
            (setk c "periodFrom" (first ps))
            (setk c "periodTo" (second ps)))
          (note (format nil "move \"~a\" ~d门 -> day ~d 第~d-~d节"
                        m (length hit) dd (first ps) (second ps)))
          (length hit)))))

(defun op-swap (op)
  (let* ((a (sx (g op "match"))) (b (sx (g op "with")))
         (ha (remove-if-not (lambda (c) (has (cname c) a)) *courses*))
         (hb (remove-if-not (lambda (c) (has (cname c) b)) *courses*)))
    (cond ((not (and (= 1 (length ha)) (= 1 (length hb))))
           (note (format nil "swap \"~a\"(~d) / \"~a\"(~d) 不是各1门，不执行"
                         a (length ha) b (length hb)))
           0)
          ((eq (car ha) (car hb))
           (note (format nil "swap \"~a\" 两侧同一门，不执行" a))
           0)
          (t (let* ((ca (car ha)) (cb (car hb))
                    (ta (mapcar (lambda (k) (g ca k)) '("day" "periodFrom" "periodTo")))
                   (tb (mapcar (lambda (k) (g cb k)) '("day" "periodFrom" "periodTo"))))
               (loop for k in '("day" "periodFrom" "periodTo")
                     for x in tb for y in ta
                     do (setk ca k x) (setk cb k y))
               (note (format nil "swap \"~a\" <-> \"~a\"" a b))
               2)))))

(defvar *ops*
  (list (cons "add" #'op-add) (cons "del" #'op-del) (cons "edit" #'op-edit)
        (cons "move" #'op-move) (cons "swap" #'op-swap)))

(defun op-fn (name) (cdr (assoc name *ops* :test #'string=)))

;; ---------- 总控 ----------
(defun slurp (path)
  (with-open-file (in path :external-format :utf-8)
    (with-output-to-string (out)
      (loop for line = (read-line in nil nil)
            while line do (write-string line out) (write-char #\Newline out)))))

(defun emit (courses n &optional forced-text)
  (let* ((lines (reverse *log*))
         (text (or forced-text
                   (if lines (format nil "~{~a~^~%~}" lines) ""))))
    (jw (list :obj
              (cons "opsText" text)
              (cons "courses" courses)
              (cons "log" (loop for l in lines for i from 1
                                collect (format nil "~d) ~a" i l)))
              (cons "n" n)))))

(defun main ()
  (let* ((path (car (last sb-ext:*posix-argv*)))
         (doc (jparse (slurp path)))
         (ops (let ((x (g doc "ops"))) (if (listp x) x '())))
         (orig (let ((x (g doc "courses"))) (if (listp x) x '()))))
    (setf *courses* orig *log* '())
    (let ((bad (find-if-not (lambda (o) (op-fn (sx (g o "op")))) ops)))
      (if bad
          (progn (setf *log* (list (format nil "拒绝：未知 op ~a" (sx (g bad "op")))))
                 (emit *courses* 0 ""))
          (let ((n 0))
            (dolist (o ops) (incf n (funcall (op-fn (sx (g o "op"))) o)))
            (emit *courses* n))))))

(main)

;;;; impl.lisp — 课表 ops 执行器（规模臂 · 建的时候就要有的 5 个 op）
;;;; 用法：sbcl --script impl.lisp in.json
;;;; 契约：{"opsText":"...","courses":[...],"log":["1) ..."],"n":N}

;; ---------------- 0. 输出：强制 UTF-8 字节 ----------------
(defun emit (text)
  (finish-output)
  (let ((octets (sb-ext:string-to-octets text :external-format :utf-8)))
    (handler-case
        (let ((s (sb-sys:make-fd-stream 1 :output t
                                        :element-type '(unsigned-byte 8)
                                        :buffering :none :auto-close nil)))
          (write-sequence octets s)
          (force-output s))
      (error () (write-string text)))))

;; ---------------- 1. JSON 读 ----------------
(defparameter *s* "")
(defparameter *i* 0)

(defun pk () (and (< *i* (length *s*)) (char *s* *i*)))

(defun skip-ws ()
  (loop while (and (pk) (member (pk) '(#\Space #\Tab #\Newline #\Return)))
        do (incf *i*)))

(defun jstr ()
  (incf *i*)                                    ; 开引号
  (let ((out (make-string-output-stream)))
    (loop
      (let ((c (pk)))
        (cond ((null c) (error "字符串未闭合"))
              ((char= c #\") (incf *i*) (return (get-output-stream-string out)))
              ((char= c #\\)
               (incf *i*)
               (let ((e (pk)))
                 (incf *i*)
                 (write-char (case e
                               (#\n #\Newline) (#\t #\Tab) (#\r #\Return)
                               (#\b #\Backspace) (#\f #\Page)
                               (#\u (prog1 (code-char (parse-integer *s* :start *i* :end (+ *i* 4) :radix 16))
                                      (incf *i* 4)))
                               (t e))
                             out)))
              (t (write-char c out) (incf *i*)))))))

(defun jnum ()
  (let ((start *i*) (dot nil))
    (loop while (and (pk) (or (digit-char-p (pk)) (find (pk) "-+.eE")))
          do (when (find (pk) ".eE") (setf dot t))
             (incf *i*))
    (let ((txt (subseq *s* start *i*)))
      (if dot (coerce (read-from-string txt) 'double-float) (parse-integer txt)))))

(defun jval ()
  (skip-ws)
  (let ((c (pk)))
    (cond ((null c) (error "意外 EOF"))
          ((char= c #\{) (jobj))
          ((char= c #\[) (jarr))
          ((char= c #\") (jstr))
          ((char= c #\t) (incf *i* 4) :true)
          ((char= c #\f) (incf *i* 5) :false)
          ((char= c #\n) (incf *i* 4) :null)
          (t (jnum)))))

(defun jobj ()
  (incf *i*)                                    ; {
  (let ((al '()))
    (skip-ws)
    (if (char= (pk) #\})
        (progn (incf *i*) (cons :obj (nreverse al)))
        (loop
          (skip-ws)
          (let ((k (jstr)))
            (skip-ws)
            (incf *i*)                          ; :
            (push (cons k (jval)) al))
          (skip-ws)
          (let ((c (pk)))
            (cond ((char= c #\,) (incf *i*))
                  ((char= c #\}) (incf *i*) (return (cons :obj (nreverse al))))
                  (t (error "对象解析失败 @~a" *i*))))))))

(defun jarr ()
  (incf *i*)                                    ; [
  (let ((xs '()))
    (skip-ws)
    (if (char= (pk) #\])
        (progn (incf *i*) (cons :arr (nreverse xs)))
        (loop
          (push (jval) xs)
          (skip-ws)
          (let ((c (pk)))
            (cond ((char= c #\,) (incf *i*))
                  ((char= c #\]) (incf *i*) (return (cons :arr (nreverse xs))))
                  (t (error "数组解析失败 @~a" *i*))))))))

(defun jparse (str) (setf *s* str *i* 0) (jval))

(defun jget (o k &optional (d :null))
  (let ((p (and (consp o) (eq (car o) :obj) (assoc k (cdr o) :test #'string=))))
    (if p (cdr p) d)))

(defun jst (o k) (let ((v (jget o k))) (if (stringp v) v "")))

(defun job (al) (cons :obj al))

;; ---------------- 2. JSON 写 ----------------
(defun jw-str (o v)
  (write-char #\" o)
  (loop for c across v do
        (cond ((char= c #\") (write-string "\\\"" o))
              ((char= c #\\) (write-string "\\\\" o))
              ((char= c #\Newline) (write-string "\\n" o))
              ((char= c #\Return) (write-string "\\r" o))
              ((char= c #\Tab) (write-string "\\t" o))
              ((< (char-code c) 32) (format o "\\u~4,'0x" (char-code c)))
              (t (write-char c o))))
  (write-char #\" o))

(defun jw (o v)
  (cond ((eq v :null) (write-string "null" o))
        ((eq v :true) (write-string "true" o))
        ((eq v :false) (write-string "false" o))
        ((stringp v) (jw-str o v))
        ((and (consp v) (eq (car v) :obj))
         (write-char #\{ o)
         (let ((first t))
           (loop for pair in (cdr v) do
                 (unless first (write-char #\, o))
                 (setf first nil)
                 (jw-str o (car pair))
                 (write-char #\: o)
                 (jw o (cdr pair))))
         (write-char #\} o))
        ((and (consp v) (eq (car v) :arr))
         (write-char #\[ o)
         (let ((first t))
           (loop for x in (cdr v) do
                 (unless first (write-char #\, o))
                 (setf first nil)
                 (jw o x)))
         (write-char #\] o))
        ((integerp v) (format o "~d" v))
        ((floatp v) (format o "~f" v))
        (t (write-string "null" o))))

;; ---------------- 3. 读输入文件 ----------------
(defun slurp (path)
  (with-open-file (in path :direction :input :external-format :utf-8)
    (let ((out (make-string-output-stream)))
      (loop for line = (read-line in nil :eof)
            while (not (eq line :eof))
            do (write-string line out) (terpri out))
      (get-output-stream-string out))))

;; ---------------- 4. ops 执行器 ----------------
(defparameter *courses* nil)
(defparameter *log* nil)

(defun logit (fmt &rest args) (push (apply #'format nil fmt args) *log*))

(defun clamp-day (n) (max 1 (min 7 (if (integerp n) n (or n 1)))))

(defun cset (c k v)
  (let ((p (assoc k (cdr c) :test #'string=)))
    (if p (rplacd p v) (push (cons k v) (cdr c))))
  c)

(defun cget (c k &optional (d :null)) (jget c k d))

(defun hit? (match c) (search match (jst c "name")))

(defun hits (match) (remove-if-not (lambda (c) (hit? match c)) *courses*))

(defun add-course (op)
  (let ((c (jget op "course")))
    (when (eq (jget c "weeks") :null)
      (cset c "weeks" (job (list (cons "type" "range") (cons "from" 1) (cons "to" 16)))))
    (cset c "day" (clamp-day (jget c "day" 1)))
    (when (eq (jget c "tag") :null) (cset c "tag" :null))
    (setf *courses* (append *courses* (list c)))
    (logit "新增 ~a" (jst c "name"))
    1))

(defun del-courses (op)
  (let* ((m (jst op "match"))
         (hs (hits m)))
    (if (null hs)
        (progn (logit "没找到 ~a" m) 0)
        (progn (setf *courses* (remove-if (lambda (c) (hit? m c)) *courses*))
               (logit "删除 ~d 门（~a）" (length hs) m)
               (length hs)))))

(defun edit-courses (op)
  (let* ((m (jst op "match"))
         (set (jget op "set"))
         (hs (hits m)))
    (if (null hs)
        (progn (logit "没找到 ~a" m) 0)
        (progn
          (dolist (c hs)
            (loop for pair in (cdr set) do
                  (let ((k (car pair)) (v (cdr pair)))
                    (when (string= k "day") (setf v (clamp-day v)))
                    (cset c k v))))
          (logit "修改 ~d 门（~a）" (length hs) m)
          (length hs)))))

(defun move-courses (op)
  (let ((m (jst op "match"))
        (day (jget op "day"))
        (pf (jget op "periodFrom"))
        (pt (jget op "periodTo")))
    (if (or (null (jst op "match")) (eq day :null) (eq pf :null) (eq pt :null))
        (progn (logit "缺少字段，未执行 move") 0)
        (let ((hs (hits m)))
          (if (null hs)
              (progn (logit "没找到 ~a" m) 0)
              (progn
                (dolist (c hs)
                  (cset c "day" (clamp-day day))
                  (cset c "periodFrom" pf)
                  (cset c "periodTo" pt))
                (logit "移动 ~d 门到 周~d" (length hs) day)
                (length hs)))))))

(defun swap-courses (op)
  (let* ((a (jst op "match"))
         (b (jst op "with"))
         (ha (hits a))
         (hb (hits b)))
    (if (and (= 1 (length ha)) (= 1 (length hb)) (not (eq (car ha) (car hb))))
        (let ((ca (car ha)) (cb (car hb)))
          (dolist (k '("day" "periodFrom" "periodTo"))
            (let ((va (cget ca k)) (vb (cget cb k)))
              (cset ca k vb)
              (cset cb k va)))
          (logit "交换 ~a 与 ~a" (jst ca "name") (jst cb "name"))
          2)
        (progn (logit "交换失败：两侧须各恰好命中 1 门") 0))))

(defparameter *ops* '(("add" . add-course)
                      ("del" . del-courses)
                      ("edit" . edit-courses)
                      ("move" . move-courses)
                      ("swap" . swap-courses)))

(defun op-fn (name) (cdr (assoc name *ops* :test #'string=)))

(defun op-text (ops)
  (with-output-to-string (o)
    (let ((n 0))
      (dolist (op ops)
        (format o "~d) ~a ~a~%" (incf n) (jst op "op") (jst op "match"))))))

(defun numbered (logs)
  (let ((n 0))
    (mapcar (lambda (l) (format nil "~d) ~a" (incf n) l)) logs)))

(defun render (opstext courses logs n)
  (with-output-to-string (o)
    (write-string "{\"opsText\":" o) (jw o opstext)
    (write-string ",\"courses\":" o) (jw o (cons :arr courses))
    (write-string ",\"log\":" o) (jw o (cons :arr logs))
    (format o ",\"n\":~d}" n)))

(defun run-file (path)
  (let* ((root (jparse (slurp path)))
         (courses (copy-list (cdr (jget root "courses" (cons :arr nil)))))
         (ops (copy-list (cdr (jget root "ops" (cons :arr nil)))))
         (bad (find-if-not (lambda (op) (op-fn (jst op "op"))) ops)))
    (cond
      ((null ops) (render "" courses '() 0))
      (bad (render "" courses (list (format nil "1) 拒绝：未知 op ~a" (jst bad "op"))) 0))
      (t
       (let ((*courses* courses) (*log* '()) (n 0))
         (dolist (op ops) (incf n (funcall (op-fn (jst op "op")) op)))
         (render (op-text ops) *courses* (numbered (reverse *log*)) n))))))

(defun main ()
  (let ((argv (last sb-ext:*posix-argv*)))
    (emit (concatenate 'string (run-file (car argv)) (string #\Newline)))))

;; 在活体会话里 (load "impl.lisp") 时不应因缺 argv 而炸：
(handler-case (main) (error (e) (declare (ignore e)) nil))

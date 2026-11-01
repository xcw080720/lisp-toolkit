;;; timetable ops executor v3.1 -- 30 commands + global --dry prefix.
;;; Pure ASCII, single file, argv in, stdout out, no file I/O, no library.

(defstruct (course (:conc-name c-))
  (name "" :type string)
  (teacher "-" :type string)
  (loc "-" :type string)
  (day 1 :type fixnum)
  (from 1 :type fixnum)
  (to 2 :type fixnum))

(defstruct op name types fn)

(defvar *ops* (make-hash-table :test #'equal))
(defvar *courses* nil)

(defun fail (code) (throw 'reject (cons :err code)))

;;; ---------- tokenizing / argument parsing ----------

(defun space-char-p (ch)
  (or (char= ch #\Space) (char= ch #\Tab)
      (char= ch #\Return) (char= ch #\Newline)))

(defun split-words (s)
  (let ((out '()) (start nil) (n (length s)))
    (dotimes (i n)
      (if (space-char-p (char s i))
          (when start (push (subseq s start i) out) (setf start nil))
          (unless start (setf start i))))
    (when start (push (subseq s start n) out))
    (nreverse out)))

(defun word-p (s)
  (and (<= 1 (length s) 12)
       (loop for ch across s always (>= (char-code ch) 32))))

(defun digits-value (s)
  (when (and (<= 1 (length s) 6) (every #'digit-char-p s))
    (let ((v 0))
      (loop for ch across s do (setf v (+ (* v 10) (- (char-code ch) 48))))
      v)))

(defun signed-value (s)
  (let ((n (length s)))
    (when (>= n 1)
      (if (or (char= (char s 0) #\-) (char= (char s 0) #\+))
          (let ((v (digits-value (subseq s 1))))
            (and v (if (char= (char s 0) #\-) (- v) v)))
          (digits-value s)))))

(defun parse-token (ty tok)
  (case ty
    (:word (if (word-p tok) tok (fail "BADARG")))
    (:day (let ((v (digits-value tok)))
            (if (and v (<= 1 v 7)) v (fail "BADARG"))))
    (:hour (let ((v (digits-value tok)))
             (if (and v (<= 1 v 12)) v (fail "BADARG"))))
    (:nat (or (digits-value tok) (fail "BADARG")))
    (:int (or (signed-value tok) (fail "BADARG")))
    (t (fail "BADARG"))))

(defun parse-args (types toks)
  (unless (= (length types) (length toks)) (fail "BADARG"))
  (loop for ty in types for tk in toks collect (parse-token ty tk)))

;;; ---------- state helpers ----------

(defun find-course (name)
  (find name *courses* :key #'c-name :test #'string=))

(defun require-course (name)
  (or (find-course name) (fail "NOTFOUND")))

(defun course-conflict-p (day from to &optional self)
  (loop for c in *courses*
        when (and (not (eq c self))
                  (= (c-day c) day)
                  (<= from (c-to c))
                  (<= (c-from c) to))
          return c))

(defun room-check (k)
  (when (> (+ (length *courses*) k) 20) (fail "LIMIT")))

(defun check-span (from to)
  (unless (<= from to) (fail "BADARG")))

(defun sort-by-name (lst)
  (sort (copy-list lst)
        (lambda (a b) (string< (c-name a) (c-name b)))))

(defun copy-courses (lst) (mapcar #'copy-course lst))

(defun drop-courses (kill)
  (when kill
    (setf *courses*
          (remove-if (lambda (c) (member c kill :test #'eq)) *courses*)))
  (length kill))

(defun compress-day (day)
  (let ((cs (sort (remove-if-not (lambda (c) (= (c-day c) day)) *courses*)
                  (lambda (a b)
                    (or (< (c-from a) (c-from b))
                        (and (= (c-from a) (c-from b))
                             (string< (c-name a) (c-name b)))))))
        (n 0)
        (k 1))
    (dolist (c cs)
      (unless (and (= (c-from c) k) (= (c-to c) (1+ k)))
        (incf n))
      (setf (c-from c) k)
      (setf (c-to c) (1+ k))
      (incf k))
    n))

;;; ---------- the op macro: one form per op ----------

(defmacro defop (name args &body body)
  (let ((vars (mapcar #'first args))
        (types (mapcar #'second args))
        (fn (intern (concatenate 'string "OP-" (string-upcase name)))))
    `(progn
       (defun ,fn ,vars ,@body)
       (setf (gethash (string-downcase ,name) *ops*)
             (make-op :name ,name :types ',types :fn #',fn)))))

;;; ---------- op 1..15 ----------

(defop "add" ((name :word) (teacher :word) (loc :word)
              (day :day) (from :hour) (to :hour))
  (check-span from to)
  (when (find-course name) (fail "DUP"))
  (room-check 1)
  (when (course-conflict-p day from to) (fail "CONFLICT"))
  (push (make-course :name name :teacher teacher :loc loc
                     :day day :from from :to to)
        *courses*)
  1)

(defop "del" ((name :word))
  (let ((c (require-course name)))
    (setf *courses* (remove c *courses* :test #'eq))
    1))

(defop "edit" ((name :word) (teacher :word) (loc :word))
  (let ((c (require-course name)))
    (setf (c-teacher c) teacher)
    (setf (c-loc c) loc)
    1))

(defop "move" ((name :word) (day :day) (from :hour) (to :hour))
  (check-span from to)
  (let ((c (require-course name)))
    (when (course-conflict-p day from to c) (fail "CONFLICT"))
    (setf (c-day c) day)
    (setf (c-from c) from)
    (setf (c-to c) to)
    1))

(defop "swap" ((a :word) (b :word))
  (let ((x (require-course a)) (y (require-course b)))
    (rotatef (c-day x) (c-day y))
    (rotatef (c-from x) (c-from y))
    (rotatef (c-to x) (c-to y))
    2))

(defop "rename" ((old :word) (new :word))
  (let ((c (require-course old)))
    (when (and (not (string= old new)) (find-course new)) (fail "DUP"))
    (setf (c-name c) new)
    1))

(defop "duplicate" ((name :word) (newname :word))
  (let ((c (require-course name)))
    (when (find-course newname) (fail "DUP"))
    (room-check 1)
    (let ((n (copy-course c)))
      (setf (c-name n) newname)
      (push n *courses*))
    1))

(defop "trim" ((day :day) (to :hour))
  (let ((n 0))
    (dolist (c *courses*)
      (when (and (= (c-day c) day) (<= (c-from c) to) (< to (c-to c)))
        (setf (c-to c) to)
        (incf n)))
    n))

(defop "clear" ((day :day))
  (let ((n (count-if (lambda (c) (= (c-day c) day)) *courses*)))
    (setf *courses* (remove-if (lambda (c) (= (c-day c) day)) *courses*))
    n))

(defop "shift" ((day :day) (delta :int))
  (let ((nd (+ day delta)))
    (unless (<= 1 nd 7) (fail "BADARG"))
    (let ((n 0))
      (dolist (c *courses*)
        (when (= (c-day c) day)
          (setf (c-day c) nd)
          (incf n)))
      n)))

(defop "copy" ((name :word) (day :day))
  (let ((c (require-course name)))
    (room-check 1)
    (let ((n (copy-course c)))
      (setf (c-name n) (format nil "~a_2" (c-name c)))
      (setf (c-day n) day)
      (push n *courses*))
    1))

(defop "merge" ((a :word) (b :word))
  (let ((x (require-course a)))
    (let ((y (require-course b)))
      (setf (c-teacher x) (c-teacher y))
      (setf (c-loc x) (c-loc y))
      (setf *courses* (remove y *courses* :test #'eq)))
    2))

(defop "sort" ()
  (setf *courses* (sort-by-name *courses*))
  0)

(defop "filter" ((day :day))
  (count-if (lambda (c) (= (c-day c) day)) *courses*))

(defop "count" ()
  (length *courses*))

;;; ---------- op 16..30 ----------

(defop "swapTeacher" ((a :word) (b :word))
  (let ((x (require-course a)) (y (require-course b)))
    (rotatef (c-teacher x) (c-teacher y))
    2))

(defop "swapLoc" ((a :word) (b :word))
  (let ((x (require-course a)) (y (require-course b)))
    (rotatef (c-loc x) (c-loc y))
    2))

(defop "copyTo" ((name :word) (day :day) (from :hour) (to :hour))
  (check-span from to)
  (let ((c (require-course name)))
    (let ((nn (format nil "~a_3" (c-name c))))
      (when (find-course nn) (fail "DUP"))
      (room-check 1)
      (when (course-conflict-p day from to) (fail "CONFLICT"))
      (push (make-course :name nn :teacher (c-teacher c) :loc (c-loc c)
                         :day day :from from :to to)
            *courses*))
    1))

(defop "truncate" ((day :day))
  (let* ((cs (sort-by-name
              (remove-if-not (lambda (c) (= (c-day c) day)) *courses*)))
         (kill (cdr cs)))
    (drop-courses kill)))

(defop "keep" ((day :day) (n :nat))
  (let* ((cs (sort-by-name
              (remove-if-not (lambda (c) (= (c-day c) day)) *courses*)))
         (kill (nthcdr n cs)))
    (drop-courses kill)))

(defop "renameTeacher" ((t1 :word) (t2 :word))
  (let ((n 0))
    (dolist (c *courses*)
      (when (string= (c-teacher c) t1)
        (setf (c-teacher c) t2)
        (incf n)))
    n))

(defop "renameLoc" ((l1 :word) (l2 :word))
  (let ((n 0))
    (dolist (c *courses*)
      (when (string= (c-loc c) l1)
        (setf (c-loc c) l2)
        (incf n)))
    n))

(defop "dedupe" ()
  (let ((seen '()) (keep '()) (n 0))
    (dolist (c (sort-by-name *courses*))
      (let ((key (list (c-teacher c) (c-loc c) (c-day c)
                       (c-from c) (c-to c))))
        (if (member key seen :test #'equal)
            (incf n)
            (progn (push key seen) (push c keep)))))
    (setf *courses* keep)
    n))

(defop "compress" ((day :day))
  (compress-day day))

(defop "compact" ()
  (let ((n 0))
    (dotimes (i 7)
      (incf n (compress-day (1+ i))))
    n))

(defop "mirror" ((day :day) (day2 :day))
  (let* ((src (remove-if-not (lambda (c) (= (c-day c) day)) *courses*))
         (news (mapcar (lambda (c)
                         (let ((n (copy-course c)))
                           (setf (c-name n) (format nil "~a_m" (c-name c)))
                           (setf (c-day n) day2)
                           n))
                       src)))
    (dolist (n news)
      (when (find-course (c-name n)) (fail "DUP")))
    (room-check (length news))
    (dolist (n news) (push n *courses*))
    (length news)))

(defop "absorb" ((a :word) (b :word))
  (let ((x (require-course a)))
    (let ((y (require-course b)))
      (setf (c-teacher x) (c-teacher y))
      (setf (c-loc x) (c-loc y)))
    2))

(defop "swapDays" ((d1 :day) (d2 :day))
  (let* ((moving (remove-if-not (lambda (c)
                                 (or (= (c-day c) d1) (= (c-day c) d2)))
                               *courses*))
         (n (length moving)))
    (let ((proj (mapcar (lambda (c)
                          (list c (if (= (c-day c) d1) d2 d1)))
                        moving)))
      (dolist (p proj)
        (dolist (q proj)
          (when (and (not (eq (first p) (first q)))
                     (= (second p) (second q))
                     (<= (c-from (first p)) (c-to (first q)))
                     (<= (c-from (first q)) (c-to (first p))))
            (fail "CONFLICT")))))
    (dolist (c moving)
      (setf (c-day c) (if (= (c-day c) d1) d2 d1)))
    n))

(defop "promote" ((name :word))
  (let* ((c (require-course name))
         (dur (1+ (- (c-to c) (c-from c))))
         (day (c-day c))
         (slot nil))
    (loop for f from 1 to (1+ (- 12 dur))
          do (unless (course-conflict-p day f (+ f (1- dur)) c)
               (setf slot f)
               (return)))
    (unless slot (fail "CONFLICT"))
    (setf (c-from c) slot)
    (setf (c-to c) (+ slot (1- dur)))
    1))

(defop "purge" ((teacher :word))
  (let ((n (count-if (lambda (c) (string= (c-teacher c) teacher)) *courses*)))
    (setf *courses*
          (remove-if (lambda (c) (string= (c-teacher c) teacher)) *courses*))
    n))

;;; ---------- dispatcher: trial state, --dry, output lines ----------

(defun emit-ok (verb n) (format t "ok ~a ~d~%" verb n))
(defun emit-err (code) (format t "err ~a~%" code))

(defun exec-op (op args dry)
  (let ((saved *courses*))
    (setf *courses* (copy-courses saved))
    (let ((res (catch 'reject
                 (handler-case
                     (cons :ok (apply (op-fn op)
                                      (parse-args (op-types op) args)))
                   (error () (cons :err "BADARG"))))))
      (if (eq (car res) :ok)
          (progn
            (when dry (setf *courses* saved))
            (emit-ok (op-name op) (cdr res)))
          (progn
            (setf *courses* saved)
            (emit-err (cdr res)))))))

(defun exec-command (cmd)
  (let ((tokens (split-words cmd))
        (dry nil))
    (when (and tokens (string= (first tokens) "--dry"))
      (setf dry t)
      (setf tokens (rest tokens)))
    (cond
      ((null tokens) (emit-err "BADARG"))
      (t
       (let ((op (gethash (string-downcase (first tokens)) *ops*)))
         (if op
             (exec-op op (rest tokens) dry)
             (emit-err "BADARG")))))))

(defun print-state ()
  (format t "#state~%")
  (dolist (c (sort-by-name *courses*))
    (format t "~a|~a|~a|~d|~d-~d~%"
            (c-name c) (c-teacher c) (c-loc c)
            (c-day c) (c-from c) (c-to c))))

;;; ---------- argv ----------

(defun script-noise-p (s)
  (or (string= s "--script")
      (string-equal s "--noinform")
      (string-equal s "--non-interactive")
      (string-equal s "--disable-debugger")
      (string-equal s "--end-toplevel-options")
      (let ((n (length s)))
        (and (> n 6) (string-equal (subseq s (- n 5)) ".lisp")))))

(defun script-args ()
  (let ((args (rest sb-ext:*posix-argv*)))
    (loop while (and args (script-noise-p (first args)))
          do (setf args (rest args)))
    args))

(defun main ()
  (dolist (cmd (script-args))
    (exec-command cmd))
  (print-state)
  (finish-output))

(main)

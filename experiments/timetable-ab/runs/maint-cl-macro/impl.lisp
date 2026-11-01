;;;; v3 timetable ops executor -- macro arm. SBCL, plain COMMON-LISP only.
;;;; argv in, one result line per command on stdout, then #state.

(defvar *ops* nil)
(defvar *cs* nil)

(eval-when (:compile-toplevel :load-toplevel :execute)
  (defvar *op-verbs* nil))

(define-condition op-failure (error)
  ((code :initarg :code :reader op-code :initform "BADARG"))
  (:report (lambda (c s) (format s "op failure ~a" (op-code c)))))

(defun fail (code)
  (error 'op-failure :code code))

(defun %register (verb fn)
  (when (assoc verb *ops* :test #'string=)
    (error "duplicate op name ~s" verb))
  (push (cons verb fn) *ops*))

;;;; ---- argument parsing -------------------------------------------------

(defun p-word (s)
  (if (<= 1 (length s) 12) s (fail "BADARG")))

(defun p-int (s lo hi)
  (let ((v (ignore-errors (parse-integer s))))
    (if (and v (<= lo v hi)) v (fail "BADARG"))))

(defun p-num (s)
  (let ((v (ignore-errors (parse-integer s))))
    (if v v (fail "BADARG"))))

(defun arg-val (kind s)
  (case kind
    (w (p-word s))
    (d (p-int s 1 7))
    (h (p-int s 1 12))
    (n (p-num s))
    (t (fail "BADARG"))))

;;;; ---- model -----------------------------------------------------------

(defstruct (course (:conc-name c-))
  name teacher loc day from to)

(defun find-name (name)
  (find name *cs* :key #'c-name :test #'string=))

(defun need (name)
  (or (find-name name) (fail "NOTFOUND")))

(defun slot-clash (day from to &optional except)
  (find-if (lambda (c)
             (and (= day (c-day c))
                  (not (eq c except))
                  (<= from (c-to c))
                  (<= (c-from c) to)))
           *cs*))

(defun limit-hit ()
  (>= (length *cs*) 20))

;;;; ---- defop: one form per op -------------------------------------------
;;;; A declaration yields: name registration, arity check, per-argument
;;;; parsing/bounds check, the dispatch entry point, and the ok/err line the
;;;; runner prints (verb carried by the registry, count returned by the body).

(defmacro defop (verb specs &body body)
  (when (member verb *op-verbs* :test #'string=)
    (error "duplicate op name ~s" verb))
  (dolist (sp specs)
    (unless (and (consp sp)
                 (null (cddr sp))
                 (member (car sp) '(w d h n))
                 (symbolp (second sp)))
      (error "bad parameter spec ~s in op ~s" sp verb)))
  (push verb *op-verbs*)
  (let* ((vars (mapcar #'second specs))
         (binds (loop for (kind var) in specs
                      for i from 0
                      collect `(,var (arg-val ',kind (nth ,i rest)))))
         (fn (intern (format nil "%OP-~a" (string-upcase verb)))))
    `(progn
       (defun ,fn (rest)
         (unless (= (length rest) ,(length specs)) (fail "BADARG"))
         (let* ,binds
           ,@(when vars `((declare (ignorable ,@vars))))
           ,@body))
       (%register ,verb ',fn))))

;;;; ---- the fifteen ops --------------------------------------------------

(defop "add" ((w name) (w teacher) (w loc) (d day) (h from) (h to))
  (when (< to from) (fail "BADARG"))
  (when (limit-hit) (fail "LIMIT"))
  (when (find-name name) (fail "DUP"))
  (when (slot-clash day from to) (fail "CONFLICT"))
  (push (make-course :name name :teacher teacher :loc loc
                     :day day :from from :to to)
        *cs*)
  1)

(defop "del" ((w name))
  (let ((c (need name)))
    (setf *cs* (remove c *cs* :test #'eq))
    1))

(defop "edit" ((w name) (w teacher) (w loc))
  (let ((c (need name)))
    (setf (c-teacher c) teacher
          (c-loc c) loc)
    1))

(defop "move" ((w name) (d day) (h from) (h to))
  (when (< to from) (fail "BADARG"))
  (let ((c (need name)))
    (when (slot-clash day from to c) (fail "CONFLICT"))
    (setf (c-day c) day
          (c-from c) from
          (c-to c) to)
    1))

(defop "swap" ((w a) (w b))
  (let ((x (need a))
        (y (need b)))
    (unless (eq x y)
      (rotatef (c-day x) (c-day y))
      (rotatef (c-from x) (c-from y))
      (rotatef (c-to x) (c-to y)))
    2))

(defop "rename" ((w old) (w new))
  (let ((c (need old)))
    (when (find-name new) (fail "DUP"))
    (setf (c-name c) new)
    1))

(defop "duplicate" ((w name) (w newname))
  (let ((c (need name)))
    (when (find-name newname) (fail "DUP"))
    (let ((d (copy-course c)))
      (setf (c-name d) newname)
      (push d *cs*))
    1))

(defop "trim" ((d day) (h to))
  (let ((n 0))
    (dolist (c *cs*)
      (when (and (= day (c-day c))
                 (<= (c-from c) to)
                 (< to (c-to c)))
        (setf (c-to c) to)
        (incf n)))
    n))

(defop "clear" ((d day))
  (let ((n (count day *cs* :key #'c-day)))
    (setf *cs* (remove day *cs* :key #'c-day))
    n))

(defop "shift" ((d day) (n delta))
  (let ((hits (remove-if-not (lambda (c) (= day (c-day c))) *cs*)))
    (dolist (c hits)
      (let ((nd (+ (c-day c) delta)))
        (unless (<= 1 nd 7) (fail "BADARG"))))
    (dolist (c hits)
      (incf (c-day c) delta))
    (length hits)))

(defop "copy" ((w name) (d day))
  (let* ((c (need name))
         (nn (concatenate 'string name "_2")))
    (when (find-name nn) (fail "DUP"))
    (let ((d (copy-course c)))
      (setf (c-name d) nn
            (c-day d) day)
      (push d *cs*))
    1))

(defop "merge" ((w a) (w b))
  (let ((x (need a))
        (y (need b)))
    (unless (eq x y)
      (setf (c-teacher x) (c-teacher y)
            (c-loc x) (c-loc y))
      (setf *cs* (remove y *cs* :test #'eq)))
    2))

(defop "sort" ()
  0)

(defop "filter" ((d day))
  (count day *cs* :key #'c-day))

(defop "count" ()
  (length *cs*))

;;;; ---- the five added ops (16-20) ---------------------------------------
;;;; Same shape: one form per op. defop keeps owning arity, parsing, bounds,
;;;; dispatch and registration; the two day-pruning ops only share one body
;;;; helper, and the two swap ops only differ by accessor.

(defun prune-day (day k)
  (let* ((same (remove-if-not (lambda (c) (= day (c-day c))) *cs*))
         (gone (nthcdr k (sort same #'string< :key #'c-name))))
    (setf *cs* (remove-if (lambda (c) (member c gone :test #'eq)) *cs*))
    (length gone)))

(defop "swapTeacher" ((w a) (w b))
  (let ((x (need a))
        (y (need b)))
    (unless (eq x y)
      (rotatef (c-teacher x) (c-teacher y)))
    2))

(defop "swapLoc" ((w a) (w b))
  (let ((x (need a))
        (y (need b)))
    (unless (eq x y)
      (rotatef (c-loc x) (c-loc y)))
    2))

(defop "copyTo" ((w name) (d day) (h from) (h to))
  (when (< to from) (fail "BADARG"))
  (let* ((c (need name))
         (nn (concatenate 'string name "_3")))
    (when (find-name nn) (fail "DUP"))
    (when (slot-clash day from to) (fail "CONFLICT"))
    (let ((d (copy-course c)))
      (setf (c-name d) nn
            (c-day d) day
            (c-from d) from
            (c-to d) to)
      (push d *cs*))
    1))

(defop "truncate" ((d day))
  (prune-day day 1))

(defop "keep" ((d day) (n n))
  (when (minusp n) (fail "BADARG"))
  (prune-day day n))

;;;; ---- the five added ops (21-25) ---------------------------------------
;;;; Two more macros absorb the repetition this batch exposes: a whole-table
;;;; field rewrite differs only by slot, and a "run it on every day" op differs
;;;; only by the per-day helper. defop still owns arity, parsing and dispatch,
;;;; so each op below is exactly one form.

(defun rewrite-slot (slot old new)
  (let ((n 0))
    (dolist (c *cs*)
      (when (string= old (slot-value c slot))
        (setf (slot-value c slot) new)
        (incf n)))
    n))

(defmacro defrewrite (verb slot)
  `(defop ,verb ((w old) (w new))
     (rewrite-slot ',slot old new)))

(defmacro defsweep (verb helper)
  `(defop ,verb ()
     (loop for d from 1 to 7 sum (,helper d))))

(defrewrite "renameTeacher" teacher)

(defrewrite "renameLoc" loc)

(defun course-key (c)
  (list (c-teacher c) (c-loc c) (c-day c) (c-from c) (c-to c)))

(defop "dedupe" ()
  (let ((seen '())
        (kept '())
        (n 0))
    (dolist (c (sort (copy-list *cs*) #'string< :key #'c-name))
      (let ((k (course-key c)))
        (if (member k seen :test #'equal)
            (incf n)
            (progn (push k seen) (push c kept)))))
    (setf *cs* (nreverse kept))
    n))

(defun compress-day (day)
  (let* ((same (remove-if-not (lambda (c) (= day (c-day c))) *cs*))
         (order (sort same
                      (lambda (a b)
                        (or (< (c-from a) (c-from b))
                            (and (= (c-from a) (c-from b))
                                 (string< (c-name a) (c-name b)))))))
         (n 0)
         (k 0))
    (dolist (c order)
      (incf k)
      (unless (and (= k (c-from c)) (= (1+ k) (c-to c)))
        (incf n))
      (setf (c-from c) k
            (c-to c) (1+ k)))
    n))

(defop "compress" ((d day))
  (compress-day day))

(defsweep "compact" compress-day)

;;;; ---- the five added ops (26-30) ---------------------------------------
;;;; Final batch. Two macros take what is still repeated -- a suffixed copy of
;;;; a whole day, and a purge by one field value -- while defop keeps owning
;;;; arity, parsing, bounds, dispatch and registration, so every op below is
;;;; one form and spell none of that out.

(defun day-courses (day)
  (remove-if-not (lambda (c) (= day (c-day c))) *cs*))

(defun clash-pair (x y)
  (and (= (c-day x) (c-day y))
       (<= (c-from x) (c-to y))
       (<= (c-from y) (c-to x))))

(defun clash-total ()
  (let ((n 0))
    (dotimes (i (length *cs*))
      (dotimes (j (length *cs*))
        (when (< i j)
          (when (clash-pair (nth i *cs*) (nth j *cs*))
            (incf n)))))
    n))

(defmacro defdaycopy (verb suffix)
  `(defop ,verb ((d day) (d day2))
     (let ((made (mapcar (lambda (c)
                           (let ((nc (copy-course c)))
                             (setf (c-name nc)
                                   (concatenate 'string (c-name c) ,suffix)
                                   (c-day nc) day2)
                             nc))
                         (day-courses day))))
       (dolist (c made)
         (when (find-name (c-name c)) (fail "DUP")))
       (dolist (c made) (push c *cs*))
       (length made))))

(defmacro defpurge (verb slot)
  `(defop ,verb ((w target))
     (let ((killed (remove-if-not
                    (lambda (c) (string= target (slot-value c ',slot)))
                    *cs*)))
       (setf *cs* (remove-if
                   (lambda (c) (string= target (slot-value c ',slot)))
                   *cs*))
       (length killed))))

(defdaycopy "mirror" "_m")

(defop "absorb" ((w a) (w b))
  (let ((x (need a))
        (y (need b)))
    (unless (eq x y)
      (setf (c-teacher x) (c-teacher y)
            (c-loc x) (c-loc y)))
    2))

(defop "swapDays" ((d d1) (d d2))
  (let* ((before (clash-total))
         (g1 (day-courses d1))
         (g2 (day-courses d2)))
    (dolist (c g1) (setf (c-day c) d2))
    (dolist (c g2) (setf (c-day c) d1))
    (when (> (clash-total) before)
      (dolist (c g1) (setf (c-day c) d1))
      (dolist (c g2) (setf (c-day c) d2))
      (fail "CONFLICT"))
    (+ (length g1) (length g2))))

(defop "promote" ((w name))
  (let* ((c (need name))
         (span (1+ (- (c-to c) (c-from c))))
         (spot (loop for f from 1 to 12
                     when (and (<= (+ f span -1) 12)
                               (not (slot-clash (c-day c) f (+ f span -1) c)))
                       return f)))
    (unless spot (fail "CONFLICT"))
    (setf (c-from c) spot
          (c-to c) (+ spot span -1))
    1))

(defpurge "purge" teacher)

;;;; ---- input / output ----------------------------------------------------

(defun split (s)
  (let ((out '())
        (start 0)
        (n (length s)))
    (dotimes (i n)
      (when (char= (char s i) #\Space)
        (let ((tok (subseq s start i)))
          (unless (string= tok "") (push tok out)))
        (setf start (1+ i))))
    (let ((tok (subseq s start n)))
      (unless (string= tok "") (push tok out)))
    (nreverse out)))

;;;; --dry support: the runner keeps the whole "simulate without committing"
;;;; rule in one place. Every op body mutates either the *cs* list or the
;;;; course structures it holds, so rebinding *cs* to a fresh copy of the
;;;; table for the duration of the call makes the op compute its own count
;;;; and its own errors against a throwaway world; unwinding discards it.

(defun copy-state ()
  (mapcar #'copy-course *cs*))

(defun dry-call (fn args)
  (let ((*cs* (copy-state)))
    (funcall fn args)))

(defun run-line (line)
  (let ((toks (split line))
        (dry nil))
    (loop while (and toks (string= (car toks) "--dry"))
          do (setf dry t)
             (pop toks))
    (let ((entry (and toks (assoc (car toks) *ops* :test #'string=))))
      (if (null entry)
          (format t "err BADARG~%")
          (handler-case
              (let ((n (if dry
                           (dry-call (cdr entry) (cdr toks))
                           (funcall (cdr entry) (cdr toks)))))
                (format t "ok ~a ~a~%" (car entry) n))
            (op-failure (e) (format t "err ~a~%" (op-code e)))
            (error () (format t "err BADARG~%")))))))

(defun dry-line-p (a)
  (and (<= 5 (length a))
       (string= "--dry" a :end1 5 :end2 5)
       (or (= 5 (length a))
           (char= #\Space (char a 5)))))

(defun argv ()
  (let ((acc '()))
    (dolist (a (rest sb-ext:*posix-argv*))
      (when (or (string= a "")
                (dry-line-p a)
                (and (not (char= (char a 0) #\-))
                     (null (search ".lisp" a))))
        (push a acc)))
    (nreverse acc)))

(defun main ()
  (dolist (a (argv))
    (run-line a))
  (format t "#state~%")
  (dolist (c (sort (copy-list *cs*) #'string< :key #'c-name))
    (format t "~a|~a|~a|~a|~a-~a~%"
            (c-name c) (c-teacher c) (c-loc c)
            (c-day c) (c-from c) (c-to c)))
  (finish-output))

(main)

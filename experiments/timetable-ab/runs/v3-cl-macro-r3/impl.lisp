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

(defun run-line (line)
  (let* ((toks (split line))
         (entry (and toks (assoc (car toks) *ops* :test #'string=))))
    (if (null entry)
        (format t "err BADARG~%")
        (handler-case
            (let ((n (funcall (cdr entry) (cdr toks))))
              (format t "ok ~a ~a~%" (car entry) n))
          (op-failure (e) (format t "err ~a~%" (op-code e)))
          (error () (format t "err BADARG~%"))))))

(defun argv ()
  (let ((acc '()))
    (dolist (a (rest sb-ext:*posix-argv*))
      (when (or (string= a "")
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

;;;; v3 timetable ops executor -- macro arm.
;;;; argv in, stdout out. No files, no JSON, no serialization, no libraries.

(defstruct (course (:constructor mk-course)) name teacher loc day from to)

(defvar *state* nil)
(defvar *ops* nil)

(define-condition op-error (error)
  ((code :initarg :code :reader op-error-code))
  (:report (lambda (c s) (format s "op error: ~a" (op-error-code c)))))

(defun fail (code) (error 'op-error :code code))

(defmacro need (form) `(unless ,form (fail :badarg)))

(defun word-p (s)
  (and (<= 1 (length s) 12)
       (not (string= s "-"))
       (every #'graphic-char-p s)))

(defun field-p (s) (or (word-p s) (string= s "-")))

(defun arg-word (args i)
  (let ((s (nth i args)))
    (if (and s (word-p s)) s (fail :badarg))))

(defun arg-field (args i)
  (let ((s (nth i args)))
    (if (and s (field-p s)) s (fail :badarg))))

(defun arg-int (args i &optional lo hi)
  (let ((s (nth i args)))
    (unless s (fail :badarg))
    (multiple-value-bind (n pos) (parse-integer s :junk-allowed t)
      (unless (and n (= pos (length s))) (fail :badarg))
      (when (and lo (not (<= lo n hi))) (fail :badarg))
      n)))

(defun find-course (name)
  (find name *state* :key #'course-name :test #'string=))

(defun conflict-p (day from to except)
  (some (lambda (c)
          (and (not (eq c except))
               (= (course-day c) day)
               (<= (course-from c) to)
               (<= from (course-to c))))
        *state*))

(defun copy-state (st)
  (mapcar (lambda (c)
            (mk-course :name (course-name c) :teacher (course-teacher c)
                       :loc (course-loc c) :day (course-day c)
                       :from (course-from c) :to (course-to c)))
          st))

(defun register-op (name fn)
  (when (assoc name *ops* :test #'string=)
    (error "duplicate op name ~s" name))
  (push (cons name fn) *ops*)
  name)

(defun find-op (verb) (assoc verb *ops* :test #'string=))

;;; One form per op. The macro grows: arity check, per-argument parsing and
;;; range check, the ok-line text, the roster entry, the dispatch table.
;;; Argument spec: (var word) | (var field) | (var int lo hi) | (var int).
;;; Body returns the affected count or calls (fail CODE).
(defmacro defop (name specs &body body)
  (unless (and (stringp name) (plusp (length name)))
    (error "op name must be a non-empty string: ~s" name))
  (unless body (error "op ~s: empty body" name))
  (let ((vars (mapcar #'first specs)))
    (unless (= (length vars) (length (remove-duplicates vars)))
      (error "op ~s: duplicate argument name: ~s" name vars))
    `(progn
       (register-op ,name
                    (lambda (args)
                      (unless (= (length args) ,(length specs)) (fail :badarg))
                      (let* ,(loop for spec in specs
                                   for i from 0
                                   collect (destructuring-bind (var kind &rest rest) spec
                                             (list var
                                                   (ecase kind
                                                     (word `(arg-word args ,i))
                                                     (field `(arg-field args ,i))
                                                     (int (if rest
                                                              `(arg-int args ,i ,@rest)
                                                              `(arg-int args ,i)))))))
                        ,@body)))
       ',name)))

(defop "add" ((name word) (teacher field) (loc field)
              (day int 1 7) (from int 1 12) (to int 1 12))
  (need (<= from to))
  (when (find-course name) (fail :dup))
  (when (= 20 (length *state*)) (fail :limit))
  (when (conflict-p day from to nil) (fail :conflict))
  (push (mk-course :name name :teacher teacher :loc loc
                   :day day :from from :to to)
        *state*)
  1)

(defop "del" ((name word))
  (let ((c (find-course name)))
    (unless c (fail :notfound))
    (setf *state* (delete c *state*))
    1))

(defop "edit" ((name word) (teacher field) (loc field))
  (let ((c (find-course name)))
    (unless c (fail :notfound))
    (setf (course-teacher c) teacher
          (course-loc c) loc)
    1))

(defop "move" ((name word) (day int 1 7) (from int 1 12) (to int 1 12))
  (need (<= from to))
  (let ((c (find-course name)))
    (unless c (fail :notfound))
    (when (conflict-p day from to c) (fail :conflict))
    (setf (course-day c) day
          (course-from c) from
          (course-to c) to)
    1))

(defop "swap" ((a word) (b word))
  (let ((x (find-course a)) (y (find-course b)))
    (unless x (fail :notfound))
    (unless y (fail :notfound))
    (rotatef (course-day x) (course-day y))
    (rotatef (course-from x) (course-from y))
    (rotatef (course-to x) (course-to y))
    2))

(defop "rename" ((old word) (new word))
  (let ((c (find-course old)))
    (unless c (fail :notfound))
    (when (find-course new) (fail :dup))
    (setf (course-name c) new)
    1))

(defop "duplicate" ((name word) (newname word))
  (let ((c (find-course name)))
    (unless c (fail :notfound))
    (when (find-course newname) (fail :dup))
    (when (= 20 (length *state*)) (fail :limit))
    (push (mk-course :name newname
                     :teacher (course-teacher c) :loc (course-loc c)
                     :day (course-day c)
                     :from (course-from c) :to (course-to c))
          *state*)
    1))

(defop "trim" ((day int 1 7) (to int 1 12))
  (let ((n 0))
    (dolist (c *state*)
      (when (and (= (course-day c) day)
                 (<= (course-from c) to)
                 (< to (course-to c)))
        (setf (course-to c) to)
        (incf n)))
    n))

(defop "clear" ((day int 1 7))
  (let ((n (count day *state* :key #'course-day)))
    (setf *state* (remove day *state* :key #'course-day))
    n))

(defop "shift" ((day int 1 7) (delta int))
  (let ((nd (+ day delta)))
    (need (<= 1 nd 7))
    (let ((n 0))
      (dolist (c *state*)
        (when (= (course-day c) day)
          (setf (course-day c) nd)
          (incf n)))
      n)))

(defop "copy" ((name word) (day int 1 7))
  (let ((c (find-course name)))
    (unless c (fail :notfound))
    (let ((nn (concatenate 'string (course-name c) "_2")))
      (when (find-course nn) (fail :dup))
      (when (= 20 (length *state*)) (fail :limit))
      (when (conflict-p day (course-from c) (course-to c) nil) (fail :conflict))
      (push (mk-course :name nn
                       :teacher (course-teacher c) :loc (course-loc c)
                       :day day
                       :from (course-from c) :to (course-to c))
            *state*)
      1)))

(defop "merge" ((a word) (b word))
  (need (not (string= a b)))
  (let ((x (find-course a)) (y (find-course b)))
    (unless x (fail :notfound))
    (unless y (fail :notfound))
    (setf (course-teacher x) (course-teacher y)
          (course-loc x) (course-loc y))
    (setf *state* (delete y *state*))
    2))

(defop "sort" ()
  0)

(defop "filter" ((day int 1 7))
  (count day *state* :key #'course-day))

(defop "count" ()
  (length *state*))

(defun split-words (s)
  (let ((out '()) (start 0) (n (length s)))
    (loop for i from 0 to n
          when (or (= i n) (member (char s i) '(#\Space #\Tab)))
            do (when (> i start) (push (subseq s start i) out))
               (setf start (1+ i)))
    (nreverse out)))

;;; The single funnel: the working copy is committed only when the op succeeded,
;;; so a rejected command cannot leave a partial change behind.
(defun attempt (fn verb args)
  (let ((*state* (copy-state *state*)))
    (handler-case
        (let ((n (funcall fn args)))
          (values t *state* (format nil "ok ~a ~d" verb n)))
      (op-error (e) (values nil nil (format nil "err ~a" (op-error-code e)))))))

(defun run-command (cmd)
  (let ((toks (split-words cmd)))
    (let ((op (and toks (find-op (first toks)))))
      (if op
          (multiple-value-bind (ok new line) (attempt (cdr op) (car op) (rest toks))
            (when ok (setf *state* new))
            (format t "~a~%" line))
          (format t "err BADARG~%")))))

;;; An empty command string is a command with no verb: it must reach
;;; run-command and be reported as err BADARG, so it is never filtered out here.
(defun script-args ()
  (loop for s in (rest sb-ext:*posix-argv*)
        when (or (zerop (length s))
                 (and (not (char= #\- (char s 0)))
                      (not (search ".lisp" s))))
          collect s))

(defun main ()
  (dolist (cmd (script-args)) (run-command cmd))
  (format t "#state~%")
  (dolist (c (sort (copy-list *state*) #'string< :key #'course-name))
    (format t "~a|~a|~a|~d|~d-~d~%"
            (course-name c) (course-teacher c) (course-loc c)
            (course-day c) (course-from c) (course-to c)))
  (finish-output))

(main)

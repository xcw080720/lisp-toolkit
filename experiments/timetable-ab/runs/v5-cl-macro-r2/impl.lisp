(in-package :cl-user)

(defstruct (course (:constructor make-course))
  name teacher loc day from to)

(defparameter *courses* nil)
(defparameter *ops* nil)

(defun fail (code)
  (throw 'op-fail (list :err code)))

(defun to-int (s)
  (handler-case
      (parse-integer s :junk-allowed nil)
    (error () (fail "BADARG"))))

(defun valid-word (s)
  (and (stringp s)
       (<= 1 (length s) 12)))

(defun valid-day (d)
  (and (integerp d) (<= 1 d 7)))

(defun valid-time-range (from to)
  (and (integerp from)
       (integerp to)
       (<= 1 from 12)
       (<= 1 to 12)
       (<= from to)))

(defun find-course (name)
  (find name *courses* :key #'course-name :test #'string=))

(defun name-exists-p (name)
  (not (null (find-course name))))

(defun conflict-p (day from to &optional ignore)
  (some (lambda (c)
          (and (not (eq c ignore))
               (= (course-day c) day)
               (<= from (course-to c))
               (<= (course-from c) to)))
        *courses*))

(defun whitespace-char-p (c)
  (member c '(#\Space #\Tab #\Newline #\Return #\Page)))

(defun split-ws (s)
  (let ((tokens nil)
        (start 0)
        (in-token nil))
    (dotimes (i (length s))
      (let ((c (char s i)))
        (if (whitespace-char-p c)
            (when in-token
              (push (subseq s start i) tokens)
              (setf in-token nil))
            (unless in-token
              (setf start i)
              (setf in-token t)))))
    (when in-token
      (push (subseq s start) tokens))
    (nreverse tokens)))

(defun emit-ok (verb n)
  (format t "ok ~a ~d~%" verb n))

(defun emit-err (code)
  (format t "err ~a~%" code))

(defun-known-command-p (s)
  (let ((tokens (split-ws s)))
    (and tokens
         (assoc (first tokens) *ops* :test #'string=))))

(defun process-command (cmd)
  (let* ((tokens (split-ws cmd))
         (verb (first tokens))
         (entry (and verb (assoc verb *ops* :test #'string=))))
    (if entry
        (let ((res (catch 'op-fail (funcall (cdr entry) (rest tokens)))))
          (if (consp res)
              (emit-err (second res))
              (emit-ok verb res)))
        (emit-err "BADARG"))))

(defmacro defop (name args &body body)
  (let ((verb (string-downcase (symbol-name name)))
        (arg-count (length args)))
    `(push (cons ,verb
                 (lambda (tokens)
                   (unless (= (length tokens) ,arg-count)
                     (fail "BADARG"))
                   (destructuring-bind ,args tokens
                     ,@body)))
           *ops*)))

(defop add (name teacher loc day from to)
  (let ((d (to-int day))
        (f (to-int from))
        (t2 (to-int to)))
    (unless (and (valid-word name)
                 (valid-word teacher)
                 (valid-word loc)
                 (valid-day d)
                 (valid-time-range f t2))
      (fail "BADARG"))
    (when (name-exists-p name)
      (fail "DUP"))
    (when (>= (length *courses*) 20)
      (fail "LIMIT"))
    (when (conflict-p d f t2)
      (fail "CONFLICT"))
    (push (make-course :name name
                       :teacher teacher
                       :loc loc
                       :day d
                       :from f
                       :to t2)
          *courses*)
    1))

(defop del (name)
  (unless (valid-word name)
    (fail "BADARG"))
  (let ((c (find-course name)))
    (unless c
      (fail "NOTFOUND"))
    (setf *courses* (remove c *courses* :test #'eq))
    1))

(defop edit (name teacher loc)
  (unless (and (valid-word name)
               (valid-word teacher)
               (valid-word loc))
    (fail "BADARG"))
  (let ((c (find-course name)))
    (unless c
      (fail "NOTFOUND"))
    (setf (course-teacher c) teacher)
    (setf (course-loc c) loc)
    1))

(defop move (name day from to)
  (let ((d (to-int day))
        (f (to-int from))
        (t2 (to-int to)))
    (unless (and (valid-word name)
                 (valid-day d)
                 (valid-time-range f t2))
      (fail "BADARG"))
    (let ((c (find-course name)))
      (unless c
        (fail "NOTFOUND"))
      (when (conflict-p d f t2 c)
        (fail "CONFLICT"))
      (setf (course-day c) d)
      (setf (course-from c) f)
      (setf (course-to c) t2)
      1)))

(defop swap (a b)
  (unless (and (valid-word a) (valid-word b))
    (fail "BADARG"))
  (let ((ca (find-course a))
        (cb (find-course b)))
    (unless ca
      (fail "NOTFOUND"))
    (unless cb
      (fail "NOTFOUND"))
    (rotatef (course-day ca) (course-day cb))
    (rotatef (course-from ca) (course-from cb))
    (rotatef (course-to ca) (course-to cb))
    2))

(defop rename (old new)
  (unless (and (valid-word old) (valid-word new))
    (fail "BADARG"))
  (let ((c (find-course old)))
    (unless c
      (fail "NOTFOUND"))
    (when (name-exists-p new)
      (fail "DUP"))
    (setf (course-name c) new)
    1))

(defop duplicate (name newname)
  (unless (and (valid-word name) (valid-word newname))
    (fail "BADARG"))
  (let ((c (find-course name)))
    (unless c
      (fail "NOTFOUND"))
    (when (name-exists-p newname)
      (fail "DUP"))
    (when (>= (length *courses*) 20)
      (fail "LIMIT"))
    (push (make-course :name newname
                       :teacher (course-teacher c)
                       :loc (course-loc c)
                       :day (course-day c)
                       :from (course-from c)
                       :to (course-to c))
          *courses*)
    1))

(defop trim (day to)
  (let ((d (to-int day))
        (t2 (to-int to)))
    (unless (and (valid-day d)
                 (integerp t2)
                 (<= 1 t2 12))
      (fail "BADARG"))
    (let ((n 0))
      (dolist (c *courses*)
        (when (and (= (course-day c) d)
                   (<= (course-from c) t2)
                   (< t2 (course-to c)))
          (setf (course-to c) t2)
          (incf n)))
      n)))

(defop clear (day)
  (let ((d (to-int day)))
    (unless (valid-day d)
      (fail "BADARG"))
    (let ((n (count-if (lambda (c) (= (course-day c) d)) *courses*)))
      (setf *courses* (remove-if (lambda (c) (= (course-day c) d)) *courses*))
      n)))

(defop shift (day delta)
  (let ((d (to-int day))
        (delta-value (to-int delta)))
    (unless (valid-day d)
      (fail "BADARG"))
    (let ((target (+ d delta-value)))
      (unless (<= 1 target 7)
        (fail "BADARG"))
      (let ((n 0))
        (dolist (c *courses*)
          (when (= (course-day c) d)
            (setf (course-day c) target)
            (incf n)))
        n))))

(defop copy (name day)
  (let ((d (to-int day)))
    (unless (and (valid-word name)
                 (valid-day d))
      (fail "BADARG"))
    (let ((c (find-course name)))
      (unless c
        (fail "NOTFOUND"))
      (let ((new (concatenate 'string (course-name c) "_2")))
        (unless (valid-word new)
          (fail "BADARG"))
        (when (name-exists-p new)
          (fail "DUP"))
        (when (>= (length *courses*) 20)
          (fail "LIMIT"))
        (push (make-course :name new
                           :teacher (course-teacher c)
                           :loc (course-loc c)
                           :day d
                           :from (course-from c)
                           :to (course-to c))
              *courses*)
        1))))

(defop merge (a b)
  (unless (and (valid-word a) (valid-word b))
    (fail "BADARG"))
  (let ((ca (find-course a))
        (cb (find-course b)))
    (unless ca
      (fail "NOTFOUND"))
    (unless cb
      (fail "NOTFOUND"))
    (setf (course-teacher ca) (course-teacher cb))
    (setf (course-loc ca) (course-loc cb))
    (setf *courses* (remove cb *courses* :test #'eq))
    2))

(defop sort ()
  0)

(defop filter (day)
  (let ((d (to-int day)))
    (unless (valid-day d)
      (fail "BADARG"))
    (count-if (lambda (c) (= (course-day c) d)) *courses*)))

(defop count ()
  (length *courses*))

(defun print-state ()
  (format t "#state~%")
  (dolist (c (sort (copy-list *courses*) #'string< :key #'course-name))
    (format t "~a|~a|~a|~d|~d-~d~%"
            (course-name c)
            (course-teacher c)
            (course-loc c)
            (course-day c)
            (course-from c)
            (course-to c))))

(defun main ()
  (let ((cmds (member-if #'known-command-p sb-ext:*posix-argv*)))
    (dolist (cmd cmds)
      (process-command cmd))
    (print-state)))

(main)

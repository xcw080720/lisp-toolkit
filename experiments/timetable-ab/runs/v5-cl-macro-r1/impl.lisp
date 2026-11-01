(defstruct course name teacher loc day from to)

(defvar *courses* nil)
(defvar *ops* (make-hash-table :test 'equal))

(defun fail (code)
  (throw 'op-error (cons :err code)))

(defun valid-word-p (s)
  (and (stringp s)
       (<= 1 (length s) 12)))

(defun parse-int-safe (s)
  (handler-case
      (multiple-value-bind (n pos)
          (parse-integer s :junk-allowed nil)
        (declare (ignore pos))
        n)
    (error () (fail "BADARG"))))

(defun parse-int-check (s min max)
  (let ((n (parse-int-safe s)))
    (when (or (and min (< n min))
              (and max (> n max)))
      (fail "BADARG"))
    n))

(defun find-course (name)
  (find name *courses* :key #'course-name :test #'string=))

(defun conflict-p (day from to &optional exclude)
  (loop for c in *courses*
        for cname = (course-name c)
        unless (member cname exclude :test #'string=)
        do (when (and (= day (course-day c))
                      (<= from (course-to c))
                      (<= (course-from c) to))
             (return t))))

(defmacro defop (verb specs &body body)
  (let* ((raws (loop repeat (length specs) collect (gensym "ARG")))
         (bindings
           (loop for spec in specs
                 for raw in raws
                 collect
                 (let ((var (first spec))
                       (type (second spec)))
                   (ecase type
                     (word
                      `(,var (progn
                               (unless (valid-word-p ,raw)
                                 (fail "BADARG"))
                               ,raw)))
                     (int
                      (let ((min (third spec))
                            (max (fourth spec)))
                        `(,var (parse-int-check ,raw ,min ,max)))))))))
    `(setf (gethash ,verb *ops*)
           (lambda (arg-list)
             (unless (= (length arg-list) ,(length specs))
               (fail "BADARG"))
             (destructuring-bind ,raws arg-list
               (let* ,bindings
                 ,@body))))))

(defop "add" ((name word) (teacher word) (loc word) (day int 1 7) (from int 1 12) (to int 1 12))
  (when (> from to) (fail "BADARG"))
  (when (find-course name) (fail "DUP"))
  (when (>= (length *courses*) 20) (fail "LIMIT"))
  (when (conflict-p day from to) (fail "CONFLICT"))
  (push (make-course :name name :teacher teacher :loc loc :day day :from from :to to) *courses*)
  1)

(defop "del" ((name word))
  (unless (find-course name) (fail "NOTFOUND"))
  (setf *courses* (remove name *courses* :key #'course-name :test #'string=))
  1)

(defop "edit" ((name word) (teacher word) (loc word))
  (let ((c (find-course name)))
    (unless c (fail "NOTFOUND"))
    (setf (course-teacher c) teacher
          (course-loc c) loc)
    1))

(defop "move" ((name word) (day int 1 7) (from int 1 12) (to int 1 12))
  (when (> from to) (fail "BADARG"))
  (let ((c (find-course name)))
    (unless c (fail "NOTFOUND"))
    (when (conflict-p day from to (list name)) (fail "CONFLICT"))
    (setf (course-day c) day
          (course-from c) from
          (course-to c) to)
    1))

(defop "swap" ((a word) (b word))
  (let ((ca (find-course a))
        (cb (find-course b)))
    (unless (and ca cb) (fail "NOTFOUND"))
    (let ((day-a (course-day ca)) (from-a (course-from ca)) (to-a (course-to ca))
          (day-b (course-day cb)) (from-b (course-from cb)) (to-b (course-to cb)))
      (when (conflict-p day-b from-b to-b (list a b)) (fail "CONFLICT"))
      (when (conflict-p day-a from-a to-a (list a b)) (fail "CONFLICT"))
      (setf (course-day ca) day-b
            (course-from ca) from-b
            (course-to ca) to-b
            (course-day cb) day-a
            (course-from cb) from-a
            (course-to cb) to-a)
      2)))

(defop "rename" ((old word) (new word))
  (let ((c (find-course old)))
    (unless c (fail "NOTFOUND"))
    (when (find-course new) (fail "DUP"))
    (setf (course-name c) new)
    1))

(defop "duplicate" ((name word) (newname word))
  (let ((c (find-course name)))
    (unless c (fail "NOTFOUND"))
    (when (find-course newname) (fail "DUP"))
    (when (>= (length *courses*) 20) (fail "LIMIT"))
    (when (conflict-p (course-day c) (course-from c) (course-to c)) (fail "CONFLICT"))
    (push (make-course :name newname
                       :teacher (course-teacher c)
                       :loc (course-loc c)
                       :day (course-day c)
                       :from (course-from c)
                       :to (course-to c))
          *courses*)
    1))

(defop "trim" ((day int 1 7) (to int 1 12))
  (let ((n 0))
    (dolist (c *courses*)
      (when (and (= (course-day c) day)
                 (<= (course-from c) to)
                 (< to (course-to c)))
        (setf (course-to c) to)
        (incf n)))
    n))

(defop "clear" ((day int 1 7))
  (let ((n (count-if (lambda (c) (= (course-day c) day)) *courses*)))
    (setf *courses* (remove-if (lambda (c) (= (course-day c) day)) *courses*))
    n))

(defop "shift" ((day int 1 7) (delta int))
  (let ((new-day (+ day delta)))
    (when (or (< new-day 1) (> new-day 7)) (fail "BADARG"))
    (let* ((moved (remove-if-not (lambda (c) (= (course-day c) day)) *courses*))
           (names (mapcar #'course-name moved)))
      (dolist (c moved)
        (when (conflict-p new-day (course-from c) (course-to c) names)
          (fail "CONFLICT")))
      (dolist (c moved)
        (setf (course-day c) new-day))
      (length moved))))

(defop "copy" ((name word) (day int 1 7))
  (let ((c (find-course name)))
    (unless c (fail "NOTFOUND"))
    (let ((newname (concatenate 'string name "_2")))
      (unless (valid-word-p newname) (fail "BADARG"))
      (when (find-course newname) (fail "DUP"))
      (when (>= (length *courses*) 20) (fail "LIMIT"))
      (when (conflict-p day (course-from c) (course-to c)) (fail "CONFLICT"))
      (push (make-course :name newname
                         :teacher (course-teacher c)
                         :loc (course-loc c)
                         :day day
                         :from (course-from c)
                         :to (course-to c))
            *courses*)
      1)))

(defop "merge" ((a word) (b word))
  (let ((ca (find-course a))
        (cb (find-course b)))
    (unless (and ca cb) (fail "NOTFOUND"))
    (setf (course-teacher ca) (course-teacher cb)
          (course-loc ca) (course-loc cb))
    (setf *courses* (remove b *courses* :key #'course-name :test #'string=))
    2))

(defop "sort" ()
  0)

(defop "filter" ((day int 1 7))
  (count-if (lambda (c) (= (course-day c) day)) *courses*))

(defop "count" ()
  (length *courses*))

(defun split-tokens (str)
  (let ((res '())
        (start 0)
        (len (length str)))
    (loop for i from 0 to len
          for ch = (if (< i len) (char str i) #\Space)
          do (when (or (= i len)
                       (member ch '(#\Space #\Tab #\Newline #\Return)))
               (when (> i start)
                 (push (subseq str start i) res))
               (setf start (1+ i))))
    (nreverse res)))

(defun script-name-p (s)
  (let ((n (length s)))
    (and (>= n 5)
         (string= ".lisp" s :start2 (- n 5)))))

(defun get-command-args ()
  (let ((args (cdr sb-ext:*posix-argv*)))
    (cond
      ((null args) nil)
      ((string= (first args) "--script") (cddr args))
      ((script-name-p (first args)) (cdr args))
      (t args))))

(defun run-command (line)
  (let ((tokens (split-tokens line)))
    (if (null tokens)
        (format t "err BADARG~%")
        (let* ((verb (first tokens))
               (args (rest tokens))
               (op (gethash verb *ops*)))
          (if (null op)
              (format t "err BADARG~%")
              (let ((res (catch 'op-error
                           (cons :ok (funcall op args)))))
                (if (eq (car res) :ok)
                    (format t "ok ~a ~a~%" verb (cdr res))
                    (format t "err ~a~%" (cdr res)))))))))

(defun main ()
  (dolist (cmd (get-command-args))
    (run-command cmd))
  (format t "#state~%")
  (dolist (c (sort (copy-list *courses*) #'string< :key #'course-name))
    (format t "~a|~a|~a|~a|~a-~a~%"
            (course-name c)
            (course-teacher c)
            (course-loc c)
            (course-day c)
            (course-from c)
            (course-to c))))

(main)

(defvar *ops* (make-hash-table :test #'equal))
(defvar *courses* nil)

(defun emit-ok (verb n)
  (format t "ok ~a ~d~%" verb n))

(defun emit-err (code)
  (format t "err ~a~%" code))

(defun success (n) (values t n))
(defun failure (code) (values nil code))

(defmacro defop (name (&rest params) &body body)
  (let ((tokens (gensym "TOKENS"))
        (succ (gensym "SUCC"))
        (val (gensym "VAL"))
        (op-name (string-downcase (symbol-name name)))
        (fn (intern (concatenate 'string "OP-" (string-upcase (symbol-name name))))))
    `(progn
       (defun ,fn (,tokens)
         (if (/= (length ,tokens) ,(1+ (length params)))
             (emit-err "BADARG")
             (let ,(loop for p in params
                         for i from 1
                         collect `(,p (nth ,i ,tokens)))
               (multiple-value-bind (,succ ,val) (progn ,@body)
                 (if ,succ
                     (emit-ok ,op-name ,val)
                     (emit-err ,val))))))
       (setf (gethash ,op-name *ops*) #',fn))))

(defstruct course name teacher loc day from to)

(defun valid-word-p (s)
  (and (stringp s)
       (<= 1 (length s) 12)
       (every (lambda (ch)
                (not (member ch '(#\Space #\Tab #\Newline #\Return))))
              s)))

(defun parse-int (s)
  (handler-case
      (multiple-value-bind (n pos)
          (parse-integer s :junk-allowed t)
        (if (and n (= pos (length s)))
            (values n t)
            (values nil nil)))
    (error () (values nil nil))))

(defun parse-int-in-range (s low high)
  (multiple-value-bind (n ok)
      (parse-int s)
    (if (and ok (<= low n) (<= n high))
        n
        nil)))

(defun find-course (name)
  (find name *courses* :key #'course-name :test #'string=))

(defun conflicts-p (day from to ignore-name)
  (some (lambda (c)
          (and (= (course-day c) day)
               (or (null ignore-name)
                   (not (string= (course-name c) ignore-name)))
               (<= from (course-to c))
               (<= (course-from c) to)))
        *courses*))

(defun tokenize (s)
  (let ((tokens nil)
        (start 0)
        (n (length s)))
    (loop for i from 0 to n
          do (when (or (= i n) (char= (char s i) #\Space))
               (when (> i start)
                 (push (subseq s start i) tokens))
               (setf start (1+ i))))
    (nreverse tokens)))

(defun ends-with (string suffix)
  (let ((n (length string)) (m (length suffix)))
    (and (>= n m)
         (string= (subseq string (- n m)) suffix))))

(defun strip-argv (argv)
  (let ((rest argv))
    (when (and rest (or (string= (first rest) "sbcl")
                        (ends-with (first rest) "/sbcl")))
      (pop rest))
    (when (and rest (string= (first rest) "--script"))
      (pop rest))
    (when (and rest (or (string= (first rest) "impl.lisp")
                        (ends-with (first rest) "/impl.lisp")))
      (pop rest))
    rest))

(defun run-command (cmd)
  (let* ((tokens (tokenize cmd))
         (verb (and tokens (string-downcase (first tokens))))
         (fn (and verb (gethash verb *ops*))))
    (if fn
        (funcall fn tokens)
        (emit-err "BADARG"))))

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
  (let ((commands (strip-argv sb-ext:*posix-argv*)))
    (dolist (cmd commands)
      (run-command cmd))
    (print-state)))

(defop add (name teacher loc day from to)
  (let ((day-n (parse-int-in-range day 1 7))
        (from-n (parse-int-in-range from 1 12))
        (to-n (parse-int-in-range to 1 12)))
    (if (and (valid-word-p name)
             (valid-word-p teacher)
             (valid-word-p loc)
             day-n from-n to-n
             (<= from-n to-n))
        (if (find-course name)
            (failure "DUP")
            (if (>= (length *courses*) 20)
                (failure "LIMIT")
                (if (conflicts-p day-n from-n to-n nil)
                    (failure "CONFLICT")
                    (progn
                      (push (make-course :name name
                                         :teacher teacher
                                         :loc loc
                                         :day day-n
                                         :from from-n
                                         :to to-n)
                            *courses*)
                      (success 1)))))
        (failure "BADARG"))))

(defop del (name)
  (if (valid-word-p name)
      (if (find-course name)
          (progn
            (setf *courses* (remove name *courses* :key #'course-name :test #'string=))
            (success 1))
          (failure "NOTFOUND"))
      (failure "BADARG")))

(defop edit (name teacher loc)
  (if (and (valid-word-p name)
           (valid-word-p teacher)
           (valid-word-p loc))
      (let ((c (find-course name)))
        (if c
            (progn
              (setf (course-teacher c) teacher
                    (course-loc c) loc)
              (success 1))
            (failure "NOTFOUND")))
      (failure "BADARG")))

(defop move (name day from to)
  (let ((day-n (parse-int-in-range day 1 7))
        (from-n (parse-int-in-range from 1 12))
        (to-n (parse-int-in-range to 1 12)))
    (if (and (valid-word-p name)
             day-n from-n to-n
             (<= from-n to-n))
        (let ((c (find-course name)))
          (if c
              (if (conflicts-p day-n from-n to-n name)
                  (failure "CONFLICT")
                  (progn
                    (setf (course-day c) day-n
                          (course-from c) from-n
                          (course-to c) to-n)
                    (success 1)))
              (failure "NOTFOUND")))
        (failure "BADARG"))))

(defop swap (a b)
  (if (and (valid-word-p a) (valid-word-p b))
      (let ((ca (find-course a))
            (cb (find-course b)))
        (if (and ca cb)
            (let ((day (course-day ca))
                  (from (course-from ca))
                  (to (course-to ca)))
              (setf (course-day ca) (course-day cb)
                    (course-from ca) (course-from cb)
                    (course-to ca) (course-to cb)
                    (course-day cb) day
                    (course-from cb) from
                    (course-to cb) to)
              (success 2))
            (failure "NOTFOUND")))
      (failure "BADARG")))

(defop rename (old new)
  (if (and (valid-word-p old) (valid-word-p new))
      (let ((c (find-course old)))
        (if c
            (let ((other (find-course new)))
              (if (and other (not (string= old new)))
                  (failure "DUP")
                  (progn
                    (setf (course-name c) new)
                    (success 1))))
            (failure "NOTFOUND")))
      (failure "BADARG")))

(defop duplicate (name newname)
  (if (and (valid-word-p name) (valid-word-p newname))
      (let ((c (find-course name)))
        (if c
            (if (find-course newname)
                (failure "DUP")
                (if (>= (length *courses*) 20)
                    (failure "LIMIT")
                    (progn
                      (push (make-course :name newname
                                         :teacher (course-teacher c)
                                         :loc (course-loc c)
                                         :day (course-day c)
                                         :from (course-from c)
                                         :to (course-to c))
                            *courses*)
                      (success 1))))
            (failure "NOTFOUND")))
      (failure "BADARG")))

(defop trim (day to)
  (let ((day-n (parse-int-in-range day 1 7))
        (to-n (parse-int-in-range to 1 12)))
    (if (and day-n to-n)
        (let ((count 0))
          (dolist (c *courses*)
            (when (and (= (course-day c) day-n)
                       (<= (course-from c) to-n)
                       (< to-n (course-to c)))
              (setf (course-to c) to-n)
              (incf count)))
          (success count))
        (failure "BADARG"))))

(defop clear (day)
  (let ((day-n (parse-int-in-range day 1 7)))
    (if day-n
        (let ((before (length *courses*)))
          (setf *courses* (remove day-n *courses* :key #'course-day :test #'=))
          (success (- before (length *courses*))))
        (failure "BADARG"))))

(defop shift (day delta)
  (let ((day-n (parse-int-in-range day 1 7)))
    (if day-n
        (multiple-value-bind (delta-n delta-ok) (parse-int delta)
          (if (not delta-ok)
              (failure "BADARG")
              (let ((new-day (+ day-n delta-n)))
                (if (or (< new-day 1) (> new-day 7))
                    (failure "BADARG")
                    (let ((count 0))
                      (dolist (c *courses*)
                        (when (= (course-day c) day-n)
                          (setf (course-day c) new-day)
                          (incf count)))
                      (success count))))))
        (failure "BADARG"))))

(defop copy (name day)
  (let ((day-n (parse-int-in-range day 1 7)))
    (if (and (valid-word-p name) day-n)
        (let ((c (find-course name)))
          (if c
              (let ((newname (concatenate 'string name "_2")))
                (if (> (length newname) 12)
                    (failure "BADARG")
                    (if (find-course newname)
                        (failure "DUP")
                        (if (>= (length *courses*) 20)
                            (failure "LIMIT")
                            (progn
                              (push (make-course :name newname
                                                 :teacher (course-teacher c)
                                                 :loc (course-loc c)
                                                 :day day-n
                                                 :from (course-from c)
                                                 :to (course-to c))
                                    *courses*)
                              (success 1))))))
              (failure "NOTFOUND")))
        (failure "BADARG"))))

(defop merge (a b)
  (if (and (valid-word-p a) (valid-word-p b))
      (let ((ca (find-course a))
            (cb (find-course b)))
        (if (and ca cb)
            (progn
              (setf (course-teacher ca) (course-teacher cb)
                    (course-loc ca) (course-loc cb))
              (setf *courses* (remove b *courses* :key #'course-name :test #'string=))
              (success 2))
            (failure "NOTFOUND")))
      (failure "BADARG")))

(defop sort ()
  (success 0))

(defop filter (day)
  (let ((day-n (parse-int-in-range day 1 7)))
    (if day-n
        (success (count day-n *courses* :key #'course-day :test #'=))
        (failure "BADARG"))))

(defop count ()
  (success (length *courses*)))

(main)

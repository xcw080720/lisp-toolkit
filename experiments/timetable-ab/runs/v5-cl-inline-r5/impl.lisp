(defvar *courses* nil)

(defstruct course
  name
  teacher
  loc
  day
  from
  to)

(defun find-course (name)
  (find name *courses* :key #'course-name :test #'string=))

(defun split-ws (s)
  (let ((res nil)
        (start 0)
        (len (length s)))
    (loop for i from 0 to len
          for c = (and (< i len) (char s i))
          do (when (or (= i len)
                       (member c '(#\Space #\Tab #\Newline #\Return)
                               :test #'char=))
               (when (> i start)
                 (push (subseq s start i) res))
               (setf start (1+ i))))
    (nreverse res)))

(defun parse-int (s)
  (handler-case (parse-integer s)
    (error () nil)))

(defun len1-12-p (s)
  (and (stringp s) (<= 1 (length s) 12)))

(defun day-ok-p (n)
  (and (integerp n) (<= 1 n 7)))

(defun time-ok-p (from to)
  (and (integerp from) (integerp to)
       (<= 1 from 12) (<= 1 to 12) (<= from to)))

(defun overlap-p (d1 f1 t1 d2 f2 t2)
  (and (= d1 d2) (<= f1 t2) (<= f2 t1)))

(defun emit-err (code)
  (format t "err ~a~%" code))

(defun emit-ok (verb n)
  (format t "ok ~a ~d~%" verb n))

(defun command-name-p (s)
  (member s '("add" "del" "edit" "move" "swap" "rename" "duplicate"
              "trim" "clear" "shift" "copy" "merge" "sort" "filter" "count")
          :test #'string=))

(defun process-command (cmd)
  (let* ((tokens (split-ws cmd))
         (verb (first tokens))
         (args (rest tokens)))
    (cond
      ((null verb)
       (emit-err "BADARG"))

      ((string= verb "add")
       (if (/= (length args) 6)
           (emit-err "BADARG")
           (destructuring-bind (name teacher loc day-s from-s to-s) args
             (let ((day (parse-int day-s))
                   (from (parse-int from-s))
                   (to (parse-int to-s)))
               (if (not (and (len1-12-p name)
                             (len1-12-p teacher)
                             (len1-12-p loc)
                             (day-ok-p day)
                             (time-ok-p from to)))
                   (emit-err "BADARG")
                   (cond
                     ((find-course name)
                      (emit-err "DUP"))
                     ((>= (length *courses*) 20)
                      (emit-err "LIMIT"))
                     ((some (lambda (c)
                              (overlap-p (course-day c)
                                         (course-from c)
                                         (course-to c)
                                         day from to))
                            *courses*)
                      (emit-err "CONFLICT"))
                     (t
                      (push (make-course :name name
                                         :teacher teacher
                                         :loc loc
                                         :day day
                                         :from from
                                         :to to)
                            *courses*)
                      (emit-ok "add" 1))))))))

      ((string= verb "del")
       (if (/= (length args) 1)
           (emit-err "BADARG")
           (let ((name (first args)))
             (if (not (len1-12-p name))
                 (emit-err "BADARG")
                 (if (find-course name)
                     (progn
                       (setf *courses*
                             (remove name *courses*
                                     :key #'course-name
                                     :test #'string=))
                       (emit-ok "del" 1))
                     (emit-err "NOTFOUND"))))))

      ((string= verb "edit")
       (if (/= (length args) 3)
           (emit-err "BADARG")
           (destructuring-bind (name teacher loc) args
             (if (not (and (len1-12-p name)
                           (len1-12-p teacher)
                           (len1-12-p loc)))
                 (emit-err "BADARG")
                 (let ((c (find-course name)))
                   (if c
                       (progn
                         (setf (course-teacher c) teacher
                               (course-loc c) loc)
                         (emit-ok "edit" 1))
                       (emit-err "NOTFOUND")))))))

      ((string= verb "move")
       (if (/= (length args) 4)
           (emit-err "BADARG")
           (destructuring-bind (name day-s from-s to-s) args
             (let ((day (parse-int day-s))
                   (from (parse-int from-s))
                   (to (parse-int to-s)))
               (if (not (and (len1-12-p name)
                             (day-ok-p day)
                             (time-ok-p from to)))
                   (emit-err "BADARG")
                   (let ((c (find-course name)))
                     (if (not c)
                         (emit-err "NOTFOUND")
                         (if (some (lambda (x)
                                     (and (not (eq x c))
                                          (overlap-p (course-day x)
                                                     (course-from x)
                                                     (course-to x)
                                                     day from to)))
                                   *courses*)
                             (emit-err "CONFLICT")
                             (progn
                               (setf (course-day c) day
                                     (course-from c) from
                                     (course-to c) to)
                               (emit-ok "move" 1))))))))))

      ((string= verb "swap")
       (if (/= (length args) 2)
           (emit-err "BADARG")
           (destructuring-bind (a b) args
             (if (not (and (len1-12-p a)
                           (len1-12-p b)))
                 (emit-err "BADARG")
                 (let ((ca (find-course a))
                       (cb (find-course b)))
                   (if (or (null ca) (null cb))
                       (emit-err "NOTFOUND")
                       (let ((ad (course-day ca))
                             (af (course-from ca))
                             (at (course-to ca))
                             (bd (course-day cb))
                             (bf (course-from cb))
                             (bt (course-to cb)))
                         (setf (course-day ca) bd
                               (course-from ca) bf
                               (course-to ca) bt)
                         (setf (course-day cb) ad
                               (course-from cb) af
                               (course-to cb) at)
                         (emit-ok "swap" 2))))))))

      ((string= verb "rename")
       (if (/= (length args) 2)
           (emit-err "BADARG")
           (destructuring-bind (old new) args
             (if (not (and (len1-12-p old)
                           (len1-12-p new)))
                 (emit-err "BADARG")
                 (let ((c (find-course old)))
                   (if (not c)
                       (emit-err "NOTFOUND")
                       (if (and (not (string= old new))
                                (find-course new))
                           (emit-err "DUP")
                           (progn
                             (setf (course-name c) new)
                             (emit-ok "rename" 1)))))))))

      ((string= verb "duplicate")
       (if (/= (length args) 2)
           (emit-err "BADARG")
           (destructuring-bind (name newname) args
             (if (not (and (len1-12-p name)
                           (len1-12-p newname)))
                 (emit-err "BADARG")
                 (let ((c (find-course name)))
                   (if (not c)
                       (emit-err "NOTFOUND")
                       (if (find-course newname)
                           (emit-err "DUP")
                           (if (>= (length *courses*) 20)
                               (emit-err "LIMIT")
                               (progn
                                 (push (make-course :name newname
                                                    :teacher (course-teacher c)
                                                    :loc (course-loc c)
                                                    :day (course-day c)
                                                    :from (course-from c)
                                                    :to (course-to c))
                                       *courses*)
                                 (emit-ok "duplicate" 1))))))))))

      ((string= verb "trim")
       (if (/= (length args) 2)
           (emit-err "BADARG")
           (destructuring-bind (day-s to-s) args
             (let ((day (parse-int day-s))
                   (to (parse-int to-s)))
               (if (not (and (day-ok-p day)
                             (integerp to)
                             (<= 1 to 12)))
                   (emit-err "BADARG")
                   (let ((n 0))
                     (dolist (c *courses*)
                       (when (and (= (course-day c) day)
                                  (<= (course-from c) to)
                                  (< to (course-to c)))
                         (setf (course-to c) to)
                         (incf n)))
                     (emit-ok "trim" n))))))))

      ((string= verb "clear")
       (if (/= (length args) 1)
           (emit-err "BADARG")
           (let ((day (parse-int (first args))))
             (if (not (day-ok-p day))
                 (emit-err "BADARG")
                 (let ((n (count day *courses* :key #'course-day :test #'=)))
                   (setf *courses*
                         (remove-if (lambda (c) (= (course-day c) day))
                                    *courses*))
                   (emit-ok "clear" n)))))))

      ((string= verb "shift")
       (if (/= (length args) 2)
           (emit-err "BADARG")
           (destructuring-bind (day-s delta-s) args
             (let* ((day (parse-int day-s))
                    (delta (parse-int delta-s))
                    (target (and (integerp day)
                                 (integerp delta)
                                 (+ day delta))))
               (if (not (and (day-ok-p day)
                             (integerp delta)
                             (integerp target)
                             (<= 1 target 7)))
                   (emit-err "BADARG")
                   (let ((moved (remove-if-not
                                 (lambda (c) (= (course-day c) day))
                                 *courses*)))
                     (if (some (lambda (m)
                                 (some (lambda (e)
                                         (and (not (member e moved :test #'eq))
                                              (= (course-day e) target)
                                              (overlap-p target
                                                         (course-from m)
                                                         (course-to m)
                                                         (course-day e)
                                                         (course-from e)
                                                         (course-to e))))
                                       *courses*))
                               moved)
                         (emit-err "CONFLICT")
                         (progn
                           (dolist (m moved)
                             (setf (course-day m) target))
                           (emit-ok "shift" (length moved)))))))))))

      ((string= verb "copy")
       (if (/= (length args) 2)
           (emit-err "BADARG")
           (destructuring-bind (name day-s) args
             (let ((day (parse-int day-s)))
               (if (not (and (len1-12-p name)
                             (day-ok-p day)))
                   (emit-err "BADARG")
                   (let ((c (find-course name)))
                     (if (not c)
                         (emit-err "NOTFOUND")
                         (let ((newname (concatenate 'string name "_2")))
                           (cond
                             ((> (length newname) 12)
                              (emit-err "BADARG"))
                             ((find-course newname)
                              (emit-err "DUP"))
                             ((>= (length *courses*) 20)
                              (emit-err "LIMIT"))
                             ((some (lambda (x)
                                      (overlap-p day
                                                 (course-from c)
                                                 (course-to c)
                                                 (course-day x)
                                                 (course-from x)
                                                 (course-to x)))
                                    *courses*)
                              (emit-err "CONFLICT"))
                             (t
                              (push (make-course :name newname
                                                 :teacher (course-teacher c)
                                                 :loc (course-loc c)
                                                 :day day
                                                 :from (course-from c)
                                                 :to (course-to c))
                                    *courses*)
                              (emit-ok "copy" 1)))))))))))

      ((string= verb "merge")
       (if (/= (length args) 2)
           (emit-err "BADARG")
           (destructuring-bind (a b) args
             (if (not (and (len1-12-p a)
                           (len1-12-p b)))
                 (emit-err "BADARG")
                 (if (string= a b)
                     (emit-err "BADARG")
                     (let ((ca (find-course a))
                           (cb (find-course b)))
                       (if (or (null ca) (null cb))
                           (emit-err "NOTFOUND")
                           (progn
                             (setf (course-teacher ca) (course-teacher cb)
                                   (course-loc ca) (course-loc cb))
                             (setf *courses*
                                   (remove b *courses*
                                           :key #'course-name
                                           :test #'string=))
                             (emit-ok "merge" 2)))))))))

      ((string= verb "sort")
       (if (/= (length args) 0)
           (emit-err "BADARG")
           (emit-ok "sort" 0)))

      ((string= verb "filter")
       (if (/= (length args) 1)
           (emit-err "BADARG")
           (let ((day (parse-int (first args))))
             (if (not (day-ok-p day))
                 (emit-err "BADARG")
                 (emit-ok "filter"
                          (count day *courses* :key #'course-day :test #'=)))))))

      ((string= verb "count")
       (if (/= (length args) 0)
           (emit-err "BADARG")
           (emit-ok "count" (length *courses*))))

      (t
       (emit-err "BADARG")))))

(let ((rest-args (cdr sb-ext:*posix-argv*)))
  (loop while (and rest-args
                   (not (command-name-p (first rest-args))))
        do (pop rest-args))
  (dolist (cmd rest-args)
    (process-command cmd))
  (format t "#state~%")
  (dolist (c (sort (copy-list *courses*)
                   (lambda (a b)
                     (string< (course-name a)
                              (course-name b)))))
    (format t "~a|~a|~a|~d|~d-~d~%"
            (course-name c)
            (course-teacher c)
            (course-loc c)
            (course-day c)
            (course-from c)
            (course-to c))))

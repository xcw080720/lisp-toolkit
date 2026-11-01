(in-package :cl-user)

(defstruct course name teacher loc day from to)

(defparameter *courses* nil)
(defparameter *ops* (make-hash-table :test #'equal))

(defun valid-word-p (s)
  (and (stringp s)
       (<= 1 (length s) 12)
       (not (find-if (lambda (c) (member c '(#\Space #\Tab #\Newline))) s))))

(defun parse-int (s)
  (handler-case
      (multiple-value-bind (n pos) (parse-integer s :junk-allowed t)
        (if (and n (= pos (length s))) n nil))
    (error () nil)))

(defun split-spaces (s)
  (let ((res nil) (start 0) (len (length s)))
    (loop for i from 0 to len
          do (when (or (= i len)
                       (member (char s i) '(#\Space #\Tab)))
               (when (> i start)
                 (push (subseq s start i) res))
               (setf start (1+ i))))
    (nreverse res)))

(defun scriptish-p (s)
  (and (stringp s)
       (or (string= s "sbcl")
           (and (> (length s) 0) (char= (char s 0) #\-))
           (and (not (find #\Space s))
                (or (search ".lisp" s :from-end t)
                    (search ".lsp" s :from-end t))))))

(defun commands-from-argv ()
  (let ((argv (sb-ext:*posix-argv*)))
    (loop while (and argv (scriptish-p (first argv)))
          do (pop argv))
    argv))

(defun op-ok (n) (list :ok n))
(defun op-err (code) (list :err code))

(defun find-course (name)
  (find name *courses* :key #'course-name :test #'string=))

(defun remove-course (name)
  (setf *courses* (remove name *courses* :key #'course-name :test #'string=)))

(defun course-count ()
  (length *courses*))

(defun conflict-p (day from to &optional ignore)
  (let ((ignores (cond ((null ignore) nil)
                       ((listp ignore) ignore)
                       (t (list ignore)))))
    (dolist (c *courses* nil)
      (unless (member c ignores :test #'eq)
        (when (and (= day (course-day c))
                   (<= from (course-to c))
                   (<= (course-from c) to))
          (return-from conflict-p t))))))

(defmacro def-op (verb lambda-list &body body)
  (let ((args (gensym "ARGS"))
        (res (gensym "RES"))
        (n (length lambda-list)))
    `(setf (gethash ,verb *ops*)
           (lambda (,args)
             (if (= (length ,args) ,n)
                 (let ,(loop for p in lambda-list for i from 0 collect `(,p (nth ,i ,args)))
                   (let ((,res (progn ,@body)))
                     (cond
                       ((and (consp ,res) (eq (car ,res) :err))
                        (format t "err ~a~%" (cadr ,res)))
                       ((and (consp ,res) (eq (car ,res) :ok))
                        (format t "ok ~a ~a~%" ,verb (cadr ,res)))
                       ((integerp ,res)
                        (format t "ok ~a ~a~%" ,verb ,res))
                       (t (format t "err BADARG~%")))))
                 (format t "err BADARG~%"))))))

(def-op "add" (name teacher loc day from to)
  (let ((d (parse-int day))
        (f (parse-int from))
        (toi (parse-int to)))
    (cond
      ((or (not (valid-word-p name))
           (not (valid-word-p teacher))
           (not (valid-word-p loc))
           (null d) (null f) (null toi)
           (not (<= 1 d 7))
           (not (<= 1 f 12))
           (not (<= 1 toi 12))
           (> f toi))
       (op-err "BADARG"))
      ((find-course name) (op-err "DUP"))
      ((>= (course-count) 20) (op-err "LIMIT"))
      ((conflict-p d f toi) (op-err "CONFLICT"))
      (t
       (push (make-course :name name :teacher teacher :loc loc :day d :from f :to toi) *courses*)
       (op-ok 1)))))

(def-op "del" (name)
  (cond
    ((not (valid-word-p name)) (op-err "BADARG"))
    ((not (find-course name)) (op-err "NOTFOUND"))
    (t (remove-course name) (op-ok 1))))

(def-op "edit" (name teacher loc)
  (cond
    ((or (not (valid-word-p name))
         (not (valid-word-p teacher))
         (not (valid-word-p loc)))
     (op-err "BADARG"))
    (t
     (let ((c (find-course name)))
       (if c
           (progn
             (setf (course-teacher c) teacher
                   (course-loc c) loc)
             (op-ok 1))
           (op-err "NOTFOUND"))))))

(def-op "move" (name day from to)
  (let ((d (parse-int day))
        (f (parse-int from))
        (toi (parse-int to)))
    (cond
      ((or (not (valid-word-p name))
           (null d) (null f) (null toi)
           (not (<= 1 d 7))
           (not (<= 1 f 12))
           (not (<= 1 toi 12))
           (> f toi))
       (op-err "BADARG"))
      (t
       (let ((c (find-course name)))
         (cond
           ((null c) (op-err "NOTFOUND"))
           ((conflict-p d f toi c) (op-err "CONFLICT"))
           (t
            (setf (course-day c) d
                  (course-from c) f
                  (course-to c) toi)
            (op-ok 1))))))))

(def-op "swap" (a b)
  (cond
    ((or (not (valid-word-p a)) (not (valid-word-p b)))
     (op-err "BADARG"))
    (t
     (let ((ca (find-course a))
           (cb (find-course b)))
       (cond
         ((or (null ca) (null cb)) (op-err "NOTFOUND"))
         ((eq ca cb) (op-ok 2))
         (t
          (let ((ad (course-day ca)) (af (course-from ca)) (at (course-to ca))
                (bd (course-day cb)) (bf (course-from cb)) (bt (course-to cb)))
            (if (or (conflict-p bd bf bt (list ca cb))
                    (conflict-p ad af at (list ca cb)))
                (op-err "CONFLICT")
                (progn
                  (setf (course-day ca) bd
                        (course-from ca) bf
                        (course-to ca) bt)
                  (setf (course-day cb) ad
                        (course-from cb) af
                        (course-to cb) at)
                  (op-ok 2))))))))))

(def-op "rename" (old new)
  (cond
    ((or (not (valid-word-p old)) (not (valid-word-p new)))
     (op-err "BADARG"))
    (t
     (let ((c (find-course old)))
       (cond
         ((null c) (op-err "NOTFOUND"))
         ((find-course new) (op-err "DUP"))
         (t
          (setf (course-name c) new)
          (op-ok 1)))))))

(def-op "duplicate" (name newname)
  (cond
    ((or (not (valid-word-p name)) (not (valid-word-p newname)))
     (op-err "BADARG"))
    (t
     (let ((c (find-course name)))
       (cond
         ((null c) (op-err "NOTFOUND"))
         ((find-course newname) (op-err "DUP"))
         ((>= (course-count) 20) (op-err "LIMIT"))
         ((conflict-p (course-day c) (course-from c) (course-to c)) (op-err "CONFLICT"))
         (t
          (push (make-course :name newname
                             :teacher (course-teacher c)
                             :loc (course-loc c)
                             :day (course-day c)
                             :from (course-from c)
                             :to (course-to c))
                *courses*)
          (op-ok 1)))))))

(def-op "trim" (day to)
  (let ((d (parse-int day))
        (toi (parse-int to)))
    (cond
      ((or (null d) (null toi)
           (not (<= 1 d 7))
           (not (<= 1 toi 12)))
       (op-err "BADARG"))
      (t
       (let ((changed 0))
         (dolist (c *courses*)
           (when (and (= (course-day c) d)
                      (<= (course-from c) toi)
                      (< toi (course-to c)))
             (setf (course-to c) toi)
             (incf changed)))
         (op-ok changed))))))

(def-op "clear" (day)
  (let ((d (parse-int day)))
    (cond
      ((or (null d) (not (<= 1 d 7)))
       (op-err "BADARG"))
      (t
       (let ((before (course-count)))
         (setf *courses* (remove d *courses* :key #'course-day))
         (op-ok (- before (course-count))))))))

(def-op "shift" (day delta)
  (let ((d (parse-int day))
        (delta-i (parse-int delta)))
    (cond
      ((or (null d) (null delta-i) (not (<= 1 d 7)))
       (op-err "BADARG"))
      (t
       (let ((new-day (+ d delta-i)))
         (if (not (<= 1 new-day 7))
             (op-err "BADARG")
             (let ((moved (remove-if-not (lambda (c) (= (course-day c) d)) *courses*)))
               (if (null moved)
                   (op-ok 0)
                   (if (some (lambda (c)
                               (conflict-p new-day (course-from c) (course-to c) moved))
                             moved)
                       (op-err "CONFLICT")
                       (progn
                         (dolist (c moved)
                           (setf (course-day c) new-day))
                         (op-ok (length moved))))))))))))

(def-op "copy" (name day)
  (let ((d (parse-int day)))
    (cond
      ((or (not (valid-word-p name)) (null d) (not (<= 1 d 7)))
       (op-err "BADARG"))
      (t
       (let ((c (find-course name)))
         (cond
           ((null c) (op-err "NOTFOUND"))
           (t
            (let ((new-name (concatenate 'string name "_2")))
              (cond
                ((not (valid-word-p new-name)) (op-err "BADARG"))
                ((find-course new-name) (op-err "DUP"))
                ((>= (course-count) 20) (op-err "LIMIT"))
                ((conflict-p d (course-from c) (course-to c)) (op-err "CONFLICT"))
                (t
                 (push (make-course :name new-name
                                    :teacher (course-teacher c)
                                    :loc (course-loc c)
                                    :day d
                                    :from (course-from c)
                                    :to (course-to c))
                       *courses*)
                 (op-ok 1)))))))))))

(def-op "merge" (a b)
  (cond
    ((or (not (valid-word-p a)) (not (valid-word-p b)))
     (op-err "BADARG"))
    (t
     (let ((ca (find-course a))
           (cb (find-course b)))
       (cond
         ((or (null ca) (null cb)) (op-err "NOTFOUND"))
         ((eq ca cb) (op-ok 2))
         (t
          (setf (course-teacher ca) (course-teacher cb)
                (course-loc ca) (course-loc cb))
          (setf *courses* (remove cb *courses* :test #'eq))
          (op-ok 2)))))))

(def-op "sort" ()
  (op-ok 0))

(def-op "filter" (day)
  (let ((d (parse-int day)))
    (cond
      ((or (null d) (not (<= 1 d 7)))
       (op-err "BADARG"))
      (t
       (op-ok (count d *courses* :key #'course-day))))))

(def-op "count" ()
  (op-ok (course-count)))

(defun dispatch (line)
  (let* ((tokens (split-spaces line))
         (verb (first tokens))
         (args (rest tokens)))
    (if (and verb (gethash verb *ops*))
        (funcall (gethash verb *ops*) args)
        (format t "err BADARG~%"))))

(defun main ()
  (dolist (cmd (commands-from-argv))
    (dispatch cmd))
  (format t "#state~%")
  (dolist (c (sort (copy-list *courses*)
                   (lambda (x y) (string< (course-name x) (course-name y)))))
    (format t "~a|~a|~a|~a|~a-~a~%"
            (course-name c)
            (course-teacher c)
            (course-loc c)
            (course-day c)
            (course-from c)
            (course-to c))))

(main)

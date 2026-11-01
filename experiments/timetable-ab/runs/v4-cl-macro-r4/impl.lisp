(in-package :cl-user)

(defstruct course name teacher loc day from to)
(defvar *courses* (make-hash-table :test 'equal))
(defvar *ops* (make-hash-table :test 'equal))

(defun emit-ok (verb n)
  (format t "ok ~a ~d~%" verb n))

(defun emit-err (code)
  (format t "err ~a~%" code))

(defun split-args (s)
  (let ((tokens nil)
        (start 0)
        (n (length s)))
    (loop for i from 0 below n do
      (when (or (char= (char s i) #\Space)
                (char= (char s i) #\Tab))
        (when (> i start)
          (push (subseq s start i) tokens))
        (setf start (1+ i))))
    (when (> n start)
      (push (subseq s start n) tokens))
    (nreverse tokens)))

(defun parse-int (s)
  (let ((n (length s))
        (i 0)
        (sign 1)
        (val 0)
        (digits 0))
    (when (and (> n 0) (char= (char s 0) #\-))
      (setf sign -1)
      (incf i))
    (loop while (< i n) do
      (let ((d (digit-char-p (char s i))))
        (if d
            (progn
              (setf val (+ (* val 10) d))
              (incf i)
              (incf digits))
            (return-from parse-int nil))))
    (if (> digits 0)
        (* sign val)
        nil)))

(defun courses-list ()
  (let ((lst nil))
    (maphash (lambda (k v)
               (declare (ignore k))
               (push v lst))
             *courses*)
    lst))

(defun conflicts-p (day from to &optional ignore-name)
  (let ((res nil))
    (maphash
     (lambda (key c)
       (when (and (or (null ignore-name)
                      (not (string= key ignore-name)))
                  (= (course-day c) day)
                  (<= from (course-to c))
                  (<= (course-from c) to))
         (setf res t)))
     *courses*)
    res))

(defun add-course (name teacher loc day from to)
  (setf (gethash name *courses*)
        (make-course :name name :teacher teacher :loc loc
                     :day day :from from :to to)))

(defmacro defop (name specs &body body)
  (let* ((fn (intern (format nil "OP-~a" (string-upcase name))))
         (arity (length specs))
         (bindings nil)
         (checks nil))
    (loop for spec in specs
          for idx from 0 do
      (let* ((var (first spec))
             (type (second spec))
             (min (third spec))
             (max (fourth spec))
             (token `(nth ,idx args)))
        (push `(,var ,(if (eq type 'str)
                          token
                          `(parse-int ,token)))
              bindings)
        (push (if (eq type 'str)
                  `(and (stringp ,var) (<= 1 (length ,var) 12))
                  (let ((parts nil))
                    (when min (push `(>= ,var ,min) parts))
                    (when max (push `(<= ,var ,max) parts))
                    `(and (integerp ,var) ,@(nreverse parts))))
              checks)))
    (setf bindings (nreverse bindings))
    (setf checks (nreverse checks))
    `(progn
       (defun ,fn (args)
         (unless (= (length args) ,arity)
           (emit-err "BADARG")
           (return-from ,fn nil))
         (let ,bindings
           (unless (and ,@checks)
             (emit-err "BADARG")
             (return-from ,fn nil))
           (let ((result (progn ,@body)))
             (if (eq (car result) :ok)
                 (emit-ok ,name (cadr result))
                 (emit-err (cadr result))))))
       (setf (gethash ,(string-downcase name) *ops*) (function ,fn)))))

(defop "add" ((name str) (teacher str) (loc str)
              (day int 1 7) (from int 1 12) (to int 1 12))
  (if (> from to)
      (list :err "BADARG")
      (cond
        ((gethash name *courses*) (list :err "DUP"))
        ((>= (hash-table-count *courses*) 20) (list :err "LIMIT"))
        ((conflicts-p day from to) (list :err "CONFLICT"))
        (t (add-course name teacher loc day from to)
           (list :ok 1)))))

(defop "del" ((name str))
  (if (gethash name *courses*)
      (progn (remhash name *courses*) (list :ok 1))
      (list :err "NOTFOUND")))

(defop "edit" ((name str) (teacher str) (loc str))
  (let ((c (gethash name *courses*)))
    (if c
        (progn
          (setf (course-teacher c) teacher
                (course-loc c) loc)
          (list :ok 1))
        (list :err "NOTFOUND"))))

(defop "move" ((name str) (day int 1 7) (from int 1 12) (to int 1 12))
  (if (> from to)
      (list :err "BADARG")
      (let ((c (gethash name *courses*)))
        (cond
          ((null c) (list :err "NOTFOUND"))
          ((conflicts-p day from to name) (list :err "CONFLICT"))
          (t
           (setf (course-day c) day
                 (course-from c) from
                 (course-to c) to)
           (list :ok 1))))))

(defop "swap" ((a str) (b str))
  (let ((ca (gethash a *courses*))
        (cb (gethash b *courses*)))
    (if (and ca cb)
        (let ((da (course-day ca))
              (fa (course-from ca))
              (ta (course-to ca)))
          (setf (course-day ca) (course-day cb)
                (course-from ca) (course-from cb)
                (course-to ca) (course-to cb)
                (course-day cb) da
                (course-from cb) fa
                (course-to cb) ta)
          (list :ok 2))
        (list :err "NOTFOUND"))))

(defop "rename" ((old str) (new str))
  (let ((c (gethash old *courses*))
        (exists (gethash new *courses*)))
    (cond
      ((null c) (list :err "NOTFOUND"))
      ((and exists (not (string= old new))) (list :err "DUP"))
      ((string= old new) (list :ok 1))
      (t
       (remhash old *courses*)
       (setf (course-name c) new)
       (setf (gethash new *courses*) c)
       (list :ok 1)))))

(defop "duplicate" ((name str) (newname str))
  (let ((c (gethash name *courses*)))
    (cond
      ((null c) (list :err "NOTFOUND"))
      ((gethash newname *courses*) (list :err "DUP"))
      ((>= (hash-table-count *courses*) 20) (list :err "LIMIT"))
      (t
       (add-course newname
                   (course-teacher c)
                   (course-loc c)
                   (course-day c)
                   (course-from c)
                   (course-to c))
       (list :ok 1)))))

(defop "trim" ((day int 1 7) (to int 1 12))
  (let ((count 0))
    (maphash
     (lambda (k c)
       (declare (ignore k))
       (when (and (= (course-day c) day)
                  (<= (course-from c) to)
                  (< to (course-to c)))
         (setf (course-to c) to)
         (incf count)))
     *courses*)
    (list :ok count)))

(defop "clear" ((day int 1 7))
  (let ((names nil))
    (maphash
     (lambda (k c)
       (when (= (course-day c) day)
         (push k names)))
     *courses*)
    (dolist (k names)
      (remhash k *courses*))
    (list :ok (length names))))

(defop "shift" ((day int 1 7) (delta int))
  (let ((newday (+ day delta)))
    (if (or (< newday 1) (> newday 7))
        (list :err "BADARG")
        (let ((count 0))
          (maphash
           (lambda (k c)
             (declare (ignore k))
             (when (= (course-day c) day)
               (setf (course-day c) newday)
               (incf count)))
           *courses*)
          (list :ok count)))))

(defop "copy" ((name str) (day int 1 7))
  (let ((c (gethash name *courses*)))
    (cond
      ((null c) (list :err "NOTFOUND"))
      (t
       (let ((newname (concatenate 'string name "_2")))
         (cond
           ((> (length newname) 12) (list :err "BADARG"))
           ((gethash newname *courses*) (list :err "DUP"))
           ((>= (hash-table-count *courses*) 20) (list :err "LIMIT"))
           ((conflicts-p day (course-from c) (course-to c))
            (list :err "CONFLICT"))
           (t
            (add-course newname
                        (course-teacher c)
                        (course-loc c)
                        day
                        (course-from c)
                        (course-to c))
            (list :ok 1))))))))

(defop "merge" ((a str) (b str))
  (let ((ca (gethash a *courses*))
        (cb (gethash b *courses*)))
    (if (and ca cb)
        (progn
          (when (string= (course-teacher ca) "-")
            (setf (course-teacher ca) (course-teacher cb)))
          (when (string= (course-loc ca) "-")
            (setf (course-loc ca) (course-loc cb)))
          (remhash b *courses*)
          (list :ok 2))
        (list :err "NOTFOUND"))))

(defop "sort" ()
  (list :ok 0))

(defop "filter" ((day int 1 7))
  (let ((count 0))
    (maphash
     (lambda (k c)
       (declare (ignore k))
       (when (= (course-day c) day)
         (incf count)))
     *courses*)
    (list :ok count)))

(defop "count" ()
  (list :ok (hash-table-count *courses*)))

(defun print-state ()
  (format t "#state~%")
  (let ((lst (courses-list)))
    (setf lst (sort lst #'string< :key #'course-name))
    (dolist (c lst)
      (format t "~a|~a|~a|~d|~d-~d~%"
              (course-name c)
              (course-teacher c)
              (course-loc c)
              (course-day c)
              (course-from c)
              (course-to c)))))

(defun bootstrap-arg-p (s)
  (or (string= s "--script")
      (let ((n (length s)))
        (and (>= n 5)
             (string-equal (subseq s (- n 5)) ".lisp")))))

(defun command-args ()
  (let ((args (cdr (sb-ext:*posix-argv*))))
    (loop while (and args (bootstrap-arg-p (first args)))
          do (pop args))
    args))

(defun main ()
  (dolist (cmd (command-args))
    (let ((tokens (split-args cmd)))
      (if tokens
          (let* ((verb (string-downcase (first tokens)))
                 (fn (gethash verb *ops*)))
            (if fn
                (funcall fn (rest tokens))
                (emit-err "BADARG")))
          (emit-err "BADARG"))))
  (print-state))

(main)

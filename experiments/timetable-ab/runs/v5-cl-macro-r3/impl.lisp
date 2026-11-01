(defstruct (course (:conc-name course-))
  name teacher loc day from to)

(defvar *courses* nil)
(defvar *ops* (make-hash-table :test #'equal))

(defun whitespace-char-p (ch)
  (or (char= ch #\Space)
      (char= ch #\Tab)
      (char= ch #\Newline)
      (char= ch #\Return)
      (char= ch #\Page)))

(defun split-words (s)
  (if (null s)
      nil
      (let ((words nil)
            (start nil))
        (loop for i from 0 below (length s)
              for ch = (char s i)
              do (if (whitespace-char-p ch)
                     (when start
                       (push (subseq s start i) words)
                       (setf start nil))
                     (unless start
                       (setf start i))))
        (when start
          (push (subseq s start) words))
        (nreverse words))))

(defun valid-word-p (s min max)
  (and (stringp s)
       (<= min (length s) max)
       (every (lambda (ch) (not (whitespace-char-p ch))) s)))

(defun validate-int (s)
  (handler-case
      (multiple-value-bind (val pos)
          (parse-integer s :junk-allowed t)
        (if (and val (= pos (length s)))
            (values val t)
            (values nil nil)))
    (error () (values nil nil))))

(defun validate-int-range (s min max)
  (multiple-value-bind (val ok) (validate-int s)
    (if (and ok (<= min val max))
        (values val t)
        (values nil nil))))

(defun validate-arg (type s)
  (case type
    ((name word) (if (valid-word-p s 1 12)
                     (values s t)
                     (values nil nil)))
    (day (validate-int-range s 1 7))
    (hour (validate-int-range s 1 12))
    (int (validate-int s))
    (otherwise (values nil nil))))

(defun find-course (name)
  (find name *courses* :key #'course-name :test #'string=))

(defun conflict-p (day from to &optional ignore)
  (some (lambda (c)
          (and (not (eq c ignore))
               (= day (course-day c))
               (<= from (course-to c))
               (<= (course-from c) to)))
        *courses*))

(defun byte-string< (a b)
  (let ((n (min (length a) (length b))))
    (loop for i from 0 below n
          for ca = (char-code (char a i))
          for cb = (char-code (char b i))
          do (cond ((< ca cb) (return-from byte-string< t))
                   ((> ca cb) (return-from byte-string< nil))))
    (< (length a) (length b))))

(defmacro defop (verb specs &body body)
  (let ((fn (intern (concatenate 'string "OP-" (string-upcase verb))))
        (n (length specs)))
    `(progn
       (defun ,fn (args)
         (unless (= (length args) ,n)
           (return-from ,fn (values :err :badarg)))
         (let ,(mapcar (lambda (spec i)
                         (let ((var (first spec))
                               (type (second spec)))
                           `(,var (multiple-value-bind (val ok)
                                      (validate-arg ',type (nth ,i args))
                                    (unless ok
                                      (return-from ,fn (values :err :badarg)))
                                    val))))
                       specs
                       (loop for i from 0 below n collect i))
           ,@body))
       (setf (gethash ,verb *ops*) #',fn))))

(defop "add" ((name name) (teacher word) (loc word) (day day) (from hour) (to hour))
  (cond
    ((> from to) (values :err :badarg))
    ((find-course name) (values :err :dup))
    ((>= (length *courses*) 20) (values :err :limit))
    ((conflict-p day from to) (values :err :conflict))
    (t
     (push (make-course :name name :teacher teacher :loc loc
                        :day day :from from :to to)
           *courses*)
     (values :ok 1))))

(defop "del" ((name name))
  (let ((c (find-course name)))
    (if c
        (progn
          (setf *courses* (remove c *courses* :test #'eq))
          (values :ok 1))
        (values :err :notfound))))

(defop "edit" ((name name) (teacher word) (loc word))
  (let ((c (find-course name)))
    (if c
        (progn
          (setf (course-teacher c) teacher
                (course-loc c) loc)
          (values :ok 1))
        (values :err :notfound))))

(defop "move" ((name name) (day day) (from hour) (to hour))
  (cond
    ((> from to) (values :err :badarg))
    (t
     (let ((c (find-course name)))
       (if c
           (if (conflict-p day from to c)
               (values :err :conflict)
               (progn
                 (setf (course-day c) day
                       (course-from c) from
                       (course-to c) to)
                 (values :ok 1)))
           (values :err :notfound))))))

(defop "swap" ((a name) (b name))
  (let ((ca (find-course a))
        (cb (find-course b)))
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
          (values :ok 2))
        (values :err :notfound))))

(defop "rename" ((old name) (new name))
  (let ((c (find-course old)))
    (cond
      ((null c) (values :err :notfound))
      ((find-course new) (values :err :dup))
      (t
       (setf (course-name c) new)
       (values :ok 1)))))

(defop "duplicate" ((name name) (newname name))
  (let ((c (find-course name)))
    (cond
      ((null c) (values :err :notfound))
      ((find-course newname) (values :err :dup))
      ((>= (length *courses*) 20) (values :err :limit))
      (t
       (let ((copy (copy-course c)))
         (setf (course-name copy) newname)
         (push copy *courses*)
         (values :ok 1))))))

(defop "trim" ((day day) (to hour))
  (let ((n 0))
    (dolist (c *courses*)
      (when (and (= (course-day c) day)
                 (<= (course-from c) to)
                 (< to (course-to c)))
        (setf (course-to c) to)
        (incf n)))
    (values :ok n)))

(defop "clear" ((day day))
  (let ((before (length *courses*)))
    (setf *courses* (remove-if (lambda (c) (= (course-day c) day)) *courses*))
    (values :ok (- before (length *courses*)))))

(defop "shift" ((day day) (delta int))
  (let ((newday (+ day delta)))
    (if (or (< newday 1) (> newday 7))
        (values :err :badarg)
        (let ((n 0))
          (dolist (c *courses*)
            (when (= (course-day c) day)
              (setf (course-day c) newday)
              (incf n)))
          (values :ok n)))))

(defop "copy" ((name name) (day day))
  (let ((c (find-course name))
        (newname (concatenate 'string name "_2")))
    (cond
      ((null c) (values :err :notfound))
      ((find-course newname) (values :err :dup))
      ((>= (length *courses*) 20) (values :err :limit))
      (t
       (let ((copy (copy-course c)))
         (setf (course-name copy) newname
               (course-day copy) day)
         (push copy *courses*)
         (values :ok 1))))))

(defop "merge" ((a name) (b name))
  (let ((ca (find-course a))
        (cb (find-course b)))
    (if (and ca cb)
        (progn
          (setf (course-teacher ca) (course-teacher cb)
                (course-loc ca) (course-loc cb))
          (setf *courses* (remove cb *courses* :test #'eq))
          (values :ok 2))
        (values :err :notfound))))

(defop "sort" ()
  (values :ok 0))

(defop "filter" ((day day))
  (values :ok (count-if (lambda (c) (= (course-day c) day)) *courses*)))

(defop "count" ()
  (values :ok (length *courses*)))

(defun run-command (cmd)
  (let* ((tokens (split-words cmd))
         (verb (first tokens))
         (args (rest tokens)))
    (if (null verb)
        (format t "err BADARG~%")
        (let ((fn (gethash verb *ops*)))
          (if fn
              (multiple-value-bind (status n) (funcall fn args)
                (if (eq status :ok)
                    (format t "ok ~A ~D~%" verb n)
                    (format t "err ~A~%" (string-upcase (symbol-name n)))))
              (format t "err BADARG~%"))))))

(defparameter *command-verbs*
  '("add" "del" "edit" "move" "swap" "rename" "duplicate" "trim"
    "clear" "shift" "copy" "merge" "sort" "filter" "count"))

(defun looks-like-command-p (s)
  (let ((tokens (split-words s)))
    (and tokens
         (member (first tokens) *command-verbs* :test #'string=))))

(defun extract-commands (argv)
  (loop for tail on argv
        when (looks-like-command-p (car tail))
          return tail))

(defun print-state ()
  (format t "#state~%")
  (dolist (c (sort (copy-list *courses*) #'byte-string< :key #'course-name))
    (format t "~A|~A|~A|~D|~D-~D~%"
            (course-name c)
            (course-teacher c)
            (course-loc c)
            (course-day c)
            (course-from c)
            (course-to c))))

(let ((commands (extract-commands sb-ext:*posix-argv*)))
  (dolist (cmd commands)
    (run-command cmd))
  (print-state))

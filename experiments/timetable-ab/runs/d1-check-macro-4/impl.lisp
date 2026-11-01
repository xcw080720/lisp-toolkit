;;;; v3 timetable ops executor -- macro arm.
;;;; 30 ops + global --dry. argv in, text out. No files, no JSON, no libraries.
;;;; One op = one (defop ...) form; arity check, field readers, registry,
;;;; dispatch entry and the body->count protocol are all grown from it.

(eval-when (:compile-toplevel :load-toplevel :execute)
  (defvar *ops* nil)
  (setf *ops* nil)
  (defparameter *kind-readers*
    '((:word . vword) (:day . vday) (:hour . vhour)
      (:delta . vdelta) (:num . vnum))))

;;; ---------------------------------------------------------------- state

(defstruct (course (:constructor mk-course (name teacher loc day from to))
                   (:conc-name c-))
  name teacher loc day from to)

(defvar *db* '())

;;; ------------------------------------------------------- error channel

;; every failure leaves through this one hole: (fail "CODE") -> (:err CODE)
(defun fail (code)
  (throw 'opfail (list :err code)))

;;; ------------------------------------------------------- field readers

(defun spacep (ch) (<= (char-code ch) 32))

(defun tokenize (line)
  (let ((acc '()) (start nil) (len (length line)))
    (dotimes (i len)
      (if (spacep (char line i))
          (when start (push (subseq line start i) acc) (setf start nil))
          (unless start (setf start i))))
    (when start (push (subseq line start) acc))
    (nreverse acc)))

(defun digits-p (s)
  (and (plusp (length s))
       (every (lambda (ch) (<= 48 (char-code ch) 57)) s)))

(defun digits->int (s)
  (let ((n 0))
    (dotimes (i (length s) n)
      (setf n (+ (* n 10) (- (char-code (char s i)) 48))))))

(defun int-of (s)
  (cond ((digits-p s) (digits->int s))
        ((and (> (length s) 1) (char= (char s 0) #\-) (digits-p (subseq s 1)))
         (- (digits->int (subseq s 1))))
        (t (fail "BADARG"))))

(defun bounded (v lo hi) (if (<= lo v hi) v (fail "BADARG")))

(defun vnum (s) (bounded (int-of s) 0 1000))
(defun vday (s) (bounded (int-of s) 1 7))
(defun vhour (s) (bounded (int-of s) 1 12))
(defun vdelta (s) (bounded (int-of s) -99 99))

(defun vword (s)
  (if (and (<= 1 (length s) 12)
           (every (lambda (ch)
                    (let ((k (char-code ch)))
                      (and (> k 32) (< k 127) (/= k 124))))
                  s))
      s
      (fail "BADARG")))

;;; --------------------------------------------------- table helpers

(defun copy-db (db) (mapcar #'copy-course db))
(defun cfind (db nm) (find nm db :key #'c-name :test #'string=))
(defun cneed (db nm) (or (cfind db nm) (fail "NOTFOUND")))
(defun cdel (db nm) (remove nm db :key #'c-name :test #'string=))
(defun cday (db d) (remove-if-not (lambda (c) (= d (c-day c))) db))
(defun cnday (db d) (count d db :key #'c-day))
(defun ovl (f1 t1 f2 t2) (and (<= f1 t2) (<= f2 t1)))
(defun sort-by-name (cs) (sort cs #'string< :key #'c-name))
(defun sort-by-from (cs) (sort cs #'< :key #'c-from))

(defun clashp (db day from to &optional skip)
  (some (lambda (c)
          (and (= day (c-day c))
               (not (and skip (string= skip (c-name c))))
               (ovl from to (c-from c) (c-to c))))
        db))

(defun day-clashp (db d)
  (let ((cs (cday db d)))
    (loop for rest on cs
          thereis (let ((a (car rest)))
                    (some (lambda (b)
                            (ovl (c-from a) (c-to a) (c-from b) (c-to b)))
                          (cdr rest))))))

(defun compress-day (db d)
  (let ((k 0) (i 0))
    (dolist (c (sort-by-from (cday db d)))
      (incf i)
      (unless (and (= (c-from c) i) (= (c-to c) (1+ i)))
        (setf (c-from c) i (c-to c) (1+ i))
        (incf k)))
    k))

;;; ------------------------------------------------------------- defop

(eval-when (:compile-toplevel :load-toplevel :execute)
  (defun op-symbol (name)
    (intern (concatenate 'string "OP." (string-upcase name))))

  (defmacro defop (name specs &body body)
    ;; one declaration grows: arity guard, field validation, registry entry,
    ;; dispatch branch, and the (n, new-db) return protocol.
    (let ((reader (lambda (kind)
                    (or (cdr (assoc kind *kind-readers*))
                        (error "defop ~s: unknown arg kind ~s" name kind)))))
      (unless (and (stringp name) (plusp (length name)))
        (error "defop: bad op name ~s" name))
      (when (assoc name *ops* :test #'string-equal)
        (error "defop: duplicate op name ~s" name))
      (push (cons name (op-symbol name)) *ops*)
      (let* ((args (gensym "ARGS"))
             (n (gensym "N"))
             (vars (mapcar #'car specs))
             (bindings (loop for (var kind) in specs
                             for i from 0
                             collect `(,var (,(funcall reader kind)
                                             (nth ,i ,args))))))
        `(defun ,(op-symbol name) (,args db)
           (unless (= (length ,args) ,(length specs)) (fail "BADARG"))
           (let* ,bindings
             ,@(when vars `((declare (ignorable ,@vars))))
             (let ((,n (progn ,@body)))
               (values ,n db)))))))

  ;; the roster is compile-time knowledge: dispatch is grown from it
  (defmacro defdispatch (fn-name)
    `(defun ,fn-name (verb args db)
       (cond
         ,@(loop for (nm . sym) in (reverse *ops*)
                 collect `((string-equal verb ,nm)
                           (multiple-value-bind (n nd) (,sym args db)
                             (values :ok ,nm n nd))))
         (t (fail "BADARG"))))))

;;; ------------------------------------------------------------- the ops

(defop "add" ((nm :word) (tc :word) (lc :word) (d :day) (fr :hour) (to :hour))
  (unless (<= fr to) (fail "BADARG"))
  (when (cfind db nm) (fail "DUP"))
  (when (>= (length db) 20) (fail "LIMIT"))
  (when (clashp db d fr to) (fail "CONFLICT"))
  (push (mk-course nm tc lc d fr to) db)
  1)

(defop "del" ((nm :word))
  (cneed db nm)
  (setf db (cdel db nm))
  1)

(defop "edit" ((nm :word) (tc :word) (lc :word))
  (let ((c (cneed db nm)))
    (setf (c-teacher c) tc (c-loc c) lc)
    1))

(defop "move" ((nm :word) (d :day) (fr :hour) (to :hour))
  (unless (<= fr to) (fail "BADARG"))
  (let ((c (cneed db nm)))
    (when (clashp db d fr to nm) (fail "CONFLICT"))
    (setf (c-day c) d (c-from c) fr (c-to c) to)
    1))

(defop "swap" ((a :word) (b :word))
  (let ((x (cneed db a)) (y (cneed db b)))
    (rotatef (c-day x) (c-day y))
    (rotatef (c-from x) (c-from y))
    (rotatef (c-to x) (c-to y))
    2))

(defop "rename" ((old :word) (new :word))
  (let ((c (cneed db old)))
    (when (cfind db new) (fail "DUP"))
    (setf (c-name c) new)
    1))

(defop "duplicate" ((nm :word) (new :word))
  (let ((c (cneed db nm)))
    (when (cfind db new) (fail "DUP"))
    (push (mk-course new (c-teacher c) (c-loc c)
                     (c-day c) (c-from c) (c-to c))
          db)
    1))

(defop "trim" ((d :day) (to :hour))
  (let ((k 0))
    (dolist (c (cday db d))
      (when (and (<= (c-from c) to) (< to (c-to c)))
        (setf (c-to c) to)
        (incf k)))
    k))

(defop "clear" ((d :day))
  (let ((k (cnday db d)))
    (setf db (remove d db :key #'c-day))
    k))

(defop "shift" ((d :day) (delta :delta))
  (let ((nd (+ d delta)))
    (unless (<= 1 nd 7) (fail "BADARG"))
    (let ((cs (cday db d)))
      (dolist (c cs) (setf (c-day c) nd))
      (length cs))))

(defop "copy" ((nm :word) (d :day))
  (let* ((c (cneed db nm))
         (nn (concatenate 'string nm "_2")))
    (when (cfind db nn) (fail "DUP"))
    (push (mk-course nn (c-teacher c) (c-loc c)
                     d (c-from c) (c-to c))
          db)
    1))

(defop "merge" ((a :word) (b :word))
  (let ((x (cneed db a)) (y (cneed db b)))
    (setf (c-teacher x) (c-teacher y) (c-loc x) (c-loc y))
    (setf db (cdel db b))
    2))

(defop "sort" ()
  0)

(defop "filter" ((d :day))
  (cnday db d))

(defop "count" ()
  (length db))

(defop "swapTeacher" ((a :word) (b :word))
  (let ((x (cneed db a)) (y (cneed db b)))
    (rotatef (c-teacher x) (c-teacher y))
    2))

(defop "swapLoc" ((a :word) (b :word))
  (let ((x (cneed db a)) (y (cneed db b)))
    (rotatef (c-loc x) (c-loc y))
    2))

(defop "copyTo" ((nm :word) (d :day) (fr :hour) (to :hour))
  (unless (<= fr to) (fail "BADARG"))
  (let* ((c (cneed db nm))
         (nn (concatenate 'string nm "_3")))
    (when (cfind db nn) (fail "DUP"))
    (when (clashp db d fr to) (fail "CONFLICT"))
    (push (mk-course nn (c-teacher c) (c-loc c) d fr to) db)
    1))

(defop "truncate" ((d :day))
  (let ((cs (sort-by-name (cday db d))))
    (dolist (c (cdr cs))
      (setf db (cdel db (c-name c))))
    (if (null cs) 0 (1- (length cs)))))

(defop "keep" ((d :day) (k :num))
  (let* ((cs (sort-by-name (cday db d)))
         (drop (nthcdr k cs)))
    (dolist (c drop)
      (setf db (cdel db (c-name c))))
    (length drop)))

(defop "renameTeacher" ((a :word) (b :word))
  (let ((k 0))
    (unless (string= a b)
      (dolist (c db)
        (when (string= a (c-teacher c))
          (setf (c-teacher c) b)
          (incf k))))
    k))

(defop "renameLoc" ((a :word) (b :word))
  (let ((k 0))
    (unless (string= a b)
      (dolist (c db)
        (when (string= a (c-loc c))
          (setf (c-loc c) b)
          (incf k))))
    k))

(defop "dedupe" ()
  (let ((k 0) (seen '()))
    (dolist (c (sort-by-name (copy-db db)))
      (let ((key (list (c-teacher c) (c-loc c) (c-day c)
                       (c-from c) (c-to c))))
        (if (member key seen :test #'equal)
            (progn (setf db (cdel db (c-name c))) (incf k))
            (push key seen))))
    k))

(defop "compress" ((d :day))
  (compress-day db d))

(defop "compact" ()
  (let ((k 0))
    (dotimes (i 7)
      (incf k (compress-day db (1+ i))))
    k))

(defop "mirror" ((d :day) (d2 :day))
  (let ((cs (cday db d)) (fresh '()))
    (dolist (c cs)
      (let ((nn (concatenate 'string (c-name c) "_m")))
        (when (cfind db nn) (fail "DUP"))
        (push (mk-course nn (c-teacher c) (c-loc c)
                         d2 (c-from c) (c-to c))
              fresh)))
    (setf db (append fresh db))
    (length cs)))

(defop "absorb" ((a :word) (b :word))
  (let ((x (cneed db a)) (y (cneed db b)))
    (setf (c-teacher x) (c-teacher y) (c-loc x) (c-loc y))
    2))

(defop "swapDays" ((d1 :day) (d2 :day))
  (let ((s1 (cday db d1)) (s2 (cday db d2)))
    (dolist (c s1) (setf (c-day c) d2))
    (dolist (c s2) (setf (c-day c) d1))
    (when (or (day-clashp db d1) (day-clashp db d2))
      (fail "CONFLICT"))
    (+ (length s1) (length s2))))

(defop "promote" ((nm :word))
  (let* ((c (cneed db nm))
         (span (- (c-to c) (c-from c)))
         (d (c-day c))
         (slot nil))
    (loop for fr from 1 to 12
          when (and (<= (+ fr span) 12) (not (clashp db d fr (+ fr span) nm)))
            do (setf slot fr) (return))
    (unless slot (fail "CONFLICT"))
    (setf (c-from c) slot (c-to c) (+ slot span))
    1))

(defop "purge" ((tc :word))
  (let ((k (count tc db :key #'c-teacher :test #'string=)))
    (setf db (remove tc db :key #'c-teacher :test #'string=))
    k))

;;; ---------------------------------------------------------- dispatcher

(defdispatch dispatch)

;;; ---------------------------------------------------------------- run

(defun run-one (verb args dry)
  (let ((r (catch 'opfail
             (multiple-value-list (dispatch verb args (copy-db *db*))))))
    (if (eq (car r) :ok)
        (progn
          (unless dry (setf *db* (cadddr r)))
          (format t "ok ~a ~a~%" (cadr r) (caddr r)))
        (format t "err ~a~%" (cadr r)))))

(defun run-line (line)
  (let ((tokens (tokenize line)))
    (cond ((null tokens) (format t "err BADARG~%"))
          ((string= "--dry" (car tokens))
           (if (null (cdr tokens))
               (format t "err BADARG~%")
               (run-one (cadr tokens) (cddr tokens) t)))
          (t (run-one (car tokens) (cdr tokens) nil)))))

(defun print-state ()
  (format t "#state~%")
  (dolist (c (sort-by-name (copy-db *db*)))
    (format t "~a|~a|~a|~a|~a-~a~%"
            (c-name c) (c-teacher c) (c-loc c)
            (c-day c) (c-from c) (c-to c))))

(defun main ()
  (dolist (line (rest sb-ext:*posix-argv*))
    (run-line line))
  (print-state))

(main)

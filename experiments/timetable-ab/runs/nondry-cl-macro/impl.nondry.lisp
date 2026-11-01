;;;; timetable ops executor -- macro arm. Single file, stdout only, pure ASCII.
;;;;
;;;; Package note: on SBCL (package-use-list (find-package :cl-user)) is
;;;;   (COMMON-LISP SB-ALIEN SB-DEBUG SB-EXT SB-GRAY SB-PROFILE)
;;;; and all six are locked, so a bare (defun room ..) aims at CL:ROOM and
;;;; (defun word ..) at SB-EXT:WORD: the load aborts on a package-lock error,
;;;; and a lambda-list variable named T aims at the CL constant T. Every
;;;; definition here lives in package TT with a tt- prefix, so no name can
;;;; resolve to an inherited or locked symbol.
;;;;
;;;; Style: defop owns definition, arity/range validation and verb registration;
;;;; defdispatch expands the dispatcher into a COND generated from that registry.

(defpackage #:tt (:use #:cl))

(in-package #:tt)

;;; ---------------------------------------------------------- macro support ---
;;; needed at macroexpansion time, hence eval-when

(eval-when (:compile-toplevel :load-toplevel :execute)

  (defparameter *tt-cap* 20)
  (defparameter *tt-db* '())
  (defparameter *tt-verbs* '())

  ;; the package argument is explicit: (intern "OP-X") alone would intern into
  ;; whatever *package* is current while the macro expands.
  (defun tt-op-symbol (verb)
    (intern (concatenate 'string "OP-" (string-upcase verb)) '#:tt))

  (defun tt-arg-parser (kind)
    (ecase kind
      (word 'tt-arg-word) (day 'tt-arg-day) (hour 'tt-arg-hour)
      (cnt 'tt-arg-cnt) (sn 'tt-arg-sn)))

  (defun tt-check-params (verb params)
    (unless (and (stringp verb) (plusp (length verb)))
      (error "defop: verb must be a non-empty string, got ~s" verb))
    (dolist (p params)
      (unless (and (consp p) (= 2 (length p)) (symbolp (first p)))
        (error "defop ~a: parameter must be (var kind), got ~s" verb p)))
    params))

;;; ---------------------------------------------------------------- record ----

(defstruct (tt-course (:conc-name tt-c-))
  name teacher loc day from to)

;; defstruct's own copier takes one argument, so clone explicitly
(defun tt-clone (c &key name day from to)
  (make-tt-course :name (or name (tt-c-name c)) :teacher (tt-c-teacher c)
                  :loc (tt-c-loc c) :day (or day (tt-c-day c))
                  :from (or from (tt-c-from c)) :to (or to (tt-c-to c))))

;;; ------------------------------------------------------------ signalling ----

(defun tt-bail (code) (throw 'tt-bail code))

;;; ------------------------------------------------------------ primitives ----

(defun tt-limit-check ()
  (when (>= (length *tt-db*) *tt-cap*) (tt-bail "LIMIT")))

(defun tt-push1 (c) (push c *tt-db*) 1)

(defun tt-find (nm)
  (find nm *tt-db* :key #'tt-c-name :test #'equal))

(defun tt-need (nm) (or (tt-find nm) (tt-bail "NOTFOUND")))

(defun tt-day-courses (day)
  (remove-if-not (lambda (c) (= day (tt-c-day c))) *tt-db*))

;; touching endpoints count as overlap, hence <= on both sides
(defun tt-overlap (skip day frm to)
  (find-if (lambda (c)
             (and (not (eq c skip)) (= day (tt-c-day c))
                  (<= frm (tt-c-to c)) (<= (tt-c-from c) to)))
           *tt-db*))

;; courses about to share one day must not overlap each other
(defun tt-self-overlap (cs)
  (let ((xs (sort (copy-list cs) #'< :key #'tt-c-from)))
    (loop for (a b) on xs while b thereis (<= (tt-c-from b) (tt-c-to a)))))

;; compress one day: the k-th course by ascending from becomes (k, k+1)
(defun tt-squeeze (day)
  (let ((k 0) (i 0)
        (cs (sort (copy-list (tt-day-courses day))
                  (lambda (x y)
                    (or (< (tt-c-from x) (tt-c-from y))
                        (and (= (tt-c-from x) (tt-c-from y))
                             (string< (tt-c-name x) (tt-c-name y))))))))
    (dolist (c cs)
      (incf i)
      (unless (and (= i (tt-c-from c)) (= (1+ i) (tt-c-to c)))
        (setf (tt-c-from c) i (tt-c-to c) (1+ i))
        (incf k)))
    k))

;;; --------------------------------------------------------------- parsing ----

(defun tt-space-p (ch)
  (member ch '(#\Space #\Tab #\Return #\Newline) :test #'char=))

(defun tt-digits-p (s)
  (and (stringp s) (plusp (length s)) (every #'digit-char-p s)))

(defun tt-unum (s)
  (let ((v 0))
    (dotimes (i (length s) v)
      (setf v (+ (* v 10) (- (char-code (char s i)) 48))))))

(defun tt-uint (s lo hi)
  (when (tt-digits-p s) (let ((v (tt-unum s))) (and (<= lo v hi) v))))

(defun tt-sint (s lo hi)
  (when (and (stringp s) (plusp (length s)))
    (let* ((neg (char= #\- (char s 0)))
           (body (if neg (subseq s 1) s)))
      (when (tt-digits-p body)
        (let ((v (if neg (- (tt-unum body)) (tt-unum body))))
          (and (<= lo v hi) v))))))

(defun tt-arg-word (s)
  (when (and (stringp s) (<= 1 (length s) 12) (not (find-if #'tt-space-p s))) s))

(defun tt-arg-day (s)  (tt-uint s 1 7))
(defun tt-arg-hour (s) (tt-uint s 1 12))
(defun tt-arg-cnt (s)  (tt-uint s 0 99))
(defun tt-arg-sn (s)   (tt-sint s -99 99))

;;; -------------------------------------------------------------- the macros --

;;; (defop "verb" ((var kind) ...) body ...)
;;;  -> (defun OP-VERB (argv)
;;;       (unless (right arity) (tt-bail "BADARG"))
;;;       (let* ((var (or (parser (nth i argv)) (tt-bail "BADARG"))) ...)
;;;         body))
;;;     + registration of the verb
(defmacro defop (verb params &body body)
  (tt-check-params verb params)
  (let ((argv (gensym "ARGV")) (fn (tt-op-symbol verb)) (binds '()))
    (loop for p in params
          for i from 0
          do (push `(,(first p)
                     (or (,(tt-arg-parser (second p)) (nth ,i ,argv))
                         (tt-bail "BADARG")))
                   binds))
    `(progn
       (defun ,fn (,argv)
         (unless (= (length ,argv) ,(length params)) (tt-bail "BADARG"))
         (let* ,(nreverse binds) ,@body))
       (eval-when (:compile-toplevel :load-toplevel :execute)
         (pushnew ,verb *tt-verbs* :test #'equal)))))

;;; The dispatcher is generated from the registered verbs, not written by hand:
;;; one COND clause per verb, unknown verb is BADARG.
(defmacro defdispatch ()
  (let ((verbs (reverse *tt-verbs*)))
    (if verbs
        `(defun tt-dispatch (verb args)
           (cond ,@(mapcar (lambda (v) `((equal verb ,v) (,(tt-op-symbol v) args)))
                           verbs)
                 (t (tt-bail "BADARG"))))
        `(defun tt-dispatch (verb args)
           (declare (ignore verb args))
           (tt-bail "BADARG")))))

;;; ----------------------------------------------------------------- the ops --

(defop "add" ((nm word) (tc word) (lc word) (dy day) (fr hour) (to hour))
  (when (> fr to) (tt-bail "BADARG"))
  (when (tt-find nm) (tt-bail "DUP"))
  (tt-limit-check)
  (when (tt-overlap nil dy fr to) (tt-bail "CONFLICT"))
  (tt-push1 (make-tt-course :name nm :teacher tc :loc lc
                            :day dy :from fr :to to)))

(defop "del" ((nm word))
  (let ((c (tt-need nm))) (setf *tt-db* (remove c *tt-db*)) 1))

(defop "edit" ((nm word) (tc word) (lc word))
  (let ((c (tt-need nm)))
    (setf (tt-c-teacher c) tc (tt-c-loc c) lc) 1))

(defop "move" ((nm word) (dy day) (fr hour) (to hour))
  (when (> fr to) (tt-bail "BADARG"))
  (let ((c (tt-need nm)))
    (when (tt-overlap c dy fr to) (tt-bail "CONFLICT"))
    (setf (tt-c-day c) dy (tt-c-from c) fr (tt-c-to c) to) 1))

;; swap exchanges day/from/to without a conflict test: each side takes the
;; other's old slot, so the result is compatible by construction
(defop "swap" ((a word) (b word))
  (let ((x (tt-need a)) (y (tt-need b)))
    (rotatef (tt-c-day x) (tt-c-day y))
    (rotatef (tt-c-from x) (tt-c-from y))
    (rotatef (tt-c-to x) (tt-c-to y))
    2))

(defop "rename" ((old word) (new word))
  (let ((c (tt-need old)))
    (when (and (not (equal old new)) (tt-find new)) (tt-bail "DUP"))
    (setf (tt-c-name c) new) 1))

(defop "duplicate" ((nm word) (nn word))
  (let ((c (tt-need nm)))
    (when (tt-find nn) (tt-bail "DUP"))
    (tt-limit-check)
    (tt-push1 (tt-clone c :name nn))))

(defop "trim" ((dy day) (to hour))
  (let ((k 0))
    (dolist (c (tt-day-courses dy) k)
      (when (and (<= (tt-c-from c) to) (< to (tt-c-to c)))
        (setf (tt-c-to c) to) (incf k)))))

(defop "clear" ((dy day))
  (let ((n (length *tt-db*)))
    (setf *tt-db* (remove-if (lambda (c) (= dy (tt-c-day c))) *tt-db*))
    (- n (length *tt-db*))))

;; the range test comes first, so an out-of-range delta changes nothing
(defop "shift" ((dy day) (dl sn))
  (let ((nd (+ dy dl)))
    (when (or (< nd 1) (> nd 7)) (tt-bail "BADARG"))
    (let ((k 0))
      (dolist (c (tt-day-courses dy) k) (setf (tt-c-day c) nd) (incf k)))))

(defop "copy" ((nm word) (dy day))
  (let* ((c (tt-need nm)) (nn (concatenate 'string nm "_2")))
    (when (tt-find nn) (tt-bail "DUP"))
    (tt-limit-check)
    (tt-push1 (tt-clone c :name nn :day dy))))

(defop "merge" ((a word) (b word))
  (let ((x (tt-need a)) (y (tt-need b)))
    (setf (tt-c-teacher x) (tt-c-teacher y) (tt-c-loc x) (tt-c-loc y))
    (unless (eq x y) (setf *tt-db* (remove y *tt-db*)))
    2))

(defop "sort" ()
  (setf *tt-db* (sort *tt-db* #'string< :key #'tt-c-name)) 0)

(defop "filter" ((dy day)) (length (tt-day-courses dy)))

(defop "count" () (length *tt-db*))

(defop "swapTeacher" ((a word) (b word))
  (let ((x (tt-need a)) (y (tt-need b)))
    (rotatef (tt-c-teacher x) (tt-c-teacher y)) 2))

(defop "swapLoc" ((a word) (b word))
  (let ((x (tt-need a)) (y (tt-need b)))
    (rotatef (tt-c-loc x) (tt-c-loc y)) 2))

(defop "copyTo" ((nm word) (dy day) (fr hour) (to hour))
  (when (> fr to) (tt-bail "BADARG"))
  (let* ((c (tt-need nm)) (nn (concatenate 'string nm "_3")))
    (when (tt-find nn) (tt-bail "DUP"))
    (tt-limit-check)
    (when (tt-overlap nil dy fr to) (tt-bail "CONFLICT"))
    (tt-push1 (tt-clone c :name nn :day dy :from fr :to to))))

(defop "truncate" ((dy day))
  (let* ((cs (sort (copy-list (tt-day-courses dy)) #'string< :key #'tt-c-name))
         (kept (if cs (list (first cs)) '()))
         (n (- (length cs) (length kept))))
    (setf *tt-db* (append kept (remove-if (lambda (c) (= dy (tt-c-day c)))
                                          *tt-db*)))
    n))

(defop "keep" ((dy day) (k cnt))
  (let* ((cs (sort (copy-list (tt-day-courses dy)) #'string< :key #'tt-c-name))
         (kept (if (< k (length cs)) (subseq cs 0 k) cs))
         (n (- (length cs) (length kept))))
    (setf *tt-db* (append kept (remove-if (lambda (c) (= dy (tt-c-day c)))
                                          *tt-db*)))
    n))

;; a table-wide rename that matches nothing is ok with n = 0, not NOTFOUND
(defop "renameTeacher" ((old word) (new word))
  (let ((k 0))
    (dolist (c *tt-db* k)
      (when (equal old (tt-c-teacher c)) (setf (tt-c-teacher c) new) (incf k)))))

(defop "renameLoc" ((old word) (new word))
  (let ((k 0))
    (dolist (c *tt-db* k)
      (when (equal old (tt-c-loc c)) (setf (tt-c-loc c) new) (incf k)))))

;; walk in name order so the lexicographically smallest name survives
(defop "dedupe" ()
  (let ((k 0) (seen '()) (out '()))
    (dolist (c (sort (copy-list *tt-db*) #'string< :key #'tt-c-name))
      (let ((key (list (tt-c-teacher c) (tt-c-loc c) (tt-c-day c)
                       (tt-c-from c) (tt-c-to c))))
        (if (member key seen :test #'equal)
            (incf k)
            (progn (push key seen) (push c out)))))
    (setf *tt-db* (nreverse out)) k))

(defop "compress" ((dy day)) (tt-squeeze dy))

(defop "compact" () (loop for d from 1 to 7 sum (tt-squeeze d)))

;; every check happens before the first push, so a DUP copies nothing
(defop "mirror" ((d1 day) (d2 day))
  (let* ((nw (mapcar (lambda (c)
                       (tt-clone c :name (concatenate 'string (tt-c-name c) "_m")
                                  :day d2))
                     (tt-day-courses d1))))
    (dolist (c nw) (when (tt-find (tt-c-name c)) (tt-bail "DUP")))
    (when (> (+ (length *tt-db*) (length nw)) *tt-cap*) (tt-bail "LIMIT"))
    (dolist (c nw) (push c *tt-db*))
    (length nw)))

(defop "absorb" ((a word) (b word))
  (let ((x (tt-need a)) (y (tt-need b)))
    (setf (tt-c-teacher x) (tt-c-teacher y) (tt-c-loc x) (tt-c-loc y)) 2))

;; each side keeps its own intervals and both leave the day, so only intra-set
;; compatibility can break; it is tested before any mutation
(defop "swapDays" ((d1 day) (d2 day))
  (let* ((a (tt-day-courses d1))
         (b (if (= d1 d2) '() (tt-day-courses d2)))
         (n (if (= d1 d2) (* 2 (length a)) (+ (length a) (length b)))))
    (when (/= d1 d2)
      (when (or (tt-self-overlap a) (tt-self-overlap b)) (tt-bail "CONFLICT"))
      (dolist (c a) (setf (tt-c-day c) d2))
      (dolist (c b) (setf (tt-c-day c) d1)))
    n))

;; first free slot of the same length, probing from 1 upwards
(defop "promote" ((nm word))
  (let* ((c (tt-need nm)) (dy (tt-c-day c))
         (span (- (tt-c-to c) (tt-c-from c)))
         (slot (loop for f from 1 to (- 12 span)
                     when (not (tt-overlap c dy f (+ f span))) return f)))
    (unless slot (tt-bail "CONFLICT"))
    (setf (tt-c-from c) slot (tt-c-to c) (+ slot span)) 1))

(defop "purge" ((tc word))
  (let ((n (length *tt-db*)))
    (setf *tt-db* (remove-if (lambda (c) (equal tc (tt-c-teacher c))) *tt-db*))
    (- n (length *tt-db*))))

;;; one COND clause per verb above, generated from the registry
(defdispatch)

;;; ----------------------------------------------------------------- driver --

(defun tt-tokens (s)
  (let ((out '()) (i 0) (n (length s)) (start 0))
    (loop
      (loop while (and (< i n) (tt-space-p (char s i))) do (incf i))
      (when (>= i n) (return (nreverse out)))
      (setf start i)
      (loop while (and (< i n) (not (tt-space-p (char s i)))) do (incf i))
      (push (subseq s start i) out))))

(defun tt-switch-p (x)
  (and (plusp (length x)) (char= #\- (char x 0))))

(defun tt-script-p (x)
  (let ((n (length x))) (and (>= n 5) (string-equal ".lisp" x :start2 (- n 5)))))

;; a command is one argv item, never a switch and never a .lisp path; SBCL's
;; --script already drops its own arguments, this is the defensive rest
(defun tt-commands ()
  (let ((out '()))
    (dolist (x (rest sb-ext:*posix-argv*))
      (unless (or (tt-switch-p x) (tt-script-p x)) (push x out)))
    (nreverse out)))

(defun tt-run (line)
  (let ((parts (tt-tokens line)))
    (if (null parts)
        (format t "err BADARG~%")
        (let* ((verb (first parts))
               (res (catch 'tt-bail (tt-dispatch verb (rest parts)))))
          (if (integerp res)
              (format t "ok ~a ~d~%" verb res)
              (format t "err ~a~%" res))))))

(defun tt-dump ()
  (format t "#state~%")
  (dolist (c (sort (copy-list *tt-db*) #'string< :key #'tt-c-name))
    (format t "~a|~a|~a|~d|~d-~d~%"
            (tt-c-name c) (tt-c-teacher c) (tt-c-loc c)
            (tt-c-day c) (tt-c-from c) (tt-c-to c))))

(defun tt-main ()
  (dolist (line (tt-commands)) (tt-run line))
  (tt-dump))

(tt-main)

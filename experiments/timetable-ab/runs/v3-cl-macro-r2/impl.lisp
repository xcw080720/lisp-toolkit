; v3 timetable ops executor -- macro style, pure ASCII, argv in / stdout out
(defstruct (c (:conc-name nil))
  nm te lc dy fr tt)

(defvar *cs* nil)
(defvar *ops* (make-hash-table :test 'equal))
(defvar *cap* 20)

(defun rep (k) (format t "err ~a~%" k) nil)
(defun okl (v n) (format t "ok ~a ~d~%" v n) nil)
(defun full () (>= (length *cs*) *cap*))

(defun dg (ch) (and (char>= ch #\0) (char<= ch #\9)))

(defun pint (s)
  (let ((n (length s)) (v 0) (i 0) (neg nil) (k 0))
    (when (and (> n 0) (char= (char s 0) #\-)) (setf neg t i 1))
    (loop while (< i n) do
      (unless (dg (char s i)) (return-from pint nil))
      (setf v (+ (* v 10) (- (char-code (char s i)) 48)))
      (incf k) (incf i))
    (when (plusp k) (if neg (- v) v))))

(defun vnum (s lo hi) (let ((v (pint s))) (and v (<= lo v hi) v)))
(defun vdel (s) (let ((v (pint s))) (and v (<= -7 v 7) v)))

(defun vword (s)
  (and s (<= 1 (length s) 12)
       (every (lambda (ch) (not (member ch '(#\Space #\Tab)))) s)
       s))

(defun byname (n) (find n *cs* :key #'nm :test #'string=))

(defun fits (d f t2 skip)
  (notany (lambda (k) (and (not (member k skip)) (= d (dy k))
                           (<= f (tt k)) (<= (fr k) t2)))
          *cs*))

(defun vform (k i)
  (ecase k
    (:word `(vword (nth ,i av)))
    (:day `(vnum (nth ,i av) 1 7))
    (:time `(vnum (nth ,i av) 1 12))
    (:delta `(vdel (nth ,i av)))))

(defmacro defop (name params &body body)
  (let ((ns (mapcar #'car params))
        (bs (loop for p in params for i from 0
                  collect `(,(car p) ,(vform (cadr p) i)))))
    `(setf (gethash ,name *ops*)
           (lambda (av)
             (if (/= (length av) ,(length params))
                 (rep "BADARG")
                 (let* ,bs
                   (if (and ,@ns)
                       (let ((r (progn ,@body)))
                         (if (integerp r) (okl ,name r) (rep r)))
                       (rep "BADARG"))))))))

(defop "add" ((nm :word) (te :word) (lc :word) (dy :day) (fr :time) (tt :time))
  (cond ((> fr tt) "BADARG")
        ((byname nm) "DUP")
        ((full) "LIMIT")
        ((not (fits dy fr tt nil)) "CONFLICT")
        (t (push (make-c :nm nm :te te :lc lc :dy dy :fr fr :tt tt) *cs*) 1)))

(defop "del" ((nm :word))
  (let ((k (byname nm)))
    (if (null k) "NOTFOUND"
        (progn (setf *cs* (remove k *cs*)) 1))))

(defop "edit" ((nm :word) (te :word) (lc :word))
  (let ((k (byname nm)))
    (if (null k) "NOTFOUND"
        (progn (setf (te k) te (lc k) lc) 1))))

(defop "move" ((nm :word) (dy :day) (fr :time) (tt :time))
  (let ((k (byname nm)))
    (cond ((> fr tt) "BADARG")
          ((null k) "NOTFOUND")
          ((not (fits dy fr tt (list k))) "CONFLICT")
          (t (setf (dy k) dy (fr k) fr (tt k) tt) 1))))

(defop "swap" ((a :word) (b :word))
  (let ((x (byname a)) (y (byname b)))
    (cond ((or (null x) (null y)) "NOTFOUND")
          ((eq x y) "BADARG")
          (t (let ((d (dy x)) (f (fr x)) (e (tt x)))
               (setf (dy x) (dy y) (fr x) (fr y) (tt x) (tt y)
                     (dy y) d (fr y) f (tt y) e)
               2)))))

(defop "rename" ((a :word) (b :word))
  (let ((k (byname a)))
    (cond ((null k) "NOTFOUND")
          ((and (not (string= a b)) (byname b)) "DUP")
          (t (setf (nm k) b) 1))))

(defop "duplicate" ((a :word) (b :word))
  (let ((k (byname a)))
    (cond ((null k) "NOTFOUND")
          ((byname b) "DUP")
          ((full) "LIMIT")
          (t (let ((w (copy-c k))) (setf (nm w) b) (push w *cs*) 1)))))

(defop "trim" ((dy :day) (to :time))
  (let ((n 0))
    (dolist (k *cs* n)
      (when (and (= dy (dy k)) (<= (fr k) to) (< to (tt k)))
        (setf (tt k) to) (incf n)))))

(defop "clear" ((dy :day))
  (let ((n (count dy *cs* :key #'dy)))
    (setf *cs* (remove dy *cs* :key #'dy)) n))

(defop "shift" ((dy :day) (dl :delta))
  (let ((nd (+ dy dl)))
    (if (or (< nd 1) (> nd 7)) "BADARG"
        (let ((n 0))
          (dolist (k *cs* n)
            (when (= dy (dy k)) (setf (dy k) nd) (incf n)))))))

(defop "copy" ((a :word) (dy :day))
  (let* ((k (byname a)) (nn (and k (concatenate 'string a "_2"))))
    (cond ((null k) "NOTFOUND")
          ((full) "LIMIT")
          ((byname nn) "DUP")
          ((not (fits dy (fr k) (tt k) nil)) "CONFLICT")
          (t (let ((w (copy-c k))) (setf (nm w) nn (dy w) dy) (push w *cs*) 1)))))

(defop "merge" ((a :word) (b :word))
  (let ((x (byname a)) (y (byname b)))
    (cond ((or (null x) (null y)) "NOTFOUND")
          ((eq x y) "BADARG")
          (t (setf (te x) (te y) (lc x) (lc y))
             (setf *cs* (remove y *cs*)) 2))))

(defop "sort" () 0)
(defop "filter" ((dy :day)) (count dy *cs* :key #'dy))
(defop "count" () (length *cs*))

(defun tks (s)
  (let ((n (length s)) (out nil) (st 0))
    (dotimes (i n)
      (when (member (char s i) '(#\Space #\Tab))
        (when (> i st) (push (subseq s st i) out))
        (setf st (1+ i))))
    (when (> n st) (push (subseq s st n) out))
    (nreverse out)))

(defun run (ln)
  (let* ((tk (tks ln))
         (op (and tk (string-downcase (first tk))))
         (fn (and op (gethash op *ops*))))
    (if fn (funcall fn (rest tk)) (rep "BADARG"))))

(defun args ()
  (let ((r nil))
    (dolist (a (rest sb-ext:*posix-argv*) (nreverse r))
      (when (and (or (zerop (length a))
                     (not (char= #\- (char a 0))))
                 (not (search ".lisp" a)))
        (push a r)))))

(defun main ()
  (dolist (ln (args)) (run ln))
  (format t "#state~%")
  (dolist (k (sort (copy-list *cs*) #'string< :key #'nm))
    (format t "~a|~a|~a|~d|~d-~d~%" (nm k) (te k) (lc k) (dy k) (fr k) (tt k)))
  nil)

(main)

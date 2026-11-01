;;;; v3 timetable ops executor -- inline style, 30 ops + global --dry
;;;; Common Lisp / SBCL, single file, ASCII only. argv in, stdout out.
;;;; A course record is a 6-element list:
;;;;   (name teacher loc day from to)

(defvar *courses* nil)

(defun split-spaces (s)
  (let ((out '()) (start 0) (n (length s)))
    (loop for i from 0 to n
          do (when (or (= i n) (char= (char s i) #\Space))
               (when (> i start) (push (subseq s start i) out))
               (setf start (1+ i))))
    (nreverse out)))

(defun num (s)
  (let ((i 0) (v 0) (neg nil) (ok (and (stringp s) (> (length s) 0))))
    (when (and ok (char= (char s 0) #\-)) (setf neg t i 1))
    (when (and ok (= i (length s))) (setf ok nil))
    (loop while (and ok (< i (length s)))
          do (let ((d (position (char s i) "0123456789")))
               (if d (progn (setf v (+ (* v 10) d)) (incf i)) (setf ok nil))))
    (when ok (if neg (- v) v))))

(defun word-p (s)
  (and (stringp s) (>= (length s) 1) (<= (length s) 12)))

(defun get-course (nm)
  (find-if (lambda (c) (string= (first c) nm)) *courses*))

(defun clash (day from to skip)
  (let ((hit nil))
    (dolist (c *courses*)
      (when (and (not (eq c skip))
                 (= (fourth c) day)
                 (<= from (sixth c))
                 (<= (fifth c) to))
        (setf hit t)))
    hit))

(defun exec (toks)
  (if (null toks)
      "err BADARG"
      (let ((verb (first toks)) (args (rest toks)))
        (cond

          ((string= verb "add")
           (if (/= (length args) 6) "err BADARG"
               (let* ((nm (nth 0 args)) (tc (nth 1 args)) (lc (nth 2 args))
                      (d (num (nth 3 args))) (f (num (nth 4 args))) (e (num (nth 5 args))))
                 (if (or (not (word-p nm)) (not (word-p tc)) (not (word-p lc))
                         (null d) (null f) (null e)
                         (< d 1) (> d 7) (< f 1) (> f 12) (< e 1) (> e 12) (> f e))
                     "err BADARG"
                     (cond ((get-course nm) "err DUP")
                           ((>= (length *courses*) 20) "err LIMIT")
                           ((clash d f e nil) "err CONFLICT")
                           (t (push (list nm tc lc d f e) *courses*)
                              "ok add 1"))))))

          ((string= verb "del")
           (if (/= (length args) 1) "err BADARG"
               (let ((c (get-course (first args))))
                 (if (null c) "err NOTFOUND"
                     (progn (setf *courses* (remove c *courses* :test #'eq))
                            "ok del 1")))))

          ((string= verb "edit")
           (if (/= (length args) 3) "err BADARG"
               (let ((nm (first args)) (tc (second args)) (lc (third args)))
                 (if (or (not (word-p tc)) (not (word-p lc))) "err BADARG"
                     (let ((c (get-course nm)))
                       (if (null c) "err NOTFOUND"
                           (progn (setf (second c) tc)
                                  (setf (third c) lc)
                                  "ok edit 1")))))))

          ((string= verb "move")
           (if (/= (length args) 4) "err BADARG"
               (let ((nm (first args)) (d (num (second args)))
                     (f (num (third args))) (e (num (fourth args))))
                 (if (or (null d) (null f) (null e)
                         (< d 1) (> d 7) (< f 1) (> f 12) (< e 1) (> e 12) (> f e))
                     "err BADARG"
                     (let ((c (get-course nm)))
                       (if (null c) "err NOTFOUND"
                           (if (clash d f e c) "err CONFLICT"
                               (progn (setf (fourth c) d)
                                      (setf (fifth c) f)
                                      (setf (sixth c) e)
                                      "ok move 1"))))))))

          ((string= verb "swap")
           (if (/= (length args) 2) "err BADARG"
               (let ((a (get-course (first args))) (b (get-course (second args))))
                 (if (or (null a) (null b)) "err NOTFOUND"
                     (let ((ad (fourth a)) (af (fifth a)) (ae (sixth a)))
                       (setf (fourth a) (fourth b))
                       (setf (fifth a) (fifth b))
                       (setf (sixth a) (sixth b))
                       (setf (fourth b) ad)
                       (setf (fifth b) af)
                       (setf (sixth b) ae)
                       "ok swap 2")))))

          ((string= verb "rename")
           (if (/= (length args) 2) "err BADARG"
               (let ((old (first args)) (new (second args)))
                 (if (not (word-p new)) "err BADARG"
                     (let ((c (get-course old)))
                       (cond ((null c) "err NOTFOUND")
                             ((get-course new) "err DUP")
                             (t (setf (first c) new) "ok rename 1")))))))

          ((string= verb "duplicate")
           (if (/= (length args) 2) "err BADARG"
               (let ((nm (first args)) (new (second args)))
                 (if (not (word-p new)) "err BADARG"
                     (let ((c (get-course nm)))
                       (cond ((null c) "err NOTFOUND")
                             ((get-course new) "err DUP")
                             ((>= (length *courses*) 20) "err LIMIT")
                             (t (push (list new (second c) (third c)
                                            (fourth c) (fifth c) (sixth c))
                                      *courses*)
                                "ok duplicate 1")))))))

          ((string= verb "trim")
           (if (/= (length args) 2) "err BADARG"
               (let ((d (num (first args))) (e (num (second args))))
                 (if (or (null d) (null e) (< d 1) (> d 7) (< e 1) (> e 12))
                     "err BADARG"
                     (let ((n 0))
                       (dolist (c *courses*)
                         (when (and (= (fourth c) d) (<= (fifth c) e) (< e (sixth c)))
                           (setf (sixth c) e)
                           (incf n)))
                       (format nil "ok trim ~d" n))))))

          ((string= verb "clear")
           (if (/= (length args) 1) "err BADARG"
               (let ((d (num (first args))))
                 (if (or (null d) (< d 1) (> d 7)) "err BADARG"
                     (let ((n (count-if (lambda (c) (= (fourth c) d)) *courses*)))
                       (setf *courses* (remove-if (lambda (c) (= (fourth c) d)) *courses*))
                       (format nil "ok clear ~d" n))))))

          ((string= verb "shift")
           (if (/= (length args) 2) "err BADARG"
               (let ((d (num (first args))) (dl (num (second args))))
                 (if (or (null d) (null dl) (< d 1) (> d 7)) "err BADARG"
                     (let ((nd (+ d dl)))
                       (if (or (< nd 1) (> nd 7)) "err BADARG"
                           (let ((n 0))
                             (dolist (c *courses*)
                               (when (= (fourth c) d)
                                 (setf (fourth c) nd)
                                 (incf n)))
                             (format nil "ok shift ~d" n))))))))

          ((string= verb "copy")
           (if (/= (length args) 2) "err BADARG"
               (let ((nm (first args)) (d (num (second args))))
                 (if (or (null d) (< d 1) (> d 7)) "err BADARG"
                     (let ((c (get-course nm)))
                       (if (null c) "err NOTFOUND"
                           (let ((nn (concatenate 'string nm "_2")))
                             (cond ((get-course nn) "err DUP")
                                   ((>= (length *courses*) 20) "err LIMIT")
                                   ((clash d (fifth c) (sixth c) nil) "err CONFLICT")
                                   (t (push (list nn (second c) (third c) d
                                                  (fifth c) (sixth c))
                                            *courses*)
                                      "ok copy 1")))))))))

          ((string= verb "merge")
           (if (/= (length args) 2) "err BADARG"
               (let ((a (get-course (first args))) (b (get-course (second args))))
                 (if (or (null a) (null b)) "err NOTFOUND"
                     (progn (setf (second a) (second b))
                            (setf (third a) (third b))
                            (setf *courses* (remove b *courses* :test #'eq))
                            "ok merge 2")))))

          ((string= verb "sort")
           (if (/= (length args) 0) "err BADARG" "ok sort 0"))

          ((string= verb "filter")
           (if (/= (length args) 1) "err BADARG"
               (let ((d (num (first args))))
                 (if (or (null d) (< d 1) (> d 7)) "err BADARG"
                     (format nil "ok filter ~d"
                             (count-if (lambda (c) (= (fourth c) d)) *courses*))))))

          ((string= verb "count")
           (if (/= (length args) 0) "err BADARG"
               (format nil "ok count ~d" (length *courses*))))

          ((string= verb "swapTeacher")
           (if (/= (length args) 2) "err BADARG"
               (let ((a (get-course (first args))) (b (get-course (second args))))
                 (if (or (null a) (null b)) "err NOTFOUND"
                     (let ((x (second a)))
                       (setf (second a) (second b))
                       (setf (second b) x)
                       "ok swapTeacher 2")))))

          ((string= verb "swapLoc")
           (if (/= (length args) 2) "err BADARG"
               (let ((a (get-course (first args))) (b (get-course (second args))))
                 (if (or (null a) (null b)) "err NOTFOUND"
                     (let ((x (third a)))
                       (setf (third a) (third b))
                       (setf (third b) x)
                       "ok swapLoc 2")))))

          ((string= verb "copyTo")
           (if (/= (length args) 4) "err BADARG"
               (let ((nm (first args)) (d (num (second args)))
                     (f (num (third args))) (e (num (fourth args))))
                 (if (or (null d) (null f) (null e)
                         (< d 1) (> d 7) (< f 1) (> f 12) (< e 1) (> e 12) (> f e))
                     "err BADARG"
                     (let ((c (get-course nm)))
                       (if (null c) "err NOTFOUND"
                           (let ((nn (concatenate 'string nm "_3")))
                             (cond ((get-course nn) "err DUP")
                                   ((>= (length *courses*) 20) "err LIMIT")
                                   ((clash d f e nil) "err CONFLICT")
                                   (t (push (list nn (second c) (third c) d f e)
                                            *courses*)
                                      "ok copyTo 1")))))))))

          ((string= verb "truncate")
           (if (/= (length args) 1) "err BADARG"
               (let ((d (num (first args))))
                 (if (or (null d) (< d 1) (> d 7)) "err BADARG"
                     (let ((ds (sort (remove-if-not (lambda (c) (= (fourth c) d))
                                                    (copy-list *courses*))
                                     #'string< :key #'first)))
                       (if (or (null ds) (null (rest ds))) "ok truncate 0"
                           (let ((n 0))
                             (dolist (c (rest ds))
                               (setf *courses* (remove c *courses* :test #'eq))
                               (incf n))
                             (format nil "ok truncate ~d" n))))))))

          ((string= verb "keep")
           (if (/= (length args) 2) "err BADARG"
               (let ((d (num (first args))) (k (num (second args))))
                 (if (or (null d) (null k) (< d 1) (> d 7) (< k 0)) "err BADARG"
                     (let* ((ds (sort (remove-if-not (lambda (c) (= (fourth c) d))
                                                     (copy-list *courses*))
                                      #'string< :key #'first))
                            (n 0))
                       (dolist (c (nthcdr k ds))
                         (setf *courses* (remove c *courses* :test #'eq))
                         (incf n))
                       (format nil "ok keep ~d" n))))))

          ((string= verb "renameTeacher")
           (if (/= (length args) 2) "err BADARG"
               (let ((t1 (first args)) (t2 (second args)))
                 (if (or (not (word-p t1)) (not (word-p t2))) "err BADARG"
                     (let ((n 0))
                       (dolist (c *courses*)
                         (when (string= (second c) t1)
                           (setf (second c) t2)
                           (incf n)))
                       (format nil "ok renameTeacher ~d" n))))))

          ((string= verb "renameLoc")
           (if (/= (length args) 2) "err BADARG"
               (let ((l1 (first args)) (l2 (second args)))
                 (if (or (not (word-p l1)) (not (word-p l2))) "err BADARG"
                     (let ((n 0))
                       (dolist (c *courses*)
                         (when (string= (third c) l1)
                           (setf (third c) l2)
                           (incf n)))
                       (format nil "ok renameLoc ~d" n))))))

          ((string= verb "dedupe")
           (if (/= (length args) 0) "err BADARG"
               (let* ((ds (sort (copy-list *courses*) #'string< :key #'first))
                      (seen '()) (n 0))
                 (dolist (c ds)
                   (let ((sig (list (second c) (third c) (fourth c)
                                    (fifth c) (sixth c))))
                     (if (member sig seen :test #'equal)
                         (progn (setf *courses* (remove c *courses* :test #'eq))
                                (incf n))
                         (push sig seen))))
                 (format nil "ok dedupe ~d" n))))

          ((string= verb "compress")
           (if (/= (length args) 1) "err BADARG"
               (let ((d (num (first args))))
                 (if (or (null d) (< d 1) (> d 7)) "err BADARG"
                     (let* ((ds (sort (remove-if-not (lambda (c) (= (fourth c) d))
                                                     (copy-list *courses*))
                                      #'< :key #'fifth))
                            (n 0) (k 0))
                       (dolist (c ds)
                         (incf k)
                         (unless (and (= (fifth c) k) (= (sixth c) (1+ k)))
                           (incf n))
                         (setf (fifth c) k)
                         (setf (sixth c) (1+ k)))
                       (format nil "ok compress ~d" n))))))

          ((string= verb "compact")
           (if (/= (length args) 0) "err BADARG"
               (let ((n 0))
                 (dolist (d '(1 2 3 4 5 6 7))
                   (let* ((ds (sort (remove-if-not (lambda (c) (= (fourth c) d))
                                                   (copy-list *courses*))
                                    #'< :key #'fifth))
                          (k 0))
                     (dolist (c ds)
                       (incf k)
                       (unless (and (= (fifth c) k) (= (sixth c) (1+ k)))
                         (incf n))
                       (setf (fifth c) k)
                       (setf (sixth c) (1+ k)))))
                 (format nil "ok compact ~d" n))))

          ((string= verb "mirror")
           (if (/= (length args) 2) "err BADARG"
               (let ((d (num (first args))) (d2 (num (second args))))
                 (if (or (null d) (null d2) (< d 1) (> d 7) (< d2 1) (> d2 7))
                     "err BADARG"
                     (let ((src (remove-if-not (lambda (c) (= (fourth c) d))
                                               (copy-list *courses*)))
                           (bad nil))
                       (dolist (c src)
                         (when (get-course (concatenate 'string (first c) "_m"))
                           (setf bad t)))
                       (if bad "err DUP"
                           (progn
                             (dolist (c src)
                               (push (list (concatenate 'string (first c) "_m")
                                           (second c) (third c) d2
                                           (fifth c) (sixth c))
                                     *courses*))
                             (format nil "ok mirror ~d" (length src)))))))))

          ((string= verb "absorb")
           (if (/= (length args) 2) "err BADARG"
               (let ((a (get-course (first args))) (b (get-course (second args))))
                 (if (or (null a) (null b)) "err NOTFOUND"
                     (progn (setf (second a) (second b))
                            (setf (third a) (third b))
                            "ok absorb 2")))))

          ((string= verb "swapDays")
           (if (/= (length args) 2) "err BADARG"
               (let ((d1 (num (first args))) (d2 (num (second args))))
                 (if (or (null d1) (null d2) (< d1 1) (> d1 7) (< d2 1) (> d2 7))
                     "err BADARG"
                     (let ((g1 (remove-if-not (lambda (c) (= (fourth c) d1))
                                              (copy-list *courses*)))
                           (g2 (remove-if-not (lambda (c) (= (fourth c) d2))
                                              (copy-list *courses*)))
                           (bad nil))
                       (dolist (x g1)
                         (dolist (y g1)
                           (when (and (not (eq x y))
                                      (<= (fifth x) (sixth y))
                                      (<= (fifth y) (sixth x)))
                             (setf bad t))))
                       (dolist (x g2)
                         (dolist (y g2)
                           (when (and (not (eq x y))
                                      (<= (fifth x) (sixth y))
                                      (<= (fifth y) (sixth x)))
                             (setf bad t))))
                       (if bad "err CONFLICT"
                           (progn
                             (dolist (c g1) (setf (fourth c) d2))
                             (dolist (c g2) (setf (fourth c) d1))
                             (format nil "ok swapDays ~d" (+ (length g1) (length g2))))))))))

          ((string= verb "promote")
           (if (/= (length args) 1) "err BADARG"
               (let ((c (get-course (first args))))
                 (if (null c) "err NOTFOUND"
                     (let* ((len (1+ (- (sixth c) (fifth c))))
                            (d (fourth c))
                            (pick nil))
                       (loop for f from 1 to (- 13 len)
                             do (when (and (null pick)
                                           (not (clash d f (+ f (1- len)) c)))
                                  (setf pick f)))
                       (if pick
                           (progn (setf (fifth c) pick)
                                  (setf (sixth c) (+ pick (1- len)))
                                  "ok promote 1")
                           "err CONFLICT"))))))

          ((string= verb "purge")
           (if (/= (length args) 1) "err BADARG"
               (let* ((tc (first args))
                      (before (length *courses*)))
                 (setf *courses* (remove-if (lambda (c) (string= (second c) tc))
                                            *courses*))
                 (format nil "ok purge ~d" (- before (length *courses*))))))

          (t "err BADARG")))))

(defun run-dry (cmd)
  (let* ((saved *courses*)
         (shadow (mapcar #'copy-list *courses*)))
    (setf *courses* shadow)
    (let ((line (exec (split-spaces cmd))))
      (setf *courses* saved)
      line)))

(let ((items (cdr sb-ext:*posix-argv*)) (out '()))
  (loop while items
        do (let ((it (first items)))
             (cond
               ((string= it "--dry")
                (if (rest items)
                    (progn (push (run-dry (second items)) out)
                           (setf items (cddr items)))
                    (progn (push "err BADARG" out)
                           (setf items nil))))
               ((and (>= (length it) 6) (string= "--dry " (subseq it 0 6)))
                (push (run-dry (subseq it 6)) out)
                (setf items (rest items)))
               (t (push (exec (split-spaces it)) out)
                  (setf items (rest items))))))
  (dolist (line (nreverse out))
    (format t "~a~%" line))
  (format t "#state~%")
  (dolist (c (sort (copy-list *courses*) #'string< :key #'first))
    (format t "~a|~a|~a|~d|~d-~d~%"
            (first c) (second c) (third c) (fourth c) (fifth c) (sixth c))))

; timetable v3 executor - 30 ops - inline style - SBCL
; every op is a hand written branch of one cond; no macros, no dispatch table
; global rule: a leading --dry on any command previews it without touching state
(let* ((raw (cdr sb-ext:*posix-argv*))
       (cmds (remove-if
              (lambda (s)
                (or (and (plusp (length s))
                         (char= (char s 0) #\-)
                         (not (equal s "--dry"))
                         (not (and (> (length s) 5)
                                   (equal (subseq s 0 5) "--dry")
                                   (or (char= (char s 5) #\Space)
                                       (char= (char s 5) #\Tab)))))
                    (and (> (length s) 5)
                         (equal (subseq s (- (length s) 5)) ".lisp"))))
              raw))
       (courses '()))
  (labels
      ((wordp (s)
         (and (stringp s) (<= 1 (length s) 12)
              (every (lambda (ch)
                       (not (or (char= ch #\Space) (char= ch #\Tab))))
                     s)))
       (nump (s)
         (and (stringp s) (plusp (length s))
              (if (char= (char s 0) #\-)
                  (and (> (length s) 1) (every #'digit-char-p (subseq s 1)))
                  (every #'digit-char-p s))
              (parse-integer s)))
       (dayp (s) (let ((n (nump s))) (and n (<= 1 n 7) n)))
       (hrp (s) (let ((n (nump s))) (and n (<= 1 n 12) n)))
       (clash (d f t2 skip)
         (some (lambda (c)
                 (and (equal (nth 3 c) d)
                      (not (and skip (equal (first c) skip)))
                      (not (or (< (nth 5 c) f) (< t2 (nth 4 c))))))
               courses))
       (emit (verb n) (format t "ok ~a ~d~%" verb n))
       (bad () (format t "err BADARG~%"))
       (dup () (format t "err DUP~%"))
       (nf () (format t "err NOTFOUND~%"))
       (conf () (format t "err CONFLICT~%"))
       (lim () (format t "err LIMIT~%")))
     (dolist (cmd cmds)
       (let ((tk '()) (cur '()))
         (loop for ch across cmd
               do (if (find ch '(#\Space #\Tab #\Return #\Linefeed))
                      (when cur
                        (push (coerce (nreverse cur) 'string) tk)
                        (setf cur '()))
                      (push ch cur)))
         (when cur (push (coerce (nreverse cur) 'string) tk))
         (setf tk (nreverse tk))
         (let ((op (first tk)) (k (length tk)) (dry nil))
           (when (equal op "--dry")
             (setf dry t)
             (setf tk (rest tk))
             (setf op (first tk))
             (setf k (length tk)))
           (cond

            ; 1 add name teacher loc day from to
            ((equal op "add")
             (cond
              ((/= k 7) (bad))
              ((not (wordp (nth 1 tk))) (bad))
              ((not (wordp (nth 2 tk))) (bad))
              ((not (wordp (nth 3 tk))) (bad))
              ((not (dayp (nth 4 tk))) (bad))
              ((not (hrp (nth 5 tk))) (bad))
              ((not (hrp (nth 6 tk))) (bad))
              ((< (nump (nth 6 tk)) (nump (nth 5 tk))) (bad))
              ((find (nth 1 tk) courses :key #'first :test #'equal) (dup))
              ((>= (length courses) 20) (lim))
              ((clash (dayp (nth 4 tk)) (nump (nth 5 tk)) (nump (nth 6 tk)) nil) (conf))
              (t (unless dry
                   (push (list (nth 1 tk) (nth 2 tk) (nth 3 tk)
                               (dayp (nth 4 tk)) (nump (nth 5 tk)) (nump (nth 6 tk)))
                         courses))
                 (emit "add" 1))))

            ; 2 del name
            ((equal op "del")
             (cond
              ((/= k 2) (bad))
              ((not (find (nth 1 tk) courses :key #'first :test #'equal)) (nf))
              (t (unless dry
                   (setf courses (remove (nth 1 tk) courses :key #'first :test #'equal)))
                 (emit "del" 1))))

            ; 3 edit name teacher loc
            ((equal op "edit")
             (cond
              ((/= k 4) (bad))
              ((not (wordp (nth 2 tk))) (bad))
              ((not (wordp (nth 3 tk))) (bad))
              ((not (find (nth 1 tk) courses :key #'first :test #'equal)) (nf))
              (t (let ((c (find (nth 1 tk) courses :key #'first :test #'equal)))
                   (unless dry
                     (setf (nth 1 c) (nth 2 tk)
                           (nth 2 c) (nth 3 tk))))
                 (emit "edit" 1))))

            ; 4 move name day from to
            ((equal op "move")
             (cond
              ((/= k 5) (bad))
              ((not (dayp (nth 2 tk))) (bad))
              ((not (hrp (nth 3 tk))) (bad))
              ((not (hrp (nth 4 tk))) (bad))
              ((< (nump (nth 4 tk)) (nump (nth 3 tk))) (bad))
              ((not (find (nth 1 tk) courses :key #'first :test #'equal)) (nf))
              ((clash (dayp (nth 2 tk)) (nump (nth 3 tk)) (nump (nth 4 tk)) (nth 1 tk)) (conf))
              (t (let ((c (find (nth 1 tk) courses :key #'first :test #'equal)))
                   (unless dry
                     (setf (nth 3 c) (dayp (nth 2 tk))
                           (nth 4 c) (nump (nth 3 tk))
                           (nth 5 c) (nump (nth 4 tk)))))
                 (emit "move" 1))))

            ; 5 swap a b  (no conflict check by spec)
            ((equal op "swap")
             (cond
              ((/= k 3) (bad))
              ((not (find (nth 1 tk) courses :key #'first :test #'equal)) (nf))
              ((not (find (nth 2 tk) courses :key #'first :test #'equal)) (nf))
              (t (let ((a (find (nth 1 tk) courses :key #'first :test #'equal))
                       (b (find (nth 2 tk) courses :key #'first :test #'equal)))
                   (unless dry
                     (rotatef (nth 3 a) (nth 3 b))
                     (rotatef (nth 4 a) (nth 4 b))
                     (rotatef (nth 5 a) (nth 5 b))))
                 (emit "swap" 2))))

            ; 6 rename old new
            ((equal op "rename")
             (cond
              ((/= k 3) (bad))
              ((not (wordp (nth 2 tk))) (bad))
              ((not (find (nth 1 tk) courses :key #'first :test #'equal)) (nf))
              ((find (nth 2 tk) courses :key #'first :test #'equal) (dup))
              (t (unless dry
                   (setf (first (find (nth 1 tk) courses :key #'first :test #'equal))
                         (nth 2 tk)))
                 (emit "rename" 1))))

            ; 7 duplicate name newname
            ((equal op "duplicate")
             (cond
              ((/= k 3) (bad))
              ((not (wordp (nth 2 tk))) (bad))
              ((not (find (nth 1 tk) courses :key #'first :test #'equal)) (nf))
              ((find (nth 2 tk) courses :key #'first :test #'equal) (dup))
              ((>= (length courses) 20) (lim))
              (t (let ((c (find (nth 1 tk) courses :key #'first :test #'equal)))
                   (unless dry
                     (push (list (nth 2 tk) (nth 1 c) (nth 2 c)
                                 (nth 3 c) (nth 4 c) (nth 5 c))
                           courses)))
                 (emit "duplicate" 1))))

            ; 8 trim day to
            ((equal op "trim")
             (cond
              ((/= k 3) (bad))
              ((not (dayp (nth 1 tk))) (bad))
              ((not (hrp (nth 2 tk))) (bad))
              (t (let ((d (dayp (nth 1 tk)))
                       (tv (nump (nth 2 tk)))
                       (n 0))
                   (dolist (c courses)
                     (when (and (equal (nth 3 c) d)
                                (<= (nth 4 c) tv)
                                (< tv (nth 5 c)))
                       (unless dry (setf (nth 5 c) tv))
                       (incf n)))
                   (emit "trim" n)))))

            ; 9 clear day
            ((equal op "clear")
             (cond
              ((/= k 2) (bad))
              ((not (dayp (nth 1 tk))) (bad))
              (t (let* ((d (dayp (nth 1 tk)))
                        (keep (remove-if (lambda (c) (equal (nth 3 c) d)) courses))
                        (n (- (length courses) (length keep))))
                   (unless dry (setf courses keep))
                   (emit "clear" n)))))

            ; 10 shift day delta
            ((equal op "shift")
             (cond
              ((/= k 3) (bad))
              ((not (dayp (nth 1 tk))) (bad))
              ((not (nump (nth 2 tk))) (bad))
              ((not (<= 1 (+ (dayp (nth 1 tk)) (nump (nth 2 tk))) 7)) (bad))
              (t (let ((d (dayp (nth 1 tk)))
                       (nd (+ (dayp (nth 1 tk)) (nump (nth 2 tk))))
                       (n 0))
                   (dolist (c courses)
                     (when (equal (nth 3 c) d)
                       (unless dry (setf (nth 3 c) nd))
                       (incf n)))
                   (emit "shift" n)))))

            ; 11 copy name day
            ((equal op "copy")
             (cond
              ((/= k 3) (bad))
              ((not (dayp (nth 2 tk))) (bad))
              ((not (find (nth 1 tk) courses :key #'first :test #'equal)) (nf))
              ((find (concatenate 'string (nth 1 tk) "_2")
                     courses :key #'first :test #'equal)
               (dup))
              ((>= (length courses) 20) (lim))
              (t (let ((c (find (nth 1 tk) courses :key #'first :test #'equal)))
                   (unless dry
                     (push (list (concatenate 'string (first c) "_2")
                                 (nth 1 c) (nth 2 c)
                                 (dayp (nth 2 tk)) (nth 4 c) (nth 5 c))
                           courses)))
                 (emit "copy" 1))))

            ; 12 merge a b
            ((equal op "merge")
             (cond
              ((/= k 3) (bad))
              ((not (find (nth 1 tk) courses :key #'first :test #'equal)) (nf))
              ((not (find (nth 2 tk) courses :key #'first :test #'equal)) (nf))
              (t (let ((a (find (nth 1 tk) courses :key #'first :test #'equal))
                       (b (find (nth 2 tk) courses :key #'first :test #'equal)))
                   (unless dry
                     (setf (nth 1 a) (nth 1 b)
                           (nth 2 a) (nth 2 b))
                     (setf courses (remove b courses :test #'eq))))
                 (emit "merge" 2))))

            ; 13 sort
            ((equal op "sort")
             (cond
              ((/= k 1) (bad))
              (t (unless dry (setf courses (sort courses #'string< :key #'first)))
                 (emit "sort" 0))))

            ; 14 filter day
            ((equal op "filter")
             (cond
              ((/= k 2) (bad))
              ((not (dayp (nth 1 tk))) (bad))
              (t (emit "filter"
                       (count (dayp (nth 1 tk)) courses
                              :key (lambda (c) (nth 3 c)) :test #'equal)))))

            ; 15 count
            ((equal op "count")
             (cond
              ((/= k 1) (bad))
              (t (emit "count" (length courses)))))

            ; 16 swapTeacher a b
            ((equal op "swapTeacher")
             (cond
              ((/= k 3) (bad))
              ((not (find (nth 1 tk) courses :key #'first :test #'equal)) (nf))
              ((not (find (nth 2 tk) courses :key #'first :test #'equal)) (nf))
              (t (let ((a (find (nth 1 tk) courses :key #'first :test #'equal))
                       (b (find (nth 2 tk) courses :key #'first :test #'equal)))
                   (unless dry (rotatef (nth 1 a) (nth 1 b))))
                 (emit "swapTeacher" 2))))

            ; 17 swapLoc a b
            ((equal op "swapLoc")
             (cond
              ((/= k 3) (bad))
              ((not (find (nth 1 tk) courses :key #'first :test #'equal)) (nf))
              ((not (find (nth 2 tk) courses :key #'first :test #'equal)) (nf))
              (t (let ((a (find (nth 1 tk) courses :key #'first :test #'equal))
                       (b (find (nth 2 tk) courses :key #'first :test #'equal)))
                   (unless dry (rotatef (nth 2 a) (nth 2 b))))
                 (emit "swapLoc" 2))))

            ; 18 copyTo name day from to
            ((equal op "copyTo")
             (cond
              ((/= k 5) (bad))
              ((not (dayp (nth 2 tk))) (bad))
              ((not (hrp (nth 3 tk))) (bad))
              ((not (hrp (nth 4 tk))) (bad))
              ((< (nump (nth 4 tk)) (nump (nth 3 tk))) (bad))
              ((not (find (nth 1 tk) courses :key #'first :test #'equal)) (nf))
              ((find (concatenate 'string (nth 1 tk) "_3")
                     courses :key #'first :test #'equal)
               (dup))
              ((>= (length courses) 20) (lim))
              ((clash (dayp (nth 2 tk)) (nump (nth 3 tk)) (nump (nth 4 tk)) nil) (conf))
              (t (let ((c (find (nth 1 tk) courses :key #'first :test #'equal)))
                   (unless dry
                     (push (list (concatenate 'string (first c) "_3")
                                 (nth 1 c) (nth 2 c)
                                 (dayp (nth 2 tk)) (nump (nth 3 tk)) (nump (nth 4 tk)))
                           courses)))
                 (emit "copyTo" 1))))

            ; 19 truncate day
            ((equal op "truncate")
             (cond
              ((/= k 2) (bad))
              ((not (dayp (nth 1 tk))) (bad))
              (t (let* ((d (dayp (nth 1 tk)))
                        (dc (remove-if-not (lambda (c) (equal (nth 3 c) d)) courses))
                        (best (first (sort (copy-list dc) #'string< :key #'first)))
                        (keep (if best
                                  (remove-if-not
                                   (lambda (c) (or (not (equal (nth 3 c) d))
                                                   (eq c best)))
                                   courses)
                                  courses))
                        (n (- (length courses) (length keep))))
                   (unless dry (setf courses keep))
                   (emit "truncate" n)))))

            ; 20 keep day n
            ((equal op "keep")
             (cond
              ((/= k 3) (bad))
              ((not (dayp (nth 1 tk))) (bad))
              ((or (not (nump (nth 2 tk))) (< (nump (nth 2 tk)) 0)) (bad))
              (t (let* ((d (dayp (nth 1 tk)))
                        (nn (nump (nth 2 tk)))
                        (dc (sort (remove-if-not (lambda (c) (equal (nth 3 c) d)) courses)
                                  #'string< :key #'first))
                        (surv (subseq dc 0 (min nn (length dc))))
                        (keep (remove-if-not
                               (lambda (c) (or (not (equal (nth 3 c) d))
                                               (member c surv :test #'eq)))
                               courses))
                        (n (- (length courses) (length keep))))
                   (unless dry (setf courses keep))
                   (emit "keep" n)))))

            ; 21 renameTeacher t1 t2
            ((equal op "renameTeacher")
             (cond
              ((/= k 3) (bad))
              ((not (wordp (nth 1 tk))) (bad))
              ((not (wordp (nth 2 tk))) (bad))
              (t (let ((n 0))
                   (dolist (c courses)
                     (when (equal (nth 1 c) (nth 1 tk))
                       (unless dry (setf (nth 1 c) (nth 2 tk)))
                       (incf n)))
                   (emit "renameTeacher" n)))))

            ; 22 renameLoc l1 l2
            ((equal op "renameLoc")
             (cond
              ((/= k 3) (bad))
              ((not (wordp (nth 1 tk))) (bad))
              ((not (wordp (nth 2 tk))) (bad))
              (t (let ((n 0))
                   (dolist (c courses)
                     (when (equal (nth 2 c) (nth 1 tk))
                       (unless dry (setf (nth 2 c) (nth 2 tk)))
                       (incf n)))
                   (emit "renameLoc" n)))))

            ; 23 dedupe
            ((equal op "dedupe")
             (cond
              ((/= k 1) (bad))
              (t (let ((seen '()) (n 0))
                   (dolist (c (sort (copy-list courses) #'string< :key #'first))
                     (let ((key (list (nth 1 c) (nth 2 c) (nth 3 c)
                                      (nth 4 c) (nth 5 c))))
                       (if (member key seen :test #'equal)
                           (progn
                             (unless dry
                               (setf courses (remove c courses :test #'equal)))
                             (incf n))
                           (push key seen))))
                   (emit "dedupe" n)))))

            ; 24 compress day
            ((equal op "compress")
             (cond
              ((/= k 2) (bad))
              ((not (dayp (nth 1 tk))) (bad))
              (t (let* ((d (dayp (nth 1 tk)))
                        (dc (sort (remove-if-not (lambda (c) (equal (nth 3 c) d))
                                                 courses)
                                  #'< :key (lambda (c) (nth 4 c))))
                        (n 0))
                   (loop for c in dc
                         for i from 1
                         do (unless (and (= (nth 4 c) i) (= (nth 5 c) (1+ i)))
                              (incf n))
                            (unless dry
                              (setf (nth 4 c) i
                                    (nth 5 c) (1+ i))))
                   (emit "compress" n)))))

            ; 25 compact
            ((equal op "compact")
             (cond
              ((/= k 1) (bad))
              (t (let ((n 0))
                   (loop for d from 1 to 7
                         do (let ((dc (sort (remove-if-not
                                             (lambda (c) (equal (nth 3 c) d))
                                             courses)
                                            #'< :key (lambda (c) (nth 4 c)))))
                              (loop for c in dc
                                    for i from 1
                                    do (unless (and (= (nth 4 c) i)
                                                    (= (nth 5 c) (1+ i)))
                                         (incf n))
                                       (unless dry
                                         (setf (nth 4 c) i
                                               (nth 5 c) (1+ i))))))
                   (emit "compact" n)))))

            ; 26 mirror day day2
            ((equal op "mirror")
             (cond
              ((/= k 3) (bad))
              ((not (dayp (nth 1 tk))) (bad))
              ((not (dayp (nth 2 tk))) (bad))
              ((some (lambda (c)
                       (find (concatenate 'string (first c) "_m")
                             courses :key #'first :test #'equal))
                     (remove-if-not (lambda (c) (equal (nth 3 c) (dayp (nth 1 tk))))
                                    courses))
               (dup))
              ((> (+ (length courses)
                     (count (dayp (nth 1 tk)) courses
                            :key (lambda (c) (nth 3 c)) :test #'equal))
                  20)
               (lim))
              (t (let* ((d (dayp (nth 1 tk)))
                        (d2 (dayp (nth 2 tk)))
                        (dc (remove-if-not (lambda (c) (equal (nth 3 c) d)) courses)))
                   (dolist (c dc)
                     (unless dry
                       (push (list (concatenate 'string (first c) "_m")
                                   (nth 1 c) (nth 2 c) d2 (nth 4 c) (nth 5 c))
                             courses)))
                   (emit "mirror" (length dc))))))

            ; 27 absorb a b
            ((equal op "absorb")
             (cond
              ((/= k 3) (bad))
              ((not (find (nth 1 tk) courses :key #'first :test #'equal)) (nf))
              ((not (find (nth 2 tk) courses :key #'first :test #'equal)) (nf))
              (t (let ((a (find (nth 1 tk) courses :key #'first :test #'equal))
                       (b (find (nth 2 tk) courses :key #'first :test #'equal)))
                   (unless dry
                     (setf (nth 1 a) (nth 1 b)
                           (nth 2 a) (nth 2 b))))
                 (emit "absorb" 2))))

            ; 28 swapDays d1 d2
            ((equal op "swapDays")
             (cond
              ((/= k 3) (bad))
              ((not (dayp (nth 1 tk))) (bad))
              ((not (dayp (nth 2 tk))) (bad))
              ((= (dayp (nth 1 tk)) (dayp (nth 2 tk)))
               (emit "swapDays" (count (dayp (nth 1 tk)) courses
                                       :key (lambda (c) (nth 3 c)) :test #'equal)))
              (t (let* ((d1 (dayp (nth 1 tk)))
                        (d2 (dayp (nth 2 tk)))
                        (a (remove-if-not (lambda (c) (equal (nth 3 c) d1)) courses))
                        (b (remove-if-not (lambda (c) (equal (nth 3 c) d2)) courses)))
                   (if (or (some (lambda (c1)
                                   (some (lambda (c2)
                                           (and (not (eq c1 c2))
                                                (not (or (< (nth 5 c2) (nth 4 c1))
                                                         (< (nth 5 c1) (nth 4 c2))))))
                                         a))
                                 a)
                           (some (lambda (c1)
                                   (some (lambda (c2)
                                           (and (not (eq c1 c2))
                                                (not (or (< (nth 5 c2) (nth 4 c1))
                                                         (< (nth 5 c1) (nth 4 c2))))))
                                         b))
                                 b))
                       (conf)
                       (progn
                         (unless dry
                           (dolist (c a) (setf (nth 3 c) d2))
                           (dolist (c b) (setf (nth 3 c) d1)))
                         (emit "swapDays" (+ (length a) (length b)))))))))

            ; 29 promote name
            ((equal op "promote")
             (cond
              ((/= k 2) (bad))
              ((not (find (nth 1 tk) courses :key #'first :test #'equal)) (nf))
              (t (let* ((c (find (nth 1 tk) courses :key #'first :test #'equal))
                        (d (nth 3 c))
                        (slot nil))
                   (loop for f from 1 to 11
                         do (unless (some (lambda (o)
                                            (and (not (eq o c))
                                                 (equal (nth 3 o) d)
                                                 (not (or (< (nth 5 o) f)
                                                          (< (1+ f) (nth 4 o))))))
                                          courses)
                              (setf slot f)
                              (return)))
                   (when (and slot (not dry))
                     (setf (nth 4 c) slot
                           (nth 5 c) (1+ slot)))
                   (emit "promote" 1)))))

            ; 30 purge teacher
            ((equal op "purge")
             (cond
              ((/= k 2) (bad))
              ((not (wordp (nth 1 tk))) (bad))
              (t (let* ((keep (remove-if (lambda (c) (equal (nth 1 c) (nth 1 tk)))
                                         courses))
                        (n (- (length courses) (length keep))))
                   (unless dry (setf courses keep))
                   (emit "purge" n)))))

            ; anything else, including a bare --dry or an empty command string
            (t (bad))))))
     (format t "#state~%")
     (dolist (c (sort (copy-list courses) #'string< :key #'first))
       (format t "~a|~a|~a|~d|~d-~d~%"
               (nth 0 c) (nth 1 c) (nth 2 c) (nth 3 c) (nth 4 c) (nth 5 c)))))

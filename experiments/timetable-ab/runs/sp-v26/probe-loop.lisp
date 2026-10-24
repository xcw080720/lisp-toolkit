(handler-case
    (print (loop for (k . v) on '(("a" . 1) ("b" . 2)) collect (list k v)))
  (error (e) (format t "dotted-destructure ERROR: ~a~%" e)))
(print (loop for (k . v) in '(("a" . 1) ("b" . 2)) collect (list k v)))
(print (loop for pair on '(("a" . 1) ("b" . 2)) collect (cons (caar pair) (cdar pair))))

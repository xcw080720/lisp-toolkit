(handler-case
    (multiple-value-bind (f w p) (compile-file "impl.lisp" :output-file "impl-check.fasl")
      (declare (ignore f))
      (format t "WARNINGS-P=~a FAILURE-P=~a~%" w p))
  (error (e) (format t "COMPILE-ERR: ~a~%" e)))

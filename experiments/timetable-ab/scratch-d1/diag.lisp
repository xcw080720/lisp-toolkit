(defparameter *src* "/mnt/c/Users/HUAWEI/Documents/deepseek-harness/default-workspace/lisp-toolkit/experiments/timetable-ab/runs/d1-check-macro-1/impl.lisp")

;; 1. compile-file: warnings / failures, capture all compiler output
(let ((out (make-string-output-stream)))
  (let ((*error-output* out) (*standard-output* out))
    (multiple-value-bind (fasl warn fail)
        (compile-file *src* :output-file "/tmp/d1-check.fasl")
      (format t "COMPILE FASL=~a~%WARN=~s~%FAIL=~s~%" (if fasl "OK" "NIL") warn fail)
      (load fasl :verbose nil :print nil)))
  (format t "---COMPILER-OUTPUT-BEGIN---~%~a---COMPILER-OUTPUT-END---~%"
          (get-output-stream-string out)))

;; 2. symbol conflicts: every name I define must not be an external symbol of CL / SB-EXT / SB-INT
(defparameter *my-names*
  '("defop" "defdispatch" "register-op" "op-fail" "badarg" "notfound" "conflict"
    "err-dup" "err-limit" "blank-char-p" "blank-char-1" "digits-only-p" "parse-word"
    "parse-uint" "parse-int" "parser-form" "op-fn" "find-course" "courses-on" "clash-p"
    "copy-courses" "schedule-free-p" "compress-day" "split-tokens" "command-args"
    "script-file-p" "exec-command" "run-command" "print-state" "main" "dispatch"
    "op-add" "op-del" "op-edit" "op-move" "op-swap" "op-rename" "op-duplicate" "op-trim"
    "op-clear" "op-shift" "op-copy" "op-merge" "op-sort" "op-filter" "op-count"
    "op-swapteacher" "op-swaploc" "op-copyto" "op-truncate" "op-keep" "op-renameteacher"
    "op-renameloc" "op-dedupe" "op-compress" "op-compact" "op-mirror" "op-absorb"
    "op-swapdays" "op-promote" "op-purge"))

(format t "---SYMBOL-CONFLICTS---~%")
(dolist (pkg '("COMMON-LISP" "SB-EXT" "SB-INT" "SB-KERNEL"))
  (dolist (nm *my-names*)
    (multiple-value-bind (sym status) (find-symbol nm pkg)
      (when (and sym (eq status :external))
        (format t "CONFLICT ~a in ~a~%" nm pkg)))))
(format t "conflict-scan-done~%")

;; 3. every defop actually produced a registered function
(format t "---REGISTRY--- ops=~d first=~a last=~a~%"
        (length *op-registry*) (caar (last (reverse *op-registry*)))
        (caar *op-registry*))

;; 4. macroexpand-1 of one op: what symbols show up in the expansion
(let ((exp (macroexpand-1 '(defop "zz" ((x :word) (y :day)) (list x y)))))
  (format t "---MACROEXPAND---~%")
  (let ((syms '()))
    (labels ((walk (f)
               (cond ((consp f) (walk (car f)) (walk (cdr f)))
                     ((and (symbolp f) f) (pushnew f syms)))))
      (walk exp))
    (dolist (s syms)
      (multiple-value-bind (sym status) (find-symbol (symbol-name s) "COMMON-LISP")
        (when (and sym (eq status :external) (not (fboundp s)))
          (format t "UNBOUND-CL-SYMBOL ~a~%" s)))))
  (format t "expansion-ok len=~d~%" (length (prin1-to-string exp))))

;; 5. smoke: run the sample from the spec inside this image
(let ((sb-ext:*posix-argv* '("sbcl" "add math t1 r1 1 1 2" "add phys t2 r2 1 3 4" "count")))
  (format t "---SMOKE---~%")
  (main))

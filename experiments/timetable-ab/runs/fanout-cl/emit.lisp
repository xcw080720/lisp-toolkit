;;;; emit.lisp -- fanout arm, CL/macro variant.
;;;; ALL artifact content is computed at MACROEXPANSION time from decls.json and
;;;; baked into the expansion as string literals; the expansion only writes files.
;;;; Source is ASCII-only on purpose (the data it reads/writes is UTF-8).
(in-package :cl-user)

(eval-when (:compile-toplevel :load-toplevel :execute)

  ;; ---------- 1. JSON reader (objects keep declaration order) ----------
  (defparameter +ws+ '(#\Space #\Tab #\Newline #\Return))
  (defparameter +stop+ '(#\, #\} #\] #\Space #\Tab #\Newline #\Return #\:))

  (defun jws (s i)
    (loop while (and (< i (length s)) (member (char s i) +ws+)) do (incf i)
          finally (return i)))

  (defun jstr (s i)
    (let ((o (make-string-output-stream)))
      (loop (let ((c (char s (incf i))))
              (cond ((char= c #\") (return (values (get-output-stream-string o) (1+ i))))
                    ((char= c #\\)
                     (let ((e (char s (incf i))))
                       (write-char (case e (#\n #\Newline) (#\t #\Tab) (#\r #\Return)
                                        (#\b #\Backspace) (#\f #\Page) (t e)) o)))
                    (t (write-char c o)))))))

  (defun jval (s i)
    (let ((c (char s (setf i (jws s i)))))
      (cond ((char= c #\{) (jobj s (1+ i)))
            ((char= c #\[) (jarr s (1+ i)))
            ((char= c #\") (jstr s i))
            ((char= c #\t) (values t (+ i 4)))
            ((char= c #\f) (values nil (+ i 5)))
            ((char= c #\n) (values nil (+ i 4)))
            (t (let ((j i))
                 (loop while (and (< j (length s)) (not (member (char s j) +stop+))) do (incf j))
                 (values (or (ignore-errors (read-from-string s nil nil :start i :end j))
                             (subseq s i j))
                         j))))))

  (defun jobj (s i)
    (let ((pairs '()))
      (loop
        (setf i (jws s i))
        (if (char= (char s i) #\})
            (return (values (cons :obj (nreverse pairs)) (1+ i)))
            (multiple-value-bind (k i2) (jstr s i)
              (setf i (jws s (1+ (jws s i2))))        ; skip the colon
              (multiple-value-bind (v i3) (jval s i)
                (push (cons k v) pairs)
                (setf i (jws s i3))
                (when (char= (char s i) #\,) (incf i))))))))

  (defun jarr (s i)
    (let ((items '()))
      (loop
        (setf i (jws s i))
        (if (char= (char s i) #\])
            (return (values (cons :arr (nreverse items)) (1+ i)))
            (multiple-value-bind (v i2) (jval s i)
              (push v items)
              (setf i (jws s i2))
              (when (char= (char s i) #\,) (incf i)))))))

  (defun jget (o k)
    (and (consp o) (eq (car o) :obj) (cdr (assoc k (cdr o) :test #'string=))))
  (defun jkeys (o) (mapcar #'car (cdr o)))
  (defun jlist (v) (if (and (consp v) (eq (car v) :arr)) (cdr v) '()))

  (defun read-json (path)
    (with-open-file (in path :external-format :utf-8)
      (let ((s (with-output-to-string (o)
                 (loop for c = (read-char in nil nil) while c do (write-char c o)))))
        (nth-value 0 (jval s 0)))))

  ;; ---------- 2. JSON writer ----------
  (defun json-str (s)
    (with-output-to-string (o)
      (write-char #\" o)
      (loop for c across s do
        (case c (#\" (write-string "\\\"" o)) (#\\ (write-string "\\\\" o))
                (#\Newline (write-string "\\n" o)) (#\Tab (write-string "\\t" o))
                (t (write-char c o))))
      (write-char #\" o)))

  (defun enc (v)
    (cond ((stringp v) (json-str v))
          ((null v) "null")
          ((and (consp v) (eq (car v) :obj))
           (format nil "{~{~a~^,~}}"
                   (loop for (k . val) in (cdr v) collect (format nil "~a:~a" (json-str k) (enc val)))))
          ((and (consp v) (eq (car v) :arr)) (format nil "[~{~a~^,~}]" (mapcar #'enc (cdr v))))
          (t (princ-to-string v))))

  (defun join (l sep) (format nil (concatenate 'string "~{~a~^" sep "~}") l))

  ;; ---------- 3. text rendering: {a.b} -> value from args, else <a.b> ----------
  (defun split-dots (s)
    (let ((out '()) (start 0))
      (dotimes (i (length s))
        (when (char= (char s i) #\.) (push (subseq s start i) out) (setf start (1+ i))))
      (nreverse (push (subseq s start) out))))

  (defun arg-val (args expr)
    (let ((v (cons :obj args)))
      (dolist (part (split-dots expr) v)
        (setf v (jget v part))
        (unless (consp v) (return nil)))))

  (defun render (tmpl args)
    (with-output-to-string (o)
      (let ((i 0) (n (length tmpl)))
        (loop while (< i n) do
          (let ((c (char tmpl i)))
            (if (and (char= c #\{) (position #\} tmpl :start i))
                (let* ((close (position #\} tmpl :start i))
                       (expr (subseq tmpl (1+ i) close))
                       (val (arg-val args expr)))
                  (write-string (if val (format nil "~a" val) (format nil "<~a>" expr)) o)
                  (setf i (1+ close)))
                (progn (write-char c o) (incf i))))))))

  ;; ---------- 4. sample args derived from params + required + clamp ----------
  (defun fields-for (p specs)
    (let ((out '()) (pre (concatenate 'string p ".")))
      (dolist (s specs (nreverse out))
        (when (and (> (length s) (length pre)) (string= pre s :end2 (length pre)))
          (let* ((rest (subseq s (length pre)))
                 (colon (position #\: rest))
                 (k (if colon (subseq rest 0 colon) rest)))
            (push (cons k (and colon (ignore-errors (parse-integer rest :start (1+ colon) :junk-allowed t))))
                  out))))))

  (defun mock-args (d)
    (let ((specs (append (jlist (jget d "required")) (jlist (jget d "clamp")))))
      (loop for p in (jlist (jget d "params"))
            collect (cons p
                          (let ((fields (fields-for p specs)))
                            (if fields
                                (cons :obj (loop for (k . lo) in fields
                                                 collect (cons k (or lo (format nil "<~a.~a>" p k)))))
                                (format nil "<~a>" p)))))))

  ;; ---------- 5. one renderer per artifact (THE per-artifact increment) ----------
  (defun op-rows (decls) (loop for op in (jkeys decls) collect (cons op (jget decls op))))

  (defun render-ops-text (decls)
    (with-output-to-string (o)
      (loop for (op . d) in (op-rows decls) do
        (format o "~a~c~a~%" op #\Tab (render (or (jget d "text") "") '())))))

  (defun render-schema (decls)
    (concatenate 'string
                 (enc (cons :obj
                            (loop for (op . d) in (op-rows decls)
                                  collect (cons op (cons :obj
                                                         (list (cons "params" (or (jget d "params") '(:arr)))
                                                               (cons "required" (or (jget d "required") '(:arr)))
                                                               (cons "clamp" (or (jget d "clamp") '(:arr)))))))))
                 (string #\Newline)))

  (defun render-client (decls)
    (with-output-to-string (o)
      (format o "// generated from decls.json; do not edit~%")
      (loop for (op . d) in (op-rows decls)
            for args = (mock-args d)
            for ps = (jlist (jget d "params"))
            do (format o "~%// ~a~%function ~a(~a) {~%  return { op: ~a, args: { ~a } };~%}~%"
                       (render (or (jget d "text") "") args) op (join ps ", ")
                       (json-str op) (join ps ", ")))
      (format o "~%module.exports = { ~a };~%" (join (jkeys decls) ", "))))

  (defun render-tests (decls)
    (concatenate 'string
                 (enc (cons :arr
                            (loop for (op . d) in (op-rows decls)
                                  for args = (mock-args d)
                                  collect (cons :obj
                                                 (list (cons "op" op)
                                                       (cons "args" (cons :obj args))
                                                       (cons "expect" (render (or (jget d "text") "") args)))))))
                 (string #\Newline)))

  (defun render-validate (decls)
    (with-output-to-string (o)
      (loop for (op . d) in (op-rows decls)
            for req = (jlist (jget d "required"))
            for clp = (jlist (jget d "clamp"))
            do (format o "~a~crequired~c~a~%" op #\Tab #\Tab
                       (if req (join req ", ") "(none)"))
               (format o "~a~cclamp~c~a~%" op #\Tab #\Tab
                       (if clp (join clp ", ") "(none)")))))

  ;; ---------- 6. artifact registry + the macro ----------
  (defparameter *artifacts*
    '(("opsText.txt"   . render-ops-text)
      ("schema.json"   . render-schema)
      ("client.js"     . render-client)
      ("tests.json"    . render-tests)
      ("validate.txt"  . render-validate)))

  (defun script-dir ()
    (or (and *load-truename*
             (make-pathname :name nil :type nil :version nil :defaults *load-truename*))
        *default-pathname-defaults*))

  (defun read-decls (&optional (name "decls.json"))
    (read-json (merge-pathnames name (script-dir))))

  (defun write-artifact (name content)
    (let ((path (merge-pathnames name (script-dir))))
      (with-open-file (o path :direction :output :if-exists :supersede
                              :if-does-not-exist :create :external-format :utf-8)
        (write-string content o))
      (format t "wrote ~a~%" (file-namestring path))))

  (defun artifact-forms (decls)
    (loop for (file . fn) in *artifacts*
          collect (list 'write-artifact file (funcall fn decls))))

  (defmacro fanout (&optional (decl-file "decls.json"))
    "Read decls.json NOW (macroexpansion time) and expand into one WRITE-ARTIFACT
     form per artifact, each carrying its fully rendered content as a literal."
    (let ((decls (read-decls decl-file)))
      (format t "fanout: expanding for ~a ops~%" (length (jkeys decls)))
      `(progn ,@(artifact-forms decls)))))

;; one line, declarative: everything else happens at expansion time
(fanout "decls.json")

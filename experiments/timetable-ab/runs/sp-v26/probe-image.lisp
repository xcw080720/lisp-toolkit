;;;; probe-image.lisp — 在同一个活体镜像里 load impl.lisp 后直接问边界
(load "impl.lisp")   ; 末尾 (main) 会按 argv 末位跑一次，这是有意的活体检查

(format t "~%--- 契约 3：三个空必须输出不同 ---~%")
(dolist (src '("{\"a\":[],\"b\":{},\"c\":null}" "[]" "{}" "null"))
  (format t "in=~a  out=~a~%" src
          (with-output-to-string (o) (jwrite (jparse src) o))))

(format t "~%--- 数字分类型写出 ---~%")
(dolist (src '("2.5" "1e3" "-0" "16"))
  (format t "in=~a  out=~a~%" src
          (with-output-to-string (o) (jwrite (jparse src) o))))

(format t "~%--- 非 ASCII 直出 ---~%")
(format t "~a~%" (with-output-to-string (o) (jwrite (jparse "\"数据结构\\ud83d\\udc0b\"") o)))

(format t "~%--- 业务层看不到 :obj ---~%")
(let ((c (course-from-json (jparse "{\"name\":\"x\",\"weeks\":{}}"))))
  (format t "weeks 槽 = ~s（是裸 alist，无 :obj）~%" (course-weeks c))
  (format t "含 :obj ? ~a~%" (search ":OBJ" (format nil "~s" (course-weeks c)))))
(finish-output)

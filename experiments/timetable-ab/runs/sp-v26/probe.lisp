(format t "argv=~s~%" sb-ext:*posix-argv*)
(format t "fmt=~s~%" (stream-external-format *standard-output*))
(format t "raw=[数据结构🐋]~%")
(finish-output)

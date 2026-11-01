(format t "N=~d~%" (length sb-ext:*posix-argv*))
(loop for x in sb-ext:*posix-argv* for i from 0 do (format t "[~d] ~s~%" i x))

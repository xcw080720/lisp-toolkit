(format t "VAR=~s~%" sb-ext:*posix-argv*)
(format t "N=~d~%" (length sb-ext:*posix-argv*))
(format t "FIRST=~s~%" (first sb-ext:*posix-argv*))

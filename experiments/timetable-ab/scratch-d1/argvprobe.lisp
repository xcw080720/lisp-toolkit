(let ((a (sb-ext:*posix-argv*)))
  (format t "ARGV=~s~%" a)
  (format t "N=~d~%" (length a)))

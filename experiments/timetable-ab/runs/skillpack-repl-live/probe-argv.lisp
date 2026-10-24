;; argv probe
(print sb-ext:*posix-argv*)
(print (car (last sb-ext:*posix-argv*)))
(print (length *args*))

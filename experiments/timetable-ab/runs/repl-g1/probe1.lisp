(write-string "ARGV=")
(write-string (prin1-to-string sb-ext:*posix-argv*))
(write-string "|ASCII-OK|")
(finish-output)

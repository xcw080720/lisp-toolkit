#!/bin/bash
cd /mnt/c/Users/HUAWEI/Documents/deepseek-harness/default-workspace/lisp-toolkit/experiments/timetable-ab/scratch-d1 || exit 1
echo "== A: quoted multi-word args =="
sbcl --script argvprobe4.lisp "add math t1 r1 1 1 2" "count"
echo "== B: plain args =="
sbcl --script argvprobe4.lisp add math t1 r1 1 1 2
echo "== C: two quoted =="
sbcl --script argvprobe4.lisp "one two" "three four"
echo "== D: env check =="
sbcl --version

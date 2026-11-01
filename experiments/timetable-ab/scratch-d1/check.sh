#!/bin/bash
D=/mnt/c/Users/HUAWEI/Documents/deepseek-harness/default-workspace/lisp-toolkit/experiments/timetable-ab
cd "$D/scratch-d1" || exit 1
echo "===== COMPILE ====="
sbcl --script compile.lisp
echo "===== RUN SAMPLE ====="
sbcl --script "$D/runs/d1-check-macro-1/impl.lisp" "add math t1 r1 1 1 2" "add phys t2 r2 1 3 4" "count"

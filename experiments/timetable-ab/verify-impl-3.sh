#!/usr/bin/env bash
cd /mnt/c/Users/HUAWEI/Documents/deepseek-harness/default-workspace/lisp-toolkit/experiments/timetable-ab || exit 1
f=runs/nondry-cl-macro/impl.lisp
cd /tmp || exit 1
sbcl --script /mnt/c/Users/HUAWEI/Documents/deepseek-harness/default-workspace/lisp-toolkit/experiments/timetable-ab/runs/nondry-cl-macro/impl.lisp \
 "add math t1 r1 1 1 2" "add phys t2 r2 1 3 4" "add chem t1 r2 2 1 2" \
 "swapTeacher math phys" "swapLoc chem math" "trim 1 3" "shift 1 1" \
 "copy math 5" "copyTo phys 6 9 10" "duplicate chem chem2" "mirror 5 6" \
 "keep 6 1" "renameTeacher t1 tt" "renameLoc r2 rr" "compress 1" "compact" \
 "swapDays 5 6" "promote phys" "absorb math chem2" "merge math chem" \
 "dedupe" "purge r1" "filter 1" "sort" "count"
echo "exit=$?"

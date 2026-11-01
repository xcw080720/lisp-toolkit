#!/bin/bash
D=/mnt/c/Users/HUAWEI/Documents/deepseek-harness/default-workspace/lisp-toolkit/experiments/timetable-ab
echo "=== keep head ==="
sbcl --script "$D/runs/d1-check-macro-1/impl.lisp" "add a t r 1 1 2" "keep 1 0" 2>&1 | head -12
echo "=== limit grep ==="
ARGS=()
for i in 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19; do
  d=$(( i / 3 + 1 )); s=$(( (i % 3) * 2 + 1 )); n=$(printf 'c%02d' "$i")
  ARGS+=("add $n t r $d $s $((s+1))")
done
sbcl --script "$D/runs/d1-check-macro-1/impl.lisp" "${ARGS[@]}" "add over t r 7 5 6" 2>/dev/null | grep -n "err"
echo "(grep done)"

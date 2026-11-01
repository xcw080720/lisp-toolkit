#!/bin/bash
IMPL=/mnt/c/Users/HUAWEI/Documents/deepseek-harness/default-workspace/lisp-toolkit/experiments/timetable-ab/runs/d1-check-macro-1/impl.lisp
pass=0; fail=0; faillist=""
t() {
  local name="$1"; local exp="$2"; shift 2
  local got
  got=$(sbcl --script "$IMPL" "$@" 2>/dev/null)
  if [ "$got" = "$exp" ]; then
    pass=$((pass+1))
  else
    fail=$((fail+1)); faillist="$faillist $name"
    printf 'FAIL %s\n--got--\n%s\n--exp--\n%s\n\n' "$name" "$got" "$exp"
  fi
}

# ---- base 1-15 ----
t sample $'ok add 1\nok add 1\nok count 2\n#state\nmath|t1|r1|1|1-2\nphys|t2|r2|1|3-4' \
  "add math t1 r1 1 1 2" "add phys t2 r2 1 3 4" "count"

t add-dup $'ok add 1\nerr DUP\n#state\nmath|t1|r1|1|1-2' \
  "add math t1 r1 1 1 2" "add math t2 r2 2 1 2"

t add-conflict-touch $'ok add 1\nerr CONFLICT\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "add b t r 1 2 3"

t add-conflict-inside $'ok add 1\nerr CONFLICT\n#state\na|t|r|1|1-6' \
  "add a t r 1 1 6" "add b t r 1 3 4"

t del-notfound $'err NOTFOUND\n#state' "del ghost"

t arity-short $'err BADARG\n#state' "add a t r 1 1"
t arity-long $'err BADARG\n#state' "add a t r 1 1 2 9"
t bad-day $'err BADARG\n#state' "add a t r 8 1 2"
t bad-day0 $'err BADARG\n#state' "add a t r 0 1 2"
t bad-slot13 $'err BADARG\n#state' "add a t r 1 1 13"
t bad-to-lt-from $'err BADARG\n#state' "add a t r 1 5 4"
t bad-name13 $'err BADARG\n#state' "add abcdefghijklm t r 1 1 2"
t bad-num-text $'err BADARG\n#state' "add a t r x 1 2"

t empty-cmd $'ok add 1\nerr BADARG\nok count 1\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "" "count"
t blank-cmd $'err BADARG\n#state' "   "
t unknown-verb $'err BADARG\n#state' "nope x"

t edit-ok $'ok add 1\nok edit 1\nok count 1\n#state\na|t9|r9|1|1-2' \
  "add a t r 1 1 2" "edit a t9 r9" "count"
t edit-notfound $'err NOTFOUND\n#state' "edit ghost t r"

t move-ok $'ok add 1\nok move 1\n#state\na|t|r|2|3-4' \
  "add a t r 1 1 2" "move a 2 3 4"
t move-conflict $'ok add 1\nok add 1\nerr CONFLICT\n#state\na|t|r|1|1-2\nb|t|r|1|3-4' \
  "add a t r 1 1 2" "add b t r 1 3 4" "move b 1 2 5"
t move-self $'ok add 1\nok move 1\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "move a 1 1 2"

t swap-ok $'ok add 1\nok add 1\nok swap 2\n#state\na|t|r|2|3-4\nb|t|r|1|1-2' \
  "add a t r 1 1 2" "add b t r 2 3 4" "swap a b"
t swap-notfound $'ok add 1\nerr NOTFOUND\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "swap a ghost"
t swap-compat $'ok add 1\nok add 1\nok swap 2\n#state\na|t|r|2|1-2\nb|t|r|1|1-2' \
  "add a t r 1 1 2" "add b t r 2 1 2" "swap a b"

t rename-ok $'ok add 1\nok rename 1\n#state\nz|t|r|1|1-2' \
  "add a t r 1 1 2" "rename a z"
t rename-dup $'ok add 1\nok add 1\nerr DUP\n#state\na|t|r|1|1-2\nb|t|r|2|1-2' \
  "add a t r 1 1 2" "add b t r 2 1 2" "rename a b"

t duplicate-ok $'ok add 1\nok duplicate 1\n#state\na|t|r|1|1-2\na2|t|r|1|1-2' \
  "add a t r 1 1 2" "duplicate a a2"
t duplicate-dup $'ok add 1\nok add 1\nerr DUP\n#state\na|t|r|1|1-2\nb|t|r|2|1-2' \
  "add a t r 1 1 2" "add b t r 2 1 2" "duplicate a b"

t trim-ok $'ok add 1\nok add 1\nok trim 1\n#state\na1|t|r|2|1-2\na2|t|r|2|3-4' \
  "add a1 t r 2 1 2" "add a2 t r 2 3 6" "trim 2 4"
t trim-none $'ok add 1\nok trim 0\n#state\na|t|r|2|1-2' \
  "add a t r 2 1 2" "trim 2 4"

t clear-ok $'ok add 1\nok add 1\nok clear 2\n#state' \
  "add a t r 1 1 2" "add b t r 1 3 4" "clear 1"

t shift-ok $'ok add 1\nok shift 1\n#state\na|t|r|3|1-2' \
  "add a t r 1 1 2" "shift 1 2"
t shift-badarg $'ok add 1\nok add 1\nerr BADARG\n#state\na|t|r|7|1-2\nb|t|r|7|3-4' \
  "add a t r 7 1 2" "add b t r 7 3 4" "shift 7 1"

t copy-ok $'ok add 1\nok copy 1\n#state\na|t|r|1|1-2\na_2|t|r|3|1-2' \
  "add a t r 1 1 2" "copy a 3"
t copy-notfound $'err NOTFOUND\n#state' "copy ghost 3"

t merge-ok $'ok add 1\nok add 1\nok merge 2\n#state\na|t2|r2|1|1-2' \
  "add a t1 r1 1 1 2" "add b t2 r2 2 3 4" "merge a b"

t sort-ok $'ok sort 0\n#state' "sort"
t filter-ok $'ok add 1\nok add 1\nok add 1\nok filter 2\nok filter 0\n#state\na|t|r|1|1-2\nb|t|r|1|3-4\nc|t|r|2|1-2' \
  "add a t r 1 1 2" "add b t r 1 3 4" "add c t r 2 1 2" "filter 1" "filter 3"
t count-empty $'ok count 0\n#state' "count"

# ---- 16-30 ----
t swapteacher $'ok add 1\nok add 1\nok swapteacher 2\n#state\na|t2|r1|1|1-2\nb|t1|r2|2|3-4' \
  "add a t1 r1 1 1 2" "add b t2 r2 2 3 4" "swapTeacher a b"
t swaploc $'ok add 1\nok add 1\nok swaploc 2\n#state\na|t1|r2|1|1-2\nb|t2|r1|2|3-4' \
  "add a t1 r1 1 1 2" "add b t2 r2 2 3 4" "swapLoc a b"
t swapteacher-notfound $'err NOTFOUND\n#state' "swapTeacher a b"

t copyto-ok $'ok add 1\nok copyto 1\n#state\na|t|r|1|1-2\na_3|t|r|3|5-6' \
  "add a t r 1 1 2" "copyTo a 3 5 6"
t copyto-conflict $'ok add 1\nok add 1\nerr CONFLICT\n#state\na|t|r|1|1-2\nb|t|r|3|5-6' \
  "add a t r 1 1 2" "add b t r 3 5 6" "copyTo a 3 5 6"
t copyto-notfound $'err NOTFOUND\n#state' "copyTo ghost 1 1 2"
t copyto-dup $'ok add 1\nok add 1\nerr DUP\n#state\na|t|r|1|1-2\na_3|t|r|4|1-2' \
  "add a t r 1 1 2" "add a_3 t r 4 1 2" "copyTo a 5 1 2"

t truncate-ok $'ok add 1\nok add 1\nok add 1\nok truncate 2\n#state\na1|t|r|1|3-4' \
  "add z1 t r 1 1 2" "add a1 t r 1 3 4" "add m1 t r 1 5 6" "truncate 1"
t truncate-empty $'ok truncate 0\n#state' "truncate 5"
t keep-ok $'ok add 1\nok add 1\nok add 1\nok keep 1\n#state\na1|t|r|1|3-4\nm1|t|r|1|5-6' \
  "add z1 t r 1 1 2" "add a1 t r 1 3 4" "add m1 t r 1 5 6" "keep 1 2"
t keep-zero $'ok add 1\nok keep 1\n#state' "add a t r 1 1 2" "keep 1 0"
t keep-big $'ok add 1\nok keep 0\n#state\na|t|r|1|1-2' "add a t r 1 1 2" "keep 1 5"

t renameteacher $'ok add 1\nok add 1\nok renameteacher 2\n#state\na|x|r|1|1-2\nb|x|r|2|1-2' \
  "add a t1 r 1 1 2" "add b t1 r 2 1 2" "renameTeacher t1 x"
t renameteacher-zero $'ok add 1\nok renameteacher 0\n#state\na|t1|r|1|1-2' \
  "add a t1 r 1 1 2" "renameTeacher zzz x"
t renameloc $'ok add 1\nok add 1\nok renameloc 2\n#state\na|t|q|1|1-2\nb|t|q|2|1-2' \
  "add a t r 1 1 2" "add b t r 2 1 2" "renameLoc r q"

t dedupe-ok $'ok add 1\nok duplicate 1\nok dedupe 1\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "duplicate a b" "dedupe"
t dedupe-zero $'ok dedupe 0\n#state' "dedupe"

t compress-ok $'ok add 1\nok add 1\nok compress 1\n#state\na|t|r|1|1-2\nb|t|r|1|2-3' \
  "add a t r 1 1 2" "add b t r 1 5 6" "compress 1"
t compress-zero $'ok compress 0\n#state' "compress 3"

t compact-ok $'ok add 1\nok add 1\nok add 1\nok compact 2\n#state\na|t|r|1|1-2\nb|t|r|1|2-3\nc|t|r|2|1-2' \
  "add a t r 1 1 2" "add b t r 1 5 6" "add c t r 2 3 4" "compact"

t mirror-ok $'ok add 1\nok add 1\nok mirror 2\n#state\na|t|r|1|1-2\na_m|t|r|2|1-2\nb|t|r|1|3-4\nb_m|t|r|2|3-4' \
  "add a t r 1 1 2" "add b t r 1 3 4" "mirror 1 2"
t mirror-dup $'ok add 1\nok add 1\nok add 1\nerr DUP\n#state\na|t|r|1|1-2\na_m|t|r|5|1-2\nb|t|r|1|3-4' \
  "add a t r 1 1 2" "add b t r 1 3 4" "add a_m t r 5 1 2" "mirror 1 2"

t absorb-ok $'ok add 1\nok add 1\nok absorb 2\nok count 2\n#state\na|t2|r2|1|1-2\nb|t2|r2|2|3-4' \
  "add a t1 r1 1 1 2" "add b t2 r2 2 3 4" "absorb a b" "count"

t swapdays-ok $'ok add 1\nok add 1\nok swapdays 2\n#state\na|t|r|2|1-2\nb|t|r|1|5-6' \
  "add a t r 1 1 2" "add b t r 2 5 6" "swapDays 1 2"
t swapdays-same $'ok add 1\nok swapdays 2\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "swapDays 1 1"

t promote-ok $'ok add 1\nok add 1\nok promote 1\n#state\na|t|r|1|1-2\nb|t|r|1|5-6' \
  "add a t r 1 3 4" "add b t r 1 5 6" "promote a"
t promote-notfound $'err NOTFOUND\n#state' "promote ghost"

t purge-ok $'ok add 1\nok add 1\nok add 1\nok purge 2\n#state\nc|t2|r|3|1-2' \
  "add a t1 r 1 1 2" "add b t1 r 2 1 2" "add c t2 r 3 1 2" "purge t1"
t purge-zero $'ok purge 0\n#state' "purge nobody"

# ---- --dry ----
t dry-add $'ok add 1\n#state' "--dry add a t r 1 1 2"
t dry-del $'ok add 1\nok del 1\nok count 1\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "--dry del a" "count"
t dry-clear $'ok add 1\nok add 1\nok clear 2\n#state\na|t|r|1|1-2\nb|t|r|1|3-4' \
  "add a t r 1 1 2" "add b t r 1 3 4" "--dry clear 1"
t dry-notfound $'err NOTFOUND\n#state' "--dry del ghost"
t dry-alone $'err BADARG\n#state' "--dry"
t dry-edit $'ok add 1\nok edit 1\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "--dry edit a t9 r9"
t dry-move-conflict $'ok add 1\nok add 1\nerr CONFLICT\n#state\na|t|r|1|1-2\nb|t|r|1|3-4' \
  "add a t r 1 1 2" "add b t r 1 3 4" "--dry move b 1 2 5"
t dry-badarg $'err BADARG\n#state' "--dry add a t"
t dry-shift $'ok add 1\nok shift 1\nok count 1\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "--dry shift 1 2" "count"

# ---- limit (20 max) ----
base=()
exp=$''
state=$''
for i in 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19; do
  d=$(( i / 3 + 1 )); s=$(( (i % 3) * 2 + 1 )); n=$(printf 'c%02d' "$i")
  base+=("add $n t r $d $s $((s+1))")
  exp+=$'ok add 1\n'
  state+="$n|t|r|$d|$s-$((s+1))"$'\n'
done
state=${state%$'\n'}
t limit-20 "$exp"$'err LIMIT\n#state\n'"$state" "${base[@]}" "add over t r 7 5 6"

# ---- dry on full table: dry add still LIMIT, count unchanged ----
t dry-limit "$exp"$'err LIMIT\nok count 20\n#state\n'"$state" \
  "${base[@]}" "--dry add extra t r 7 5 6" "count"

printf 'PASS=%d FAIL=%d\n' "$pass" "$fail"
printf 'failed:%s\n' "$faillist"

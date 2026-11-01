#!/bin/bash
IMPL=/mnt/c/Users/HUAWEI/Documents/deepseek-harness/default-workspace/lisp-toolkit/experiments/timetable-ab/runs/d1-check-macro-1/impl.lisp
pass=0; fail=0; faillist=""
t() {
  local name="$1"; local exp="$2"; shift 2
  local got
  got=$(sbcl --script "$IMPL" "$@" 2>/dev/null)
  if [ "$got" = "$exp" ]; then pass=$((pass+1)); else
    fail=$((fail+1)); faillist="$faillist $name"
    printf 'FAIL %s\n--got--\n%s\n--exp--\n%s\n\n' "$name" "$got" "$exp"
  fi
}

t dash-fields $'ok add 1\n#state\na|-|-|1|1-2' "add a - - 1 1 2"
t tab-sep $'ok add 1\n#state\na|t|r|1|1-2' "$(printf 'add\ta\tt\tr\t1\t1\t2')"
t trailing-space $'ok add 1\n#state\na|t|r|1|1-2' "add a t r 1 1 2   "
t lead-space $'ok add 1\n#state\na|t|r|1|1-2' "   add a t r 1 1 2"
t upper-verb $'ok add 1\n#state\na|t|r|1|1-2' "ADD a t r 1 1 2"

t shift-neg $'ok add 1\nok shift 1\n#state\na|t|r|6|1-2' "add a t r 7 1 2" "shift 7 -1"
t shift-underflow $'ok add 1\nerr BADARG\n#state\na|t|r|1|1-2' "add a t r 1 1 2" "shift 1 -1"
t shift-zero $'ok add 1\nok shift 1\n#state\na|t|r|1|1-2' "add a t r 1 1 2" "shift 1 0"
t shift-notnum $'err BADARG\n#state' "shift 1 +1"

t dry-twice $'err BADARG\n#state' "--dry --dry add a t r 1 1 2"
t dry-unknown $'err BADARG\n#state' "--dry zzz"
t dry-count $'ok add 1\nok count 1\nok sort 0\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "--dry count" "--dry sort"

t keep-notnum $'ok add 1\nerr BADARG\n#state\na|t|r|1|1-2' "add a t r 1 1 2" "keep 1 x"
t keep-negative $'err BADARG\n#state' "keep 1 -1"
t filter-badday $'err BADARG\n#state' "filter 9"
t count-extra $'err BADARG\n#state' "count 1"
t sort-extra $'err BADARG\n#state' "sort 1"

t rename-same $'ok add 1\nok rename 1\n#state\na|t|r|1|1-2' "add a t r 1 1 2" "rename a a"
t rename-long $'ok add 1\nerr BADARG\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "rename a abcdefghijklm"

t copyto-self-slot $'ok add 1\nerr CONFLICT\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "copyTo a 1 1 2"
t copyto-badslot $'ok add 1\nerr BADARG\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "copyTo a 1 3 2"

t promote-full $'ok add 1\nok add 1\nok add 1\nok add 1\nok add 1\nok add 1\nok promote 1\n#state\na1|t|r|1|1-2\na2|t|r|1|3-4\na3|t|r|1|5-6\na4|t|r|1|7-8\na5|t|r|1|9-10\na6|t|r|1|11-12' \
  "add a1 t r 1 1 2" "add a2 t r 1 3 4" "add a3 t r 1 5 6" \
  "add a4 t r 1 7 8" "add a5 t r 1 9 10" "add a6 t r 1 11 12" "promote a6"

t mirror-same-day $'ok add 1\nok mirror 1\n#state\na|t|r|1|1-2\na_m|t|r|1|1-2' \
  "add a t r 1 1 2" "mirror 1 1"

t merge-same-teacher $'ok add 1\nok add 1\nok merge 2\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "add b t r 2 3 4" "merge a b"

t absorb-keeps-b $'ok add 1\nok add 1\nok absorb 2\nok count 2\n#state\na|t2|r2|1|1-2\nb|t2|r2|2|3-4' \
  "add a t1 r1 1 1 2" "add b t2 r2 2 3 4" "absorb a b" "count"

t truncate-ties $'ok add 1\nok add 1\nok truncate 1\n#state\naa|t|r|1|3-4' \
  "add ab t r 1 1 2" "add aa t r 1 3 4" "truncate 1"

t dedupe-many $'ok add 1\nok duplicate 1\nok duplicate 1\nok dedupe 2\nok count 1\n#state\na|t|r|1|1-2' \
  "add a t r 1 1 2" "duplicate a b" "duplicate a c" "dedupe" "count"

t purge-all $'ok add 1\nok purge 1\nok count 0\n#state' \
  "add a t r 1 1 2" "purge t" "count"

t mix-dry-then-real $'ok add 1\nok del 1\nok del 1\nok count 0\n#state' \
  "add a t r 1 1 2" "--dry del a" "del a" "count"

t two-days-swap $'ok add 1\nok add 1\nok swapdays 2\n#state\na|t|r|2|1-2\nb|t|r|1|3-4' \
  "add a t r 1 1 2" "add b t r 2 3 4" "swapDays 1 2"

t swapdays-empty $'ok add 1\nok swapdays 1\n#state\na|t|r|4|1-2' \
  "add a t r 1 1 2" "swapDays 1 4"

printf 'EDGE PASS=%d FAIL=%d\n' "$pass" "$fail"
printf 'failed:%s\n' "$faillist"

# ---- invariant fuzz: every command yields exactly one line, state sorted, no stderr ----
fuzz() {
  local bad=0
  local cmds=(
    "add a t r 1 1 2" "add b t r 1 3 4" "add c t r 2 1 2" "edit a t2 r2"
    "move b 3 1 2" "swap a c" "rename c cc" "duplicate a d" "trim 1 3"
    "copy a 5" "merge a b" "swapTeacher a cc" "swapLoc a cc" "copyTo d 6 1 2"
    "truncate 1" "keep 1 1" "renameTeacher t x" "renameLoc r y" "dedupe"
    "compress 3" "compact" "mirror 2 4" "absorb a b" "swapDays 5 6"
    "promote d" "purge x" "filter 1" "count" "sort" "clear 3"
    "--dry del a" "--dry add z t r 7 12 12" "--dry clear 2" "--dry zzz"
    "del ghost" "--dry" "" "   " "add bad day here 1 1 2"
  )
  local out
  out=$(sbcl --script "$IMPL" "${cmds[@]}" 2>/dev/null)
  local ncmds=${#cmds[@]}
  local total
  total=$(printf '%s\n' "$out" | wc -l)
  local state_lines
  state_lines=$(printf '%s\n' "$out" | sed -n '/^#state$/,$p' | tail -n +2 | wc -l)
  if [ "$total" -ne $(( ncmds + 1 + state_lines )) ]; then
    echo "FUZZ FAIL linecount total=$total expect=$(( ncmds + 1 + state_lines ))"; bad=1
  fi
  if [ "$(printf '%s\n' "$out" | grep -c '^#state$')" -ne 1 ]; then
    echo "FUZZ FAIL state header count"; bad=1
  fi
  if printf '%s\n' "$out" | sed -n '/^#state$/,$p' | tail -n +2 | grep -qvE '^[a-z_0-9]+\|[^|]+\|[^|]+\|[1-7]\|[0-9]+-[0-9]+$'; then
    echo "FUZZ FAIL state line format"; printf '%s\n' "$out" | sed -n '/^#state$/,$p' | tail -n +2 | grep -vE '^[a-z_0-9]+\|[^|]+\|[^|]+\|[1-7]\|[0-9]+-[0-9]+$'; bad=1
  fi
  if printf '%s\n' "$out" | grep -q ' $'; then echo "FUZZ FAIL trailing space"; bad=1; fi
  local errlines
  errlines=$(sbcl --script "$IMPL" "${cmds[@]}" 2>&1 >/dev/null | wc -l)
  if [ "$errlines" -ne 0 ]; then echo "FUZZ FAIL stderr lines=$errlines"; bad=1; fi
  if [ "$bad" -eq 0 ]; then echo "FUZZ OK cmds=$ncmds lines=$total"; fi
}
fuzz

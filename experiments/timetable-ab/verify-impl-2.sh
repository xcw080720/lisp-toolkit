#!/usr/bin/env bash
cd /mnt/c/Users/HUAWEI/Documents/deepseek-harness/default-workspace/lisp-toolkit/experiments/timetable-ab || exit 1
IMPL=runs/nondry-cl-macro/impl.lisp
pass=0; fail=0

chk() {
  local name="$1"; shift
  local want="$1"; shift
  local got
  got=$(sbcl --script "$IMPL" "$@" 2>/dev/null)
  if [ "$got" = "$want" ]; then
    pass=$((pass+1))
  else
    fail=$((fail+1))
    echo "=== FAIL: $name"
    diff <(printf '%s\n' "$want") <(printf '%s\n' "$got") | head -20
  fi
}

chk noargs '#state'

chk empty-state '#state'

chk copyto-conflict 'ok add 1
ok add 1
err CONFLICT
ok count 2
#state
a|t|r|1|1-2
b|u|s|3|1-2' "add a t r 1 1 2" "add b u s 3 1 2" "copyTo a 3 1 2" "count"

chk keep-zero 'ok add 1
ok add 1
ok add 1
ok keep 3
ok count 0
#state' "add a t r 1 1 1" "add b t r 1 2 2" "add c t r 1 3 3" "keep 1 0" "count"

chk dash-fields 'ok add 1
ok count 1
#state
a|-|-|1|1-2' "add a - - 1 1 2" "count"

chk swap-self 'ok add 1
ok swap 2
#state
a|t|r|1|1-2' "add a t r 1 1 2" "swap a a"

chk long-word 'err BADARG
#state' "add abcdefghijklm t r 1 1 1"

chk twelve 'ok add 1
#state
abcdefghijkl|t|r|1|1-2' "add abcdefghijkl t r 1 1 2"

chk readd 'ok add 1
ok del 1
ok add 1
ok count 1
#state
a|u|s|2|5-6' "add a t r 1 1 2" "del a" "add a u s 2 5 6" "count"

chk trim-none 'ok add 1
ok trim 0
#state
a|t|r|1|1-4' "add a t r 1 1 4" "trim 1 12"

chk trim-edge 'ok add 1
ok trim 1
#state
a|t|r|1|1-1' "add a t r 1 1 4" "trim 1 1"

chk arity 'err BADARG
err BADARG
err BADARG
err BADARG
err BADARG
err BADARG
err BADARG
#state' "add" "del" "swap a" "trim 1" "keep 1 2 3" "count 9" "purge"

chk shift-same 'ok add 1
ok shift 1
#state
b|t|r|1|1-2' "add b t r 1 1 2" "shift 1 0"

chk zero-match 'ok add 1
ok renameTeacher 0
ok renameLoc 0
ok purge 0
ok clear 0
ok mirror 0
ok dedupe 0
ok compact 0
ok count 1
#state
a|t|r|1|1-2' "add a t r 1 1 2" "renameTeacher nope x" "renameLoc nope x" "purge nope" \
  "clear 3" "mirror 5 6" "dedupe" "compact" "count"

chk sort-order 'ok add 1
ok add 1
ok add 1
ok sort 0
#state
aa|t|r|1|1-1
ab|t|r|1|2-2
b|t|r|1|3-3' "add b t r 1 3 3" "add ab t r 1 2 2" "add aa t r 1 1 1" "sort"

echo "----"
echo "pass=$pass fail=$fail"
echo "--- stderr must be empty ---"
sbcl --script "$IMPL" "add a t r 1 1 2" "count" 2>&1 >/dev/null | head -5
echo "--- ascii / size / trailing space ---"
LC_ALL=C grep -c $'\r' "$IMPL" || true
LC_ALL=C grep -n '[^ -~]' "$IMPL" | head -5 || true
LC_ALL=C grep -nc ' $' "$IMPL" || true
wc -l < "$IMPL"
head -c 3 "$IMPL" | od -An -tx1

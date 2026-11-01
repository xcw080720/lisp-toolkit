#!/usr/bin/env bash
# self-built conformance battery (derived from the spec text only)
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

chk selfcheck 'ok add 1
ok add 1
ok count 2
#state
math|t1|r1|1|1-2
phys|t2|r2|1|3-4' "add math t1 r1 1 1 2" "add phys t2 r2 1 3 4" "count"

chk errors 'ok add 1
err DUP
err CONFLICT
err NOTFOUND
err BADARG
err BADARG
err BADARG
err BADARG
err BADARG
err BADARG
err BADARG
ok count 1
#state
math|t1|r1|1|1-2' \
  "add math t1 r1 1 1 2" \
  "add math t9 r9 2 1 2" \
  "add chem t3 r3 1 2 3" \
  "del nope" \
  "add x" \
  "" \
  "   " \
  "bogus a" \
  "add longname12345 t r 3 1 1" \
  "add zz t r 0 1 1" \
  "add zz t r 1 13 13" \
  "count"

chk badrange 'err BADARG
#state' "add a t r 1 9 3"

chk trim 'ok add 1
ok add 1
ok add 1
ok trim 1
ok count 3
#state
a|t|r|1|1-3
b|u|s|1|5-6
c|v|w|2|1-2' "add a t r 1 1 4" "add b u s 1 5 6" "add c v w 2 1 2" "trim 1 3" "count"

chk shift 'ok add 1
ok add 1
err BADARG
ok shift 2
ok shift 2
ok filter 2
#state
a|t|r|2|1-2
b|u|s|2|3-4' "add a t r 1 1 2" "add b u s 1 3 4" "shift 1 7" "shift 1 2" "shift 3 -1" "filter 2"

chk swappairs 'ok add 1
ok add 1
ok swap 2
ok swapTeacher 2
ok swapLoc 2
ok count 2
#state
a|t2|r2|1|3-4
b|t1|r1|1|1-2' "add a t1 r1 1 1 2" "add b t2 r2 1 3 4" "swap a b" "swapTeacher a b" "swapLoc a b" "count"

chk names 'ok add 1
ok add 1
ok rename 1
err DUP
ok rename 1
ok duplicate 1
err DUP
ok copy 1
ok copyTo 1
err DUP
ok copyTo 1
#state
b|t|r|1|1-2
bb|t|r|1|1-2
bb_2|t|r|2|1-2
bb_3|t|r|3|5-6
c|u|s|1|3-4
c_3|u|s|3|1-2' \
  "add a t r 1 1 2" "add c u s 1 3 4" "rename a b" "rename b c" "rename b b" \
  "duplicate b bb" "duplicate b bb" "copy bb 2" "copyTo bb 3 5 6" "copyTo bb 3 5 6" \
  "copyTo c 3 1 2"

chk merges 'ok add 1
ok add 1
ok add 1
ok merge 2
ok renameTeacher 1
ok renameLoc 1
ok absorb 2
ok purge 2
ok count 0
#state' "add a t1 r1 1 1 2" "add b t2 r2 1 3 4" "add c t1 r9 2 1 2" \
  "merge a b" "renameTeacher t1 t9" "renameLoc r9 rz" "absorb a c" "purge t9" "count"

chk swapdays 'ok add 1
ok add 1
ok swapDays 2
ok count 2
#state
a|t|r|2|1-2
b|u|s|1|1-2' "add a t r 1 1 2" "add b u s 2 1 2" "swapDays 1 2" "count"

chk swapdays-conflict 'ok add 1
ok duplicate 1
err CONFLICT
ok count 2
#state
x|t|r|3|1-2
xx|t|r|3|1-2' "add x t r 3 1 2" "duplicate x xx" "swapDays 3 4" "count"

chk trunc-keep 'ok add 1
ok add 1
ok add 1
ok truncate 2
ok add 1
ok add 1
ok keep 1
ok count 2
#state
a|t|r|1|1-1
b|t|r|1|2-2' "add a t r 1 1 1" "add b t r 1 2 2" "add c t r 1 3 3" "truncate 1" \
  "add b t r 1 2 2" "add c t r 1 3 3" "keep 1 2" "count"

chk dedupe 'ok add 1
ok duplicate 1
ok dedupe 1
ok count 1
#state
a|t|r|1|1-2' "add a t r 1 1 2" "duplicate a a2" "dedupe" "count"

chk compress 'ok add 1
ok add 1
ok compress 2
#state
a|t|r|1|1-2
b|u|s|1|2-3' "add a t r 1 1 1" "add b u s 1 5 6" "compress 1"

chk compact 'ok add 1
ok compact 1
#state
a|t|r|2|1-2' "add a t r 2 3 4" "compact"

chk mirror 'ok add 1
ok mirror 1
err DUP
ok count 2
#state
a|t|r|1|1-2
a_m|t|r|2|1-2' "add a t r 1 1 2" "mirror 1 2" "mirror 1 2" "count"

chk promote 'ok add 1
ok add 1
ok add 1
ok promote 1
ok count 3
#state
a|t|r|1|4-5
b|u|s|1|1-1
c|v|w|1|3-3' "add b u s 1 1 1" "add c v w 1 3 3" "add a t r 1 5 6" "promote a" "count"

chk sort-filter 'ok add 1
ok add 1
ok sort 0
ok filter 1
ok filter 1
ok count 2
#state
a|t|r|2|1-2
z|u|s|1|1-2' "add z u s 1 1 2" "add a t r 2 1 2" "sort" "filter 2" "filter 1" "count"

# 20 courses then a 21st add
names=(a b c d e f g h i j k l m n o p q r s u)
args20=()
exp=""
for i in $(seq 0 19); do
  dd=$(( i / 12 + 1 ))
  ff=$(( i % 12 + 1 ))
  args20+=("add ${names[$i]} t r $dd $ff $ff")
  exp+=$'ok add 1\n'
done
args20+=("add v v t 3 1 3")
exp+=$'err LIMIT\n#state\n'
for i in $(seq 0 19); do
  dd=$(( i / 12 + 1 ))
  ff=$(( i % 12 + 1 ))
  printf -v ln '%s|t|r|%d|%d-%d' "${names[$i]}" "$dd" "$ff" "$ff"
  exp+="$ln"$'\n'
done
exp=${exp%$'\n'}
chk limit "$exp" "${args20[@]}"

chk move-edit 'ok add 1
ok add 1
ok move 1
ok edit 1
err CONFLICT
ok count 2
#state
a|tt|rr|2|1-2
b|u|s|2|3-3' "add a t r 1 1 2" "add b u s 2 3 3" "move a 2 1 2" "edit a tt rr" "move b 2 1 2" "count"

chk clear 'ok add 1
ok add 1
ok clear 2
ok clear 0
ok count 0
#state' "add a t r 1 1 2" "add b u s 1 3 4" "clear 1" "clear 1" "count"

chk delnotfound 'err NOTFOUND
#state' "del ghost"

chk unknown 'err BADARG
#state' "swaps a b"

echo "----"
echo "pass=$pass fail=$fail"

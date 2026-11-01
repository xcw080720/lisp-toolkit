#!/bin/bash
D=/mnt/c/Users/HUAWEI/Documents/deepseek-harness/default-workspace/lisp-toolkit/experiments/timetable-ab
F="$D/runs/d1-check-macro-1/impl.lisp"
echo "=== bytes/lines ==="
wc -c -l "$F"
echo "=== non-ascii bytes (expect none) ==="
LC_ALL=C grep -nP '[\x80-\xFF]' "$F" | head -5
echo "(non-ascii scan done)"
echo "=== CR check ==="
LC_ALL=C grep -c $'\r' "$F" || true
echo "=== forbidden io/json/serialization tokens (expect none) ==="
grep -nE 'with-open-file|open \(|open\(|open "|read-sequence|write-sequence|pathname|truename|probe-file|directory \(|load \(|require|asdf|quicklisp|json|json-|yason|cffi|uiop' "$F" | head -20
echo "(io scan done)"
echo "=== defined ops count ==="
grep -c '^(defop "' "$F"
echo "=== defun/defmacro names ==="
grep -oE '^\((defun|defmacro) [^ ]+' "$F" | sed 's/^(defun //; s/^(defmacro //' | tr '\n' ' '
echo
echo "=== stderr on plain run (expect empty) ==="
sbcl --script "$F" "count" 2>/tmp/err.txt >/tmp/out.txt
echo "stderr-bytes=$(wc -c < /tmp/err.txt)"
cat /tmp/out.txt

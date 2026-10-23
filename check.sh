#!/bin/sh
# lisp-toolkit / check.sh -- one command, POSIX.
# Requires SBCL on PATH, or: SBCL=/usr/local/bin/sbcl ./check.sh
set -u
SBCL_BIN=${SBCL:-sbcl}
if ! command -v "$SBCL_BIN" >/dev/null 2>&1; then
    echo "sbcl not found. Install it (apt install sbcl / brew install sbcl) or set SBCL=/path/to/sbcl"
    exit 127
fi

cd "$(dirname "$0")" || exit 1
fail=0

echo "== check-parens =="
"$SBCL_BIN" --script tools/check-parens.lisp tools || fail=$((fail + 1))

echo
echo "== check-format =="
"$SBCL_BIN" --script tools/check-format.lisp tools || fail=$((fail + 1))

echo
echo "== check-encoding =="
"$SBCL_BIN" --script tools/check-encoding.lisp tools README.md check.sh check.cmd skills || fail=$((fail + 1))

echo
echo "== advisory: check-touches (tools/*.lisp) =="
for f in tools/*.lisp; do "$SBCL_BIN" --script tools/check-touches.lisp "$f" || true; done

echo
if [ "$fail" -eq 0 ]; then echo "-- all checks passed"; else echo "-- $fail check group(s) failed"; fi
exit "$fail"

# Task B: secondary-school timetable (English)

> Frozen. Do not edit during runs. Any edit makes it a new task and voids the run.

## Data model

```json
{"lessons":[{"subject":"Math","room":"R101","day":"Mon","period":1,
             "weeks":{"type":"term","from":1,"to":36}}]}
```

- `day` ∈ `Mon | Tue | Wed | Thu | Fri` (no weekends)
- `period` ∈ 1..8
- `weeks.type` ∈ `term | odd | even`; each carries `from`/`to`

## Op set (4)

| op | fields | meaning | constraints |
|---|---|---|---|
| `create` | `lesson` | append a lesson | `subject` required; missing `weeks` → `term 1..36` |
| `drop` | `match` | remove lessons whose subject contains `match` | empty/0 hits → log "not found" |
| `change` | `match`, `set` | patch matched lessons | only keys present in `set`; `period` clamped to 1..8 |
| `swap` | `match`, `with` | swap time slots with the lesson matching `with` | both must match exactly 1 lesson each, else no-op + log |

## Output contract (identical in both languages)

Executable takes **one** JSON file path as argv[1] and prints **one** JSON object:

```json
{"opsText":"drop \\\"Math\\\"","lessons":[...],"log":["dropped 1 lesson"],"n":1}
```

- `opsText`: English confirmation text, ops joined with `; `, empty string when no ops
- `lessons`: full timetable after applying (order preserved; new lessons appended)
- `log`: one line per op, English
- `n`: number of lessons actually affected

Entry points:

- JS: `node impl.js input.json`
- Lisp: `sbcl --script impl.lisp input.json`

## Constraints that will be asserted

1. `create` missing `weeks` → defaults to `term 1..36`
2. `drop` matching 2 lessons → `n += 2`, log states the count
3. `change` with `period=0` → no change (must not clamp up to 1) and log says so
4. `swap` when either side matches 0 or >1 lessons → no-op + log
5. unknown op (`op:"nope"`) → must appear in `log`, never silent
6. empty `ops` → `opsText` empty, `n=0`, `log=[]`

## Not done if

- output is not valid JSON
- field names differ from the contract (e.g. `periodFrom` instead of `period`)
- unknown ops are silently ignored

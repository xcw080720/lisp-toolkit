# timetable-ab raw data v1.0.1

Two control arms added, both run against my own conclusions. **Neither overturned them; both narrowed them.**

## What is new

### `runs/n5-cl-1..5` and `runs/n5-js-1..5`

One single-defect patient (log numbering off-by-one) copied ten times, five per language,
handed to ten isolated agents who could not see each other.

```
10 / 10   fixed in one round, at the same line, with zero wrong hypotheses
CL        detection latency median 9s (1–12)
JS        detection latency median 8s (6–14)   intervals overlapping
```

The point is not the timing. The point is that **variance is zero everywhere except the
clock** — which is what a ceiling looks like from the inside.

### `linter/`

Four independent defect classes planted in a healthy JS file and a healthy CL file, scored
against the default toolchain and against eslint.

| Defect class | `node --check` | `eslint no-undef` | `sbcl compile-file` |
|---|---|---|---|
| A free identifier typo | 0 | **caught** | **caught** |
| B function name typo | 0 | **caught** | **caught** |
| C property / keyword name typo | 0 | missed | **not measured** (plant failed) |
| D semantic constant flip (7 → 6) | 0 | missed | missed |

## What changed in the write-up

| Item | Was | Now |
|---|---|---|
| Static checking | Lisp has it, JS does not | **Lisp needs no configuration, JS needs one install — friction, not capability** |
| Diagnosis speed | undecidable (n=1) | **decidable, and the effect is zero (n=5+5)** |
| Rework rounds | constant 1, location random | **variance zero (10/10 one round, same line, zero wrong hypotheses)** |

**Nothing was overturned. Everything got narrower.** Narrow is harder, because narrow has to
survive more objections.

## Disclosure

The C-class plant on the CL side **never landed**: the string I tried to replace did not
exist in the source, so that cell is *not measured*, not *also missed*. Recorded in
`linter/README.md`.

A replacement has to be verified as having happened before its effect is verified. The JS
side got that check. The CL side did not, and one cell was lost.

## Recompute

```bash
node experiments/timetable-ab/check-scale.cjs --impl experiments/timetable-ab/runs/n5-cl-1/impl.lisp
node experiments/timetable-ab/metric.cjs experiments/timetable-ab/runs/f-python/impl.py
node experiments/timetable-ab/gate.cjs

# linter arm
cd experiments/timetable-ab/linter
npm install --no-save eslint@8
node_modules/.bin/eslint --no-ignore --no-eslintrc -c .eslintrc.json --format json A-freevar.js
```

## Cite

```
许宸玮. (2026). timetable-ab: a controlled cross-language comparison of
abstract-structure cost (Version 1.0.1) [Data set]. Zenodo.
https://doi.org/10.5281/zenodo.23618045   ← version DOI for 1.0.1 is minted on release
```

Concept DOI for all versions: `10.5281/zenodo.23618044`

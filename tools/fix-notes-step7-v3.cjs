#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', '.zenodo.json');
const j = JSON.parse(fs.readFileSync(p, 'utf8'));

const startMark = 'THE FIRST VERSION OF STEP 7 HAD A HOLE';
const endMark = 'not the criterion missing it. ';
const i = j.notes.indexOf(startMark);
const e = j.notes.indexOf(endMark);
if (i < 0 || e < 0) { console.error('anchor missing', i, e); process.exit(1); }

const rep = 'STEP 7 WAS REWRITTEN THREE TIMES, AND EACH ROUND WAS CAUGHT BY A BLIND SUBAGENT. '
  + 'V1: String.includes on the description. A subagent changed one occurrence of v1.7.6 to v1.7.60 and the check still passed - the most ordinary typo there is. '
  + 'V2: bounded regular expression. The first attempt forbade dots in the lookbehind as well as digits, so the notes sentence "...not evidence.v1.7.6 (2026-11-02)" - where the version follows a full stop - was judged as missing the version, and three tests went red on the same sentence. Red for the wrong reason is a fake test. Fixed to forbid digits only; four tests then passed. '
  + 'A second round then found two more greens: changing ONLY the first occurrence to v1.7.60 passed (the criterion asked "mentioned somewhere", not "the first sentence is right"), and setting version to 1.7 on both sides passed (the version was pasted into the regex as a literal, and v1.7 is followed by a dot, so the right boundary held). '
  + 'V3: no regular expression at all. Three parts: the version must match ^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$, rejecting leading zeros; every vX.Y[.Z] in notes and description is extracted and the current version must be exactly in that list; and the FIRST version number in the description must equal the current version, because the first sentence is the one a reader sees. '
  + 'SIX TESTS: full replacement fails; only-the-first-occurrence fails on "first version is v1.7.60"; version=1.7 fails on "not three-part"; reordering authors passes; one extra author fails; restore passes with byte-identical hashes. '
  + 'KNOWN AND DELIBERATELY NOT CLOSED, stated in the code comment rather than left implicit: v1.7.6.1 and v1.7.6x are extracted as "1.7.6", and extraction runs over raw text so an HTML attribute value also counts as an occurrence. These require deliberate construction, and what this criterion protects against is forgetting to bump the version - which is what actually happened in v1.7.5 - not an adversary. Adding criteria for inputs that cannot occur naturally is the same error as manufacturing green. '
  + 'A test-design error is recorded too: the first attempt at the full-replacement test changed only one of the two occurrences and therefore passed; that was the test not being thorough, not the criterion being blind. ';

j.notes = j.notes.slice(0, i) + rep + j.notes.slice(e + endMark.length);
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('ok, len =', j.notes.length);
console.log('has V3:', j.notes.includes('V3: no regular expression'));

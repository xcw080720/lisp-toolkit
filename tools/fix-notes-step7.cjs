#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', '.zenodo.json');
const j = JSON.parse(fs.readFileSync(p, 'utf8'));

const anchor = 'This step fails on the v1.7.5 state and passes on the current one; both directions were observed.';
if (!j.notes.includes(anchor)) { console.error('anchor missing'); process.exit(1); }

const ins = 'This step fails on the v1.7.5 state and passes on the current one; both directions were observed. '
  + 'THE FIRST VERSION OF STEP 7 HAD A HOLE AND IT WAS FOUND BY A BLIND SUBAGENT: the version check used String.includes, so changing one occurrence of v1.7.6 in the description to v1.7.60 still passed - the most ordinary typo there is. Tightened to a bounded regular expression. The FIRST tightening was also wrong: the lookbehind forbade dots as well as digits, and the notes contain "...not evidence.v1.7.6 (2026-11-02)", so normal text was judged as missing the version and three tests went red on the same sentence - red for the wrong reason, which is a fake test. The lookbehind now forbids digits only. The authors/contributors comparison was changed from ordered element-wise to sorted, because the requirement is set equality and a reordered author list should not be an error. '
  + 'FOUR TESTS: replacing both occurrences with v1.7.60 fails on "description has no v1.7.6"; reordering authors while keeping the same set passes; adding one author to only one side fails on the mismatch; restoring everything passes. One test design error is recorded too: the first attempt at the first test replaced only one of the two occurrences and therefore passed - that was the test not being thorough, not the criterion missing it. ';

j.notes = j.notes.replace(anchor, ins);
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('ok:', j.notes.includes('HAD A HOLE AND IT WAS FOUND'));
console.log('len =', j.notes.length);

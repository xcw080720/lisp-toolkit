#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', '.zenodo.json');
const j = JSON.parse(fs.readFileSync(p, 'utf8'));

const anchor = 'STILL OPEN, recorded: the full counterexample replay is not a gate step;';
if (!j.notes.includes(anchor)) { console.error('anchor missing'); process.exit(1); }

const ins = 'BLIND REPLICATION of the matrix: an independent subagent rebuilt the clean base from runs/full-js-inline/impl.js without reading the first one and produced a byte-identical file (sha256 616E2E96...0AB); of the first 25 mutants, 24 red sets matched exactly and one row had been omitted from the summary (add not checking to<from, #33); the second batch of 7 matched 7/7. Union of both batches: 45 of 84. Three limits the replica raised are recorded rather than argued with: the count is a function of how each mutant is written (differing trim and clear variants move it by one criterion each), #60 and #75 test the consistency of the reported n rather than trim semantics, and #36 is a catch-all that three unrelated mutants trip, so it is not an independent signal. #37 #38 #39 were lit by no mutant, but they already have counterexamples - eight of the ten cells go red on them - so the lower bound for "an implementation exists that makes this criterion fail" is 48 of 84, not 45. Also corrected: #37 #38 #39 are content criteria on the camel-case output, so the matrix and the real failures do not overlap much. ';

j.notes = j.notes.replace(anchor, ins + anchor);
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('inserted:', j.notes.includes('BLIND REPLICATION'));
console.log('len =', j.notes.length);

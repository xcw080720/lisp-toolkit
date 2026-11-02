#!/usr/bin/env node
// 第七步之后又加了第八步（反例仍能红），把三处陈述同步成真的。
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..');

// 1) CITATION.cff：steps 5-7 → 5-8
const cPath = path.join(R, 'CITATION.cff');
let c = fs.readFileSync(cPath, 'utf8');
if (!c.includes('regression-gate steps 5-7')) { console.error('CITATION 里找不到 steps 5-7'); process.exit(1); }
c = c.replace('regression-gate steps 5-7', 'regression-gate steps 5-8');
fs.writeFileSync(cPath, c, 'utf8');

// 2) .zenodo.json
const zPath = path.join(R, '.zenodo.json');
const j = JSON.parse(fs.readFileSync(zPath, 'utf8'));

const beforeDesc = j.description;
j.description = j.description.replace(
  'Still open: the counterexample step is not wired into the gate.',
  'Step 8 samples four counterexamples and compares the red set they produce against <code>counterexamples/matrix.tsv</code>, so the gate now checks that the criteria can still fail, not merely that they are unchanged. A full 25-mutant replay is not wired in - it takes about 3.5 minutes - so the sample is deterministic but partial.'
);
if (j.description === beforeDesc) { console.error('description 里找不到那句 still open'); process.exit(1); }

j.notes = j.notes.replace(
  '  STILL OPEN, recorded: the counterexample matrix is not yet wired into the gate as a step;',
  '  STEP 8 ADDED: the counterexample matrix is now sampled by the gate. Four mutants (first, two thirds points, last) are re-run and their red sets compared against counterexamples/matrix.tsv; a mismatch names the mutant and both sets. Destruction test: editing one row of matrix.tsv (#4 #57 to #4) produced "1 mismatch, FAIL, naming add-noclash (recorded #4 / now #4 #57)"; restored byte-identical, PASS. This closes the hole that v1.7.5 notes had recorded as still open. A full 25-mutant replay is not wired in; 3.5 minutes is too slow for a default gate. '
  + 'STILL OPEN, recorded: the full counterexample replay is not a gate step;'
);

fs.writeFileSync(zPath, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('CITATION: steps 5-8 ok');
console.log('description: step 8 ok');
console.log('notes: step 8 ok');

#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', '.zenodo.json');
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
let n = j.notes;

function sub(from, to, label) {
  if (!n.includes(from)) { console.error('[MISS] ' + label); return false; }
  n = n.replace(from, to);
  console.log('[OK]   ' + label);
  return true;
}

sub('gate steps 5-7 and the record of self-correction', 'gate steps 5-8 and the record of self-correction', 'contributor text 5-7 -> 5-8');

sub('STILL OPEN, recorded: the counterexample matrix is not yet wired into the gate as a step;',
  'STEP 8 ADDED: the counterexample matrix is now sampled by the gate. Four mutants (first, two thirds points, last) are re-run and their red sets compared against counterexamples/matrix.tsv; a mismatch names the mutant and both sets. Destruction test: editing one row of matrix.tsv (#4 #57 to #4) produced "1 mismatch, FAIL, naming add-noclash (recorded #4 / now #4 #57)"; restored byte-identical, PASS. This closes the hole that v1.7.5 had recorded as still open. A full 25-mutant replay is not a gate step - 3.5 minutes is too slow for a default run. '
  + 'STILL OPEN, recorded: the full counterexample replay is not a gate step;',
  'insert STEP 8');

sub('14 frozen specifications (5 FREEZE records)',
  'a stated count of 14 frozen specifications, against the FREEZE records actually on disk',
  'freeze count wording');

fs.writeFileSync(p, JSON.stringify({ ...j, notes: n }, null, 2) + '\n', 'utf8');
console.log('notes len =', n.length);
console.log('has STEP 8:', n.includes('STEP 8 ADDED'));
console.log('has 5-8:', n.includes('gate steps 5-8'));

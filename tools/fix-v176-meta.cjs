#!/usr/bin/env node
// v1.7.6 元数据：version、description 重写、notes 追加 v1.7.6 段。
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const p = path.join(ROOT, '.zenodo.json');
const j = JSON.parse(fs.readFileSync(p, 'utf8'));

j.version = '1.7.6';

j.description = [
  '<p><strong>Current state (v1.7.6, 2026-11-02).</strong> This description states current values. Earlier revision notes remain in the version history; where an older note quotes a figure this one supersedes, this one governs.</p>',

  '<p><strong>The headline numbers.</strong> Language effect: inline JavaScript/Common Lisp = 1.008x (95% CI [0.829, 1.116]); abstraction = 1.007x ([0.879, 1.095]). Both intervals cross 1.0, so "identical" cannot be excluded. What survives is the writing style, not the language: collapsing repetition into one place saves 17% of characters (ratio 1.200x; as a saving interval 7.2%-30.7% in Common Lisp and 6.8%-26.6% in JavaScript, derived as 1 - 1/ratio from the ratio intervals [1.0771, 1.4423] and [1.0725, 1.3619] given in <code>v4-ratios.tsv</code>). Two earlier figures are withdrawn and named here rather than deleted: the "28-40% saving" (v1.6.0) and the "1.93x" language ratio quoted in older notes, which compared different abstraction levels, unequal JSON ecosystems and repeatedly registered runs.</p>',

  '<p><strong>What is re-checkable, and what is not.</strong> Two languages, a 15-operator specification, 36 invariants, plus 24 cells with archived prompts and frozen spec/criteria hashes. A second layer of 13 independent implementations under 80 invariants is kept as a prior account. Runs that did not archive their task descriptions are reported as observations, never as evidence.</p>',

  '<p><strong>Criteria self-audit (v1.7.0-v1.7.2).</strong> 88 criteria = 84 content + 2 form + 2 method (the numbers 81 and 82 are deliberately vacant, because H1/H2 live in a separate file), each newly added one proven able to fail by a counterexample. Three findings are recorded rather than hidden: the 36 scale criteria kill 0 of 12 mutants while the gate only ran the scale set; every assertion sits behind <code>JSON.parse</code>, so serialisation fidelity is constrained by nothing; and three mutants - leading whitespace, <code>require("fs")</code>, a <code>JSON.parse</code> call - are invisible to all 84 content criteria, caught only by H1/S1/S2 respectively. At v1.7.0, 8 of 84 content criteria had a counterexample; <code>experiments/timetable-ab/counterexamples/</code> now ships a clean 84/84 base plus a mutation matrix that records, for each mutant, exactly which criteria turn red.</p>',

  '<p><strong>Undecidability is still the point.</strong> Established (3), refuted (3), undecidable (6). Missing conditions: C1 no weak-executor channel; C2 no exclusive machine or clock alignment; C3 a single model family. Incomplete rather than missing: C4 silent-failure coverage - 12 mutants audited, 8 killed, 4 survivors all classified, zero Class-A blind spots, which is not the same as "no blind spots"; C5 scale (at most 30 ops, at most 1k lines).</p>',

  '<p><strong>Protocol results.</strong> Expansion-time rejection (19/19 with validation off, load-time failure with it on); zero ceremony cost (0/0 manual edits); live-image REPL saves characters (9028 to 5957). S-expressions are not the most compact (CL 7506 vs JS 5933 characters at 5 ops); skill-pack intervention showed no main effect (0/6).</p>',

  '<p><strong>Gate and packaging (v1.7.5-v1.7.6).</strong> The regression gate now guards the v3-full criteria set by fingerprint, the frozen files by hash, and the release metadata itself: version must agree between <code>CITATION.cff</code> and <code>.zenodo.json</code>, the citation DOI must be the concept DOI, authors and contributors must agree on both sides, and both the notes and this description must mention the current version. Every added step was put through a destruction test - edited to break, observed to fail, restored, observed to pass - because a check that has never failed is not known to be a check. Still open: the counterexample step is not wired into the gate.</p>',

  '<p><strong>What this dataset does not do.</strong> It does not read "not detected" as "not present"; it does not extrapolate beyond the measured scale; it does not delete data - the timing columns, the retired line-count metric and all nineteen recorded failures of the measurement apparatus remain in the chronicle, annotated with their scope.</p>',

  '<p><strong>Included:</strong> run artefacts, frozen specifications (5 FREEZE records), the 36 invariants with their go-red proofs, mutation scores with sample-size bounds, <code>CONDITIONS.md</code>, <code>results.tsv</code> with <code>RESULTS-SCHEMA.md</code>, an append-only chronicle (2678 lines, E-01 through E-04), <code>CLAIMS.md</code>, and the criteria-engineering documents (<code>SPEC-AUDIT.md</code>, <code>CRITERIA-ENGINEERING.md</code>, <code>C4-REPORT.md</code>, <code>ATTACK-WEAK-COVERAGE.md</code>, <code>DO-NOT-MODIFY.md</code>). <strong>Excluded:</strong> compiled binaries, build caches, machine-local temporary files, personal data.</p>',

  '<p><strong>Intended use:</strong> replication of the measurement protocol; reuse of the mutation-testing gate as a way to audit one\'s own criteria; and an empirical basis for benchmark-validity work in LLM code generation.</p>',
].join('');

const seg = 'v1.7.6 (2026-11-02): the contributor record had never been updated, and the public description had stopped at v1.6.3. BOTH ARE FIXED. '
  + 'THE CONTRIBUTOR GAP: CITATION.cff put the assistant into the authors list with two fields that the CFF 1.2.0 schema does not allow there (type, contribution - additionalProperties is false on definitions.person), and carried no contributors section at all; .zenodo.json had the contributor but with no description of what was contributed, and that entry had not changed since the first commit. '
  + 'The citation now has a real contributors section whose text covers the criteria engineering, the blind-replication driver, gate steps 5-7 and the record of self-correction, and both files name the same two parties. '
  + 'THE DESCRIPTION GAP, which is the more serious of the two: the record description - the text a reader sees first, byte-identical to what was published for v1.7.5 - still opened with v1.6.3 and stated nothing about v1.7.0 through v1.7.5. It also carried three withdrawn values as live results: the interval lower bound 0.825 (corrected to 0.829 in v1.7.3, 18 occurrences), "1.93x" as refuted evidence (withdrawn in v1.6.0), and "nine surviving mutants" (superseded by the C4 audit: 12 mutants, 8 killed, 4 survivors classified, zero Class-A blind spots). Two further counts were stale: a 2318-line chronicle (now 2678) and 14 frozen specifications (5 FREEZE records). The description is rewritten to state current values; the withdrawn figures are named as withdrawn rather than removed. '
  + 'THE CITATION DOI, third time: v1.7.5 notes claimed "both now read 1.7.5" while CITATION.cff still pointed at 10.5281/zenodo.23871162, the v1.7.4 record. The version had been changed and the DOI had not. It is now the concept DOI 10.5281/zenodo.23618044, so that it cannot fall behind a release again. '
  + 'STEP 7 ADDED to the gate, and this is why the failure can be caught mechanically: version equality between CITATION.cff and .zenodo.json; citation DOI must be the concept DOI; authors must equal creators and contributors must equal contributors on both sides; and both notes and description must mention the current version. This step fails on the v1.7.5 state and passes on the current one; both directions were observed. '
  + 'CORRECTED IN PASSING: CLAIMS.md claim-31 still stated the saving interval as "[7%, 29-36%]", mixing the two languages and using the two upper bounds that v1.7.4 had identified as wrong; it now gives 7.2%-30.7% (CL) and 6.8%-26.6% (JS) with the derivation. README.md still pointed new readers at tools/gate.cjs, which is the early general-purpose gate and does not contain steps 5-7; the pointer now names experiments/timetable-ab/gate.cjs and says what the difference is. '
  + 'MEASURED THIS RELEASE, not prose: the ten-cell baseline was re-run end to end and the raw stdout kept under experiments/timetable-ab/baseline-v17/ - 10 cells, 255.1 s total, 8 cells at 78/84 and 2 at 84/84, every score at or above the recorded floor, and the six red criteria identical in every cell (#37 #38 #39 #42 #43 #49, the camel-case verb line). The recorded cost of "65-77 seconds per Common Lisp cell, roughly twelve minutes" was wrong: the actual range is 25.0-37.7 s per Lisp cell and 8.1-8.2 s per JavaScript cell. '
  + 'ALSO MEASURED: a clean 84/84 base (counterexamples/base-clean.js) was reconstructed, and a mutation matrix was run over it, so that each mutant now ships with the exact set of criteria it turns red. The point is not to produce red output but to answer a countable question: for how many of the 84 content criteria does an implementation exist that makes that criterion fail? '
  + 'STILL OPEN, recorded: the counterexample matrix is not yet wired into the gate as a step; 12 releases from v1.1.0 to v1.6.4 have no RELEASE-NOTES file; and git HEAD still sits at the v1.6.3 commit, so the "rebuilt from the named git commit" chain does not cover v1.7.x. No measurement, criterion or dataset value changed in this release.';

j.notes = String(j.notes || '').replace(/\s+$/, ' ') + seg;

fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('version =', j.version);
console.log('description len =', j.description.length);
console.log('notes len =', j.notes.length);

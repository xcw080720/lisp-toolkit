#!/usr/bin/env node
// 一次性扫描：找 1.7.5 之后还落后的版本号 / 版本与 DOI 错配。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'runs', 'tmp', 'archive-zips']);
const EXT = new Set(['.md', '.cff', '.json', '.html', '.txt']);

const KNOWN = {
  '23859509': '1.7.0', '23859788': '1.7.1', '23859892': '1.7.2',
  '23860573': '1.7.3', '23871162': '1.7.4', '23872219': '1.7.5',
  '23618044': 'concept', '23835156': 'v1.5.3', '23858220': '1.6.4',
};

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); }
    else if (EXT.has(path.extname(e.name).toLowerCase())) files.push(p);
  }
})(ROOT);

const lag = [];
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  const verses = new Set();
  const hits = [];
  lines.forEach((ln, i) => {
    let m;
    const re = /1\.7\.(\d+)/g;
    while ((m = re.exec(ln))) verses.add('1.7.' + m[1]);
    // 版本与相邻 DOI 错配
    const v = ln.match(/1\.7\.\d/);
    const did = ln.match(/zenodo\.(\d{8})|\b(23\d{6})\b/g);
    if (v && did) {
      for (const raw of did) {
        const id = (raw.match(/(\d{8})$/) || [])[1];
        if (id && KNOWN[id] && KNOWN[id] !== 'concept' && KNOWN[id].startsWith('1.7')
            && KNOWN[id] !== v[0] && !/supersed|ignored|撤回|撤回/ .test(ln)) {
          hits.push(`${i + 1}: says ${v[0]} with doi ${id}(=${KNOWN[id]}) :: ${ln.trim().slice(0, 140)}`);
        }
      }
    }
  });
  const arr = [...verses].sort((a, b) => +a.split('.')[2] - +b.split('.')[2]);
  const maxV = arr[arr.length - 1];
  if (maxV && maxV !== '1.7.5') lag.push({ rel, maxV, n: arr.length });
  if (hits.length) { console.log(`[MISMATCH] ${rel}`); hits.forEach(h => console.log('   ' + h)); }
}

console.log('\n=== 版本号最高只到 1.7.x（未含 1.7.5）===');
for (const r of lag.sort((a, b) => a.rel.localeCompare(b.rel))) console.log(`${r.maxV.padEnd(6)} ${r.rel}`);
console.log(`\n文件 ${files.length}；落后 ${lag.length}`);

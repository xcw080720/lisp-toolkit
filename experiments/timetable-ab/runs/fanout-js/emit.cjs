'use strict';
// emit.cjs — 声明驱动生成器：decls.json 是唯一真源，5 样产物每次整份重写，禁止手改。
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const RESERVED = new Set(('break case catch class const continue debugger default delete do else enum export '
  + 'extends false finally for function if import in instanceof new null return super switch this throw true '
  + 'try typeof var void while with yield let static implements interface package private protected public await').split(' '));

const decls = () => JSON.parse(fs.readFileSync(path.join(DIR, 'decls.json'), 'utf8'));
const ops = (d) => Object.entries(d);
const render = (tpl) => String(tpl == null ? '' : tpl).replace(/\{([^{}]+)\}/g, (_, e) => '<' + e.trim() + '>');
const ident = (p) => /^[A-Za-z_$][\w$]*$/.test(p) && !RESERVED.has(p);
const line = (t) => t + '\n';

// ---- 产物 1/5：确认文案 ----
const opsText = (d) => line(ops(d).map(([n, s]) => `${n}\t${render(s.text)}`).join('\n'));

// ---- 产物 2/5：schema ----
const schema = (d) => {
  const out = {};
  for (const [n, s] of ops(d)) out[n] = { params: s.params || [], required: s.required || [], text: render(s.text) };
  return JSON.stringify(out, null, 2) + '\n';
};

// ---- 产物 3/5：客户端存根 ----
const client = (d) => {
  const L = ['// client.js — 由 emit.cjs 从 decls.json 生成，勿手改。', "'use strict';", ''];
  for (const [n, s] of ops(d)) {
    const ps = s.params || [];
    const sp = ps.map((p) => (ident(p) ? p : p + '$')); // JS 保留字（如 with）不能当形参名
    if (sp.join() !== ps.join()) L.push(`// ${n}(${ps.join(', ')})  ← 声明原名；${ps.filter((p) => !ident(p)).join(',')} 是保留字`);
    L.push(`function ${n}(${sp.join(', ')}) {`);
    L.push(`  return { op: ${JSON.stringify(n)}, args: { ${ps.map((p, i) => `${JSON.stringify(p)}: ${sp[i]}`).join(', ')} } };`);
    L.push('}', '');
  }
  L.push('module.exports = { ' + ops(d).map(([n]) => n).join(', ') + ' };');
  return line(L.join('\n'));
};

// ---- 产物 4/5：测试样例 ----
const tests = (d) => JSON.stringify(ops(d).map(([n, s]) => ({
  name: `${n}.sample`,
  op: n,
  params: s.params || [],
  required: s.required || [],
  args: Object.fromEntries((s.params || []).map((p) => [p, '<' + p + '>'])),
  expect: 'ok',
})), null, 2) + '\n';

// ---- 产物 5/5：校验规则清单 ----
const validate = (d) => line(['# validate.txt — 由 emit.cjs 从 decls.json 生成，勿手改。']
  .concat(ops(d).flatMap(([n, s]) => [
    `[${n}] required: ${(s.required || []).join(', ') || '(none)'}`,
    `[${n}] clamp: ${(s.clamp || []).join(', ') || '(none)'}`,
  ])).join('\n'));

// ---- 产物注册表：加第 6 样产物 = 这里加一行 ----
const ARTIFACTS = [
  ['opsText.txt', opsText],
  ['schema.json', schema],
  ['client.js', client],
  ['tests.json', tests],
  ['validate.txt', validate],
];

for (const [file, build] of ARTIFACTS) fs.writeFileSync(path.join(DIR, file), build(decls()), 'utf8');
console.log(`emit: ${Object.keys(decls()).length} ops x ${ARTIFACTS.length} artifacts`);

'use strict';
// B 段自测：每条新不变量一个测试，任一失败 → 退出码 1。
// 用法：node verify.cjs [--impl path\to\impl.js]
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const argv = process.argv.slice(2);
const at = argv.indexOf('--impl');
const IMPL = path.resolve(at >= 0 && argv[at + 1] ? argv[at + 1] : path.join(__dirname, 'impl.js'));

let seq = 0;
// 契约同 check-scale：argv[2] 是一个 JSON 文件，stdout 出结果对象
function run(input) {
  const f = path.join(os.tmpdir(), `relay-b-verify-${process.pid}-${seq++}.json`);
  fs.writeFileSync(f, JSON.stringify(input));
  try {
    return JSON.parse(execFileSync(process.execPath, [IMPL, f], { encoding: 'utf8' }));
  } finally {
    fs.unlinkSync(f);
  }
}

const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const T = [];

/* ---------------- D4：undo 撤销紧邻的上一条 op ---------------- */
T.push([
  'D4 add → undo：课表空、n 正确、深拷恢复',
  () => {
    const COURSE = { name: 'A', day: 1, periodFrom: 1, periodTo: 2, weeks: { type: 'range', from: 1, to: 8 } };

    const out = run({ courses: [], ops: [{ op: 'add', course: COURSE }, { op: 'undo' }] });
    ok(out.courses.length === 0, `撤销后课表应为空，实际 ${out.courses.length} 门`);
    ok(out.n === 0, `n 应为 0（add +1 与 undo -1 抵掉），实际 ${out.n}`);
    ok(/已撤销 add/.test(out.log[1]), `日志应写明撤销了哪条 op，实际 ${JSON.stringify(out.log[1])}`);

    // 深拷：被撤销的 op 原地改过课程对象的字段（88/135/209/246），浅拷拿不回来
    const o2 = run({
      courses: [],
      ops: [
        { op: 'add', course: COURSE },
        { op: 'edit', match: 'A', set: { periodFrom: 6, teacher: 'T' } },
        { op: 'undo' },
      ],
    });
    ok(o2.courses.length === 1 && o2.courses[0].periodFrom === 1 && o2.courses[0].teacher === '',
      `undo 未把 edit 的原地改动还原：${JSON.stringify(o2.courses)}`);

    // 被撤销的是「紧邻的上一条」，不是第一条
    const o3 = run({
      courses: [],
      ops: [
        { op: 'add', course: { name: 'A', day: 1, periodFrom: 1, periodTo: 2 } },
        { op: 'add', course: { name: 'B', day: 2, periodFrom: 1, periodTo: 2 } },
        { op: 'del', match: 'A' },
        { op: 'undo' },
      ],
    });
    ok(o3.courses.map((c) => c.name).sort().join(',') === 'A,B', `undo 应只回滚 del：${JSON.stringify(o3.courses.map((c) => c.name))}`);

    // 失败分支 1：无可撤销
    const o4 = run({ courses: [], ops: [{ op: 'undo' }] });
    ok(/撤销失败：无可撤销/.test(o4.log[0]), `首条 undo 应报无可撤销，实际 ${JSON.stringify(o4.log[0])}`);
    ok(o4.n === 0, `无可撤销时 n 不变，实际 ${o4.n}`);

    // 失败分支 2：不能连续撤销（上一条是 undo 本身）
    const o5 = run({ courses: [], ops: [{ op: 'add', course: { name: 'A' } }, { op: 'undo' }, { op: 'undo' }] });
    ok(/撤销失败：不能连续撤销/.test(o5.log[2]), `连续 undo 应拒绝，实际 ${JSON.stringify(o5.log[2])}`);
    ok(o5.courses.length === 0, `连续撤销不得改动课表，实际 ${JSON.stringify(o5.courses)}`);
  },
]);

/* ---------------- D5：成功执行的日志行末加 [+k] ---------------- */
T.push([
  'D5 三条 op（中间缺字段）：[+1] / 无 / [+3]',
  () => {
    const out = run({
      courses: [{ name: 'A', day: 1, periodFrom: 1, periodTo: 2 }],
      ops: [
        { op: 'tag', match: 'A', tag: 'x' },
        { op: 'move', match: 'A' }, // 缺 day/periodFrom/periodTo → [skip]
        { op: 'untag', tag: 'x' },
      ],
    });
    ok(out.log.length === 3, `三条 op 应产生三行日志，实际 ${out.log.length}`);
    ok(/ \[\+1\]$/.test(out.log[0]), `log[0] 应以 " [+1]" 结尾，实际 ${JSON.stringify(out.log[0])}`);
    ok(/^\[skip\]/.test(out.log[1]), `log[1] 应是 [skip] 行，实际 ${JSON.stringify(out.log[1])}`);
    ok(!/ \[\+\d+\]$/.test(out.log[1]), `[skip] 行不得加 [+k]，实际 ${JSON.stringify(out.log[1])}`);
    // 中间那条被跳过，若 k 记的是「成功执行到第几个」，这里会是 [+2]
    ok(/ \[\+3\]$/.test(out.log[2]), `log[2] 应以 " [+3]"（ops 里的 1 基序号）结尾，实际 ${JSON.stringify(out.log[2])}`);
    ok(/^3\)/.test(out.log[2]), `行首编号应同为 3，实际 ${JSON.stringify(out.log[2])}`);

    // 全部成功的批次：k 与行首编号逐个对齐，[+k] 不参与下一次编号
    const o2 = run({ courses: [], ops: [{ op: 'add', course: { name: 'A' } }, { op: 'sort' }, { op: 'stats' }] });
    const kk = o2.log.map((s) => (s.match(/ \[\+(\d+)\]$/) || [])[1]);
    ok(kk.join(',') === '1,2,3', `三条成功 op 的 k 应为 1,2,3，实际 ${JSON.stringify(o2.log)}`);
    ok(o2.log.every((s, i) => s.startsWith(`${i + 1}) `)), `行首编号应仍是 1) 2) 3)，实际 ${JSON.stringify(o2.log)}`);
  },
]);

/* ---------------- D6：stats 追加每门课的 match 命中次数 ---------------- */
const C = (name, day, from, to) => ({ name, day, periodFrom: from, periodTo: to });
function parseHits(line) {
  const m = /hits (\{[^}]*\})/.exec(line || '');
  if (!m) throw new Error(`日志里没有 hits 字段：${JSON.stringify(line)}`);
  return JSON.parse(m[1]);
}

T.push([
  'D6 edit match=A 两次 → stats 里 A 的 hits=2',
  () => {
    const out = run({
      courses: [C('A', 1, 1, 2), C('B', 2, 3, 4)],
      ops: [
        { op: 'edit', match: 'A', set: { teacher: 'T' } },
        { op: 'edit', match: 'A', set: { location: 'L' } },
        { op: 'stats' },
      ],
    });
    const line = out.log[2];
    const h = parseHits(line);
    ok(h.A === 2, `A 的 hits 应为 2，实际 ${JSON.stringify(h)}（行：${line}）`);
    ok(h.B === 0, `B 一次都没被命中，hits 应为 0，实际 ${JSON.stringify(h)}`);
    ok(/^3\) 共 2 门课，\d+ 个时段被占/.test(line), `原有 stats 文案必须保留（追加不是替换），实际 ${line}`);
    ok(!('hits' in out.courses[0]), `hits 不得混进课程字段：${JSON.stringify(out.courses[0])}`);

    // 计数跟着课程对象走，不跟着名字走：改名后仍归到新名字上（edit 与 rename 各命中一次）
    const o2 = run({
      courses: [C('A', 1, 1, 2)],
      ops: [
        { op: 'edit', match: 'A', set: { teacher: 'T' } },
        { op: 'rename', match: 'A', to: 'Z' },
        { op: 'stats' },
      ],
    });
    const h2 = parseHits(o2.log[2]);
    ok(h2.Z === 2 && !('A' in h2), `改名后应统计为 Z=2，实际 ${JSON.stringify(h2)}`);

    // 被删掉的课不出现在统计里（del 自己也走 hit()，但它的命中对象随即离场，
    // 计数永远观测不到 —— 断言只针对"不出现在输出里"这一条）
    const o3 = run({
      courses: [C('A', 1, 1, 2), C('B', 2, 3, 4)],
      ops: [
        { op: 'edit', match: 'B', set: { teacher: 'T' } },
        { op: 'del', match: 'B' }, // 命中 B 后把它删掉
        { op: 'stats' },
      ],
    });
    const h3 = parseHits(o3.log[2]);
    ok(h3.A === 0 && !('B' in h3), `删掉的 B 不应出现、A 应为 0，实际 ${JSON.stringify(h3)}`);
  },
]);

/* ---------------- runner ---------------- */
let bad = 0;
for (const [name, fn] of T) {
  try {
    fn();
    console.log(`[ok  ] ${name}`);
  } catch (e) {
    bad++;
    console.log(`[FAIL] ${name}\n        ${e.message}`);
  }
}
console.log(`-- ${T.length - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);

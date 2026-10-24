#!/usr/bin/env node
// verify.cjs — 接手者（B 段）自测：D4 / D5 / D6 三条新不变量，每条都要能红。
//
// 用法：
//   node verify.cjs                    # 跑全部，对 impl.lisp
//   node verify.cjs --impl X.lisp      # 对另一份实现跑（用来证明"能红"）
//   node verify.cjs --only V1          # 只跑一条
//
// 为什么这样测：判据 check-scale.cjs 只管老行为 20 条，新行为它一条都不管。
// 所以这里每条 check = 造一个 JSON 包 -> 跑 SBCL -> 只断言这条需求自己承诺的东西，
// 不碰别的字段，免得多加一条不变量就把自己锁死在别人的输出格式上。
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const IMPL = path.resolve(argOf("--impl", "impl.lisp"));
const ONLY = argOf("--only", null);

const SBCL =
  process.env.SBCL ||
  "C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\tools\\sbcl\\PFiles\\Steel Bank Common Lisp\\sbcl.exe";
const SBCL_HOME = process.env.SBCL_HOME || path.dirname(SBCL);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "relay-verify-"));

function runPkg(pkg) {
  const f = path.join(TMP, "pkg.json");
  fs.writeFileSync(f, JSON.stringify(pkg), "utf8");
  const r = spawnSync(SBCL, ["--script", IMPL, f], {
    env: { ...process.env, SBCL_HOME },
    encoding: "utf8",
    maxBuffer: 1 << 24,
  });
  if (r.error) throw new Error(`起不来 SBCL: ${r.error.message}`);
  const out = (r.stdout || "").trim();
  try {
    return JSON.parse(out);
  } catch (e) {
    throw new Error(
      `impl 输出不是 JSON（exit=${r.status}）；stderr 前 300 字：${(r.stderr || "").replace(/\s+/g, " ").slice(0, 300)}`
    );
  }
}

const mk = (o = {}) =>
  Object.assign(
    { name: "A", teacher: "T", location: "L", day: 1, periodFrom: 1, periodTo: 2 },
    o
  );

class Bad extends Error {}
const must = (cond, msg) => {
  if (!cond) throw new Bad(msg);
};
const show = (v) => JSON.stringify(v);

const checks = [
  {
    id: "V1",
    d: "D4",
    title: "undo：add 之后 undo → courses 空、n 归零；无前像/连续撤销都给纯文本拒绝",
    run() {
      // 规格原话：`add A` → `undo` → `courses` 为空，且 n 计数正确。
      const out = runPkg({
        courses: [],
        ops: [{ op: "add", course: mk({ name: "A", day: 3, periodFrom: 5, periodTo: 6 }) }, { op: "undo" }],
      });
      must(out.courses.length === 0, `courses 应为空，实际 ${show(out.courses)}`);
      must(out.n === 0, `n 应为 0（add 记 1，undo 必须反向记 -1），实际 ${out.n}`);
      must(out.log.length === 2, `log 应有 2 条，实际 ${show(out.log)}`);
      must(/^2\) /.test(out.log[1]), `undo 要算一条成功 op（编号 2），实际 ${show(out.log[1])}`);
      must(/撤销/.test(out.log[1]), `undo 文案里要点出撤销，实际 ${show(out.log[1])}`);

      // 分支 1：第一条就 undo —— 没有可撤销的 op
      const first = runPkg({ courses: [], ops: [{ op: "undo" }] });
      must(
        first.log.length === 1 && first.log[0].includes("撤销失败：无可撤销"),
        `首条 undo 应记「撤销失败：无可撤销」，实际 ${show(first.log)}`
      );
      must(first.n === 0, `被拒的 undo 不能改 n，实际 ${first.n}`);

      // 分支 2：上一条是 undo 本身 —— 不能连续撤销
      const twice = runPkg({
        courses: [],
        ops: [{ op: "add", course: mk({ name: "A" }) }, { op: "undo" }, { op: "undo" }],
      });
      must(
        twice.log.length === 3 && twice.log[2].includes("撤销失败：不能连续撤销"),
        `连续 undo 应记「撤销失败：不能连续撤销」，实际 ${show(twice.log)}`
      );
      must(twice.courses.length === 0 && twice.n === 0, `连续 undo 被拒后状态不能动，实际 n=${twice.n} courses=${show(twice.courses)}`);
    },
  },
  {
    id: "V2",
    d: "D5",
    title: "日志后缀 [+k]：k 是 ops 里的序号（中间一条缺字段被 skip 时，第 3 条仍是 [+3]），skip 行不加",
    run() {
      // 规格原话：一批 3 个 op（中间缺字段），log[0] 以 ` [+1]` 结尾，log[2] 以 ` [+3]` 结尾。
      const out = runPkg({
        courses: [],
        ops: [
          { op: "add", course: mk({ name: "A" }) },
          { op: "edit", match: "A" }, // 缺 set → 不执行，只留 [skip]
          { op: "stats" },
        ],
      });
      must(out.log.length === 3, `log 应有 3 条（含 1 条 [skip]），实际 ${show(out.log)}`);
      must(/ \[\+1\]$/.test(out.log[0]), `log[0] 应以「 [+1]」结尾，实际 ${show(out.log[0])}`);
      must(/^\[skip\]/.test(out.log[1]), `log[1] 应是 [skip] 行，实际 ${show(out.log[1])}`);
      must(!/\[\+\d+\]$/.test(out.log[1]), `[skip] 行不该带 [+k] 后缀，实际 ${show(out.log[1])}`);
      must(/ \[\+3\]$/.test(out.log[2]), `log[2] 应以「 [+3]」结尾（k 数的是 ops 序号，不是成功条数），实际 ${show(out.log[2])}`);
      must(/^2\) /.test(out.log[2]), `log[2] 的行内编号仍是 2)（那是成功条数 i，与 k 不同），实际 ${show(out.log[2])}`);
    },
  },
  {
    id: "V3",
    d: "D6",
    title: "stats 追加 hits：edit match=A 两次 → A=2（B 没命中过报 0），且 courses 里不多出 hits 字段",
    run() {
      // 规格原话：`edit match=A` 两次 → stats 里 A 的 hits = 2。
      const out = runPkg({
        courses: [],
        ops: [
          { op: "add", course: mk({ name: "A" }) },
          { op: "add", course: mk({ name: "B", day: 2, periodFrom: 3, periodTo: 4 }) },
          { op: "edit", match: "A", set: { teacher: "X" } },
          { op: "edit", match: "A", set: { teacher: "Y" } },
          { op: "stats" },
        ],
      });
      // 末行是 stats；先剥掉 D5 的 [+k] 尾巴，这样这条 check 不依赖 D5 是否已实现
      const line = out.log[out.log.length - 1].replace(/ \[\+\d+\]$/, "");
      const m = /hits：(.*)$/.exec(line);
      must(m, `stats 行里没有 hits：实际 ${show(line)}`);
      const pairs = {};
      for (const kv of m[1].split("、")) {
        const i = kv.lastIndexOf("=");
        if (i > 0) pairs[kv.slice(0, i)] = kv.slice(i + 1);
      }
      must(pairs["A"] === "2", `A 的 hits 应为 2，实际 ${show(m[1])}`);
      must(pairs["B"] === "0", `B 一次没被 match 命中，应报 0，实际 ${show(m[1])}`);
      must(!("hits" in out.courses[0]), `courses 里不该多出 hits 字段（会顶掉 check-scale 老用例），实际 ${show(out.courses[0])}`);

      // 空课表也要能出 hits（否则 stats 文案在空表上缺一段）
      const empty = runPkg({ courses: [], ops: [{ op: "stats" }] });
      must(/hits：/.test(empty.log[0]), `空课表的 stats 也要有 hits：实际 ${show(empty.log[0])}`);
    },
  },
];

let failed = 0;
let ran = 0;
for (const c of checks) {
  if (ONLY && !ONLY.split(",").includes(c.id)) continue;
  ran++;
  try {
    c.run();
    console.log(`[ok  ] ${c.id} ${c.d} ${c.title}`);
  } catch (e) {
    failed++;
    console.log(`[FAIL] ${c.id} ${c.d} ${c.title}\n       → ${e.message}`);
  }
}
console.log(`-- ${ran - failed} passed, ${failed} failed  (impl=${path.relative(process.cwd(), IMPL)})`);
process.exit(failed === 0 ? 0 : 1);

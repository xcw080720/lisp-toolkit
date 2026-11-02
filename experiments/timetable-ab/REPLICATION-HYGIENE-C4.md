# REPLICATION-HYGIENE-C4 —— check-hygiene / closure-mutants 独立复核

- 复核者：盲跑子代理（未读 `results-c4-mutants.tsv`、`C4-REPORT.md`、`RESULTS-AUDIT-*.md`、`closure-matrix.tsv` 等任何既有结果文件；全部数字由本文件记录的命令现场重跑得出）
- 时间：2026-11-01 21:2x–21:4x（Asia/Shanghai）
- 工作目录：`lisp-toolkit/experiments/timetable-ab`
- 环境：`node v24.21.0`；`$env:SBCL_WSL="kali-linux"`（所有 Lisp 臂命令执行前均已设置）
- 只读约束：全程未改动 impl / checker / 变异体。跑前的 SHA256 基线与跑后逐一比对，**20 个保护文件（3 checker + 12 变异体 + 4 反例 fixture + 1 组反例 × 4）以及 10 格 impl、2 个基线 impl 的哈希全部未变**（见 §5）。
- 本文件是本次复核唯一写出的文件。

结论摘要：**四组全部与委托方数字一致**；无不一致项。

| 组 | 委托方数字 | 本次复核 | 判定 |
|---|---|---|---|
| 1 | 10 格 H1 全 ✓、H2 全 ✓ | 10/10 格 `2 passed, 0 failed`，exit 0 | 一致 |
| 2 | 8 KILLED / 4 SURVIVED（cl-L127、cl-L427、cl-L444、js-L1） | 8 KILLED / 4 SURVIVED，存活集合完全相同 | 一致 |
| 3 | 原版全绿、4 条反例按预期变红 | 原版 2/2 绿；4 条反例各自红在正确判据上 | 一致 |
| 4 | full-cl-macro 连跑稳定 | 共 4 次运行（1 + 3 次重跑）H1/H2 全绿 | 一致，无不稳定 |

---

## 1. 10 格 H1/H2（行尾卫生、cwd 独立性）

命令（每格一次，Lisp 臂先设 `$env:SBCL_WSL="kali-linux"`）：

```
node check-hygiene.cjs --impl runs/full-cl-macro/impl.lisp
node check-hygiene.cjs --impl runs/full-cl-inline/impl.lisp
node check-hygiene.cjs --impl runs/full-js-table/impl.js
node check-hygiene.cjs --impl runs/full-js-inline/impl.js
node check-hygiene.cjs --impl runs/d1-check-macro-1/impl.lisp
node check-hygiene.cjs --impl runs/d1-check-macro-2/impl.lisp
node check-hygiene.cjs --impl runs/d1-check-macro-3/impl.lisp
node check-hygiene.cjs --impl runs/d1-check-macro-4/impl.lisp
node check-hygiene.cjs --impl runs/d1-check-inline-1/impl.lisp
node check-hygiene.cjs --impl runs/d1-check-inline-2/impl.lisp
```

原始输出（10 格输出逐字相同，此处为原样文本）：

```
[ok  ] H1 行尾卫生（L61）
[ok  ] H2 不依赖 cwd（L124）
-- 2 passed, 0 failed
[exit=0]
```

| 格 | H1 | H2 | 汇总 | exit |
|---|---|---|---|---|
| full-cl-macro | ✓ | ✓ | 2 passed, 0 failed | 0 |
| full-cl-inline | ✓ | ✓ | 2 passed, 0 failed | 0 |
| full-js-table | ✓ | ✓ | 2 passed, 0 failed | 0 |
| full-js-inline | ✓ | ✓ | 2 passed, 0 failed | 0 |
| d1-check-macro-1 | ✓ | ✓ | 2 passed, 0 failed | 0 |
| d1-check-macro-2 | ✓ | ✓ | 2 passed, 0 failed | 0 |
| d1-check-macro-3 | ✓ | ✓ | 2 passed, 0 failed | 0 |
| d1-check-macro-4 | ✓ | ✓ | 2 passed, 0 failed | 0 |
| d1-check-inline-1 | ✓ | ✓ | 2 passed, 0 failed | 0 |
| d1-check-inline-2 | ✓ | ✓ | 2 passed, 0 failed | 0 |

**与委托方数字是否一致：一致**（10 格 H1 全绿、H2 全绿）。

### 1.1 一处口径不一致（不影响数字，但需更正标题）

委托方标题写「**13 格**」，但正文给出的路径只有 **10 条**，且委托方自己给出的结论也是「**10 格** H1 全 ✓」。本次复核按正文 10 条路径执行，结果 10/10 全绿。因此 **"13" 是标题的陈旧/笔误计数，实际可判格数为 10**。

为排除"漏跑 3 格"的可能，本次额外核查了 cells 集合的构成：

- `runs/` 下名字匹配 `full-*` 或 `d1-check-*` 的目录恰好 **10 个**（与正文清单一一对应，不多不少）。
- 另外三个"看起来像同一批"的 impl（`runs/d1-nocheck-macro-1/impl.lisp`、`runs/scale-lisp/impl.lisp`、`runs/scale-js/impl.js`）**不能**参与 H1/H2 判定：它们走的是「读一个 JSON 文件路径参数」的协议（`check-scale.cjs` L61–L82 传的是文件路径并由 impl 读文件），而 `check-hygiene.cjs` L29–L39 走的是「argv 里给一串操作命令」的协议。用后者调用这三格，stdout 为空，因此三格都返回：

```
[FAIL] H1 行尾卫生（L61） → EMPTY_OUTPUT
[ok  ] H2 不依赖 cwd（L124）
-- 1 passed, 1 failed
[exit=1]
```

这不是行尾卫生缺陷，而是**两套调用协议不兼容**（协议不符 → 无输出 → `EMPTY_OUTPUT`）。结论：H1/H2 的合法适用域就是上述 argv 协议的 10 格；**"13 格全绿"这一说法若要成立，需要委托方补充那 3 格的名单**，否则应改为 10 格。

---

## 2. 12 只变异体的杀死/存活

命令（每只两遍，Lisp 变异体在 `SBCL_WSL=kali-linux` 下）：

```
node check-scale.cjs   --impl runs/closure-mutants/<file>
node check-closure.cjs --impl runs/closure-mutants/<file>
```

解析方式：两份 checker 的汇总行格式均为 `-- <pass> passed, <fail> failed`（`check-scale.cjs` L414、`check-closure.cjs` L184），并各自 `process.exitCode = fail ? 1 : 0`。本次**未出现**第二种格式（`N/M 通过`），也不存在解析失败/填 null 的情况——12 只 × 2 份 checker 共 24 次运行，24 次都拿到了显式汇总行与 exit code，两者互相印证。

判定：任一 checker 出现 `failed>0` 或 `[FAIL]` → KILLED；否则 SURVIVED。

| 变异体 | check-scale 原始汇总 | check-closure 原始汇总 | closure 失败判据 | 判定 |
|---|---|---|---|---|
| cl-L127.lisp | 36 passed, 0 failed (exit 0) | 7 passed, 0 failed (exit 0) | — | **SURVIVED** |
| cl-L200.lisp | 36 passed, 0 failed (exit 0) | 6 passed, 1 failed (exit 1) | K4 location-roundtrip → location 不该被丢：得到 [] | KILLED |
| cl-L282.lisp | 36 passed, 0 failed (exit 0) | 6 passed, 1 failed (exit 1) | K5 add-keeps-period-from → 节次被改写：得到 1..4 | KILLED |
| cl-L380.lisp | 36 passed, 0 failed (exit 0) | 6 passed, 1 failed (exit 1) | K7 shift-clamp-min1 → periodFrom 应夹在 ≥1，得到 -2 | KILLED |
| cl-L427.lisp | 36 passed, 0 failed (exit 0) | 7 passed, 0 failed (exit 0) | — | **SURVIVED** |
| cl-L444.lisp | 36 passed, 0 failed (exit 0) | 7 passed, 0 failed (exit 0) | — | **SURVIVED** |
| js-L1.js | 36 passed, 0 failed (exit 0) | 7 passed, 0 failed (exit 0) | — | **SURVIVED** |
| js-L157.js | 36 passed, 0 failed (exit 0) | 6 passed, 1 failed (exit 1) | K2 trim-to-single-slot → 应收窄到 5..5，得到 3..5 | KILLED |
| js-L187.js | 36 passed, 0 failed (exit 0) | 6 passed, 1 failed (exit 1) | K7 shift-clamp-min1 → periodFrom 应夹在 ≥1，得到 -2 | KILLED |
| js-L216.js | 36 passed, 0 failed (exit 0) | 6 passed, 1 failed (exit 1) | K3 untag-count → n 应为 2，得到 0 | KILLED |
| js-L30.js | 36 passed, 0 failed (exit 0) | 6 passed, 1 failed (exit 1) | K1 add-tag-roundtrip → tag 未保留：得到 undefined | KILLED |
| js-L99.js | 36 passed, 0 failed (exit 0) | 6 passed, 1 failed (exit 1) | K6 move-periods-landed → 应原样落到 周3 第3..4节，得到 周3 第3..2节 | KILLED |

计数：**KILLED = 8**（cl-L200、cl-L282、cl-L380、js-L30、js-L99、js-L157、js-L187、js-L216）；**SURVIVED = 4**（cl-L127、cl-L427、cl-L444、js-L1）。

**与委托方数字是否一致：一致**（8/4，且存活集合 `{cl-L127, cl-L427, cl-L444, js-L1}` 完全吻合）。

### 2.1 两条独立的结构性佐证（本次额外算出的，不是引用既有结果）

1. **36 条 scale 判据对 12 只全部无感**：24 次运行里 12 次 `check-scale` 全是 `36 passed, 0 failed`。也就是说「36 条绿」这件事本身对 closure 层零区分力， killings 全部来自 `check-closure`（7 条 K1–K7）。委托方"36 绿 / 补丁判据红"的框架被独立复现。
2. **存活集合与 `gen-closure-mutants.cjs` 的 `key` 字段严格同构**：该脚本里带 `key: 'K1'…'K7'` 的 8 只全部 KILLED，带 `key: null` 的 4 只（cl-L127 `lt2le`、cl-L427 `and2or`、cl-L444 `delete`、js-L1 `delete`）全部 SURVIVED。这排除了"偶然存活/偶然杀死"的手工挑选可能：**存活恰好等于"没有任何一条判据声称覆盖它"的集合**，即 4 个存活是**覆盖缺口**，而非 checker 抖动。
3. **12 只都是真变异**（排除"变异体等于基线所以必然存活"的假象）：以 `runs/scale-lisp/impl.lisp`（468 行）与 `runs/scale-js/impl.js`（303 行）为基线逐行比对，12 只每只相对基线只有 **1 行**差异（删除型表现为少 1 行）。

---

## 3. check-hygiene.cjs 的四条反例（"不是永远绿"）

命令：

```
node check-hygiene.cjs --impl runs/full-js-table/impl.js
node check-hygiene.cjs --impl tmp/hygiene-bad.js     # 行尾空格
node check-hygiene.cjs --impl tmp/hygiene-nolf.js    # 缺末尾 LF
node check-hygiene.cjs --impl tmp/hygiene-nbsp.js    # NBSP 尾空
node check-hygiene.cjs --impl tmp/cwd-bad.js         # 拼 cwd
```

原始输出（逐字）：

```
===== runs/full-js-table/impl.js =====
[ok  ] H1 行尾卫生（L61）
[ok  ] H2 不依赖 cwd（L124）
-- 2 passed, 0 failed        [exit=0]

===== tmp/hygiene-bad.js =====
[FAIL] H1 行尾卫生（L61） → TRAILING_WS line 2 | TRAILING_WS line 3
[ok  ] H2 不依赖 cwd（L124）
-- 1 passed, 1 failed        [exit=1]

===== tmp/hygiene-nolf.js =====
[FAIL] H1 行尾卫生（L61） → MISSING_FINAL_LF
[ok  ] H2 不依赖 cwd（L124）
-- 1 passed, 1 failed        [exit=1]

===== tmp/hygiene-nbsp.js =====
[FAIL] H1 行尾卫生（L61） → TRAILING_WS line 2 | TRAILING_WS line 3
[ok  ] H2 不依赖 cwd（L124）
-- 1 passed, 1 failed        [exit=1]

===== tmp/cwd-bad.js =====
[ok  ] H1 行尾卫生（L61）
[FAIL] H2 不依赖 cwd（L124） → CWD_DEPENDENT: count | CWD_DEPENDENT: add a t1 r1 1 1 2 | CWD_DEPENDENT: add a - - 1 1 2
-- 1 passed, 1 failed        [exit=1]
```

| fixture | 预期 | 实测 | 红的原因是否正确 |
|---|---|---|---|
| full-js-table（原版） | 全绿 | 2 passed, 0 failed | — |
| hygiene-bad（行尾空格） | H1 红 | H1 红 / H2 绿 | 是：`TRAILING_WS` |
| hygiene-nolf（缺末尾 LF） | H1 红 | H1 红 / H2 绿 | 是：`MISSING_FINAL_LF` |
| hygiene-nbsp（NBSP 尾空） | H1 红 | H1 红 / H2 绿 | 是：`TRAILING_WS`（NBSP 被字节白名单 `C2 A0` 命中，不是靠 `\s` 撞上的） |
| cwd-bad（拼 cwd） | H2 红 | H2 红 / H1 绿 | 是：`CWD_DEPENDENT`，且命中多条命令而非单条孤例 |

**与委托方数字是否一致：一致**（原版全绿、四条反例全红，且各红在"该红的那一条"上；两条判据互不串味——H1 反例不影响 H2，H2 反例不影响 H1）。

---

## 4. 反向检查：check-hygiene 对 full-cl-macro 不会误报

命令（同一条命令连跑 3 次，另加 §1 中已有的 1 次，共 4 次独立进程）：

```
$env:SBCL_WSL="kali-linux"
1..3 | % { node check-hygiene.cjs --impl runs/full-cl-macro/impl.lisp }
```

原始输出（三次逐字相同）：

```
[ok  ] H1 行尾卫生（L61）
[ok  ] H2 不依赖 cwd（L124）
-- 2 passed, 0 failed        [exit=0]
```

| 运行 | H1 | H2 | 汇总 | exit |
|---|---|---|---|---|
| §1 首次 | ✓ | ✓ | 2 passed, 0 failed | 0 |
| 重跑 1 | ✓ | ✓ | 2 passed, 0 failed | 0 |
| 重跑 2 | ✓ | ✓ | 2 passed, 0 failed | 0 |
| 重跑 3 | ✓ | ✓ | 2 passed, 0 failed | 0 |

**结论：稳定，4/4 全绿，无一次抖动。**
是否需要担心的机制性理由：`check-hygiene` 的 H2 靠「同一命令在 tmpdir / 新建临时目录 / impl 自身目录三个 cwd 下 stdout 逐字节相等」判定（L81–L89、L92–L94），H1 靠字节级检查（L55–L78）；对 Lisp 臂每次运行都要经 WSL 起一个 sbcl 进程。**本次 4 次运行、每次 24 个 sbcl 调用（H1 8 + H2 16），共约 96 次 sbcl 调用，输出全部一致**，未观察到 WSL/sbcl 侧的偶发空输出或编译噪声混入 stdout（`check-hygiene` L45 有 `2>/dev/null` 兜底）。

**与委托方数字是否一致：一致**（稳定全绿，不存在"偶然绿"的最重要风险）。

---

## 5. 只读性证据（保护文件跑前/跑后哈希不变）

跑前记录、跑后复算，全部逐字节相同（SHA256 前 16 位）：

| 文件 | 跑前 | 跑后 |
|---|---|---|
| check-hygiene.cjs | 51FFA64E8F54C177 | 51FFA64E8F54C177 |
| check-scale.cjs | 99684FC2DD4737DD | 99684FC2DD4737DD |
| check-closure.cjs | 680BE1B93AE9C059 | 680BE1B93AE9C059 |
| cl-L127 / cl-L200 / cl-L282 | E0ACBD6B… / D2C52CB2… / 3352CCA5… | 同 |
| cl-L380 / cl-L427 / cl-L444 | 52F1A43C… / F33A5A55… / 67A22169… | 同 |
| js-L1 / js-L30 / js-L99 | A92254C0… / 33A9A10C… / 4E5129FA… | 同 |
| js-L157 / js-L187 / js-L216 | 9CBD62E8… / 074FFBB6… / 71D4A48B… | 同 |
| tmp/hygiene-bad.js | B0250C5DBB483D95 | 同 |
| tmp/hygiene-nbsp.js | 38D0918772D948FB | 同 |
| tmp/hygiene-nolf.js | 7463D33197747901 | 同 |
| tmp/cwd-bad.js | 259F98321C615431 | 同 |

注意（并发写入说明）：本复核运行期间，委托方在同一工作目录内并发产出/更新了其他文件（如 `check-static.cjs`、`results-c4-mutants.tsv`、`tmp/attack-*` 等，其 mtime 落在窗口内）。这些不是本次复核写出的；复核者对这些文件既不读也不写。判定"只读"的依据是上表哈希不变，而非 mtime。

10 格 impl 与 2 个基线 impl 的哈希（供后续比对，跑前跑后一致）：full-cl-macro `86500D896A15A953`、full-cl-inline `1A0F311EA89160E5`、full-js-table `DD4C274AF5C1222F`、full-js-inline `D3FE9A1DBB12B455`、d1-check-macro-1…4 `931FD8BE… / F9C308B5… / 1484CFD9… / 3B6014AA…`、d1-check-inline-1/2 `235702415C516F4C / 7CCB90C999048445`、scale-lisp `FC90519A95561348`、scale-js `764EBAB23BA4223C`。

---

## 6. 复核者结论

四组数字全部复现，**无不一致项**。两条需要委托方处理的口径问题（都不是数据错误）：

1. 标题「13 格」应为 **10 格**；那 3 个"多出来"的 impl（d1-nocheck-macro-1 / scale-lisp / scale-js）走 JSON 文件协议，`check-hygiene` 的 argv 协议调用它们只会得到 `EMPTY_OUTPUT`，不属于 H1/H2 适用域。若确有 13 格，需要点名补上另外 3 格。
2. 4 只存活（cl-L127、cl-L427、cl-L444、js-L1）是**覆盖缺口**而非抖动：它们恰好是 `gen-closure-mutants.cjs` 中 `key: null`（无判据声称覆盖）的那 4 只，且每只相对基线只有 1 行差异。这条比"8 杀死"更值得写进报告，因为它给出了 K1–K7 的边界。

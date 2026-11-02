# 攻击弱覆盖：`SPEC-AUDIT.md` 三条 ⚠️ 的实际判定

> 2026-11-01 · 实验目录 `lisp-toolkit/experiments/timetable-ab`
> spec = `tasks/v3-full.spec.md`；判据 = `check-v4.cjs` · `check-closure.cjs`(K1–K7) · `check-hygiene.cjs`(H1/H2)
> 目标：**让判据变红**。变红 = 找到能打穿它的输入；全绿 = 这条规格目前没有任何判据能抓。
> 硬约束遵守记录：只在 `tmp/` 造文件；未动 `runs/`（`impl.js` sha256 攻击前后同为 `dd4c274a…76309`，mtime 仍 2026-10-31 17:00:17）；未改任何 checker。

---

## ⚠️ 先读这条：仪表在攻击途中被人改过

`check-v4.cjs` 在我跑矩阵的中途（**21:36:44**）被并发同伴改了一次：判据从 **80 条变成 82 条**，
新增的正是 `#83`「`copyTo` 复制到已占时段 → CONFLICT 且状态不变（L162）」和 `#84`「`copyTo` 复制到自身原时段 → CONFLICT」。

这件事本身是结论的一部分，所以本报告给**两个快照**：

| 快照 | 时刻 | check-v4 |
|---|---|---|
| **S80** | 21:32–21:36 | 80 条（`tmp/attack-logs/attack-*.v4.log`） |
| **S82** | 21:40 之后 | 82 条（`tmp/attack-logs/v82-*.v4.log`） |

**S80 的结论是"③ 的 copyTo CONFLICT 全绿 = 真盲区"；S82 已经被 #83/#84 抓红。**
换句话说：**我打出来的洞，同一时间另一个人在补**——两边的发现是独立的，结论都以 S82 为准，S80 保留作对照。

---

## 摘要（S82 = 当前判据）

| # | 规格 | 变异 | S80 | S82（当前） | 判定 |
|---|---|---|---|---|---|
| ① | L39 `n` 整数、无前导零 | `001` / `+1` / `1.0` / 行内双空格 | 红 69 | **红 71**（11/82） | **已有判据能抓**（整行逐字节比对） |
| ①旁 | L39 同上，尾随空格 | `ok add 1·` | v4 绿 / **H1 红** | v4 绿 / **H1 红** | 已有判据能抓（L61 兜住） |
| ①残1 | L39 同上，但只在 `n≥4` 变形 | `ok count 05` | 全绿 | **全绿 82/82** | **真盲区**（n 只被观测过 `{0,1,2,3}`） |
| ①残2 | L32/L34 逐字格式，行首空白 | `·ok add 1` | — | **全绿 82/82** | **真盲区**（v4 的 `trim()` 吃行首，H1 只看行尾） |
| ② | L93–97 禁文件 I/O / JSON / 第三方库 / L98 stderr | 读 spec 文件、`require('fs'/'path')`、`JSON.stringify`、`require('./attack-lib3p.js')`、`stderr` 泄漏 | 全绿 | **全绿 82/82** | **真盲区**（结构性：stdout 已被钉死） |
| ③ | L162 `copyTo` 冲突 → CONFLICT 且不部分生效 | 静默成功／先落盘再报错 | 全绿 | **红 #83 #84** | S80 真盲区 → **S82 已被补上** |
| ③旁 | L161 `copyTo` 撞名 → DUP | 删重名检查 | 全绿 | **全绿 82/82** | **真盲区**（兄弟缺口，仍无人补） |
| ③反 | L162 `swapDays` 冲突 → CONFLICT | 删冲突检查 | 全绿 | 全绿，且**基线在 7 组对抗输入上输出逐字节相同** | 不是盲区：**分支在合法状态下不可达** |

**结论：3 条 ⚠️ 里 2 条是"根本没判据"（②、③）；① 是"有判据但窄"。
按 S82 计，仍站得住的真盲区 4 处：② 整条（L93–98）、③ 的 `copyTo` DUP（L161）、① 的 `n≥4`、① 的行首空白。**

---

## 0. 前置：为什么要先造一个"中性基线"

直接用 `runs/full-js-table/impl.js` 当基线是错的——它自己就不是全绿（S82 下 76/82）：

```
$ node check-v4.cjs --impl runs/full-js-table/impl.js
#37 FAIL   swapTeacher 交换教师      L3 期望: ok swapteacher 2   L3 实际: ok swapTeacher 2
#38 FAIL   swapLoc 交换地点          L2 期望: ok swaploc 2       L2 实际: ok swapLoc 2
#39 FAIL   copyTo 复制到指定时间（name_3）  L2 期望: ok copyto 1  L2 实际: ok copyTo 1
#42 FAIL   renameTeacher 全表改教师  L3 期望: ok renameteacher 2 L3 实际: ok renameTeacher 2
#43 FAIL   renameLoc 全表改地点      L2 期望: ok renameloc 1     L2 实际: ok renameLoc 1
#49 FAIL   swapDays 两天所有课互换   L3 期望: ok swapdays 2      L3 实际: ok swapDays 2

76/82 通过（fail=6 crash=0）      （S80 下为 74/80，同样是这 6 条）
```

这 6 条是 spec L39「`verb` 为命令名小写」的既有违例。若直接拿它当基线，变异体的"红"就和这 6 条纠缠在一起，无法归因。

所以先做 `tmp/attack-base.js`：只把 `line = 'ok ' + r.verb + ' ' + r.n;` 的 verb 改成 `.toLowerCase()`，
即**把基线改成合规实现**（不是改判据）。验证：

```
$ node check-v4.cjs      --impl tmp/attack-base.js    →  82/82 通过（fail=0 crash=0）  [S80 亦为 80/80]
$ node check-hygiene.cjs --impl tmp/attack-base.js    →  [ok  ] H1 行尾卫生 / [ok  ] H2 不依赖 cwd
```

之后每个变异体 = 基线 + 一处改动。生成器 `tmp/attack-gen.cjs` 对每个替换锚点都断言"在源文件里恰好出现 N 次"，
锚点失配就报错退出——防止静默生成一个"等于原版"的假变异体（这会制造全绿假象）。

---

## 1. ① L39「`n` 为整数、无前导零」

spec 原文（L39）：`成功：verb 为命令名小写，n 为受影响课程数（整数，无前导零）`

### 变异做了什么

全部只改输出那一行（`line = 'ok ' + r.verb.toLowerCase() + ' ' + r.n;`）：

| 变异 | 改动 | 实际输出 |
|---|---|---|
| `attack-001a.js` | `('000' + r.n).slice(-3)` | `ok add 001` |
| `attack-001b.js` | `(r.n >= 0 ? '+' : '') + r.n` | `ok add +1` |
| `attack-001c.js` | `Number(r.n).toFixed(1)` | `ok add 1.0` |
| `attack-001d.js` | `'  ' + r.n`（前导空格） | `ok add  1` |
| `attack-001e.js` | `r.n + ' '`（尾随空格） | `ok add 1·` |
| `attack-001f.js` | 只在 `n>=4` 时补零 | `ok count 05` / `ok purge 05` |
| `attack-001g.js` | 整行前加一个空格 | `·ok add 1` |

### 跑了哪些判据 / 结果（S82）

```
attack-base   82/82 通过（fail=0 crash=0）   H1 green  H2 green
attack-001a   11/82 通过（fail=71 crash=0）  H1 green  H2 green
attack-001b   11/82 通过（fail=71 crash=0）  H1 green  H2 green
attack-001c   11/82 通过（fail=71 crash=0）  H1 green  H2 green
attack-001d   11/82 通过（fail=71 crash=0）  H1 green  H2 green
attack-001e   82/82 通过（fail=0 crash=0）   H1 RED    H2 green
attack-001f   82/82 通过（fail=0 crash=0）   H1 green  H2 green
attack-001g   82/82 通过（fail=0 crash=0）   H1 green  H2 green
```

红在哪（原始输出）：

```
# 1 FAIL   add 单条 → ok + state 一行
     L1 期望: ok add 1
     L1 实际: ok add 001          ← attack-001a

# 1 FAIL   add 单条 → ok + state 一行
     L1 期望: ok add 1
     L1 实际: ok add  1           ← attack-001d（行内双空格）

[FAIL] H1 行尾卫生（L61） → TRAILING_WS line 1 | TRAILING_WS line 2    ← attack-001e
```

001a 绿的 11 条恰是**期望里不含 `ok` 行**的判据（`5,6,8,10,31,32,33,56,67,73,79`，全是只有 `err` 的用例）。
换句话说，**凡观测 `n` 的判据 71/71 全红**。

### 结论：① 是"有判据但窄"，不是没判据；但残了两个真盲区

`check-v4.cjs` 比的是**规范化后的整行逐字节相等**（`line.trim() === expect`），所以 `n` 的书写形式在
`{0,1,2,3}` 这几个值上是被硬比对钉死的。`SPEC-AUDIT.md` 第 3 行写"只靠数值比较间接测"，低估了它。

**残余盲区 1：`n≥4` 一次都没被观测过。**

```
$ node tmp/attack-nrange.cjs          （S82 版本上重跑，结论不变）
check-v4.cjs 期望里出现的 n 值集合 = {0, 1, 2, 3}
最大被观测 n = 3
出现 n>=4 的次数 = 0
```

```
$ node tmp/attack-001f.js 加五门课…count…purge
attack-base.js stdout = … ok count 5 ⏎ ok purge 5 …      （行为不同）
attack-001f.js stdout = … ok count 05 ⏎ ok purge 05 …    （逐字节相同? false）
                → 但 S82 仍然 82/82 全绿，H1/H2 全绿
```

**残余盲区 2：行首空白对 v4 和 H1 同时隐形。**

机制：`check-v4.cjs` 的 `runImpl()` 里有 `out.split('\n').map(l => l.trim())`，**行首空白被 trim 吃掉**；
而 `check-hygiene.cjs` 的 H1 只检查每行**最后一个字节**（行尾）。于是：

```
$ node tmp/attack-001g.js "add a t r 1 1 2"
stdout = " ok add 1\n#state\na|t|r|1|1-2\n"      ← 行首多一个空格
$ node check-v4.cjs      --impl tmp/attack-001g.js  →  82/82 通过
$ node check-hygiene.cjs --impl tmp/attack-001g.js  →  H1 [ok] H2 [ok]
```

spec L32 写的是「输出格式（逐字遵守）」，行首空格显然不合该格式，但**没有任何判据能看见它**。
这和 001e（尾空）形成对照：尾空靠 H1 兜住了，**行首是彻底没人管的那一侧**。

---

## 2. ② L93–97「禁止文件 I/O / JSON / 第三方库」

spec 原文：L93 `禁止事项（违反即该次生成作废）`：读写任何文件 / 任何 JSON / 引入第三方库 / 输出任何调试信息。
`SPEC-AUDIT.md` 第 8 行：**只有人工 grep，⚠️ 无自动判据**。

### 变异做了什么

| 变异 | 违规点 | 是否影响 stdout |
|---|---|---|
| `attack-002a.js` | `require('fs')` + `require('path')` + `readFileSync('../tasks/v3-full.spec.md')`，字节数参与一个永不成立的判断 | **否** |
| `attack-002b.js` | `JSON.stringify({...})` + `require('./attack-lib3p.js')`（tmp 下伪造的第三方库） | **否** |
| `attack-002c.js` | `readFileSync(...)` + `process.stderr.write('SPEC_BYTES=…')` | 否（走 stderr） |

代码（002a 头部）：

```js
'use strict';
// [VIOLATION L95 读写文件 + L97 内置 fs/path]
var fs = require('fs');
var nodePath = require('path');
var SPEC_BYTES = fs.readFileSync(nodePath.join(__dirname, '..', 'tasks', 'v3-full.spec.md')).length;
if (SPEC_BYTES <= 0) throw { code: 'BADARG' };
```

### 跑了哪些判据 / 结果（S82）

```
attack-002a   82/82 通过（fail=0 crash=0）   H1 green  H2 green
attack-002b   82/82 通过（fail=0 crash=0）   H1 green  H2 green
attack-002c   82/82 通过（fail=0 crash=0）   H1 green  H2 green
```

**三个违规实现全部全绿**，且 `attack-probe.cjs` 证明它们与基线的 stdout **逐字节相同**：

```
D. 违规实现（读文件/JSON/第三方库/写 stderr）的 stdout 是否与基线一致
-- attack-002a.js  exit=0  stdout与基线逐字节相同=true  stderr=""
-- attack-002b.js  exit=0  stdout与基线逐字节相同=true  stderr=""
-- attack-002c.js  exit=0  stdout与基线逐字节相同=true  stderr="SPEC_BYTES=8567\n"   ← 8567 = spec 文件真实字节数
```

`8567` 是 `tasks/v3-full.spec.md` 的真实大小 —— 文件确实被读了，只是没人看这个通道。

同时确认现有判据**都没有源码级扫描能力**：

```
$ node tmp/attack-nrange.cjs
check-hygiene.cjs: 读实现源码=false  有源码级扫描=false
check-closure.cjs: 读实现源码=false  有源码级扫描=false
```

### 结论：② 是真盲区，而且是**结构性**的，不是"还没造对输入"

论证（比"我试了三种全绿"更强）：

> `check-v4.cjs` 是「同一状态序列 → 精确输出比对」。82 条判据把实现的 stdout 空间**完全钉死**在唯一一个正确输出上。
> 于是任何**只作用于 stdout 的判据**都无法区分"只算对了"和"算对的同时还偷读了文件/写了 stderr"——
> 因为观测通道本身被穷举了，文件 I/O 的全部痕迹都在 stdout 之外。

所以这条规格**不可能**由内容判据/进程形态判据抓住，只能由**源码级判据**抓。现在的状态是 `SPEC-AUDIT.md`
把它登记成"人工检查（grep）"——那就等于**没有判据**：人工 grep 不在任何一次判据执行里，忘一次就漏一次。

（附带：L98「输出任何调试信息」同样是自由通道——002c 往 stderr 写一行，`check-v4` 只在 crash 时读 stderr，
H1/H2 根本不读。这条连"人工 grep"都没登记。）

---

## 3. ③ L162「`copyTo` 冲突 → CONFLICT 且不部分生效」

spec 原文：L143 `copyTo | name day from to | 复制该课到指定时间，新名 name_3；需查重名与冲突`
L161 `需要查重的（copyTo / mirror）→ err DUP`；L162 `需要查冲突的（copyTo / swapDays）→ err CONFLICT，且不得部分生效`

### 先确认 CONFLICT 在什么输入下**应该**触发（S80 时确实没人测）

```
$ node tmp/attack-base.js "add a t r 1 1 2" "add b t r 1 3 4" "copyTo a 1 3 4"
stdout = "ok add 1\nok add 1\nerr CONFLICT\n#state\na|t|r|1|1-2\nb|t|r|1|3-4\n"
```
即：`a_3` 要落在 day1 的 `[3,4]`，与 `b` 的 `[3,4]` 端点重合 —— 按 L30「端点相接算重叠」必须 CONFLICT，且状态不得变。
基线行为正确，但 **S80 的 80 条判据里没有任何一条喂过这个输入**：`#39` 只测成功路径（`copyTo a 3 5 6`，day 3 是空的），
`#69` 测的是 `mirror` 的 DUP，`#49` 测的是 `swapDays` 的成功路径。

### 变异做了什么

| 变异 | 改动 | 行为（实测） |
|---|---|---|
| `attack-003a.js` | copyTo 里整条 `if (hits(...)) fail('CONFLICT');` 删掉 | `ok copyto 1`，且 `a_3` 真的进了课表 |
| `attack-003b.js` | 冲突时**先 push 再** `fail('CONFLICT')` | `err CONFLICT`，但 `a_3` 已在课表里（部分生效） |
| `attack-003c.js` | copyTo 里 `if (get(s, nn)) fail('DUP');` 删掉（L161 兄弟项） | `ok copyto 1`，课表出现**两门同名 `a_3`** |
| `attack-003d.js` | `swapDays` 互换后的冲突检查整段删掉 | 与基线**完全不可区分**（见下） |

原始输出（`attack-probe.cjs` / `attack-probe2.cjs`）：

```
输入: add a t r 1 1 2 | add b t r 1 3 4 | copyTo a 1 3 4
-- attack-base.js  stdout="ok add 1\nok add 1\nerr CONFLICT\n#state\na|t|r|1|1-2\nb|t|r|1|3-4\n"
-- attack-003a.js  stdout="ok add 1\nok add 1\nok copyto 1\n#state\na|t|r|1|1-2\na_3|t|r|1|3-4\nb|t|r|1|3-4\n"
-- attack-003b.js  stdout="ok add 1\nok add 1\nerr CONFLICT\n#state\na|t|r|1|1-2\na_3|t|r|1|3-4\nb|t|r|1|3-4\n"

输入: add a t r 1 1 2 | add a_3 t r 5 1 2 | copyTo a 3 5 6
-- attack-base.js  stdout="… err DUP … a|t|r|1|1-2 … a_3|t|r|5|1-2"
-- attack-003c.js  stdout="… ok copyto 1 … a_3|t|r|5|1-2 … a_3|t|r|3|5-6"   ← 同名两门
```

### 跑了哪些判据 / 结果（两个快照对照）

```
                     S80（80 条）              S82（当前 82 条）
attack-003a   80/80 全绿  H1/H2 绿       80/82 → 红 #83 #84
attack-003b   80/80 全绿  H1/H2 绿       80/82 → 红 #83 #84
attack-003c   80/80 全绿  H1/H2 绿       82/82 全绿            ← 仍然无人覆盖
attack-003d   80/80 全绿  H1/H2 绿       82/82 全绿            ← 等价变异，不该红
```

### 结论：`copyTo` 的 CONFLICT 分支在 S80 是真盲区（已由并发的 #83/#84 补上）；DUP 分支仍是真盲区；`swapDays` 的 CONFLICT 是**不可达死分支**

`copyTo` 的 CONFLICT 与 DUP 都能被合法输入触发，S80 时都没测 → 真盲区；S82 的 `#83`/`#84` 补上了 CONFLICT 这一半，
`#84` 还顺手覆盖了「复制到自身原时段」这个我原本没测的形态（`copyTo a 1 1 2`，基线也确实报 CONFLICT）。
**`#83`/`#84` 与我的 P3 是同一处发现的独立两条路径**（我 21:38 落盘报告，它 21:36:44 落盘判据）。

但 `attack-003c`（`copyTo` 撞名不报 DUP，制造出**同名两门课**）在 S82 下**仍然 82/82 全绿** —— L161 那一半没人管。

`swapDays` 必须单独说清楚，否则会把"等价变异"误报成盲区：

```
B. swapDays 冲突可构造性测试（若基线从不报 CONFLICT，则该分支不可达）
7 组对抗输入（含 1↔1 自换、跨天区间重叠、一整天多门）：
  基线输出 vs 003d（删掉整段冲突检查）—— 7/7 逐字节相同
  基线在这些输入里报过 CONFLICT 吗? false
```

理由：`swapDays` 只是给**两天的整组课**换 `day` 标签，而「同一天内无重叠」是全程不变量
（`add`/`move`/`copyTo` 查冲突、`swap` 交换的是区间集合本身、`compress` 给的是 `(k,k+1)`）。
换标签后每天内部相对关系完全没变，冲突永远不出现 —— **L153 的 CONFLICT 子句是死分支**。
所以 `attack-003d.js` 全绿不是判据漏了，是**这个变异体在 spec 允许的输入上不可观测**。

> `SPEC-AUDIT.md` 记「#69 覆盖 mirror、copyTo 的 CONFLICT 未显式测」——真正该记的是：
> 「copyTo 的 CONFLICT 可达且（S80）无判据；copyTo 的 DUP 可达且无判据；swapDays 的 CONFLICT 不可达，不必有判据」。

---

## 4. 还该补什么判据（已实现并验证判别力）

不是建议，是跑过的：`tmp/propose-criteria.cjs` 把 4 条候选判据实现出来，并同时验证
**在合规实现上绿 + 在对应变异体上红**（否则就是 `SPEC-AUDIT.md` §二 说的"永远不会失败的判据"）。

```
=== P1 (L39 n>=4) ===
  [ok] attack-base.js / runs/full-js-table/impl.js   期望PASS 实际PASS
  [ok] attack-001f.js                                期望FAIL 实际FAIL L6 期望 "ok count 5" 实际 "ok count 05"
  [ok] attack-001a.js                                期望FAIL 实际FAIL L1 期望 "ok add 1" 实际 "ok add 001"
=== P2 (L93-97 源码扫描) ===
  [ok] attack-base.js / runs/full-js-table/impl.js   期望PASS 实际PASS
  [ok] attack-002a.js  期望FAIL 实际FAIL L97 require('fs') | L95 readFileSync
  [ok] attack-002b.js  期望FAIL 实际FAIL L96 JSON.stringify | L97 require('./
  [ok] attack-002c.js  期望FAIL 实际FAIL L95/L97 + L98 process.stderr
=== P3 (L162 copyTo CONFLICT) ===
  [ok] attack-base.js  期望PASS 实际PASS
  [ok] attack-003a.js  期望FAIL 实际FAIL L3 期望 "err CONFLICT" 实际 "ok copyto 1"
  [ok] attack-003b.js  期望FAIL 实际FAIL L6 期望 "b|t|r|1|3-4" 实际 "a_3|t|r|1|3-4"   ← 抓到"部分生效"
=== P4 (L161 copyTo DUP) ===
  [ok] attack-base.js  期望PASS 实际PASS
  [ok] attack-003c.js  期望FAIL 实际FAIL L3 期望 "err DUP" 实际 "ok copyto 1"
```

**P3 已经不需要了 —— `#83`/`#84` 已落地**（并发同伴）。下面三条还没有：

**#85（`check-v4.cjs`，依据 L161）—— `copyTo` 撞名必须报 DUP**

```
命令: add a t r 1 1 2 | add a_3 t r 5 1 2 | copyTo a 3 5 6
期望: ok add 1, ok add 1, err DUP, #state, a|t|r|1|1-2, a_3|t|r|5|1-2
      （不得出现两门 a_3）
```

**#86（`check-v4.cjs`，依据 L39 + L32）—— `n≥4` 的书写形式**

```
命令: add c1 t r 1 1 2 | add c2 t r 1 3 4 | add c3 t r 1 5 6 | add c4 t r 1 7 8 | add c5 t r 1 9 10
      | count | purge t | filter 1
期望: ok add 1 ×5, ok count 5, ok purge 5, ok filter 0, #state（无行）
```
顺手把 `#30` 那 20 门课后的 `count` 也补成一条（→ `ok count 20`），让 `n` 的取值覆盖到两位数。

**H3（`check-hygiene.cjs`，依据 L93–99）—— 源码级禁用项扫描**

```
读入 impl 源码，以下 6 类正则必须零命中（exit 0）：
  ① require('fs'|'path'|'child_process'|'os'|'net'|'http'|'https'|'module')
  ② readFileSync|writeFileSync|readFile|writeFile|appendFileSync|existsSync|createReadStream|createWriteStream|openSync
  ③ JSON.parse|JSON.stringify
  ④ require('./…') / require('../…') / import … from '…'
  ⑤ process.stderr
  ⑥ （Lisp 臂）with-open-file|open|quickload|asdf|read-from-string|read-line
期望: 在 runs/full-js-table/impl.js 上零命中（已验证）；在 attack-002a/b/c 上命中（已验证）。
```
**这条不能用内容判据替代** —— 见 §2 的论证：stdout 已被 82 条钉死，外部副作用无处显形。

**H1 补一侧（依据 L32/L34）—— 行首空白**

H1 现在只看行尾。改成「每行首尾都不得有空白」即可抓住 `attack-001g`；现成的 `attack-001g.js` 就是它的反例。
（注意：`check-v4` 的 `trim()` 不要动，动了会把 80 条既有判据的口径一起改掉——加在 H1 更安全。）

**不要**给 `swapDays` 的 CONFLICT 补判据——它在合法状态下不可达，写了也永远绿（会是第 8 次判据错误）。
正确做法是在 `SPEC-AUDIT.md` 里把 L153 的 CONFLICT 子句登记成"不可达分支"。

---

## 5. 顺带发现：`check-closure.cjs` 对 v3-full 根本不是判据

```
attack-base / 全部 15 个变异体 / runs/full-js-table/impl.js
    closure: -- 0 passed, 7 failed     （每个都是，零例外）
```
`K1–K7` 的失败原因全是 `→ stdout 非 JSON`：它测的是 **`tasks/scale.spec.md`** 的 JSON 契约（`{courses:[…]}`），
与 v3-full 的纯文本契约无关。它对 v3-full 的**判别力为零**（基线和所有变异体都是 0/7），
所以本报告不把它当证据，并提醒：**「80+7=87 条判据」这个说法对 v3-full 不成立**（S82 下是 82+2=84 条，两条 H 判据）。

---

## 6. 复现 / 物证清单 / 边界

复现（全部命令在 `lisp-toolkit/experiments/timetable-ab` 下执行）：

```powershell
node tmp\attack-gen.cjs            # 生成中性基线 + 15 个变异体（锚点失配会直接报错）
node tmp\attack-probe.cjs          # 行为级证据：变异体真的改了什么
node tmp\attack-probe2.cjs         # copyTo DUP / swapDays 可达性
node tmp\attack-nrange.cjs         # 判据观测过的 n 取值集合 + 有无源码扫描
node tmp\propose-criteria.cjs      # 4 条候选判据的判别力自检

# 判据（每个变异体各跑一遍）
node check-v4.cjs      --impl tmp\attack-XXX.js
node check-hygiene.cjs --impl tmp\attack-XXX.js
node check-closure.cjs --impl tmp\attack-XXX.js
```

产物（`tmp/` 下）：

| 文件 | 作用 |
|---|---|
| `attack-gen.cjs` | 生成器；每个锚点断言出现次数，防假变异体 |
| `attack-base.js` | 中性基线（S82 下 82/82 + H1/H2 绿） |
| `attack-001a…001g.js` | ① 的 7 个变异体 |
| `attack-002a…002c.js` + `attack-lib3p.js` | ② 的 3 个违规实现 + 假第三方库 |
| `attack-003a…003d.js` | ③ 的 4 个变异体（含 swapDays 等价变异对照） |
| `attack-probe.cjs` / `attack-probe2.cjs` / `attack-nrange.cjs` / `propose-criteria.cjs` | 证据脚本 |
| `attack-logs/attack-*.v4.log` | **S80**（80 条判据）全部原始输出 |
| `attack-logs/v82-*.v4.log` | **S82**（82 条判据）全部原始输出 |
| `attack-logs/*.hygiene.log` / `*.closure.log` / `probe.log` / `probe2.log` / `propose.log` | 其余原始输出 |

> `tmp/` 下另有 `attack-io.js`、`attack-json.js`、`attack-n-leadzero.js`、`attack-copyto-noconflict.js`
> （21:31–21:35 落盘）**不是本代理产物**，本报告不引用；以 `attack-gen.cjs` 重新生成的那批为准。

边界（本报告没做的事）：

1. 只打 JS 臂。Lisp 臂的对应形态（`format` 输出 `~d`、`with-open-file`）未跑；H3 的 Lisp 正则未验证。
2. H2（不依赖 cwd）只比对**输出**，所以"读了相对路径文件但结果不进 stdout"不会被抓——已在 ② 用 002a/002c 实证。
3. 没穷举 ② 的其它外泄通道（网络、`Date`/随机、环境变量）。按 §2 的论证它们同样不可观测，但没逐条造变异体验证。
4. 没有改动任何 checker、没有动 `runs/`；`runs/full-js-table/impl.js` sha256 `dd4c274af5c1222fccc4f6b903a7e0e430fb8ad1ceee71039b18d8e0fc76309` 攻击前后一致。

---

## 7. 一句话

> ① 不是盲区，是**取值只覆盖到 3**：判据比的是整行字节，`007` 当场就红；但 `n≥4` 与**行首空白**一次都没被观测过。
> ② 是真盲区，而且是**结构性的**：stdout 已被 82 条判据钉死，文件 I/O 的痕迹全在 stdout 之外，只能靠源码扫描。
> ③ 的 `copyTo` 两个分支都能被合法输入触发——CONFLICT 那一半已被并发补丁 `#83/#84` 补上（S80 时是真盲区），
> DUP 那一半仍全绿；`swapDays` 的 CONFLICT 则是不可达死分支，补判据等于造假绿。

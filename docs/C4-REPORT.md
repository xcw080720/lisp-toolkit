# C4 变异审计：干净重跑与分类

工作目录：`lisp-toolkit/experiments/timetable-ab`
生成时间：2026-11-01
数据来源：本轮**现场重跑**，未采用任何历史结果。

---

## 0. 方法与纪律

### 0.1 重跑命令（逐只、现场执行）

```powershell
$env:SBCL_WSL="kali-linux"
node check-scale.cjs   --impl runs/closure-mutants/<mutant>
node check-closure.cjs --impl runs/closure-mutants/<mutant>
```

### 0.2 解析规则（上一轮的错就在这里）

两个脚本的行尾都是 `-- N passed, M failed`（`check-scale.cjs:414`、`check-closure.cjs:184`），
不是在用的正则 `N/M 通过`。本轮按下面的规则判定，**没有出现一次解析失败**：

| 项 | 提取方式 |
|---|---|
| `scale_pass` / `scale_fail` | 行尾 `-- (\d+) passed, (\d+) failed` |
| `closure_pass` / `closure_fail` | 同上 |
| `closure_failing_ids` | 逐行抓 `[FAIL] (K\d+)`（`check-closure.cjs:182` 的格式） |
| 兼容 `N/M 通过` | 仅在 `-- ...passed...failed` 缺失时作为回退 |
| 解析不出数字 | 一律回读原始输出人工确认，**不许写 null** |

判定：`scale_fail > 0` 或 `closure_fail > 0` 或存在 `[FAIL]` 行 → **KILLED**；两者皆零 → **SURVIVED**。

### 0.3 关于旧 `results-c4-mutants.tsv`

未采用其任何数据。为执行覆盖写，读过一次，内容为 12 行全部 `null/null` + 全部 `SURVIVED`，
与本轮实测（8 KILLED）直接矛盾，符合已知的"只认 `N/M 通过`"解析 bug。

### 0.4 只读约束与完整性

- `runs/` 下所有文件未修改；`impl`、`checker`、`spec` 均未改动。
  核对方式：`runs/` 全树最新 mtime 为 16:59（本轮作业始于 21:19），无一个文件落在本轮时间窗内。
- **本轮我只写了两个文件**：`results-c4-mutants.tsv`、`C4-REPORT.md`。
  说明：核对时发现工作目录下另有 `check-hygiene.cjs`、`SPEC-AUDIT.md`、`tmp/cmp*.cjs`、
  `tmp/probe-msg.lisp` 等文件在本轮时间窗内被写入，**这些不是本任务产物**，应是同一工作区上的
  并发进程所为。`runs/` 未被波及。
- 第三节 B 类所需的逐字节对比，探针输入写在 `$env:TEMP\c4probe\`（工作目录之外），未污染工作区。

基线与被审样本的 SHA256 前 16 位（备复核）：

| 文件 | sha256[:16] |
|---|---|
| `runs/scale-js/impl.js` | `764EBAB23BA4223C` |
| `runs/scale-lisp/impl.lisp` | `FC90519A95561348` |
| `runs/closure-mutants/js-L1.js` | `A92254C0A232529A` |
| `runs/closure-mutants/cl-L127.lisp` | `E0ACBD6B38376E0D` |
| `runs/closure-mutants/cl-L427.lisp` | `F33A5A55F33BAB0E` |
| `runs/closure-mutants/cl-L444.lisp` | `67A221691907252E` |

---

## 一、重跑结果表（12 只）

`scale` = check-scale.cjs（36 条）；`closure` = check-closure.cjs（K1–K7）。

| # | mutant | scale | closure | verdict | 被抓判据 | 判据给出的原因（原文） |
|---|---|---|---|---|---|---|
| 1 | `js-L1.js` | 36 / 0 | 7 / 0 | **SURVIVED** | – | – |
| 2 | `js-L30.js` | 36 / 0 | 6 / 1 | **KILLED** | K1 | tag 未保留：得到 undefined |
| 3 | `js-L99.js` | 36 / 0 | 6 / 1 | **KILLED** | K6 | 应原样落到 周3 第3..4节，得到 周3 第3..2节 |
| 4 | `js-L157.js` | 36 / 0 | 6 / 1 | **KILLED** | K2 | 应收窄到 5..5，得到 3..5 |
| 5 | `js-L187.js` | 36 / 0 | 6 / 1 | **KILLED** | K7 | periodFrom 应夹在 ≥1，得到 -2 |
| 6 | `js-L216.js` | 36 / 0 | 6 / 1 | **KILLED** | K3 | n 应为 2，得到 0 |
| 7 | `cl-L127.lisp` | 36 / 0 | 7 / 0 | **SURVIVED** | – | – |
| 8 | `cl-L200.lisp` | 36 / 0 | 6 / 1 | **KILLED** | K4 | location 不该被丢：得到 [] |
| 9 | `cl-L282.lisp` | 36 / 0 | 6 / 1 | **KILLED** | K5 | 节次被改写：得到 1..4 |
| 10 | `cl-L380.lisp` | 36 / 0 | 6 / 1 | **KILLED** | K7 | periodFrom 应夹在 ≥1，得到 -2 |
| 11 | `cl-L427.lisp` | 36 / 0 | 7 / 0 | **SURVIVED** | – | – |
| 12 | `cl-L444.lisp` | 36 / 0 | 7 / 0 | **SURVIVED** | – | – |

### 判据鉴别力分布

| 判据 | 抓到的变异体 | 次数 |
|---|---|---|
| K1 add-tag-roundtrip | js-L30 | 1 |
| K2 trim-to-single-slot | js-L157 | 1 |
| K3 untag-count | js-L216 | 1 |
| K4 location-roundtrip | cl-L200 | 1 |
| K5 add-keeps-period-from | cl-L282 | 1 |
| K6 move-periods-landed | js-L99 | 1 |
| K7 shift-clamp-min1 | js-L187, cl-L380 | 2 |

**K1–K7 全部至少命中一次**，无死判据。

### 一个必须记下的结构事实

12 只变异体在 `check-scale.cjs` 上是 **36/36 全绿**：本批闭包变异体对 36 条 scale 判据的
杀伤力为 **0/12**。8 次击杀全部来自 `check-closure.cjs`。这与既有结论一致——gate 只跑
check-scale，所以这批变异的杀伤力完全在 gate 射程之外。

---

## 二、杀死率

```
killed / total = 8 / 12 = 66.7%
```

| 臂 | killed | 杀死率 |
|---|---|---|
| JS（6 只） | 5 | 83.3% |
| CL（6 只） | 3 | 50.0% |
| 合计 | 8 | 66.7% |

存活 4 只：`js-L1.js`、`cl-L127.lisp`、`cl-L427.lisp`、`cl-L444.lisp`。
每只相对原实现都只差**一行**（`git diff --no-index --numstat` 全部为 `1/1` 或 `0/1`）。

---

## 三、存活变异：diff + 分类 + 证据

### 3.1 `js-L1.js` → **B 等价变异**

**diff**（`runs/scale-js/impl.js` → `runs/closure-mutants/js-L1.js`，`0 增 / 1 删`）

```diff
-'use strict';
 // 课表 ops 执行器 —— 表驱动
 // 一条 op 声明 = 参数夹紧(kind) + 必填校验(need) + 执行分支(run) + 日志文案(say) + 可用名单(REG 的键)
```

改动：删掉第 1 行 `'use strict';`（文件从 9394 字节变 9380 字节，行数 309→308）。

**为什么等价（静态）**：strict 模式只在下面这些构造上有语义差：`with`、裸 `this`、
`arguments`/`arguments.callee`、八进制字面量、重复形参、给未声明变量赋值、对不可配置属性
`delete`。全文检索 `runs/scale-js/impl.js`：无 `with`、无 `this`、无 `arguments`、
无 `callee`、无 `0o` 字面量；所有赋值目标（`out` 等）都是已声明变量。构造一条都不存在。

**逐字节对比证据**（`stdout` SHA256 比对，探针覆盖 15 个 op 全部 + 边界）

| 探针 | 内容 | 原实现 vs js-L1 |
|---|---|---|
| in1 | 15 个 op 全串一遍，含空格与中文 | 1884 B / 1884 B **相同** |
| in2 | 空 ops | 95 / 95 **相同** |
| in3 | 未知 op（整批拒绝） | 124 / 124 **相同** |
| in4 | unicode + weeks 变体 + tag | 570 / 570 **相同** |
| in5 | 负值/浮点夹紧、越界 day | 810 / 810 **相同** |
| in6 | swap 自比、del 未命中、clear 越界 | 581 / 581 **相同** |
| in7 | `ops: null` | 42 / 42 **相同** |
| in8 | `add` 缺 course 等缺字段 | 443 / 443 **相同** |
| in9 | 非法 JSON | 双方 exit 1、stdout 均 0 B；stderr 仅行号 284→283（删行导致的位置偏移） |
| in10 | 空串 tag / untag | 447 / 447 **相同** |

**唯一可观测差异**是 in9 崩溃栈里的源码行号（差 1 行），属删行引起的位置漂移，
不触及 spec 的任何输出契约。→ **B**

---

### 3.2 `cl-L127.lisp` → **C 越界变异**

**diff**（`runs/scale-lisp/impl.lisp` → `runs/closure-mutants/cl-L127.lisp`，`1/1`）

```diff
@@ -123,9 +123,9 @@
           do (cond ((eql ch #\") (write-string "\\\"" o))
                    ((eql ch #\\) (write-string "\\\\" o))
-                   ((< code 32) (format o "\\u~4,'0x" code))
+                   ((<= code 32) (format o "\\u~4,'0x" code))
```

改动：JSON 字符串写出器的控制字符判定由 `code < 32` 放宽为 `code <= 32`，
于是 **空格 U+0020 也被转义成 `\u0020`**。

**它是可观测的**，而且有两层——这点必须说清，不能混进 B：

1. **原始字节层**：含空格的输入全部不同。in1 `2673 → 3079` 字节；28 KB 大输入 `28027 → 30107`。
   ```diff
   -  "name":"\u7532 \u8BFE"          (原实现：字面空格)
   +  "name":"\u7532\u0020\u8BFE"     (变异体：转义空格)
   ```
2. **解析后 `opsText` 字段层**（关键）：`opsText` 是"JSON 文本套在字符串里"，所以转义变化
   改变了这个**字符串的值**，不是只改变它的写法：
   ```
   原 ：[{"op":"add","course":{"name":"\u7EBF \u4EE3", ...}}]
   变异：[{"op":"add","course":{"name":"\u7EBF\u0020\u4EE3", ...}}]
   ```
   但把 `opsText` 再解析一次，两者深度相等（`opsText re-parsed deep equal: true`）。

**解析后其余三个字段完全相等**：`courses` / `log` / `n` strict deep-equal 全为 true
（in1 实测：`log equal: true`、`courses equal: true`、`n 14/14`）。

**为什么不是 A**：`tasks/scale.spec.md` 里指不到任何一行被违反。逐条核对：

| spec 行 | 规定 | 变异体是否满足 |
|---|---|---|
| L22 | 输出形如 `{"opsText":"...","courses":[...],"log":[...],"n":2}` | 满足（示例非规范） |
| L25 | `log` 每条带 `N) ` 前缀，按执行顺序从 1 起 | 满足（解析后前缀仍是 `1) `） |
| L27 | 未知 op → `opsText:""`、`n:0`、课表原样、日志一条 | 满足（实测 `opsText` 仍为 `""`） |
| L28 | 空 ops → `opsText:""`、`n:0`、`log:[]` | 满足 |
| L61 | 输出必须是合法 JSON，字段名与契约一致 | 满足（`\u0020` 是合法 JSON 转义） |

spec 对"JSON 序列化形式"（空格/非 ASCII 是否转义、键序）**一句话都没有**。
按"指不到行号的不写 A"的规则，它不能记 A；但它又确实可观测，也不是 B。→ **C，记边界**。

**边界记录（这是本轮最值得留的一条）**：36 条 scale 判据 + K1–K7 **全部在 `JSON.parse(stdout)`
之后断言**；对 `opsText` 唯一的断言是 `o.opsText === ''`（`check-scale.cjs:120`，未知 op 整批拒绝）。
因此「输出的 JSON 序列化保真度」整块不在判据射程内。这是 **spec 缺口**，不是判据缺口：
现在就补判据等于给 spec 追加一条未写明的约束。若日后确需 `opsText` 字节保真，
应先改 spec（例如加一行"`opsText` 必须与输入的 ops 文本一致"或"输出 JSON 不得转义
ASCII 可打印字符"），再据该行补判据。

---

### 3.3 `cl-L427.lisp` → **B 等价变异**

**diff**（`1/1`）

```diff
@@ -423,9 +423,9 @@
         (incf n (or cnt 0))
-        (when (and msg (string/= msg ""))
+        (when (or msg (string/= msg ""))
           (incf i)
           (push (fmt "~d) ~a" i msg) log))))
```

改动：日志记账条件 `and` → `or`。

**为什么等价（可证）**：两式只在 `msg` 为 `""` 或 `nil` 时分叉——
- `msg = ""` 时，`and` 版得 `nil` 跳过，`or` 版因 `""` 在 Lisp 里为真而记一条空文案；
- `msg = nil` 时，`and` 版跳过，`or` 版会走 `(string/= nil "")` 抛 type-error。

而 `run-op` 返回值表里**每一个 `msg` 都是非空 `fmt` 串**，既不会是 `""` 也不会是 `nil`：
逐个检查 `runs/scale-lisp/impl.lisp` 的全部 `(values ...)` 站点——262–264、287、295、298、
321–323、332、346–347、362–363、375–376、391–392、403、412–413、418，以及 `run-op` 自身
的错误路径 270、273，加上 `defop-each` 宏（255–264）产出的固定文案
`"~a：命中 ~a 门（匹配「~a」）"` / `"~a：没找到「~a」"`。
全部是字面量前缀的非空 format 串。**没有任何可达输入能让 `msg` 落进 `""` 或 `nil`**，
故两式在所有合法输入上恒等。

**逐字节对比证据**（11 组探针，含 28 KB 大输出）

| 探针组 | in1–in8、in10 | in9（非法 JSON） | big（200 门课 / 5 个 op） |
|---|---|---|---|
| 原实现 vs cl-L427 | 全部 SHA256 **相同** | 双方同类 `SIMPLE-ERROR`、stdout 均 0 B | 28027 B **相同**（`DA7795EF…`） |

大输出超过了默认 4 KB 缓冲，仍然逐字节相同——顺带排除了"缓冲未 flush 被截断"的可能。
→ **B**

---

### 3.4 `cl-L444.lisp` → **B 等价变异**

**diff**（`0 增 / 1 删`）

```diff
@@ -440,9 +440,8 @@
    (write-json (list (cons "opsText" opstext)
                      (cons "courses" (mapcar #'course-alist courses))
                      (cons "log" log)
                      (cons "n" n)))))
-(finish-output)
 
 (defun read-text (path)
```

改动：删掉第 444 行的**顶层** `(finish-output)`（文件 19100 → 19084 字节，行数 474→473）。

**为什么等价**：这一行是顶层表单，位置在 `(defun emit …)` 之后、`(defun read-text …)` 之前
（变异体里 `read-text` 移到 445 行），**在加载/编译期执行**。那一刻 `emit` 还没被调用过，
stdout 上一个字节都还没有，`finish-output` 无事可做。真正的输出由 `main` 里
（`impl.lisp:463/465/471`）调用 `emit` 写出，而 SBCL 正常退出时会 flush 标准输出缓冲。

**逐字节对比证据**

| 探针组 | in1–in8、in10 | in9 | big（28 KB） |
|---|---|---|---|
| 原实现 vs cl-L444 | 全部 SHA256 **相同** | 双方 exit/输出一致 | 28027 B **相同**（`DA7795EF…`） |

28 KB 输出完整落盘、与原实现逐字节相同，直接证明没有因删掉这行而丢缓冲。
→ **B**

---

### 3.5 分类汇总

| mutant | 改动 | 类别 | 依据 |
|---|---|---|---|
| `js-L1.js` | 删 `'use strict';` | **B** | 10 组探针 stdout 逐字节相同；全文无 strict 敏感构造 |
| `cl-L127.lisp` | `< 32` → `<= 32`（转义空格） | **C** | 字节/`opsText` 层可观测，但 spec 无一行规定序列化形式 |
| `cl-L427.lisp` | `and` → `or` | **B** | 可证：无 op 返回 `""`/`nil` 的 `msg`；11 组探针逐字节相同 |
| `cl-L444.lisp` | 删顶层 `(finish-output)` | **B** | 加载期执行时 stdout 为空；11 组探针（含 28 KB）逐字节相同 |

**A / B / C = 0 / 3 / 1**

---

## 四、A 类建议补的判据

**本轮无 A 类，故无候选判据。**

没有一只存活变异违反 `tasks/scale.spec.md` 的任何一条，因此给不出"命令序列 + 期望输出 + spec 行号"
三件套——按"指不到行号的不写"的规则，这里留空而不硬凑。

需要区分清楚两种"看起来该补"的情况，它们都不是 A：

1. `cl-L127.lisp`（空格转义）：看似判据漏了，实为 **spec 未规定**。真要管，先补 spec 一行，
   再补判据；否则就是拿判据去加 spec 里没写的约束。
2. `js-L1` / `cl-L427` / `cl-L444`：输出逐字节相同，任何输入下都测不出来，补判据也无从下断言。

**若确有必要扩判据，建议顺序是**：先改 spec（写明期望的序列化保真度 / 是否要求 `'use strict'`），
再据新行扩 `check-closure.cjs`。当前 7 条 K 判据对这批 12 只变异体的鉴别力是 8/12，
剩下的 4 只全部落在"spec 未规定"或"行为不可观测"里，不是判据写得不够严。

---

## 附：本轮产物

| 文件 | 内容 |
|---|---|
| `results-c4-mutants.tsv` | 12 行重跑结果（7 列，含 `closure_failing_ids`） |
| `C4-REPORT.md` | 本报告 |

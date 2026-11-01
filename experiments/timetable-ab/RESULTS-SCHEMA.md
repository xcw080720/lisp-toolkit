# results.tsv 字段表

> 生成：`node experiments/timetable-ab/collect.cjs --out experiments/timetable-ab/results.tsv`
> 现状：81 行（0 skipped）。**12 列自动填，5 列留空等人填。**

## 一、自动列（脚本填，可复算）

| 列 | 含义 | 来源 | 口径说明 |
|---|---|---|---|
| `run` | 运行目录名 | 目录 | 内部代号，不是论文用词 |
| `lang` | 语言 | 扩展名 | `.lisp`→common-lisp，`.js/.cjs/.mjs`→javascript，`.jl`→julia，其余同名 |
| `impl` | 实现文件名 | 目录内优先 `impl.*` | 部分臂有多个源文件时只取主实现 |
| `bytes` | UTF-8 字节 | `metric.cjs` | 原样文件大小 |
| `lines` | 物理行 | `metric.cjs` | **已作废为因变量**，仅留档 |
| `code_lines` | 非空非注释行 | `metric.cjs` | 同上 |
| `chars` | **非空白非注释字符** | `metric.cjs` | **主口径** |
| `log` | 有无 log.txt | 目录 | 36/81 有 |
| `log_lines` | log 行数 | log.txt | — |
| `ops_from_log` | op 数 | log 里 `--ops "a,b,c"` 最长一份 | **只有 2/81 能从 log 取到**，其余需从规格补 |
| `checks_in_log` | 跑过几种判据 | log 里 `check-*.cjs` 去重 | 只能证明"跑过"，不能证明"通过了" |
| `first_green` | log 里出现过全绿 | 正则 `全绿|0 failed|passed` | 弱信号，不等于 first-pass acceptance |

## 二、待填列（人读，不许猜）

| 列 | 定义 | 怎么填 |
|---|---|---|
| `first_pass` | 第一次生成就被编译器/判据接受的比例（0–1） | 重放一次 `compile-file` + 判据；不过就是不过 |
| `rework_rounds` | 从首个产物到全绿之间的修改轮数 | 数 log 里的 edit/重跑次数，一条改动算一轮 |
| `silent_failures` | 不报错但结果错的次数 | **必须人验**：比对输出形状，不能靠退出码 |
| `status` | `auto` / `human` / `undecidable` | 不可判的写 `undecidable` 并在 note 里写缺哪个条件（C1–C5） |
| `note` | 一句话 | 差异、异常、口径变更都写这里 |

## 三、缺口编号（与 CONDITIONS.md 对齐）

| 编号 | 缺口 | 影响的列 |
|---|---|---|
| C1 | 执行者档位（缺小模型通道） | first_pass、rework_rounds 全部不可判 |
| C2 | 时间轴（缺独占机器/时钟对齐） | 任何时间列 |
| C3 | 规模（≤30 op） | chars 的外推 |
| C4 | 模型族（单族） | 语言效应 vs 训练分布 |
| C5 | 判据标定（9 条存活变异） | silent_failures 的覆盖率 |

## 四、曾经误报的"差异"（已查清，撤回）

| 项 | 曾记 | 实际 |
|---|---|---|
| 编年史 11460 vs results.tsv 11458 | 记为"同一 run 差 2 字符，未查" | **不成立**：11460 是 `scale-lisp`，11458 是 `audit-lisp`，**两个不同的 run**。报告与表格一致 |

教训：跨文件比对数字前必须先对齐**主键**（run 名），否则会把两个 run 的差当成同一个 run 的差。


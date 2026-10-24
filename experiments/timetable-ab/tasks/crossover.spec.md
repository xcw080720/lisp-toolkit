# 交叉点实验（crossover）：30 个 op，两种写法

## 目的

量出"CL+单源 DSL" 与 "JS 表驱动" 的**成本交叉点**。昨晚测到 19–34，但那是行数口径、单次、且熟练度未平。
本轮用**新鲜的手**重测，并把结论写成公式而不是区间。

## 预注册（跑前贴进对话，跑完不许改）

```
H1  Lisp 的每 op 增量 < JS 的每 op 增量（在 N=30 处比较）
H2  交叉点 N* 落在 10 ≤ N* ≤ 30
H3  同一 agent 第二轮建 30 op 的成本 < 第一轮（熟练度效应）
否证条件：任一条不成立就记"否"
```

## 语言与写法（两个臂，串行跑，不并行）

| 臂 | 写法 | 要求 |
|---|---|---|
| **CL** | `defop` 宏单源 + 手写 JSON（复用 skills/lisp-json） | 可用活体 REPL |
| **JS** | `OPS` 表单源 + `JSON.parse` | 标准库随便用 |

## 30 个 op（按形状分三组，各 10 个）

**A 组：纯横切（改一个标量字段）**
`setDay` `setPeriodFrom` `setPeriodTo` `setTeacher` `setLocation` `setNote` `setWeeks` `clearNote` `bumpDay` `bumpPeriod`

**B 组：复合（对命中集合做两步）**
`moveDay`（改 day 且顺延节次）`swapTeacher`（两门课互换老师）`copyWeeks`（A 的周次抄给 B）
`mergeCourses`（同名合并）`splitCourse`（一门拆两门）`rotateDay`（整周轮换）`trimWeeks`（裁周次）
`padWeeks`（补周次）`renumber`（重排节次）`sortByName`（按名排序）

**C 组：批处理 / 参数化**
`bulkMark`（给命中课打标）`bulkClear`（清标）`bulkShift`（集体平移）`bulkCopy`（复制到另一天）
`filterDay`（只留某天）`dropWeek`（删某周）`keepWeek`（只留某周）`statsByDay`（按天统计）
`validate`（整表校验）`normalize`（整表规整）

## 判据（这是本轮的硬要求）

**每加一个 op，必须同时加一条不变量。** 昨天出现过两次假绿（`tag-untag`、curv 的 20 个新 op 零覆盖）。

- 每条不变量写成"操作前 → 操作后"的断言，例如：
  `bumpDay(+1)` 之后，每门命中课的 `day` 要么 +1，要么被夹在 1..7；
- 判据必须**先证明能红**：给一个故意写错的实现，判据要报错；
- 报告里贴出"判据能红"的证据。

## 每轮要记的数

```
<HH:mm:ss> | op=<名字> | 组=<A|B|C> | 累计行数=<L> | 本步新增=<d> | 动了几处=<n> | 不变量=<k 条 全绿>
```

## 时间戳（v2 协议）

`T0` 收任务 / `T1` 首次落盘 / `T2` 首次全绿。缺 T1 只许报前两个口径。

## 输出

1. 两条曲线：行数 vs N（CL / JS）；
2. 两个斜率：`c_cl`、`c_js`（用最后 10 个 op 的增量均值）；
3. 交叉点 `N* = (建_JS − 建_CL) / (c_js − c_cl)`；
4. **H3 专项**：记录第二轮（换一个新领域、同样 30 个 op）的 `T1→T2` 与总行数，和第一轮比。

## 报告口径（必须写）

```
口径：<命令跨度 | 到全绿 | 纯写码>
样本：n=2 轮（熟练度对照）
归因：A<几> B<几> C<几> D<几>   （沿用归因文件的四类）
```

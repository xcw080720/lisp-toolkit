# 五条改动（冻结，对两种语言一字不差）

> 规则：每次只把**这一条**交给 agent，不给实现提示。
> 每条改动单独计时；三条 run 之外的一句话都不许多说。

---

## 改动 1：加一个 `swap` op

给 `ops` 增加 `swap`：把 `match` 命中的课与 `with` 命中的课的 `(day, periodFrom, periodTo)` 互换。

- 两侧都必须**恰好命中 1 门**，否则不执行，日志写原因。
- `opsText` 显示为：`换「高数」和「英语」的时间`。

**验收**：`cases` 中 `swap-ok`、`swap-ambiguous` 两条。

## 改动 2：`edit` 支持改 `weeks`

`edit` 的 `set.weeks` 现在生效：按 `weeks.type ∈ all|range|odd|even|list` 校验，非法值**不写**并记日志 `周次格式不对，跳过`。

- `range/odd/even` 必须有 `from`/`to`；`list` 必须有 `list` 数组。

**验收**：`cases` 中 `edit-weeks-ok`、`edit-weeks-bad` 两条。

## 改动 3：`add` 支持 `remindOffsets`

`course.remindOffsets`：整数数组，最多 3 个，单位分钟；缺省 `[]`。

- 超过 3 个 → 取前 3 个，日志写 `提醒点太多，只留 3 个`。
- `opsText` 里这门课后面加 `（带提醒）`。

**验收**：`cases` 中 `add-remind-ok`、`add-remind-truncate` 两条。

## 改动 4：日志加序号，`n` 改语义

- 每条日志前面加 `1) `、`2) `（按执行顺序，从 1 起）。
- `n` 的含义改为**实际改动条数**：删除 3 条算 3，改动 2 条算 2，新增 1 条算 1。

**验收**：`cases` 中 `log-numbering`、`n-semantics` 两条。

## 改动 5：未知 op 改为整批拒绝

遇到未知 `op` 时，**一条都不执行**：

- 输出 `opsText` 为空串，`n=0`，课表原样返回；
- 日志只有一条：`拒绝：未知 op nope`。

**验收**：`cases` 中 `reject-unknown` 一条。

---

## 判据（这条改动算不算完成）

1. `cases` 里对应的验收条目全过；
2. 不许违反 spec 里已有的 6 条约束（尤其"未知 op 不许静默"）；
3. 赛道 B 的硬约束：单次 `git diff` ≤ 40 行，且不许重写整个文件。

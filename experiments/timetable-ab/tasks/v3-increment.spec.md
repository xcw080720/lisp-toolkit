# v3 增量规格：op 16–30

> 用于 `PROTOCOL-v3-increment.md`。**#state 的行格式不变**，因此 base 36 条判据仍然有效。
> 新 op 只操作已有字段（name / teacher / loc / day / from / to），不引入新字段。

## 追加的 15 条命令

| # | 命令 | 参数 | 语义 | 成功时 n |
|---|---|---|---|---|
| 16 | `swapTeacher` | a b | 交换两门课的 teacher | 2 |
| 17 | `swapLoc` | a b | 交换两门课的 loc | 2 |
| 18 | `copyTo` | name day from to | 复制该课到指定时间，新名 `name_3`；需查重名与冲突 | 1 |
| 19 | `truncate` | day | 该天只保留名字字典序最小的一门 | 删除数 |
| 20 | `keep` | day n | 该天只保留字典序前 n 门 | 删除数 |
| 21 | `renameTeacher` | t1 t2 | 全表把 teacher=t1 改成 t2 | 改动数 |
| 22 | `renameLoc` | l1 l2 | 全表把 loc=l1 改成 l2 | 改动数 |
| 23 | `dedupe` | （无） | 删除 teacher/loc/day/from/to 完全相同的重复课（保留字典序最小的名字） | 删除数 |
| 24 | `compress` | day | 该天课程按原 from 升序重排为连续时段：第 k 门 = `(k, k+1)` | 改动数 |
| 25 | `compact` | （无） | 对 1..7 每天都执行一次 compress | 总改动数 |
| 26 | `mirror` | day day2 | 把 day 的全部课复制到 day2，名字加 `_m`；name2 上已有的同名冲突则 `DUP` | 复制数 |
| 27 | `absorb` | a b | 把 b 的 teacher/loc 并入 a，**保留 b** | 2 |
| 28 | `swapDays` | d1 d2 | 两天所有课互换 day（若互换后产生时段冲突则 `CONFLICT` 且不生效） | 两天的课数之和 |
| 29 | `promote` | name | 把该课移到同一天第一个能放下的空时段（from 从 1 起试） | 1 |
| 30 | `purge` | teacher | 删除该教师全部课程 | 删除数 |

## 通用规则（与 base 相同）

- 参数个数或取值越界 → `err BADARG`，状态不变
- 目标不存在 → `err NOTFOUND`
- 需要查重的（`copyTo` / `mirror`）→ `err DUP`
- 需要查冲突的（`copyTo` / `swapDays`）→ `err CONFLICT`，且**不得部分生效**
- 空命令串 / 未知命令 → `err BADARG`
- 输出格式、`#state` 排序与行格式**一律不变**

## 判据编号

| 判据 id | 对应 op |
|---|---|
| 37–51 | 16–30（一一对应） |

第 k 个新 op 加入后，应满足 `check-v3 --upto (36+k)` 全绿。

## 口径消歧（2026-10-31 追加）

- enameTeacher / enameLoc 匹配 0 门时返回 **ok <verb> 0**（不是 NOTFOUND）。NOTFOUND 只用于「指名某门课但不存在」的情况（如 edit / del / copyTo）。
- dedupe / compact 匹配 0 时同样返回 ok 0。
- 本批判据未覆盖「0 匹配」这条；下一轮判据应补。

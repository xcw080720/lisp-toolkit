# t2a-single 记账（单宏臂：一个 `defop` 吃下 9 个新 op / 3 种新形状）

基线：`impl.lisp` 467 行，15 个 op，`check-scale.cjs` 20/20。全程只用一个宏 `defop`（未新建任何宏）。
本文件按"每加一个 op 记一笔"追加；行数用 `LF` 计数（`s.match(/\n/g).length`），与 `read` 的行号一致。

格式：`时刻 | op | 形状 | 加了后行数 | 本步新增 | 动了几个地方（逐处列出）`

```
10:31:42 | op=sortBy         | 形状=B | 加了后行数=512 | 本步新增=45 | 动了 2 处：① 新增 3 个公共函数 split-comma(8)/course-key(9)/course-less(11) —— 参数化排序必需；② 1 个 defop 表单(9)
10:31:49 | op=shiftAll       | 形状=B | 加了后行数=521 | 本步新增=9  | 动了 1 处：1 个 defop 表单
10:31:54 | op=filterDay      | 形状=B | 加了后行数=528 | 本步新增=7  | 动了 1 处：1 个 defop 表单
10:32:20 | op=countByTeacher | 形状=C | 加了后行数=550 | 本步新增=22 | 动了 6 处：① defop 文档字符串 1 行（宏内，非功能）② 新增 result 返回通道 4 行 ③ run-all 收第 3 个返回值 +1 行 ④ emit 新增 results 键 +5 行 ⑤ main 多接一个值改写 1 行 ⑥ 1 个 defop 表单(6)
10:32:29 | op=countByDay     | 形状=C | 加了后行数=555 | 本步新增=5  | 动了 1 处：1 个 defop 表单
10:32:34 | op=busiestDay     | 形状=C | 加了后行数=567 | 本步新增=12 | 动了 1 处：1 个 defop 表单（哈希计数写在 body 里）
10:32:45 | op=conflictOf     | 形状=D | 加了后行数=590 | 本步新增=23 | 动了 2 处：① 新增 seed-courses(5)（"全等名优先、退化到子串"的种子集合）② 1 个 defop 表单(12)；results 通道复用，零执行层改动
10:32:54 | op=sameTeacher    | 形状=D | 加了后行数=598 | 本步新增=8  | 动了 1 处：1 个 defop 表单
10:32:58 | op=sameName       | 形状=D | 加了后行数=606 | 本步新增=8  | 动了 1 处：1 个 defop 表单（10:33:42 定稿：same* 语义改为"返回整组"，本步净行数不变）
```

合计 467 → 606，净增 139 行；`check-scale` 每一步都是 20/20。

## 三种"新形状"的第一次，各自动了什么

| 形状首次 | 宏体 | 分发 run-op | 日志 run-all | 输出 emit | 其它 | 处数 | 行数 |
|---|---|---|---|---|---|---|---|
| B（sortBy） | 0 | 0 | 0 | 0 | 3 个排序工具函数 + 表单 | **2** | **45** |
| C（countByTeacher） | 1 行文档 | 0 | +1 行 | +5 行（results） | result 通道 + main 传参 + 表单 | **6** | **22** |
| D（conflictOf） | 0 | 0 | 0 | 0 | 种子集合 seed-courses + 表单 | **2** | **23** |

## 关键结论（机制层面）

1. **形状 B 几乎不花钱，因为基线早就不是"一种形状"**：原有 15 个 op 里只有 9 个带 `match` 槽
   （del/edit/move/swap/rename/duplicate/trim/shift/tag），另外 6 个（add/clear/untag/sort/swapDay/stats）
   本来就是"无 match 的整表/查询 op"。`defop` 的声明槽位 `(name fields &body body)` 对"有没有 match"
   天然中立 → 形状 B 的整表语义只是 body 写法不同，宏一行没动。
2. **形状 C 撞的不是"形状"，是"返回类型"**：只读统计要返回数字，而原实现只有 `n + 日志文案` 两个出口。
   这一堵墙在**执行层**（run-all/emit/main），不在宏里 —— `defop` 的 body 是任意 Lisp，第三个返回值
   自动透传，宏体只需改 1 行文档。代价 11 行，一次性，形状 D 全部白拿。
3. **形状 D 本身几乎免费**：集合结果复用 C 的 results 通道，只多一个"种子集合"工具（5 行）+
   每 op 一个 7–12 行表单。**没有新增任何声明槽位**。
4. `defop` 上新增槽位 = **0**；新增宏 = **0**；改到已有 15 个声明 = **0 行**（每步都跑 check-scale，20/20 从未掉）。

## 判据

- `verify.cjs`：9 条不变量，9/9 通过（B1 多键排序、B2 全体 +1、B3 按天过滤、C1/C2/C3 三个只读值 + n=0 + 数据不变、D1 边界重叠算冲突、D2/D3 整组返回）。
- `red.cjs`：把每个 op 的 `defop` 表单注释成 `#|...|#` 后重跑，9/9 都"恰好该条红、其余 8 条仍绿"。
- `node ..\..\check-scale.cjs --impl impl.lisp`：20/20（原有判据一条没坏）。

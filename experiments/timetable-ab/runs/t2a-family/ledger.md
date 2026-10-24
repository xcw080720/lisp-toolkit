# t2a-family 记账（二阶 DSL：defop-family）

环境：SBCL 2.6.9；基线 `impl.base.lisp` = **467 行 / 15 op / check-scale 20/20**
口径：行数一律 `node wc.cjs`（`\r?\n` 切分 + 去尾空元素）；块行数用 `node account.cjs`（括号配平法）
成品：`impl.lisp` = **631 行 / 24 op**

## 0. 起点

```
10:29:22 | 基线 impl.base.lisp | 15 op | 467 行 | check-scale 20/20
```

## 1. 引擎 + 形状 R + 形状 A（老 op 迁到 family 生成的宏上）

```
10:31:00 | 阶段 0 | 契约=引擎+形状R+形状A | 加了后行数=506 | 本步新增=+39（wc 实测，467→506）
```

动了几个地方（6 处）：
1. `op-spec` 加 `shape` 槽（L223，改 1 行）
2. `register-op` 加 `&optional shape` + `:shape`（L227-231，改 2 行）
3. 新增 `op-shape` 访问器（L233-235，+3 行）
4. 引擎本体（L246-278，+33 行）= `family-macro-name` 2 + `family-fill` 5 + `family-splice` 5 + `family-expand` 7 + `defop-family` 5 + 注释/空行 9
5. 三条声明 + 别名（+15 行）：`:raw` 2、`(defmacro defop ...)` 别名 3、`:match-edit` 10
6. 删掉单个 `defop-each`（11 行），4 处调用改成 `defop-match-edit`（行数不变：rename 2 / trim 5 / shift 5 / tag 2）

判据：`check-scale 20/20`（在 506 行处实测）。

## 2. 每加一个 op 的记账（本实验重点）

格式：`时刻 | op | 形状 | 加了后行数 | 本步新增 | 动了几个地方（逐处列出）`

```
10:33:09 | 声明 :table-wide      | 只声明不产 op | 515 | +9  | 1 处：L300-307 声明本体 7 行 + 注释 1 + 空行 1
10:33:18 | op=sortBy    | 形状=B | 527 | +12 | 1 处：6a 段头 3 行 + op 本体 9 行
10:33:31 | 引擎修补 family-expand | —            | 529 | +2  | 1 处：L266-272（:op-name 填充提到整棵树，见 §4）
（块量）  | op=shiftAll  | 形状=B | 538 | +9  | 1 处：空行 1 + op 本体 8 行
10:33:57 | op=filterDay  | 形状=B | 545 | +7  | 1 处：空行 1 + op 本体 6 行
10:34:15 | 声明 :readonly-stat   | 只声明不产 op | 562 | +17 | 1 处：L309-324 声明本体 15 行 + 注释 1 + 空行 1
10:34:20 | op=countByTeacher | 形状=C | 571 | +9  | 1 处：6b 段头 3 行 + op 本体 6 行
10:34:24 | op=countByDay     | 形状=C | 577 | +6  | 1 处：空行 1 + op 本体 5 行
10:34:29 | op=busiestDay     | 形状=C | 584 | +7  | 1 处：空行 1 + op 本体 6 行
（块量）  | D 的公共设施（*results* / note-result / emit）| D 前置 | 589 | +5 | 2 处：L326-329 注释+defvar+defun 4 行；emit 加 result 键 1 行
10:34:41 | 声明 :cross-ref       | 只声明不产 op | 606 | +17 | 1 处：L331-345 声明本体 14 行 + 注释 1 + 空行 2
10:34:46 | op=conflictOf  | 形状=D | 617 | +11 | 1 处：6c 段头 3 行 + op 本体 8 行
10:34:50 | op=sameTeacher | 形状=D | 624 | +7  | 1 处：空行 1 + op 本体 6 行
10:34:57 | op=sameName    | 形状=D | 631 | +7  | 1 处：空行 1 + op 本体 6 行
```

（标"块量"的两行由 `account.cjs` 的配平行数给出：shiftAll 8+1、D 设施 4+1；其余均为 `wc.cjs` 实测。）

## 3. 每条 defop-family 声明本身花了多少行、改了什么

| 声明 | 行数 | 位置 | 内容 |
|---|---|---|---|
| `:raw`（形状 R，自管） | **2** | L281-282 | 只给 doc，`prelude` 留空 ⇒ 宏退化成老 `defop` |
| `:match-edit`（形状 A） | **10** | L289-298 | 骨架：`pat`/`hits` + `dolist` 里放 `:body` + 命中/未命中两套文案 |
| `:table-wide`（形状 B） | **7** | L301-307 | 骨架：`tbl`/`n`/`note` + 收尾 `(values n (or note ...))` |
| `:readonly-stat`（形状 C） | **15** | L310-324 | 骨架：`tbl` + 聚合套件 `counts`/`keys`/`bump`/`rows` + `note` + 只报数 |
| `:cross-ref`（形状 D） | **14** | L332-345 | 骨架：`tbl`/`pat`/`sel`/`self`/`out` + 收尾 `note-result` 上交集合 |

引擎本体（一次写成，之后只在 §4 动过一次）：

```
family-macro-name  2 行
family-fill        5 行
family-splice      5 行
family-expand      7 行   ← 唯一被改过的地方
defop-family       5 行（含 docstring）
合计 24 行代码 / 28 行含注释 / 33 行含注释与空行
```

## 4. 引擎改动史（回答"加第 2、3 种形状时有没有动 defop-family 本体"）

```
10:33:31 | 第 2 种形状（B）的第一个 op | 动 1 次 | 改 1 处 | 净 +2 行
          症状：sortBy 的 note 里写 :op-name，却印出字面量 "OP-NAME"
          原因：family-fill 只作用在骨架（prelude/epilogue）上，op 自己的 body 没被填
          修法：把 family-fill 提升到整棵展开树 —— L266-272，5 行 → 7 行
10:34:15 | 第 3 种形状（C）加完 | 动 0 次 | 0 行
10:34:41 | 第 4 种形状（D）加完 | 动 0 次 | 0 行（D 需要的 5 行公共设施在宏外面）
```

即：**`defop-family` 这个宏本身从写出来到收尾一字未动；被改的是它的辅助函数 `family-expand`，1 次、+2 行。**

## 5. 判据运行记录

```
10:34:57 | node verify.cjs        → 9 passed, 0 failed（B:1-3 / C:4-6 / D:7-9）
10:35:23 | node red.cjs           → 9/9 都能红（每条判据一个定点变异；另交叉确认 #2 在 #1 的变异下仍绿）
10:35:0x | node ..\..\check-scale.cjs --impl impl.lisp → 20 passed, 0 failed（631 行处）
10:36:26 | node diff-legacy.cjs   → 14/14 负载逐字节相同（老 15 个 op 行为不变）；
                                    名册老 15 个全部保留且为前缀，新增 9 个
```

## 6. 形状归属（probe-shapes.cjs 实测）

```
add del edit move swap duplicate clear untag sort swapDay stats  → RAW（11 个）
rename trim shift tag                                           → MATCH-EDIT（4 个）
sortBy shiftAll filterDay                                       → TABLE-WIDE
countByTeacher countByDay busiestDay                            → READONLY-STAT
conflictOf sameTeacher sameName                                 → CROSS-REF
```

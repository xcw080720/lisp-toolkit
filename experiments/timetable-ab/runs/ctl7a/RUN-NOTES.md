# RUN-NOTES · ctl7a（有技能包 · 7 篇）

## 记账

| 项 | 值 |
|---|---|
| T0 读完技能包、开始读规格 | 19:18:52 |
| T1 impl.lisp 首次落盘 | 19:19:52 |
| T2 首次三组全绿 | 19:22:03 |
| 终态复跑 | 19:22:33（仍 9/9、6/6、1/1） |
| `metric.cjs impl.lisp` | **8799 字符** / 424 物理行 / 338 代码行 |

## 判据结果

| 组 | 首跑 | 终态 |
|---|---|---|
| #1–#9 | 0 passed, 9 failed | **9 passed, 0 failed** |
| #21–#26 | 0 passed, 6 failed | **6 passed, 0 failed** |
| #34 | 0 passed, 1 failed | **1 passed, 0 failed** |

红证明（`empty.lisp`，不读 argv、不打印）：三组同样 0/9、0/6、0/1，均 exit 1。

首跑全红的单一原因：文件在**读取期**就炸（reader error），一条语义判据都没被执行到。
1 个语法错误 → 16 条判据同时报 `stdout 非 JSON`。

## 返工 4 轮

| 轮 | 症状 | 改动 |
|---|---|---|
| 1 | `unmatched close parenthesis` Line 165 | 数组分支删掉多出的右括号，把 `(unless … (return))` 收回 `loop` 体内 |
| 2 | `IF … got 4` | 数组分支的 `multiple-value-bind` 提前闭合（`(push …)`/`(setf …)` 落到了 `loop` 层）；把它们变成 mvb 的 body |
| 3 | `undefined variable: K` + `The function SB-EXT:*POSIX-ARGV* is undefined` | 对象分支整段 loop 删掉，改为「读第一对 → 交给 `jval-obj-rest` 续读」；`(sb-ext:*posix-argv*)` → `sb-ext:*posix-argv*`（变量不是函数调用） |
| 4 | 能跑但日志写 `拒绝：未知 op NIL`，所有 op 都变未知 | `jval` 里 `(jstr s (1+ i))` → `(jstr s i)`：`jstr` 自己跳过开引号，多传 1 让每个键丢首字符 |

## 自写不变量（probe.cjs，10 条）

P1 浮点不写成 `16.5d0` / P2 `true`·`null` 往返 / P3 不倒挂且 ≥1 / P4 swap 多匹配拒绝 /
P5 空 ops 契约 / P6 空对象不塌成 null / P7 日志编号连续 / P8 整批拒绝课表原样 /
P9 默认 weeks 只在缺失时补 / P10 move 全·缺两态 —— 全绿。

## 变异对照（判据有没有牙）

| 变异 | 官方判据 | probe |
|---|---|---|
| mut1 去掉 `(max 1 …)` 节次下界 | #26、#34 红 | 全绿（**没抓住**） |
| mut2 去掉代理对分支 | #23 红 | 全绿（**没抓住**） |
| mut3 去掉未知 op 整批拒绝 | #8 红 | P6、P8 红 |

结论：probe 是官方判据的**补集**，不是超集；不可互相替代。

## 结构性事实（交接用）

- 未知 op → 整包拒绝：`opsText:""`、`n:0`、courses 原样、日志恰好 1 条。
- 日志只有一个出口（`emit`）＋ 输出期统一加 `N) ` 前缀；编号来自输出顺序，不是执行顺序。
- 写入只有一个通道（`set-fld`）；`fix-order` 是"写完之后"的唯一不变量修复点。
- 输出全 ASCII（≥127 转 `\uXXXX`，增补平面拆代理对）→ 与 stdout 编码解耦。
- 对象/数组用带标签的 cons（`:obj`/`:arr`）表示，空对象与空数组可区分。

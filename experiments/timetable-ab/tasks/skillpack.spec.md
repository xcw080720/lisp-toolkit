# skillpack：技能包本身作为自变量

## 假设

今天写进 `lisp-toolkit` 的四篇技能（defop / JSON / 成本 / 宏价值）**能不能让一个 fresh agent
写出更小、更少踩坑的实现？**

## 对照（同语言，排除跨语言干扰）

| 臂 | 条件 | 数据来源 |
|---|---|---|
| **A 无技能包** | 只给规格与判据；**禁活体 REPL**，只许 `sbcl --script` | 已有：`runs/repl-g1`（415 行 / **9028 字符** / 9-9） |
| **B 有技能包** | 同样只给规格与判据、同样禁 REPL；**额外给四篇 SKILL.md** | 本轮新跑 |

## 任务与判据（与 A 完全一致）

- 规格：`tasks/scale.spec.md`（5 个 op：add/del/edit/move/swap + 输出契约）
- 判据：`node check-scale.cjs --impl impl.lisp --only 1,2,3,4,5,6,7,8,9`，目标 **9/9**
- 禁改 `tasks/`、`cases/`、`check-scale.cjs`

## 要给 agent 读的技能（四篇，全文）

```
lisp-toolkit/skills/lisp-defop/SKILL.md
lisp-toolkit/skills/lisp-json/SKILL.md
lisp-toolkit/skills/lisp-cost/SKILL.md
lisp-toolkit/skills/lisp-macro-value/SKILL.md
```

## 指标（三个口径一起报，别再只报行数）

```
非空白非注释字符   ← 主指标
代码行
物理行
判据结果 / 返工轮数
T0 / T1 / T2
```

字符用 `node metric.cjs <file>` 算。

## 预注册

```
H1  B 的字符数 < A（9028）的 80%          → 技能包省下超过 20% 的代码
H2  B 首次即 9/9，零返工                  → 技能包减少了踩坑
H3  B 的实现里出现 defop 类单源结构       → 技能包改变了写法，不只是变短
否证：B 的字符数 ≥ A，或 B 需要更多返工 → 技能包无效或有害
```

## 记录

```
T0 / T1 / T2
每一条命令 → log.txt（UTF-8 无 BOM）
最终：字符数、代码行、物理行
```

## 为什么要跟 A 用同样的"禁 REPL"

技能包里有一篇专门讲 REPL 的价值（`lisp-repl`）。如果 B 用了活体，
测到的就是"REPL + 技能包"两个变量。**本轮只测技能包。**
REPL 那一维已经在 `repl-g1` vs `repl-g2` 单独测过（287 vs 414 行）。

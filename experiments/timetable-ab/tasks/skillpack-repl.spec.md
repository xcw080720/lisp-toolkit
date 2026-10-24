# skillpack-repl：技能包条件下重测 REPL（新基线）

## 为什么重测

技能包从今天起是**常设条件**。所以 `repl-g1`（415 行 / 9028 字符，无技能包时写的）
**不再是合格基线**，它测的是"没经验的模型 + 只有脚本"。

新基线序列只有两条：

| 臂 | 条件 | 数据 |
|---|---|---|
| **SP-script** | 技能包 + **只许** `sbcl --script` | **已有**：`runs/skillpack-cl`（**7775 字符** / 302 代码行 / 9-9 / 返工 1 轮） |
| **SP-live** | 技能包 + **可用**活体 REPL | 本轮新跑 |

## 预注册（跑前写死，跑完不许改）

```
H1  SP-live 的字符数 < SP-script（7775）          → REPL 在技能包条件下仍有收益
H2  SP-live 的返工轮数 < SP-script（1 轮）         → REPL 减少试错
H3【关键·反直觉】REPL 的收益会**小于**无技能包那轮（414→287，−31%）
       因为技能包与 REPL 都在解决同一件事：**避免"绕过"**
       技能包已经把大部分"绕"提前消掉 → REPL 的边际收益下降
否证：H3 不成立（REPL 收益仍 ≥20%）→ 说明两者不重叠，各管一段
```

**H3 是这一轮唯一有意思的东西**：如果技能包与 REPL 可替代，那"要不要上 REPL"
就变成"你的技能包写到多厚"的函数，而不是独立的语言优势。

## 任务与判据（与 SP-script 完全一致）

- 规格：`tasks/scale.spec.md`（5 个 op）
- 判据：`node check-scale.cjs --impl impl.lisp --only 1,2,3,4,5,6,7,8,9` → **9/9**
- 另跑一次 `--only 19`（edit 必须真改节次）作为附加检查

## 必须读的技能包（四篇全文）

```
lisp-toolkit/skills/lisp-defop/SKILL.md
lisp-toolkit/skills/lisp-json/SKILL.md
lisp-toolkit/skills/lisp-cost/SKILL.md
lisp-toolkit/skills/lisp-macro-value/SKILL.md
```

## 指标（三个口径一起报）

```
非空白非注释字符   ← 主指标（node metric.cjs impl.lisp）
代码行 / 物理行
判据结果 / 返工轮数 / 首个错误
T0 / T1 / T2（T0 = 读完技能包并开始读规格）
```

## 隔离要求（硬）

- **fresh agent**，不许看 `runs/` 下任何其它目录；
- 每臂一个 agent，**不许同一个 agent 连做两臂**；
- 报告里注明：`上下文隔离：fresh-agent-per-arm`。

## 记账要点

```
用完技能包里哪一条？具体到条目
有没有一条是"技能包说了但我没照做"的？为什么
REPL 具体帮你避开了什么？（要能指出是哪一次调用）
```

# lisp-toolkit 技能包

给子代理读的短文，每篇一个可执行结论。**给几篇本身是实验变量**（见 `experiments/timetable-ab/tasks/skillpack.spec.md`）。

## 当前（v3，2026-10-31 起）

| 篇 | 状态 | 作用 |
|---|---|---|
| `lisp-v3-brief` | **必给** | v3 任务与三种方案定义，禁 JSON |
| `lisp-defop` | **给** | 单一知识源表单怎么写 |
| `lisp-macro-value` | **给** | 宏能做什么、不能做什么 |
| `lisp-cost` | 给（带口径提示） | 边际成本与交叉点，只作先验 |
| `lisp-json` | **v3 不给** | v3 禁用 I/O，给了会诱导违规 |
| `lisp-repl` | **v3 不给** | REPL 是单独一维，混进来就测不清 |
| `lisp-boundary` | 可选 | 展开期拒绝的边界 |
| `mutation-testing` | 可选 | 判据自证方法 |
| `handoff` | 不给 | 与实验无关 |

## 规矩

1. **一份实验只用一套技能包**，中途不换（换=换变量）。
2. 技能包里的数字必须和 `CLAIMS.md` 一致；不一致时以 CLAIMS 为准，并当场改技能包。
3. 不许在技能包里写"Lisp 更好"——只写"在什么条件下更省"。
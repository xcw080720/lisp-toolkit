# 任务 A：大学课表（中文）

> 冻结版。跑的过程中不得修改。改一个字就算新任务，必须重跑。

## 数据模型

```json
{"courses":[{"name":"高数","teacher":"张","location":"A101","day":1,"periodFrom":1,"periodTo":2,
             "weeks":{"type":"range","from":1,"to":16}}]}
```

- `day`：1–7（周一=1）
- `periodFrom` ≤ `periodTo`，均 ≥ 1
- `weeks.type` ∈ `all | range | odd | even | list`；`range/odd/even` 带 `from`/`to`；`list` 带 `list:[..]`

## op 集（4 个）

| op | 字段 | 语义 | 约束 |
|---|---|---|---|
| `add` | `course` | 追加一门课 | `name` 必填；缺 `weeks` 时默认 `range 1..totalWeeks`（totalWeeks 默认 16） |
| `del` | `match` | 删除名字包含 `match` 的课 | `match` 为空 → 报"没找到"；命中 0 条 → 报"没找到" |
| `edit` | `match`, `set` | 改命中课的字段 | 只改 `set` 里出现的键；`day` 夹到 1..7；`periodFrom/To` 至少 1 |
| `move` | `match`, `day`, `periodFrom`, `periodTo` | 改时间三件套 | 同 `edit` 的夹取规则；三个字段必须同时给 |

## 输出契约（两种语言一致）

实现必须提供可执行入口，读**一个** JSON 文件路径作为 argv[1]，向 stdout 打印**一个** JSON：

```json
{"opsText":"删掉「高数」；加「线代」","courses":[...],"log":["删掉 1 条「高数」"],"n":2}
```

- `opsText`：中文确认文案，多个 op 用 `；` 连接，无 op 时为空串
- `courses`：执行后的完整课表（顺序：未删除的保持原顺序，新增的追加在后）
- `log`：逐条执行日志（中文）
- `n`：实际生效的条数（删除按命中条数计）

入口方式：

- JS：`node impl.js input.json`
- Lisp：`sbcl --script impl.lisp input.json`

## 必须能过的约束（会被断言检查）

1. `add` 缺 `weeks` → 默认 `range 1..16`
2. `del` 命中 3 条 → `n += 3`，日志写条数
3. `edit` 的 `day=9` → 夹到 7；`periodFrom=0` → 保留原值（不改）
4. `move` 只给 `day` → 视为非法，不执行，日志说明
5. 未知 op（`op:"nope"`）→ 必须出现在 `log` 里，不许静默
6. 空 `ops` → `opsText` 为空串，`n=0`，`log` 为空数组

## 不算完成的情况

- 输出不是合法 JSON
- 字段名与契约不一致（例如把 `periodFrom` 写成 `period_from`）
- 静默忽略未知 op

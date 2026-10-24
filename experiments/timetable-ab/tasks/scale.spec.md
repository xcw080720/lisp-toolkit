# 规模臂规格：课表 ops 执行器（15 个 op 的路线图）

> 这是给"规模臂"用的规格。它的目的不是做一个好用的课表工具，而是造一个**会不断加 op** 的系统。
> 第 1–5 号 op 在**建的时候**就要有；第 6–15 号由后续十次改动逐个加入。

## 数据模型

```json
{"courses":[{"name":"高数","teacher":"张","location":"A101","day":1,"periodFrom":1,"periodTo":2,
             "weeks":{"type":"range","from":1,"to":16},"tag":null}]}
```

- `day`：1–7；`periodFrom ≤ periodTo`，均 ≥ 1
- `weeks.type` ∈ `all | range | odd | even | list`
- `tag`：字符串或 `null`（可选字段，缺省 `null`）

## 输出契约（与既有实验一致）

入口读一个 JSON 文件路径（argv[1]），向 stdout 打印一个 JSON：

```json
{"opsText":"...","courses":[...],"log":["1) ..."],"n":2}
```

- `log` 每条带 `N) ` 前缀，按执行顺序从 1 起
- `n` = 实际改动条数（删 3 条 = 3，改 2 条 = 2，新增 1 条 = 1）
- 未知 op → **整批拒绝**：`opsText:""`、`n:0`、课表原样、日志一条 `1) 拒绝：未知 op X`
- 空 `ops` → `opsText:""`、`n:0`、`log:[]`

## 建的时候就要有的 5 个 op

| op | 字段 | 语义 |
|---|---|---|
| `add` | `course` | 追加；缺 `weeks` → `range 1..16`；`day` 夹 1..7 |
| `del` | `match` | 名字含 `match` 的全删；0 命中 → 日志「没找到」 |
| `edit` | `match`, `set` | 只改 `set` 里的键；`day` 夹 1..7 |
| `move` | `match`,`day`,`periodFrom`,`periodTo` | 三件套缺任一 → 不执行 |
| `swap` | `match`, `with` | 两侧各命中恰好 1 门 → 互换时间三件套 |

## 十次改动（每次加一个 op，逐条给）

| # | op | 语义（一句话） |
|---|---|---|
| 6 | `rename` | `match`+`to`：命中课改名 |
| 7 | `duplicate` | `match`+`day`：把命中课复制到另一天（其余字段同） |
| 8 | `trim` | `match`+`from`+`to`：把命中课的节次范围收窄到 `[from,to]` |
| 9 | `clear` | `day`：删掉该天所有课 |
| 10 | `shift` | `match`+`delta`：命中课节次整体平移（夹在 ≥1，`periodTo ≥ periodFrom`） |
| 11 | `tag` | `match`+`tag`：命中课打标签 |
| 12 | `untag` | `tag`：删掉所有该标签 |
| 13 | `sort` | 无字段：课表按 `day` 升序、同天按 `periodFrom` 升序 |
| 14 | `swapDay` | `a`+`b`：把两天之间的所有课整体对调 |
| 15 | `stats` | 无字段：只产出一条日志「共 N 门课，M 个时段被占」 |

## 判据（不变量，不看文案）

每加一个 op，必须同时满足：

1. **既有 15 条不变量全绿**（回归）——加新 op 不许弄坏老的；
2. **新 op 的专项不变量**成立；
3. 输出必须是合法 JSON，字段名与契约一致。

具体不变量由 `check-scale.cjs` 执行，见该文件头部注释。

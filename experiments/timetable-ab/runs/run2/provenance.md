# provenance —— run2（JS · 赛道 A 从零实现）

结论：**impl.js 全部自己写，0 段抄。**

| 段落（impl.js） | 来源 |
|---|---|
| `clampInt` / `canonCourse` | 自己写 |
| `weeksOf`（range/odd/even/list/all + 缺省 range 1..totalWeeks） | 自己写 |
| `pickMatched`（`name` 包含 `match` 子串，空 match → 无命中） | 自己写 |
| `main()` 四个 op 分支（add / del / edit / move）+ 未知 op 兜底 | 自己写 |
| 输出装配（`opsText ； 连接`、`log`、`n`） | 自己写 |

## 明确没读 / 没抄的东西

- `oracle.js`：**没打开**（只算了 SHA256 核对冻结，未读内容）。
- `cases/hidden-A.json`：**没打开**（同上，仅哈希核对）。
- `runs/run1/`：**没读**（规则禁止读 runs 下其它目录）。
- `bench/op-layer-js/layer.js`、`weixuezhang/assets/www/app.js`：允许抄，但本题用不上，**没读**。

## 规范遵循说明

- 唯一依据：`tasks/A.spec.md` + `cases/public-A.json` 的 3 条样例。
- 文字模板从 spec 输出契约示例反推：`加「X」` / `加了「X」`、`删掉「X」` / `删掉 N 条「X」`；`edit` → `改「X」` / `改了 N 条「X」`，`move` → `移「X」` / `移了 N 条「X」`（spec 未给 edit/move 原话，按同一句式自拟）。
- 非法 move / 未知 op / 没找到 一律进 `log`，不计 `n`，不静默。

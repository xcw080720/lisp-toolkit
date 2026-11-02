# 禁改清单（DO-NOT-MODIFY）

> 2026-11-01 立。起因：我写了一个批量加横幅的脚本，把 `tasks/v3-full.spec.md` 的头加了一段注释——那份规格的 sha256 冻结在 `FREEZE-reproducible-layer-v3.1.txt` 里，一改就全废。
> 已经精确回滚、哈希恢复，但这说明**「靠我记得哪些文件不能动」是不成立的**。

---

## 一、规则

> **任何自动改文件的脚本，必须有一份禁改清单，且清单要能被机器检查。**
> 靠人记得哪些文件是冻结的，一定会漏。

脚本开工前第一步：**对清单里每个文件求 sha256，记下来；改完之后再求一次，不一致就报错并回滚。**

---

## 二、当前禁改清单

| 文件 | 冻结记录 | sha256（前 16 位） |
|---|---|---|
| `experiments/timetable-ab/tasks/v3-full.spec.md` | `FREEZE-reproducible-layer-v3.1.txt` | `b202981ae0ae5659` |
| `experiments/timetable-ab/check-v4.cjs` | 本文件 §四 说明 | 见下 |
| `experiments/timetable-ab/check-hygiene.cjs` | 同上 | 见下 |
| `experiments/timetable-ab/check-static.cjs` | 同上 | 见下 |
| `experiments/timetable-ab/runs/**` | 全树只读 | 逐格 impl 在 `FREEZE-*` 里 |

### 关于 check-*.cjs

它们**不是绝对禁改**——今晚确实改过（加 #83–#86、加行首检查、加编号注释）。但它们属于「改了必须记账」的那一类：

**每次改都必须同时做三件事：**
1. 在 `SPEC-AUDIT.md` 或对应的 `RELEASE-NOTES` 里写明改了什么
2. 重跑受影响的所有格，确认分数变化可解释
3. 如果是「加注释」这类不影响行为的改动，用**逐字节相同**的输出来证明等价

今晚加编号注释时做过这个证明：`A1`（旧版跑）与 `S1–S3`（新版跑）输出逐字节相同。

---

## 三、检查命令

开工前：

```powershell
Get-FileHash experiments/timetable-ab/tasks/v3-full.spec.md -Algorithm SHA256
# 应为 b202981ae0ae5659edab54acb4f3729462c1617a76b97e74bb7ebe9e982efce0
```

收工后同样一条，比对。

---

## 四、为什么这条要单独写一个文件

因为它不是「判据」，是**操作纪律**。写成文件的好处：

- 下次写批量脚本时，会先读它
- 不用靠记忆
- 出错后的回滚方法也在里面（求哈希 → 移除 → 再求哈希 → 比对）

---

## 五、今晚那次事故的完整记录

| 时刻 | 事件 |
|---|---|
| 23:0x | 写 `tools/add-banners.cjs`，目标里含 `tasks/v3-full.spec.md` |
| 23:0x | 运行，9 个文件被加横幅 |
| 立刻 | 发现 spec 的 sha256 从 `b202981a…` 变成 `c4b16f87…` |
| 立刻 | 精确移除横幅（从 MARK 到结束标记），吃掉紧邻换行 |
| 验证 | 哈希**逐字节**回到 `b202981ae0ae5659…efce0` |
| 损失 | **无**——但这是运气，不是设计 |

**为什么是运气**：我只是恰好加了「移除横幅」的代码，而且横幅文本可精确定位。如果加的是不可逆改动（比如改数字），就回不来了。

**所以要有清单，而不是靠「加的东西可逆」。**

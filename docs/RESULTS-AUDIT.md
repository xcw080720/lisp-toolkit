# RESULTS-AUDIT：可核层（v3.1）

> 这一份是整套实验里**唯一可以对外说"你自己复核"**的部分。
> 其余 101 个 run 见 `RESULTS-探索层.md`（标注为不可核）。
> 冻结记录：`FREEZE-reproducible-layer-v3.1.txt`

---

## 0. 为什么要有这一层

上一版报告的问题不是结论错，而是**证据链断了**：

| 项 | 旧（101 run） | 本层（4 格） |
|---|---|---|
| prompt 存档 | **1 / 101** | **4 / 4**（逐格 sha256） |
| spec 状态 | 中途改过（trim 语义、空串、swap） | **冻结**，sha256 存档 |
| 判据状态 | 中途改过 | **冻结**，sha256 存档 |
| 判据与 spec 一致 | 不一致（#32/#36 超纲） | **一致**（§6 补写两条） |
| 失败可判定 | 一半靠我判断语义 | **编译器报错，无需解读** |

## 1. 冻结基线

| 项 | sha256 |
|---|---|
| spec `tasks/v3.spec.md` | `7b27852da5340f3d35f5c8aeb0b3e3a06abdac6c1cdfdbe06e96a9a19e1960ce` |
| 判据 `check-v3.cjs` | `e3157bbcfe4ca8e1267f7abcbdefa79538df2d7a8d25bab1dad52b039ab14707` |

范围：**op 1–15**（15 个命令），判据 **1–36**。判据 37–56（增量与维护臂）**不在本层范围内**，因对应 spec 未纳入本次冻结。

## 2. 四格（各 1 次独立生成，新会话）

| 格 | chars | impl sha256 | 判据 1–36 | 首次通过 | 返工轮数 |
|---|---|---|---|---|---|
| aud-cl-macro | 5052 | `a4e7c0e2a06e50cf` | 5 / 36（crash 31） | **N** | **2** |
| aud-cl-inline | 6095 | `30787e792a5d80c3` | 36 / 36 | Y | 0 |
| aud-js-table | 3591 | `03c51f5e11dae00e` | 36 / 36 | Y | 0 |
| aud-js-inline | 5543 | `3ccdc8f3a193cec5` | 36 / 36 | Y | 0 |

每格目录含：`prompt.txt`（任务原文）、`impl.*`、`log.txt`（判据输出原文）。

## 3. 字符口径（同方案对比）

| 对比 | 值 |
|---|---|
| 语言效应（inline） | JS 5543 / CL 6095 = **0.91×** |
| 语言效应（抽象方案：table / macro） | JS 3591 / CL 5052 = **0.71×** |
| 方案效应（CL） | inline / macro = 6095 / 5052 = **1.21×** |
| 方案效应（JS） | inline / table = 5543 / 3591 = **1.54×** |

**方向与探索层一致**：语言效应小（0.71–0.91×），方案效应大（1.21–1.54×）。但 n=1，不能给区间。

## 4. 唯一一次干净失效：宏臂三轮迭代

这是本层最有价值的部分——**失败由编译器报出，不依赖任何语义解释**。

| 回合 | chars | 判据 1–36 | 失败形态 | 修复内容 |
|---|---|---|---|---|
| r1（冻结） | 5052 | **5 / 36**（crash 31） | `undefined variable: COMMON-LISP-USER::DAY`（DEFOP 宏展开时变量未绑定） | — |
| r2 | 5087 | **33 / 36**（crash 3） | `invalid number of arguments: 3`，`(COPY-COURSE ... :NAME "b")` | 修未绑定变量，**+35 字符换来 28 条判据恢复** |
| r3 | 5254 | **36 / 36** | — | 两处 `copy-course` 调用改为 `make-course` 逐槽复制 |

### 4.1 三个可写进论文的观察

**（1）一处宏错 → 31 条判据全崩。**
不是"31 个错"，是**同一个错被 31 条判据各撞了一次**。失败不是分布在 31 个地方，是集中在一个地方。

**（2）一处修复 → 28 条判据恢复，代价 35 字符。**
修好与修坏走同一条路径：改一处，大面积翻转。

**（3）剩下的错仍同时压着 2 个 op。**
`duplicate` 与 `copy` 共用同一个复制调用点，一处没改对，两个 op 一起坏。

### 4.2 与 inline 臂的对照

同样条件、同一批判据、同一份 prompt 结构：**inline 首次 36/36，返工 0 次。**

| 臂 | 首次 | 返工 | 失效形态 |
|---|---|---|---|
| macro | 5 / 36 | 2 轮 | 集中（一处压 31 条，后一处压 2 条） |
| inline | 36 / 36 | 0 | — |

**这是"收敛换来代码量、同时换来失效集中"的第一个干净样本**（n=1，只作方向证据）。

## 5. 本层能说与不能说

### 能说

1. 四格全部有完整证据链，可被第三方复核（含 prompt、impl、判据输出、冻结哈希）。
2. 字符口径下，**语言效应小、方案效应大**，方向与探索层一致。
3. 宏臂出现**单点失效扩散**：一处错误让 31 条判据失败，修复后一处未改对仍压 2 个 op。

### 不能说

1. **不能说概率**。每格 n=1，无区间、无显著性。
2. **不能说"宏更容易出错"**。只有 1 次 macro 生成失败、1 次 inline 生成全绿，n=1 不构成频率证据。
3. **不能外推到 30 op 与维护臂**。本层只覆盖 op 1–15。
4. **不能替代探索层**。探索层的 101 run 提供了"量级"，本层提供"可核"，两者不可互相代替。

## 6. 复核步骤（第三方照做即可）

```bash
cd lisp-toolkit/experiments/timetable-ab

# 1) 校验冻结基线
sha256sum tasks/v3.spec.md check-v3.cjs
#   应分别等于 §1 的两个哈希

# 2) 逐格复核（JS 臂）
node check-v3.cjs --impl runs/aud-js-table/impl.js  --upto 36
node check-v3.cjs --impl runs/aud-js-inline/impl.js --upto 36

# 3) 逐格复核（CL 臂；Windows 上需 WSL 里的 SBCL）
SBCL_WSL=kali-linux node check-v3.cjs --impl runs/aud-cl-macro/impl.lisp  --upto 36
SBCL_WSL=kali-linux node check-v3.cjs --impl runs/aud-cl-inline/impl.lisp --upto 36

# 4) 复核三轮迭代
for r in aud-cl-macro aud-cl-macro-r2 aud-cl-macro-r3; do
  SBCL_WSL=kali-linux node check-v3.cjs --impl runs/$r/impl.lisp --upto 36
done

# 5) 复核字符数
node metric.cjs runs/aud-*/impl.*
```

## 7. 本层已知的残留问题

| # | 问题 | 影响 |
|---|---|---|
| 1 | 每格 n=1 | 无区间，只能作方向 |
| 2 | 判据 37–56 未纳入 | 30 op 与维护臂不可核 |
| 3 | 模型版本/温度未记录 | 无法证明四格出自同一参数 |
| 4 | `aud-cl-macro` 的三轮修复由不同会话完成 | rework 计数口径 = "产物版本数"，非"同一会话内的轮次" |
| 5 | 可核层只覆盖 CL 与 JS | 不能替其他语言下结论 |

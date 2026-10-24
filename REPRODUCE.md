# REPRODUCE.md —— 复算这套实验的数

**目标**：任何人拿到仓库，不读实现代码，跑几条命令，得到同样的数。
如果得不到，**那是仓库的问题，不是你的问题**——请开 issue 附完整输出。

> 本文件经过一次**陌生 agent 盲跑**修订。它挑出的三处硬伤已修：
> ①「非空白字符」实际是「非空白**非注释**字符」；
> ② Windows 上 `*` 通配不展开、`/tmp` 不存在；
> ③ 判据编号里**没有 #20**（是 `15.5` 之后接着 `16`），而 `--only` 遇到不存在的编号
> 过去会静默返回 `0 passed, 0 failed`——**现在是 exit 2 并列出合法编号**。

---

## 先决条件

- Node.js ≥ 18 —— **只装 Node 就能跑完四条**
- 只有跑 `.lisp` 的判据才需要 SBCL；复算 1/2/3 都不需要

```powershell
# 仅跑 .lisp 判据时需要
$env:SBCL='<你的 sbcl.exe 路径>'      # Linux/macOS: export SBCL=$(which sbcl)
```

---

## 复算 1：技能包的体量

```bash
node experiments/timetable-ab/metric.cjs lisp-toolkit/skills/lisp-defop/SKILL.md lisp-toolkit/skills/lisp-json/SKILL.md lisp-toolkit/skills/lisp-macro-value/SKILL.md lisp-toolkit/skills/lisp-cost/SKILL.md lisp-toolkit/skills/lisp-repl/SKILL.md
```

**期望**：五篇各自的字符数，合计约 **9571**（个位数差异来自本地换行符）。

> Windows 的 cmd/PowerShell **不展开 `*`**，所以这里逐个列文件名。

---

## 复算 2：判据不接受"没有输出"的东西

```bash
node experiments/timetable-ab/check-scale.cjs --impl experiments/timetable-ab/cases/public-A.json
```

**期望**：`-- 0 passed, 20 failed`，**exit ≠ 0**。

（`.json` 不是可执行程序，跑不出 stdout。）**这一步如果绿了，说明判据是假的，后面所有数字都不作数。**

---

## 复算 3：同一份规格、四种实现的体量

```bash
node experiments/timetable-ab/metric.cjs experiments/timetable-ab/runs/scale-lisp/impl.lisp experiments/timetable-ab/runs/scale-js/impl.js experiments/timetable-ab/runs/f-java/impl.java experiments/timetable-ab/runs/f-rust/impl.rs
```

**期望**（`字符` 列，误差应为 0）：

| 文件 | 字符 |
|---|---|
| `impl.lisp` | **11289** |
| `impl.js` | **5933** |
| `impl.java` | **6970** |
| `impl.rs` | **9390** |

⚠️ **口径**：`字符` = 原文**去掉注释**之后**再去掉所有空白**的字符数
（`metric.cjs` 里 `noComment.replace(/\s+/g,'')`）。
只做 `-replace '\s',''` 而不去注释，会得到 11762 / 6315 / 7119 / 9650——
**那不是仓库对不上，是口径不同。**

---

## 复算 4（最推荐）：判据能"定点报警"

删一行，**只红一条**。

```bash
# 1) 复制一份实现（Windows 用 %TEMP%，没有 /tmp）
cp experiments/timetable-ab/runs/scale-js/impl.js "$TEMP/no-period.js"

# 2) 删掉这一行（负责 edit 的节次字段）：
#    else if (k === 'periodFrom' || k === 'periodTo') out[k] = COERCE.period(v);

# 3) 只跑第 19 条 —— 必须红
node experiments/timetable-ab/check-scale.cjs --impl "$TEMP/no-period.js" --only 19

# 4) 跑其余 19 条 —— 必须全绿
#    判据编号是 1..15, 15.5, 16..19，一共 20 条，没有 #20
node experiments/timetable-ab/check-scale.cjs --impl "$TEMP/no-period.js" --only 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15.5,16,17,18
```

**期望**：

```
第 19 条    → 0 passed, 1 failed    exit 1
其余 19 条  → 19 passed, 0 failed   exit 0
```

**为什么这条重要**：`edit` 静默丢弃 `periodFrom/periodTo` 这个 bug，曾在 18 条判据全绿时
活了一整晚（日志还写着"键：day/periodFrom/periodTo"）。第 19 条是事后补的，只认这一件事。

### 顺便验证 `--only` 不再骗人

```bash
node experiments/timetable-ab/check-scale.cjs --impl experiments/timetable-ab/runs/scale-js/impl.js --only 20
```

**期望**：`[ERROR] --only 里有不存在的编号: 20` + 合法编号清单，**exit 2**。
（这个守卫是盲跑者发现的：过去它返回 `0 passed, 0 failed` 且 exit 0——静默假绿。）

---

## 如果你复算不出来

把每条命令的**完整输出**贴成 issue。**复现失败是我最想收到的信息。**

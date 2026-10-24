# lisp-toolkit

三个静态检查器 + 一个 REPL 技能包：在把 `.lisp` 交给 SBCL 之前，先把"少括号、格式串、BOM"挡在门外。

**一条命令**：`./check.sh`（Windows：`check.cmd`）。只需要 SBCL。

```
== check-parens ==
[ok  ] tools/check-parens.lisp
-- 2 个文件，0 个有问题
== check-format ==
[ok  ] tools/check-parens.lisp（9 个顶层 form）
-- 2 个文件，0 个有问题
== check-encoding ==
[ok  ] 14 个文件：无 BOM、脚本全 ASCII
-- all checks passed
```

**抓什么**：少括号（报最外层 form 的行号 + 最内层未闭合括号）、`format` 参数比指令少、`~` 指令写进普通字符串、文件头 BOM、脚本里的非 ASCII。
**不抓什么**：语义错、包/API 误用、运行时行为。宁可少报，不误报。

---

## 装

```sh
# 任何有 SBCL 的机器
apt install sbcl        # Debian/Ubuntu
brew install sbcl       # macOS
# Windows: 从 https://www.sbcl.org/platform-table.html 装，或解包后 set SBCL=path\to\sbcl.exe
```

没有别的依赖。不是 Quicklisp 项目，不联网。

## 跑

```sh
./check.sh                       # 检查 tools/ + README + 脚本
sbcl --script tools/check-parens.lisp path/to/src   # 单个工具，参数可以是文件或目录
```

退出码 = 有问题的文件数（0 = 全过），所以能直接进 CI：

```yaml
- run: sudo apt-get install -y sbcl && ./check.sh
```

## 三个工具

### `tools/check-parens.lisp`

SBCL 对少一个右括号只报 `end of file ... (in form starting at line N)`；深层嵌套时你知道"某个 form 没闭上"，但不知道是哪一个。这个工具报两个位置：

```
[FAIL] fixtures/bad/unclosed.lisp
       最外层没闭合的 form 起于：第 4 行第 1 列
       最内层没闭合的括号在：第 5 行第 10 列（共 7 个未闭合）
       多余的闭括号：第 12 行第 3 列
```

能处理 `;` 注释、`#|...|#` 块注释、`"字符串"`、`|符号|`、`#\x` / `#\Space` / `#\(` 这类字符字面量。

### `tools/check-format.lisp`

两类事故，都是运行期才炸的：

```
[FAIL] fixtures/bad/missing-args.lisp
       第 1 行：FORMAT: 控制串要 2 个参数，只给了 1 个 —— "a=~a b=~a"
[FAIL] fixtures/bad/tilde-in-string.lisp
       第 1 行：WRITE-STRING: 字面量里有 ~ 指令，但这个函数不解析格式串 —— "line~%next"
```

只数"确定吃参数"的指令（`~a ~s ~d ~f` 等），`~{`/`~?` 按 1/2 记，其余当 0——所以不会误报，也可能漏报。
读文件时按文本里出现的 `pkg:` 前缀临时建包并 intern，遇到不认识的包不会中断。

### `tools/check-encoding.lisp`

```
[FAIL] BOM: src/foo.lisp
[FAIL] 脚本里有 362 个非 ASCII 字符: build.ps1
```

BOM 会让 SBCL 报 `The variable ﻿ is unbound`；无 BOM 的 `.ps1` 被 PowerShell 5.1 按 GBK 读，
中文注释的字节可能吞掉换行，脚本"少跑一段"却不报错。两道都是静默故障，所以单独查。

## 自己验一下它会失败

```sh
sbcl --script tools/check-parens.lisp fixtures/bad    # 1 个文件有问题
sbcl --script tools/check-format.lisp fixtures/bad    # 3 个文件有问题
sbcl --script tools/check-parens.lisp fixtures/good   # 0 个
```

## 技能包

`skills/lisp-repl/SKILL.md` —— 在活体 CL 镜像里干活的操作规程（不是工具，是给模型看的）。
它假设你能拿到一个 REPL 会话（SBCL + Slynk、或任何能把 form 送进镜像的通道）。

## 边界

- 三个检查器都只读文件，不改任何东西。
- `check-format` 是启发式：只认字面量控制串，拼出来的字符串查不到。
- 这套东西不替代测试。它只负责把"编译器本来能拦、但报得看不懂"的那几类错提前。

## 我们的两条立场

这套工具不是"Lisp 很好"的证明。它只把两件事说清楚：

1. **不要为了熟练度贬低自己。**
   同一件事，在不熟的语言里叫"又踩坑了"，在熟的语言里叫"正常工作"。账本不该按语言翻页——
   新语言的前 N 轮是学习成本，单列，不并进"这个语言更贵"。否则你比较的从来不是语言，
   是自己的熟练度，而且只给陌生那一侧记账。

2. **不要为了 debug 哭泣。**
   错误成本 = 发现时延 × 传播范围。Lisp 已经把发现时延压到近零（load 即编译），
   这三个检查器再把"报得看不懂"的那几类压到零；剩下的只有"改一行"。
   代价是可数的，情绪不必入场。

工具能做的到此为止：它不解决"Lisp 难不难"，只解决"错了多久才知道"。

## License

MIT。

---

## v2（2026-10-23）：从"检查器"扩到"成本模型"

v1 只有三个静态检查器 + 一个活体 REPL 技能。v2 加了**用数字说话**的部分——
全部数据来自一次跨语言对照实验（Lisp / JS / Rust / Julia，同一份规格、同一判据）。

### 新增技能

| 技能 | 一句话 |
|---|---|
| [`skills/lisp-defop`](skills/lisp-defop/SKILL.md) | 一条声明长出校验/文案/日志/分发/名册；**边界**：不管字段纵切，也不负责横切关注点 |
| [`skills/lisp-json`](skills/lisp-json/SKILL.md) | CL 手写 JSON **≈100 行，是所有对照语言里最省的**；含三个必踩的编码坑 |
| [`skills/lisp-cost`](skills/lisp-cost/SKILL.md) | 交叉点公式（`N* = (建_JS − 建_CL) / (13.7 − c_cl)`）与熟练度曲线 |

### 新增工具

```bash
sbcl --script tools/check-touches.lisp FILE [--strict]
```

**查"同一份知识散落在几处"**：字符串字面量出现 ≥3 次就报出来并给行号。
用在无宏手写实现上，第一条就是 `"day" 出现 11 次`——这正是"每加一个 op 要改 N 处"的静态证据。

> 它只是**指针**不是判决：字面量出现在 `(defop ...)` 声明里是正常的，
> 出现在 `cond` / 名册 / 日志里才是复制。看行号判断。

### v2 的三条结论（都可以复算）

1. **宏省的是声明成本，不是接入成本。** 给 15 个 op 加"审计"：宏 3 处、表驱动 1 处、手写 4 处（且 0 处 per-op）。
   O(1) 的前提是**分发器有统一漏斗**，跟有没有宏无关。
2. **组合深度免费，组合数量不免费。** 层内每 op 恒定 2 行；每新增一层付一次性 4–19 行。
3. **熟练度是变量。** 同一批人连写四次 CL，每 op 成本 92.5 → 59.5 → 24.5 → 12.7。
   拿第一次的数去和"写了一万遍的 JS"比，比的是人不是语言。

### 不要做的事

- **不要 retrofit**：把手写实现改成 defop 实测 +142 行，`N × (K−1) > 142` 才回本，K=3 时需 **N > 71**。
- **不要在 <10 个 op 的项目上套宏**：交叉点实测 19–34（新手），熟练后 10–18。
---

## v2.1.0（2026-10-24）：四层账

新增 [`skills/lisp-macro-value`](skills/lisp-macro-value/SKILL.md) —— **宏到底值在哪**，四层都有数：

| 维度 | 谁赢 | 受模型参数影响 |
|---|---|---|
| 编写成本（行数 / 触点） | 表驱动赢或打平 | 受影响（熟练度） |
| 产物扇出（改声明手改几处） | 打平（都 0 手改） | 不受 |
| **body 级内嵌横切** | **宏赢**（0 声明 vs 15 行声明 + 1 处手改） | 不受 |
| **展开期校验** | **宏独占** | 不受 |
| 运行时开销 | 宏赢 24%–68%（每次 1.3–3.5 ns） | 不受 |

一句话：**宏不是"更省"，是"更早"和"更贴近 body"。**

`skills/lisp-defop` 同步补了「宏的唯一独占场景」一节。

### 顺带记两个坑

- **Java 注解处理器最贵的不是 754 行，是静默失败**：删掉 `META-INF/services/javax.annotation.processing.Processor` 后，`javac` 退出码 0、无警告、就是不生成。
- **"为性能上哈希表"在 15 个 op 的规模上是伪需求**：alist 线性扫描只比宏展开的 `case` 慢 68%（8.5 vs 5.0 ns/次）。
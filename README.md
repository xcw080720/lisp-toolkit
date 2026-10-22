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

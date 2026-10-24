---
name: lisp-repl
description: Use when you need to work inside a live Common Lisp image through a REPL — evaluating forms, expanding macros, describing symbols, reading a backtrace and choosing a restart — instead of batch-running a file with `--script`, which throws the image away after one run.
---

# 在活体 CL 镜像里干活

`sbcl --script file.lisp` 只给一次性结果：跑完退出，没有 `describe`、没有 `trace`、没有 restart。
需要"问镜像"的时候（这是什么符号、宏展开成什么、哪个 form 没闭上、这层栈为什么会这样），
必须有一个**保持活着的** SBCL 会话。

本文是操作规程，不是 API 文档。

## 0. 先确认通道

能做到下面任一条，才算有 REPL：

- 一个 SBCL 进程 + 能持续送 form、读回打印值（Slynk/SLIME、自建 stdio 管道都算）；
- 或 `sbcl --load` 起一个交互进程，人工/程序把 form 写进 stdin。

做不到就必须退回 `--script`——那就别假装在"用 REPL 调试"，本文后半的动词都用不了。

## 1. 送 form 的规矩

1. **一次一个顶层 form**。一次塞十个，报错时你不知道是哪一个的锅。
2. **读打印值，不要读自己的意图**。`(defun f ...)` 返回 `F` 只说明它被定义了，不说明它算得对。
3. **每个判断后面跟一个它自己的证据**。`(length xs) => 40`，而不是"长度为 40"。
4. **改完立刻重跑那条断言**，不要攒。

## 2. 核心动词

| 想知道 | 发送 |
|---|---|
| 这个表达式的值 | `(form)` —— 直接求值，看打印值 |
| 这个宏展开了什么 | `(macroexpand-1 '(form))`，再看 `(macroexpand '(form))` |
| 这个符号是什么 | `(describe 'sym)`；`(documentation 'fn 'function)` |
| 这个对象的结构 | `(inspect obj)`，`:q` 退出 |
| 谁调用了谁 | `(trace fn other)` / `(untrace)` |
| 慢在哪 | `(time (form))` |
| 这段代码编成了什么 | `(disassemble #'fn)` |
| 名字包含某串的符号 | `(apropos "op")`；`(find-symbol "DEFOP" :app.ops)` |
| 这个包导出什么 | `(do-external-symbols (s :app.ops) (print s))` |
| 注册表里有什么 | `(maphash (lambda (k v) (format t "~a => ~a~%" k v)) *registry*)` |

**注册表要能问**：如果代码里有 `*registry*` 之类的 hash-table，先问它有什么，再改。
"我记得有三个 op"不是证据，`(length (list-ops))` 才是。

## 3. 出错时：先读，再选

1. 读条件类型和消息，不要立刻重跑。
2. `:ba`（或 `(sb-debug:list-backtrace)`）看是谁触发的。
3. 看有哪些 restart：`(compute-restarts)`。CL 的错不是"中断"，是"给上层一个选择"。
4. 选一个：`(invoke-restart 'use-zero)`、`(abort)` 回顶层、`:q` 退出。
5. **不要**为了跑通而把 `handler-case` 糊在出错点上——那会把错误变成静默。

## 4. 改代码的纪律

- 改一个函数：`(compile 'fn)` 或重新 `(load "file.lisp")`；两者都要再看一次返回值和 `*compile-*` 警告。
- 改完**先跑断言**，再跑生成/构建。
- 需要"产物不变"的场合（生成器、构建脚本）：改前后各存一份输出，逐字节比。
- 保留回滚副本；不要在 REPL 里对唯一一份文件做大改。

## 5. 载入新文件之前

先跑静态检查，别让 reader 替你报错：

```
sbcl --script tools/check-parens.lisp src
sbcl --script tools/check-format.lisp src
sbcl --script tools/check-encoding.lisp src
```

理由：SBCL 对少一个右括号只报 form 起点；格式串参数不够要等运行到那一行才炸。

## 6. 预检清单（每次载入前 10 秒）

```
(compile-file "src/x.lisp")   ; 看 warnings 和 failure-p
(load "src/x.fasl")           ; 看是否真能 load
```

`compile-file` 过、`load` 炸，说明是**顺序问题**（宏还没定义就被使用），不是语法问题。

## 7. 边界与失败模式

- **镜像是临时的**：不 `save-lisp-and-die` 就没有持久化；进程死了状态全丢。
- **包是隐式的**：`(in-package ...)` 会改全局 `*package*`，之后的 form 全部受影响。改完记得切回来。
- **`--script` 没有 debugger**：出问题直接退出，看不到栈。这就是本文存在的原因。
- **不要 eval 不可信输入**：`read` + `eval` 等于执行任意代码；读数据用 `*read-eval* nil`。
- **Windows**：SBCL 需要 `SBCL_HOME` 指向 core 所在目录；`--script` 的路径用正斜杠更稳。

## 8. 三条给自己的规矩

- **不熟不等于错。** 新语言前 N 轮的错误记作学习成本，单列；不要把它们并进"这个语言更贵"。
  否则你量的是熟练度，不是语言。
- **不为 debug 哭泣。** 报错是数据：记"什么错、多久发现、改了几行"，不记"又踩坑了"。
  发现自己开始用"难"形容一次报错时，停下来，把它拆成可数的两项。
- **只报你验过的。** 打印值是证据，记忆不是。

## 9. 收尾

回答里分开写三件事：**跑过的**（贴打印值）、**推断的**（标明是推断）、**没测的**（明确说没测）。
在活体镜像里最容易被"看起来成功"骗——`(defun ...)` 返回符号永远成功。

---

## 2026-10-24 追加：REPL 的产出是"看见"，不是"少写"

四格实测（同一份 5 op 规格、同一套 9 条判据）：

| 臂 | 非空白字符 | 判据 |
|---|---|---|
| 无技能包 · 只跑脚本 | 9028 | 9/9 |
| 无技能包 · 活体 REPL | 6314 | 9/9 |
| 有技能包 · 只跑脚本 | 7775 | 9/9 |
| **有技能包 · 活体 REPL** | **5957** | 9/9 |

### 一、REPL 真正的产出：抓住判据看不见的错

判据 9/9 全绿之后，REPL 还抓出两个**永远不会被 fixture 碰到**的错：

```lisp
(jw (jparse "{\"a\":[2.5, ...]}"))     ; 修好前输出 2.5d0 —— 非法 JSON
                                       ; 19 条用例全是整数，这条永远测不到

(op-edit {match:"高数" set:{day:9 periodFrom:5}})
                                       ; 修好前 periodTo 被静默改成 5
                                       ; 改了 set 之外的键，判据没覆盖
```

> **"测试说没坏"和"REPL 说哪里坏了"是两件事。**
> REPL 让你问的是"现在到底发生了什么"，测试只能问"我预设的输入有没有对"。

### 二、REPL 与技能包是**替代品**，不是叠加品

同一个 REPL，在有无技能包时收益不同：

```
无技能包 → 有技能包，REPL 收益：30.06% → 23.38%
技能包 → 加 REPL，技能包收益：13.88% →  5.65%
```

机制证据：技能包里"ASCII 兜底 127 行"那条，**活体臂没照做**——因为它一句
`(stream-external-format *standard-output*)` 就查到了答案。

- 技能包给的是**提前防御**（写之前就知道，多写行数）
- REPL 给的是**当场问清**（写的时候查，少写行数）

**两者都在解决"绕过"。** 所以：技能包越厚，REPL 的边际收益越小；
反过来，有 REPL 时，技能包不必写得那么防御。

### 三、一句

> **技能包替代经验，REPL 替代猜测。** 两者有交集，交集处只需要付一次。
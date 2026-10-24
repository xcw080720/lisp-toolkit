# ctl7b 运行报告（fresh agent，第 1 次做这个任务）

## 1. 时钟与体积

| 项 | 值 |
|---|---|
| **T0** 读完 7 篇技能包、开始读规格 | **19:18:48** |
| **T1** `impl.lisp` 首次全量落盘 | **≈19:20:30**（推定） |
| **T2** 首次三组判据全绿 | **19:21:01** |
| 全程（T0→T2） | **2 分 13 秒** |

T1 说明：文件系统上只有两个可证时刻——空实现落盘 19:18:58、首次 check 19:20:38；
T1 落在其间（probe 19:19:19 之后、首次 check 之前），取 19:20:30。

`node ..\..\metric.cjs impl.lisp`：

```
文件             语言   物理行   代码行   字符
impl.lisp        lisp    301      264     7248
```

## 2. 开跑前：空实现证明判据会红

`impl.lisp` 内容只有一行注释时：

```
=== RED-RUN A (1..9) ===
[FAIL] #1 add-default-weeks  — stdout 非 JSON
... (9 条全部 stdout 非 JSON)
-- 0 passed, 9 failed
exit=1
=== RED-RUN B (21..26) ===
-- 0 passed, 6 failed
exit=1
=== RED-RUN C (34) ===
-- 0 passed, 1 failed
exit=1
```

## 3. 三组首跑结果与返工

| 组 | 首跑（19:20:38） | 修复后 |
|---|---|---|
| A `--only 1..9` | **0 / 9** | **9 / 9** |
| B `--only 21..26` | **0 / 6** | **6 / 6** |
| C `--only 34` | **0 / 1** | **1 / 1** |

**返工 1 轮（语义）**：`(sb-ext:*posix-argv*)` → `sb-ext:*posix-argv*`
（把 special variable 当函数调用，`main` 一进就 UNDEFINED-FUNCTION）。

**另外 1 轮纯整理（不改语义，改后三组重跑仍全绿）**：`do-move` 里 `pt*` 被内层 `let` 遮蔽，合并成一次计算。

**1 次假警报（未改 impl）**：PowerShell 5.1 的 `Out-File -Encoding utf8` 给自测输入写了 BOM
（前 4 字节 `239,187,191,123`），SBCL 把它当字符 → `no non-whitespace characters in string ""`。
换成 `[IO.File]::WriteAllText(..., UTF8Encoding($false))` 即通。`check-scale.cjs` 用
`fs.writeFileSync` 写的是无 BOM 文件，所以这条**只打我的脚手架，不打实现**——
但它正是 lisp-json 技能包第三个坑的原文复现。

## 4. 首个错误的完整 stderr 原文

（`sbcl --script impl.lisp in1.json`，19:20:42）

```
Unhandled UNDEFINED-FUNCTION in thread #<SB-THREAD:THREAD tid=19644 "main thread" RUNNING
                                          {1100C78003}>:
  The function SB-EXT:*POSIX-ARGV* is undefined.

Backtrace for: #<SB-THREAD:THREAD tid=19644 "main thread" RUNNING {1100C78003}>
0: ("undefined function")
1: (MAIN)
2: (SB-INT:SIMPLE-EVAL-IN-LEXENV (MAIN) #<NULL-LEXENV>)
3: (EVAL-TLF (MAIN) 46 NIL)
4: ((LABELS SB-FASL::EVAL-FORM :IN SB-INT:LOAD-AS-SOURCE) (MAIN) 46)
5: ((LAMBDA (SB-KERNEL:FORM &KEY :CURRENT-INDEX &ALLOW-OTHER-KEYS) :IN SB-INT:LOAD-AS-SOURCE) (MAIN) :CURRENT-INDEX 46)
6: (SB-C::%DO-FORMS-FROM-INFO #<FUNCTION (LAMBDA (SB-KERNEL:FORM &KEY :CURRENT-INDEX &ALLOW-OTHER-KEYS) :IN SB-INT:LOAD-AS-SOURCE) {5FEEFB}> #<SB-C::SOURCE-INFO {1100C6DBA3}> SB-C::INPUT-ERROR-IN-LOAD)
7: (SB-INT:LOAD-AS-SOURCE #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl7b\\impl.lisp" {110003BC73}> :VERBOSE NIL :PRINT NIL :CONTEXT "loading")
8: ((LABELS SB-FASL::LOAD-STREAM-1 :IN LOAD) #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl7b\\impl.lisp" {110003BC73}> NIL)
9: (SB-FASL::CALL-WITH-LOAD-BINDINGS #<FUNCTION (LABELS SB-FASL::LOAD-STREAM-1 :IN LOAD) {5FF3AB}> #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl7b\\impl.lisp" {110003BC73}> NIL #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl7b\\impl.lisp" {110003BC73}>)
10: ((LABELS SB-FASL::LOAD-STREAM :IN LOAD) #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl7b\\impl.lisp" {110003BC73}> NIL)
11: (LOAD #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl7b\\impl.lisp" {110003BC73}> :VERBOSE NIL :PRINT NIL :IF-DOES-NOT-EXIST :ERROR :EXTERNAL-FORMAT :DEFAULT)
12: ((FLET SB-IMPL::LOAD-SCRIPT :IN SB-IMPL::PROCESS-SCRIPT) #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl7b\\impl.lisp" {110003BC73}>)
13: ((FLET SB-UNIX::BODY :IN SB-IMPL::PROCESS-SCRIPT))
14: ((FLET "WITHOUT-INTERRUPTS-BODY-" :IN SB-IMPL::PROCESS-SCRIPT))
15: (SB-IMPL::PROCESS-SCRIPT "impl.lisp")
16: (SB-IMPL::TOPLEVEL-INIT)
17: ((FLET SB-UNIX::BODY :IN SB-IMPL::START-LISP))
18: ((FLET "WITHOUT-INTERRUPTS-BODY-3" :IN SB-IMPL::START-LISP))
19: (SB-IMPL::%START-LISP)
20: ("foreign function: #x140048B39")
21: ("foreign function: #x14000B260")

unhandled condition in --disable-debugger mode, quitting
[exit code: 1]
```

（第二条，即 BOM 那条，是脚手架错，原文：）

```
Unhandled SB-INT:SIMPLE-PARSE-ERROR in thread #<SB-THREAD:THREAD tid=20816 "main thread" RUNNING
                                                 {1100C78003}>:
  no non-whitespace characters in string "".
```

## 5. 技能包里真正省事的与真正咬人的

**省事的（写之前就知道，零返工）**

- `loop for (k . v) in` 而不是 `on` —— 对象写出一次成型，没有 6/9 条判据齐红的场面。
- `:external-format :utf-8` 读文件 + 先问镜像 `(stream-external-format *standard-output*)`
  = `(UTF-8 REPLACEMENT)`，于是**没有写那 127 行 ASCII 兜底**，emoji 直接过（#23 是判据里最难的一条）。
- 判据口径：#1 比 `JSON.stringify(weeks)`，所以 `default-weeks` 的键序必须是 type/from/to；
  #25 要求 `{}` 写出 `{}` 而不是 `null`（对象用 `(:o . alist)` 标签，空对象仍有 cons）。

**咬人的**：`(sb-ext:*posix-argv*)` 加括号。技能包没写这条，我第一次就踩了。

## 6. 自写不变量（check-scale 不覆盖，按 handoff 第六节做）

`node probe.cjs` → **12 passed, 0 failed**：
未知 op 在中间→整批拒绝且课表原样 / 空 ops→`log:[]` / move day=99→7 且 periodFrom=0→1 /
swap 一侧多命中→不执行 / opsText 两个 op 都在 / 日志 1) 2) 连续 / n=2 /
未实现 op（stats）点名拒绝 / emoji+嵌套数组往返 / 负数全部夹紧不倒挂 /
edit 不倒挂 / edit 真的改节次（不是只写日志）。

`compile-file`：`WARNINGS-P=NIL FAILURE-P=NIL`。

## 7. 一句话

> 花时间最多的是**「通道/脚手架」类错误**（special variable 加括号、自测文件被 PowerShell 写成 BOM），
> 不是五个 op 的语义——语义一次写对，判据首跑只有 1 轮实在的返工。

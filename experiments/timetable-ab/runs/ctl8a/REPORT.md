# ctl8a 结束报告（CL 臂 · 5 op 控制组）

## 1. 记账

| 事件 | 时刻 |
|---|---|
| T0 读完八篇技能包、开始读规格 | **19:19:01** |
| T1 impl.lisp 首次落盘 | **19:21:15** |
| T2 首次三组全绿 | **19:22:49** |

`node ..\..\metric.cjs impl.lisp`：

```
impl.lisp    lisp   物理行 289   代码行 245   字符 6621
```

（字符 = 非空白非注释字符，口径同 metric.cjs）

## 2. 开跑前红灯证明（空实现）

`empty.lisp`（只有一行注释，什么都不做）：

```
-- 0 passed, 9 failed   exit=1   (--only 1..9)
-- 0 passed, 6 failed   exit=1   (--only 21..26)
-- 0 passed, 1 failed   exit=1   (--only 34)
```

16 条判据全部报 `stdout 非 JSON` —— 判据确实会红。

## 3. 三组首跑结果与返工

| 轮次 | 三组结果 | 改了什么 |
|---|---|---|
| 首跑 | 0/9 · 0/6 · 0/1（16 条全 `stdout 非 JSON`） | — |
| 返工 1 | 仍读不进来（`parens.cjs` 报 depth=1） | 把 `jstr` 拍平成 `ju` / `jesc` / `jstr` 三个函数，消掉多关的一层括号 |
| 返工 2 | 直跑有输出，stderr 报警告 | `op-edit` 补 1 个右括号（`dolist` 没闭） |
| 返工 3 | **9/9 · 5/6 · 1/1** | `op-move` 的 `let` → `let*`（`pf` 在并行绑定里不可见） |
| 返工 4 | **9/9 · 6/6 · 1/1（T2）** | 边界第 3 契约：`{}` 被塌成 `nil` → `jobj` 返回 `:empty-obj`，`jw` 写回 `"{}"` |

返工轮数：**4 轮**（首跑红之后 4 次修改，第 4 次全绿）。

## 4. 首个错误的完整 stderr 原文

（`sbcl --script impl.lisp in1.json`，括号未修复时）

```
; file: C:/Users/HUAWEI/Documents/deepseek-harness/default-workspace/experiments/timetable-ab/runs/ctl8a/impl.lisp
; in: DEFUN JSTR
;     (GET-OUTPUT-STREAM-STRING OUT)
; 
; caught WARNING:
;   undefined variable: COMMON-LISP-USER::OUT
; 
; compilation unit finished
;   Undefined variable:
;     OUT
;   caught 1 WARNING condition
Unhandled SB-C::INPUT-ERROR-IN-LOAD in thread #<SB-THREAD:THREAD tid=2968 "main thread" RUNNING
                                                 {1100C78003}>:
  READ error during LOAD:

    unmatched close parenthesis

      Line: 48, Column: 7, File-Position: 1981

      Stream: #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8a\\impl.lisp" {110003BC73}>

Backtrace for: #<SB-THREAD:THREAD tid=2968 "main thread" RUNNING {1100C78003}>
0: (SB-DEBUG::DEBUGGER-DISABLED-HOOK #<SB-C::INPUT-ERROR-IN-LOAD {1101026A53}> #<unused argument> :QUIT T)
1: (SB-DEBUG::RUN-HOOK *INVOKE-DEBUGGER-HOOK* #<SB-C::INPUT-ERROR-IN-LOAD {1101026A53}>)
2: (INVOKE-DEBUGGER #<SB-C::INPUT-ERROR-IN-LOAD {1101026A53}>)
3: (ERROR #<SB-C::INPUT-ERROR-IN-LOAD {1101026A53}>)
4: (SB-C:COMPILER-ERROR SB-C::INPUT-ERROR-IN-LOAD :CONDITION #<SB-INT:SIMPLE-READER-ERROR "unmatched close parenthesis" {1101026A13}> :STREAM #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8a\\impl.lisp" {110003BC73}>)
5: (SB-C::%DO-FORMS-FROM-INFO #<FUNCTION (LAMBDA (SB-KERNEL:FORM &KEY :CURRENT-INDEX &ALLOW-OTHER-KEYS) :IN SB-INT:LOAD-AS-SOURCE) {5FEEFB}> #<SB-C::SOURCE-INFO {1100C6DBA3}> SB-C::INPUT-ERROR-IN-LOAD)
6: (SB-INT:LOAD-AS-SOURCE #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8a\\impl.lisp" {110003BC73}> :VERBOSE NIL :PRINT NIL :CONTEXT "loading")
7: ((LABELS SB-FASL::LOAD-STREAM-1 :IN LOAD) #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8a\\impl.lisp" {110003BC73}> NIL)
8: (SB-FASL::CALL-WITH-LOAD-BINDINGS #<FUNCTION (LABELS SB-FASL::LOAD-STREAM-1 :IN LOAD) {5FF3AB}> #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8a\\impl.lisp" {110003BC73}> NIL #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8a\\impl.lisp" {110003BC73}>)
9: ((LABELS SB-FASL::LOAD-STREAM :IN LOAD) #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8a\\impl.lisp" {110003BC73}> NIL)
10: (LOAD #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8a\\impl.lisp" {110003BC73}> :VERBOSE NIL :PRINT NIL :IF-DOES-NOT-EXIST :ERROR :EXTERNAL-FORMAT :DEFAULT)
11: ((FLET SB-IMPL::LOAD-SCRIPT :IN SB-IMPL::PROCESS-SCRIPT) #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8a\\impl.lisp" {110003BC73}>)
12: ((FLET SB-UNIX::BODY :IN SB-IMPL::PROCESS-SCRIPT))
13: ((FLET "WITHOUT-INTERRUPTS-BODY-" :IN SB-IMPL::PROCESS-SCRIPT))
14: (SB-IMPL::PROCESS-SCRIPT "impl.lisp")
15: (SB-IMPL::TOPLEVEL-INIT)
16: ((FLET SB-UNIX::BODY :IN SB-IMPL::START-LISP))
17: ((FLET "WITHOUT-INTERRUPTS-BODY-3" :IN SB-IMPL::START-LISP))
18: (SB-IMPL::%START-LISP)
19: ("foreign function: #x140048B39")
20: ("foreign function: #x14000B260")

unhandled condition in --disable-debugger mode, quitting
```

## 5. 时间花在哪一类错误上

**结构/作用域类（括号 + `let` 并行绑定）**：这次 4 轮返工里 3 轮都是它，占时最多；
真正的语义错误只有 #25 那条（`{}` 在边界被塌成 `nil`），一轮就修好了。

## 6. 需要接手人知道的（判据看不见的）

- **#25 是"拒绝路径"给绿的，不是"回落默认"路径**：`stats` 不在 5 op 里 → 整批拒绝 →
  输出原样课表；`{}` 靠边界修复被忠实写回 `{}`，于是 `typeof === 'object'` 成立。
  我已用已知 op（`del`）单独验过"回落默认"分支确实存在且正确：
  `weeks:{} → {"type":"range","from":1,"to":16}`。两件事别混为一谈。
- 同理 #22/#23/#24 也走拒绝路径。它们本来就是"数据通道往返"检查，走拒绝路径是有效的；
  但这类检查**不覆盖归一化**，接新 op 时要自己补不变量。
- 三个"空"实测有区别：`[]` / `{}` / `null` 各自输出不同（`e1.json`、`e2.json` 有证据）。
- `:empty-obj` 这个边界标签只出现在 2 处（`jobj` 解析、`jw` 写出），没有漏进业务层。
- 未实现（`stats` 等 10 个后续 op）时任何含它们的输入都整批拒绝 —— 这与"新 op 生效并撤销"同形，
  写不变量时必须补"日志内容 + 条数"断言，否则假阳。

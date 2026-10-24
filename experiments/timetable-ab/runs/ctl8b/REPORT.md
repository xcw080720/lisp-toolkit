# ctl8b 报告（fresh agent · 八篇技能包对照臂）

## 1. 记账

| 项 | 时刻 |
|---|---|
| T0 读完技能包、开始读规格 | 19:18:50 |
| T1 impl.lisp 首次落盘（完整实现首版） | ≈19:20:30（在 19:20:48 首跑之前，估） |
| T2 首次三组全绿 | 19:21:00–19:21:24 之间（`impl.lisp` 末次写入 19:21:00，紧接着的重跑即全绿） |

`node ..\..\metric.cjs impl.lisp`：

```
impl.lisp    lisp    物理行 233   代码行 203   字符 5184
```

## 2. 判据

| 组 | 首跑 | 终跑 |
|---|---|---|
| `--only 1..9` | **0 passed, 9 failed** | **9 passed, 0 failed** |
| `--only 21..26` | **0 passed, 6 failed** | **6 passed, 0 failed** |
| `--only 34` | **0 passed, 1 failed** | **1 passed, 0 failed** |
| 合跑 16 条 | — | **16 passed, 0 failed** |

### 空实现证红（开跑前）

```
=== G1 1-9 ===   -- 0 passed, 9 failed      (全部 "stdout 非 JSON")
=== G2 21-26 === -- 0 passed, 6 failed      (全部 "stdout 非 JSON")
=== G3 34 ===    -- 0 passed, 1 failed      (全部 "stdout 非 JSON")
```

### 返工：1 轮

| 轮 | 改了什么 | 结果 |
|---|---|---|
| 首跑 → 轮 1 | `robj` 读 key 时把引号本身当字符串首字符 → `(rstr s i)` 改 `(rstr s (1+ i))`（一个 `(1+ …)`） | 16/16 全绿，无第二次返工 |

## 3. 首个错误的 stderr 原文（逐字）

命令：`sbcl --script impl.lisp in1.json`（in1.json = #1 的输入）

```
Unhandled END-OF-FILE in thread #<SB-THREAD:THREAD tid=14528 "main thread" RUNNING
                                   {1100C78003}>:
  end of file on #<dynamic-extent STRING-INPUT-STREAM (unavailable) from "">

Backtrace for: #<SB-THREAD:THREAD tid=14528 "main thread" RUNNING {1100C78003}>
0: (SB-DEBUG::DEBUGGER-DISABLED-HOOK #<END-OF-FILE {1101B5A723}> #<unused argument> :QUIT T)
1: (SB-DEBUG::RUN-HOOK *INVOKE-DEBUGGER-HOOK* #<END-OF-FILE {1101B5A723}>)
2: (INVOKE-DEBUGGER #<END-OF-FILE {1101B5A723}>)
3: (ERROR END-OF-FILE :STREAM #<SB-IMPL::STRING-INPUT-STREAM {5FE7E3}>)
4: ((FLET SB-IMPL::CHARACTER-IN :IN SB-IMPL::%INIT-STRING-INPUT-STREAM) #<SB-IMPL::STRING-INPUT-STREAM {5FE7E3}> T 0)
5: (SB-IMPL::%READ-PRESERVING-WHITESPACE #<SB-IMPL::STRING-INPUT-STREAM {5FE7E3}> T (NIL) T)
6: (SB-IMPL::%READ-PRESERVING-WHITESPACE #<SB-IMPL::STRING-INPUT-STREAM {5FE7E3}> T (NIL) NIL)
7: (READ #<SB-IMPL::STRING-INPUT-STREAM {5FE7E3}> T NIL NIL)
8: (SB-IMPL::%READ-FROM-STRING "" T NIL 0 NIL NIL)
9: (RNUM "{\"courses\":[],\"ops\":[{\"op\":\"add\",\"course\":{\"name\":\"线代\",\"teacher\":\"\",\"location\":\"\",\"day\":3,\"periodFrom\":1,\"periodTo\":2}}]}" 3)
10: (ROBJ "{\"courses\":[],\"ops\":[{\"op\":\"add\",\"course\":{\"name\":\"线代\",\"teacher\":\"\",\"location\":\"\",\"day\":3,\"periodFrom\":1,\"periodTo\":2}}]}" 1)
11: (MAIN)
12: (SB-INT:SIMPLE-EVAL-IN-LEXENV (MAIN) #<NULL-LEXENV>)
13: (EVAL-TLF (MAIN) 27 NIL)
14: ((LABELS SB-FASL::EVAL-FORM :IN SB-INT:LOAD-AS-SOURCE) (MAIN) 27)
15: ((LAMBDA (SB-KERNEL:FORM &KEY :CURRENT-INDEX &ALLOW-OTHER-KEYS) :IN SB-INT:LOAD-AS-SOURCE) (MAIN) :CURRENT-INDEX 27)
16: (SB-C::%DO-FORMS-FROM-INFO #<FUNCTION (LAMBDA (SB-KERNEL:FORM &KEY :CURRENT-INDEX &ALLOW-OTHER-KEYS) :IN SB-INT:LOAD-AS-SOURCE) {5FEEFB}> #<SB-C::SOURCE-INFO {1100C6DBA3}> SB-C::INPUT-ERROR-IN-LOAD)
17: (SB-INT:LOAD-AS-SOURCE #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8b\\impl.lisp" {110003BC73}> :VERBOSE NIL :PRINT NIL :CONTEXT "loading")
18: ((LABELS SB-FASL::LOAD-STREAM-1 :IN LOAD) #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8b\\impl.lisp" {110003BC73}> NIL)
19: (SB-FASL::CALL-WITH-LOAD-BINDINGS #<FUNCTION (LABELS SB-FASL::LOAD-STREAM-1 :IN LOAD) {5FF3AB}> #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8b\\impl.lisp" {110003BC73}> NIL #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8b\\impl.lisp" {110003BC73}>)
20: ((LABELS SB-FASL::LOAD-STREAM :IN LOAD) #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8b\\impl.lisp" {110003BC73}> NIL)
21: (LOAD #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8b\\impl.lisp" {110003BC73}> :VERBOSE NIL :PRINT NIL :IF-DOES-NOT-EXIST :ERROR :EXTERNAL-FORMAT :DEFAULT)
22: ((FLET SB-IMPL::LOAD-SCRIPT :IN SB-IMPL::PROCESS-SCRIPT) #<SB-SYS:FD-STREAM for "file C:\\Users\\HUAWEI\\Documents\\deepseek-harness\\default-workspace\\experiments\\timetable-ab\\runs\\ctl8b\\impl.lisp" {110003BC73}>)
23: ((FLET SB-UNIX::BODY :IN SB-IMPL::PROCESS-SCRIPT))
24: ((FLET "WITHOUT-INTERRUPTS-BODY-" :IN SB-IMPL::PROCESS-SCRIPT))
25: (SB-IMPL::PROCESS-SCRIPT "impl.lisp")
26: (SB-IMPL::TOPLEVEL-INIT)
27: ((FLET SB-UNIX::BODY :IN SB-IMPL::START-LISP))
28: ((FLET "WITHOUT-INTERRUPTS-BODY-3" :IN SB-IMPL::START-LISP))
29: (SB-IMPL::%START-LISP)
30: ("foreign function: #x140048B39")
31: ("foreign function: #x14000B260")

unhandled condition in --disable-debugger mode, quitting
[exit code: 1]
```

判据侧看到的是 16 条一模一样的 `stdout 非 JSON`——正是 lisp-boundary 第一节说的那种"全红其实一个根因"。

## 4. 真 op 补验（防止 #22–#25 假阳）

`#22 #23 #24 #25` 用的都是 `stats`，本臂只实现了 5 个 op → 它们走的是**未知 op 整批拒绝**路径，
绿得没说服力。改用 `del`（未命中，不改课表但**经过真执行路径**）复验同四条：

| 探针 | 输出要点 |
|---|---|
| 转义往返 `a"b\c` | `"name":"a\"b\\c"` 原样保留 |
| 中文 + emoji `数据结构🐋` / `张三` | 原样，非 `\u` 转义、非 `?` |
| `weeks:{}` / `null` / `[]` | 分别输出 `{}` / `null` / `[]`，三种空**没有塌缩** |
| 空 `ops` | `opsText:""`、`log:[]`、`n:0` |
| `edit {periodTo:2}`（原 6..8） | `periodFrom:6, periodTo:6`，不倒挂 |
| `swap` 多匹配 | `n:0`，两门课时间不变 |

`grep ':obj'` 命中 8 处，**全部在边界**（robj×2、un/wr×3、jw×2、main×1）；`cget`/`cset`/`norm`/5 个 `op-*` 里一处都没有。

## 5. 一句话：时间花在哪类错误上最多

**花在 JSON 读器的游标约定不一致上**——一个 `(1+ i)` 让 16 条判据同时报 `stdout 非 JSON`；
我按技能包的诊断规则（全红先直跑取 stderr 第一行，别看判据）2 分钟定位、改 1 处，
业务层 5 个 op（含夹紧、缺失字段、整批拒绝）首版就一次过。

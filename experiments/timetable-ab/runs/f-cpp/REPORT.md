# f-cpp 臂报告（语言横评第七臂）

## 1) 时间与体积

| 标记 | 时刻 | 备注 |
|---|---|---|
| T0 | 19:46:26 | 开始读 `tasks/scale.spec.md` + `check-scale.cjs`（只读） |
| T_red | ~19:46:50 | 空实现（只打印 `{}`）落盘并跑判据：**0 passed, 9 failed** |
| T1 | 19:47:48 | 真实 `impl.cpp` 首次落盘，**488 物理行**（当日一次写完，之后未再改一行） |
| T2 | 19:48:26 | 三组判据全绿 |

`node ..\..\metric.cjs impl.cpp`：

```
文件                     语言   物理行  代码行  字符
impl.cpp                 cpp     488    437    11374
```

对齐到已有臂：**Python 4750 / JS 5933 / Java 6970 / Julia 7316 / CL 7506 / Rust 9390 / C++ 11374**。
C++ 是当前最大的一份，比 Rust 还多 1984 字符。

## 2) 三组首跑结果 + 返工

```
--only 1,2,3,4,5,6,7,8,9   → 9 passed, 0 failed
--only 21,22,23,24,25,26   → 6 passed, 0 failed
--only 34                  → 1 passed, 0 failed
```

全量（36 条）顺带跑了一次：**22 passed, 14 failed**，14 个失败全部落在 5 个 op 之外
（#10–#18 十个未实现的 op，加 #32/#33/#35/#36 四条依赖 duplicate/clear/tag/stats 的）——
5 op 范围内的 #19/#27/#28/#29/#30/#31 全部顺带通过。

返工轮数：**源码 0 轮**（首落盘即编译 0 error，第二版不存在），**环境 1 轮**（见下）。
另做了一次 `-Wall -Wextra` 复检：0 warning。

## 3) 首个错误的完整原文（逐字）

第一次跑判据时 9 条全 FAIL，但**编译器 stderr 是空的**——编译是成功的。真正的首个错误在运行期：

```
[FAIL] #1 add-default-weeks  — stdout 非 JSON
... (9 条同)
-- 0 passed, 9 failed
=== A exit=1 ===
```

手工复现拿到的进程退出码与输出（逐字）：

```
$ cmd /c "probe.exe probe-in.json > out.txt 2> err.txt"
exit=-1073741515          # 0xC0000135 STATUS_DLL_NOT_FOUND
--- out ---
                          # 空
--- err ---
                          # 空
```

根因：MinGW 默认动态链接 `libstdc++-6.dll / libgcc_s_seh-1.dll / libwinpthread-1.dll`，
判据把 exe 编译到 `%TEMP%\sc-xxxx\impl.exe` 再直接 spawn，exe 目录不在 PATH，DLL 找不到。
判据的编译命令写死为 `g++ -O2 -std=c++17 -o impl.exe impl.cpp`，加不进 `-static`。
修法只动环境不动源码：把 `mingw64\bin` 前置进 PATH。源码自 T1 到 T2 一行未改。

编译器报错原文（用探针逼出来的真实 g++ 输出，逐字，节选前 4 条）：

```
probe-errors.cpp:8:7: error: expected ';' at end of member declaration
    8 |   int x
      |       ^
      |        ;
probe-errors.cpp: In function 'int g()':
probe-errors.cpp:13:10: error: 'undefined_var' was not declared in this scope
   13 |   return undefined_var;    // 错 2：未声明标识符
      |          ^~~~~~~~~~~~~
probe-errors.cpp: In function 'int h()':
probe-errors.cpp:17:11: error: invalid conversion from 'const char*' to 'int' [-fpermissive]
   17 |   int n = "abc";           // 错 3：const char* 初始化 int
      |           ^~~~~
```

## 4) 手写 JSON 花的行数 vs 业务逻辑

| 分层 | 行区间 | 行数 | 占比 |
|---|---|---|---|
| 手写 JSON —— 值类型 `Val`（对象/数组/数字/字符串/空值） | 15–54 | 40 | 8.2% |
| 手写 JSON —— 解析器（含 `\u` 转义、代理对、浮点/整数判别） | 55–187 | 133 | 27.3% |
| 手写 JSON —— 序列化器（转义表 + UTF-8 透出 + 整数不带小数点） | 188–234 | 47 | 9.6% |
| 手写 JSON —— 入口里的输出装配 | 462–483 | 22 | 4.5% |
| **手写 JSON 合计** | | **242** | **49.6%** |
| 业务逻辑 —— 夹紧/取字段小工具 | 235–269 | 35 | 7.2% |
| 业务逻辑 —— add/del/edit/move/swap 五个 op | 270–415 | 146 | 29.9% |
| 业务逻辑 —— main 调度 + 未知 op 整批拒绝 | 428–461, 484–487 | 38 | 7.8% |
| **业务逻辑合计** | | **219** | **44.9%** |
| 其余（头注释 14 + readAll 10 + 分隔空行 ~3） | | 27 | 5.5% |

一句话：**近一半的行数花在 JSON 上，而且这一半在别的语言里是 `JSON.parse`/`JSON.stringify` 两个调用。**

## 5) g++ 一次编译能报出几处错

三个探针，都在本机 g++ 16.2.0 实测：

- **探针 A（10 处互相独立的错：缺分号 / 未声明变量 / 类型不兼容 / 实参过少 / void 赋值 /
  实参过多 / 未声明函数 / push_back 类型错 / 成员重定义 / 成员不存在）**
  → `exit=1`，一次编译报出 **10 / 10 条**，一条不漏，且**不因前面的语法错停下**：
  第 8 行的缺分号报完后，后面 9 个函数照样逐个检查。
- **探针 B（同一个函数里 30 条同构错）** → 报出 **30 / 30 条**。默认 `-fmax-errors=0`（不限），
  不会像 `-fmax-errors=1` 那样砍到第一条。
- **探针 C（未闭合注释，词法/预处理级致命错）** → 只报 1 条就停：
  ```
  probe-lex.cpp:3:1: error: unterminated comment
      3 | /* 没有闭合
        | ^
  ```
  后面两行的未声明变量一概不报。**唯一会让 g++ 停止逐条报的，是这种预处理/词法层 fatal error。**

结论：g++ 是"一轮全报、逐条列、语义错不互相阻断"，只有词法级致命错会掐断。
这一点上 C++ 比 JS/Python 的解析器强得多（它们遇到第一处语法错就基本不往下走了）。
另外它给的是**位置 + 插字符 + 修法建议**（`^~~~~` 与 `| ;`），错误信息密度是所有臂里最高的。

## 6) 一句话：C++ 在这件事上的主要成本在哪

**成本不在语言表达力，而在"标准库没有 JSON"——解析器 + 序列化器 + 值模型吃掉 242 行（49.6%）；
这层写对之后，五个 op 只花了 146 行，比任何一臂都短。** 附带一条 Windows 独有的隐性成本：
动态链接的 exe 需要 `mingw64\bin` 在 PATH 里，否则判据拿到的是 `0xC0000135` 而不是错误信息。

## 7) 测量口径备注（给汇总表用）

- `#22–#25` 在只有 5 op 的臂里走的是"未知 op（`stats`）→ 整批拒绝 → courses 原样回显"这条路径。
  它们仍然真实地压到了 JSON 数据通道（解析 + 重新序列化：撇号/反斜杠、中文+emoji、嵌套数组、空对象 `{}`），
  但没有被任何 op 消费。判断：**这四条在任何一臂上都只测数据通道，不测业务**，与实现是否支持 `stats` 无关。
- `#21 / #26 / #34` 走的是 `edit`（真业务路径），`#25` 的空对象 `{}` 在回显里保持 `{}` 没有塌成 `null`。

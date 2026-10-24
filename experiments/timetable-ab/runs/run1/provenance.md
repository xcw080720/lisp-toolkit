# provenance.md — impl.lisp 的代码来源

结论先说：**4 段抄/改写自 workspace 已有代码，其余全部自己写。**

唯一被抄的文件：`C:\Users\HUAWEI\Documents\deepseek-harness\default-workspace\bench\op-lisp.lisp`
（下文行号指该文件当前内容）

---

## 抄 / 改写的段落

### 1. JSON 读取（impl.lisp 第 1 节 `parse-json`）
- 来源：`bench/op-lisp.lisp` **第 27–124 行**（`json-tokenize` + `parse-json`）。
- 抄了什么：整体思路与骨架——先跳过空白、按字符判断 `{ } [ ] , :` 与字符串/数字、
  递归下降出对象与数组；数字的处理（含 `.`/`e` 走 float，否则 `parse-integer`）；
  字符串转义 `\n \t \r \b \f` 的映射表。
- 改了什么：原实现先切 token 向量、对象用 `hash-table`；我改成**字符级递归下降、不建 token 向量**，
  对象用保序 alist 包装（`jobj`），因为输出要按输入键序逐字回显（公开样例里未改动的课必须原样输出）。
  另补了 `\uXXXX`（含代理对）支持。

### 2. `jget` 取值助手（impl.lisp 第 3 节）
- 来源：`bench/op-lisp.lisp` **第 150–152 行** `hget`。
- 抄了什么：`gethash` 带 default 的取值写法；改成对 alist 做 `assoc`。

### 3. 中文文案与 `edit-part`（impl.lisp 第 5 节 + 各 op 的 log 文案）
- 来源：`bench/op-lisp.lisp` **第 157–191 行**（`match-courses` / `edit-part` / `one-op-text`）。
- 抄了什么：
  - 匹配语义 `match-courses`：先 `string-trim`，空串直接无命中，否则 `search` 子串匹配；
  - 文案模板：`删掉「x」` / `加「x」` / `把「x」改成 …` / `删掉 N 条「x」` / `改了 N 条「x」`/`加了「x」`/`没找到「x」`；
  - `edit-part` 里 `周一…周日` 的取名方式（`*days*` 向量 + `周N` 兜底）、`第A-B节` 格式、
    `周次改过`、`（没写具体值）`。
- 为什么抄：公开样例 `cases/public-A.json` 期望的 `opsText`/`log` 与本文件逐字一致
  （`加「线代」`/`加了「线代」`/`删掉「高数」`/`删掉 2 条「高数」`），说明 oracle 用的是同一套文案。

## 自己写的段落

1. **有序 JSON 模型与写出器**（`jobj` / `jarr` / `write-json` / `write-json-string`）自己写：
   非 ASCII 一律 `\uXXXX` 转义，保证 stdout 恒为纯 ASCII，绕开 Windows 下 SBCL 的 stdout 编码问题。
2. **四个 op 的语义**全部自己写：`add`（缺 weeks → `range 1..totalWeeks`，totalWeeks 取顶层/op 级，默认 16；
   缺 teacher/location 补 `""`；day 夹 1..7、period 夹 ≥1；保留 add 里的额外键追加在后）、
   `del`（命中条数计 n、写条数日志，空 match → 没找到）、
   `edit`（只改 set 里出现的键；day 夹到 1..7；periodFrom/To < 1 保留原值）、
   `move`（三件套必须同时给且为数字，否则判非法不执行、只写日志；合法时同 edit 的夹取规则）。
   键序：`jset` 对已有键原位覆盖，新键追加末尾——未删课程原样保留输入键序，新增课程追加在后。
3. **入口**自己写：`sbcl --script impl.lisp input.json`，从 `sb-ext:*posix-argv*` 取最后一个非选项参数
   （Windows SBCL 2.6.9 下该变量形如 `(sbcl.exe "input.json")`，本机无 `sb-ext:posix-argv` 函数，
   已实测确认），读文件用 `:external-format :utf-8`，末尾 `sb-ext:exit :code 0` 保证 exit=0。
4. **自测用例** `selftest.json` / `selftest2.json` 自己写（覆盖 spec 约束 2–5 + totalWeeks=20 + 非法 add）。
   这两个文件只是开发自测，不参与交付。

## 未做的事

- 没有读 `runs\` 下其它目录，没有改 `tasks/`、`cases/`、`score.cjs`、`oracle.js`。
- 没有向任何人要实现提示。

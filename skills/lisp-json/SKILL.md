# SKILL: 在 Common Lisp 里手写 JSON

## 为什么需要这份

CL 没有内置 JSON。实测手写成本（同规模同判据）：

| 语言 | 手写 JSON 行数 |
|---|---|
| **CL** | **≈100（最省）** |
| JS | 134 |
| Rust | 246 |
| Julia | 267 |

CL 最省的原因：没有类型系统要对付，key 用 cons 就够，递归下降写起来基本是直接翻译语法。

## 最小可用形状（约 100 行）

```lisp
;; 读：一个函数 + 一个游标
(defun jparse (s) ...)            ; 入口
(defun skip-ws (s i) ...)         ; 跳空白
(defun j-str  (s i) ...)          ; 字符串，含 \uXXXX 与代理对
(defun j-num  (s i) ...)          ; 数字：整数/小数/指数
(defun j-val  (s i) ...)          ; 分派：{ [ " t f n 数字

;; 写：两个函数
(defun jwrite-str (s) ...)        ; 转义
(defun jwrite (v) ...)            ; 分派
```

**键序必须保持输入顺序**：对象用 `alist`（`(("k" . v) ...)`）或有序的 pair list，
**不要用 hash-table**——`maphash` 的顺序是实现相关的，检查器如果逐字节比对就会红。

## 三个必踩的坑（每个都让一次 run 白跑）

1. **`sb-sys:make-fd-stream` 写到 fd 1 加 `:external-format :utf-8` 会报"句柄无效"**
   写文件没问题，写标准输出不行。要么用 `*standard-output*` 的既有编码，要么输出全 ASCII。
2. **输出全 ASCII 的兜底**：把所有 ≥127 的字符转成 `\uXXXX`。
   这是**规避**不是**修复**——代价实测 127 行。能开活体 REPL 的话，先用
   `(fboundp 'sb-sys:make-fd-stream)` / `(describe ...)` 问清楚，别猜。
3. **BOM**：`Add-Content -Encoding utf8`（PowerShell）会写 BOM，SBCL 读到会当成字符。
   写日志一律用 `[IO.File]::WriteAllText` + `UTF8Encoding($false)`。

## 第四个坑（2026-10-24 实测补）：`loop ... on` 不是逐元素拆构

写对象/数组时最自然的写法是遍历 alist：

```lisp
(loop for (k . v) on al do ...)   ; ✗ 在 SBCL 上是错的
(loop for (k . v) in al do ...)   ; ✓ 这个才对
```

**为什么**：`on` 和 `in` 都接受"拆构模式"，但语义差一档——

```
in → 每个元素绑一次，元素被拆到 (k . v)
on → 每个"尾部"绑一次，第一个 (k . v) 拆的是整个列表，v 变成整条尾巴
```

实际报错（SBCL）：

```
Unhandled TYPE-ERROR: The value ("opsText" . "add") is not of type VECTOR
  when binding #:V0
```

**代价**：一次实测里它让 16 条判据**同时**报 `stdout 非 JSON`，看起来像十六种不同的错。
修法是两个字符（`on` → `in`）。

> **规则**：遍历 alist 一律用 `in`。`on` 只在"需要看到剩余尾部"时才用（例如找第一个满足条件的）。

---

## 判据写法建议

- 不要逐字节比对整份 JSON 字符串（键序、空格、数字格式都会打架）；
- 比对**语义**：解析回来再比结构；或者只比对关键字段的键序。

## 一句

在 CL 里写 JSON 是**一次性成本**：写完就永久有了。
它属于"缺件"，不属于"语言规则"——缺件能补，规则不能补。

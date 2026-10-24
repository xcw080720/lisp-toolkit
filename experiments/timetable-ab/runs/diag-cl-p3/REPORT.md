# diag-cl-p3 排障报告（SBCL / Common Lisp 臂）

## 1) 三个时刻

| 时刻 | 事件 |
|---|---|
| **T_red 19:29:04** | 第一次跑判据 `--only 1,...,9`，9 条全红，失败理由同一句「stdout 非 JSON」 |
| **T_root 19:29:24** | 第一次写下正确根因（原句见下） |
| **T_green 19:29:31** | 改 1 行后三组全绿：9/9 + 6/6 + 1/1 |

T_root 当时写下的那一句：

> jw 的对象分支写的是 `(loop for (k . val) on (cdr v) ...)`：`on` 遍历的是 successive tails，`k` 绑到的是整个 `(key . val)` 点对而不是 key，于是 `jwstr` 把一个 cons 当字符串喂给 `across`，抛 TYPE-ERROR，stdout 只写出半截 `{"`。

## 2) 假设日志

```
19:29:04  假设：9 条判据同时全红且理由都是「stdout 非 JSON」，说明程序在写 JSON 之前就崩了，
          不是字段级语义偏差（否则只会红其中几条）。
          依据：9 条互不相关的检查（默认 weeks / day 夹取 / del 计数 / swap / 日志编号）失败理由完全同一句。
          排除方式：绕过判据直接跑 impl，看 stderr 第一行。

19:29:11  假设：报错是 BOM/编码问题（stderr：「JSON 错误：未知值（偏移 0）」）。
          依据：我自己用 PowerShell Set-Content -Encoding utf8 造输入，PS 5.1 会加 BOM，偏移 0 正好卡在第一个字节。
          排除方式：改用 node 写无 BOM 的 JSON 重跑 → 该错误消失，冒出真正的 TYPE-ERROR。
          结论：假象，是我测试夹具带进来的，不是 impl 的问题（判据侧 fs.writeFileSync 不写 BOM）。

19:29:20  假设（被证实）：根因在 JSON *写* 器，不在读器；具体是 jw 的对象分支用 `on` 而不是 `in`。
          依据：stderr 明说 `The value ("opsText" . "add") is not of type VECTOR when binding #:V0`，
          而 #:V0 正是 jwstr 里 `(loop for ch across s ...)` 的 across 绑定；错误值是「键值点对」而不是键本身，
          说明 k 被绑成了整条 (key . val)。所有输出顶层都是对象，所以每条判据都撞同一处。
          反证同文件内：apply-patch 里 `(loop for (k . val) in (cdr set) ...)` 用的是 `in`，那才是作者本意。
          排除方式：`on` → `in`，立刻重跑判据。

19:29:31  改完立即跑三组，9/9、6/6、1/1 全绿。
19:29:47  二次复跑三组，仍全绿（排除偶发）。
```

## 3) 最终 diff

改动 **1 行**（`impl.lisp:162`，jw 的 obj 分支）：

```diff
-       (loop for (k . val) on (cdr v) do
+       (loop for (k . val) in (cdr v) do
```

- 改动前：`(loop for (k . val) on (cdr v) do`
- 改动后：`(loop for (k . val) in (cdr v) do`

## 4) 根因分类

**① 不熟练（语言特有的语法/语义约定）**，不是 ③ 逻辑，也不是 ② 串台。

- 不是 ③：设计本身是对的——obj 用 alist 保序、写回时逐对输出并用 first 标志插逗号、空对象写 `{}`，
  这套结构在 21–26（浮点/转义/Unicode/嵌套 weeks/空对象/负值夹取）上全绿，说明算法与表示没问题；
  错的只是一个 LOOP 关键字的取值语义。
- 不是 ②：`on` 这个「遍历 successive tails」的语义在 JS/Python 里没有对应写法可搬；
  跨语言的默认直觉恰恰是 `in`（逐个元素），作者反而写出了一个更 Lisp 专有的 `on`。
  所以不是把别语言的写法搬过来，而是把 CL LOOP 的 `on` / `in` 分辨记混了。
- 是 ① 的具体形态：`for x on list` 走 cons 链、`for (k . v) in list` 解构元素——
  两者都合法，混用后 `on` + 点对解构会绑到「尾部第一对」，静态看不出错，只有运行时 across 报 TYPE-ERROR。
  这类 bug 的代价是「全红且只有一句笼统失败理由」，必须先看 stderr 第一行而不是逐条读判据。

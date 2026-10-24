# sp-v26 · 八篇技能包 · 从头写（fresh agent 对照臂）

## 0. 权威顺序与版本

规格 `tasks/scale.spec.md` > 判据 `check-scale.cjs` > 本文件 > 代码注释。
本文件描述 2026-10-24 19:13（非空白字符 9134）时的 `impl.lisp`；行号会漂，语义不会。

## 1. 记账

| 事件 | 时刻 | 数据 |
|---|---|---|
| T0 读完八篇技能、开始读规格 | 19:10:36 | 8 篇全读（含 lisp-boundary 124 行） |
| T1 `impl.lisp` 首次落盘 | 19:12:28 | 381 物理行（PS 口径；终版 397 为 metric 口径） |
| T2 首次 16/16 | ≈19:12:55 | 9/9 + 6/6 + 1/1（区间由 19:12:28 落盘与 19:13:08 探针夹住） |

终版指标（`node ../../metric.cjs impl.lisp`）：
物理行 **397** / 代码行 **332** / 非空白非注释字符 **9134**。

## 2. 判据先证明能红（空实现）

`stub.lisp` 只打印 `{}`：

```
-- 0 passed, 9 failed      (--only 1..9)
-- 0 passed, 6 failed      (--only 21..26)
-- 0 passed, 1 failed      (--only 34)
```

报错各不相同（`默认 weeks 不对` / `未知 op 应整批拒绝` / `中文/emoji 名字没有原样保留` …），
证明判据不是"静默通过"。

## 3. 首跑与返工

**首跑（impl v1，16 条全红，同一个根因）**

```
[FAIL] #1..#9   — stdout 非 JSON
[FAIL] #21..#26 — stdout 非 JSON
[FAIL] #34      — stdout 非 JSON
```

直接跑 impl 拿到 stderr 原文：

```
Unhandled TYPE-ERROR ... The value ("opsText" . "add") is not of type VECTOR when binding #:V0
```

**根因**：写出层用了 `(loop for (k . v) on al ...)`。SBCL 上 `on` 把第一态绑成**整个尾部**，
`in` 才按元素拆。实测三行对照：

```
for (k . v) on '((("a") . 1) ...)  => ((("a" . 1) (("b" . 2))) (("b" . 2) NIL))   ← 错
for (k . v) in ...                => (("a" 1) ("b" 2))                            ← 对
```

**返工 1 轮**：只改 `jwrite-obj` / `jwrite-arr` 两个函数（14 行 → 18 行，含 1 行警示注释）。
改完三组一次全绿，**没有再返工**。

**判据分布**：首跑 0 条过、16 条红；返工后 16 条一次过。
（判据分不出"哪条红"——16 条同一个消息，正是 `lisp-boundary` 第一节描述的症状形态，
但根因不是边界，是 LOOP 语义。）

## 4. 边界三问（活体镜像里实测，非推断）

```
--- 契约 3：三个空必须输出不同 ---
in={"a":[],"b":{},"c":null}  out={"a":[],"b":{},"c":null}
--- 数字分类型写出 ---
in=2.5 out=2.5      in=1e3 out=1000.0      in=-0 out=0      in=16 out=16
--- 非 ASCII 直出 ---
"数据结构🐋"
--- 业务层看不到 :obj ---
weeks 槽 = (("type" . "range") ("from" . 1) ("to" . 16))   含 :obj ? NIL
```

`:obj` 出现 7 处，全在 4 个函数里：`j-obj`(2) / `jwrite`(1) / `unwrap-obj`(1) / `course->json`(2，
含 weeks 嵌套) + 入口 1 处。业务层 0 处。

## 5. 全量 36 条（参考，不是本次判据）

22 passed / 14 failed，14 条红全部是"op 还没实现"：
`#10–#18、#32、#33、#35、#36`。
**#19 / #27 / #28 / #29 / #30 / #31 在建好的 5 个 op 上已经绿**
（edit 三字段、swap 三件套、不倒挂、多匹配拒绝、move 日志带数量）。

## 6. 三问

1. **lisp-boundary 让我提前做了什么**：三条。① 契约 3 → 空对象直接写成 `(:obj)` 而非 `nil`，
   三问在 16/16 之后单独补跑并留证；② 契约 1/2 → 业务层只吃 `course` 结构体与裸 alist，
   进门只 `unwrap-obj` 一次、出门只在 `course->json` 戴回；③ BOM 条 → 我先踩了
   （`Set-Content -Encoding utf8` 写出 BOM，SBCL 报 `no non-whitespace characters in string ""`），
   照文档换 `[IO.File]::WriteAllText` + `UTF8Encoding($false)` 立刻好；④ stdout 编码条 →
   先探 `(stream-external-format *standard-output*)` = `(:UTF-8 ...)`，于是**没有**写那份 127 行 ASCII 兜底。
2. **内部表示 vs 外部 JSON 有没有出错**：没有出那个 TYPE-ERROR。定住我的是这两句：
   "业务层（`cget`/`set-fld`/每个 op 的 body）只接受裸 alist 与标量" 与 契约 2 的两行示例。
   我出的错在**文本层**（LOOP 拆构），只是症状长得一模一样（16 条同红 `stdout 非 JSON`）。
3. **完全没用的**：`handoff`（0 处影响——没有接手人，也没写 HANDOFF）。
   **最有用的**：`lisp-boundary`；第二 `lisp-json`（alist 保键序、不用 hash-table、BOM、stdout 四条），
   第三 `lisp-repl`（argv 形状、stdout 编码、LOOP 语义三次"问镜像"，每次都省掉一轮猜）。

## 7. 一句话

八篇 vs 七篇的差：第 8 篇（lisp-boundary）让我**零成本跳过**那次必踩的
`:OBJ is not of type LIST`（省一轮返工）并省掉 127 行 ASCII 兜底；
但它和省不掉我这次真正返工的那类错——LOOP 的 `on`/`in` 拆构，八篇里没有一篇管这个。

# linter 对照 —— 「静态检查」到底是能力还是摩擦

**问题**：之前的结论说「Lisp 的编译器会指出未定义的名字，JS 不会」。
这句话对吗？还是说，JS 只是**没装**而已？

**做法**：同一份健康实现，各造四个互相独立的病人。看三种入口分别能抓到几类。

## 四种缺陷

| 文件 | 类 | 缺陷 | 说明 |
|---|---|---|---|
| `A-freevar.js` / `cl-A-freevar.lisp` | **A** | 自由标识符写错 | JS: `COERCE.str` → `COERCEE.str`；CL: `(nreverse log)` → `(nreverse lg)` |
| `B-callonly.js` / `cl-B-funcname.lisp` | **B** | 函数名写错（只改调用点） | JS: `spliceIn(` → `spliceInn(`；CL: `(num-int v 1)` → `(num-intt v 1)` |
| `C-proptypo.js` / `cl-C-keytypo.lisp` | **C** | 属性 / keyword 名写错 | JS: `Math.trunc` → `Math.trunk`；CL: **未成功种点**（见下） |
| `D-semantic.js` / `cl-D-semantic.lisp` | **D** | 语义常量错 | `day` 上界 `7` → `6` |

## 结果

| 类 | JS `node --check` | JS + `eslint no-undef` | CL `compile-file` |
|---|---|---|---|
| **A** 自由标识符 | **0** | **抓到**（7 条） | **抓到**（undefined variable ×1） |
| **B** 函数名 | **0** | **抓到**（2 条） | **抓到**（undefined function ×2） |
| **C** 属性/keyword | 0 | **抓不到** | **未测** |
| **D** 语义常量 | 0 | **抓不到** | **抓不到** |

## 结论

```
✗ 旧：Lisp 有静态检查，JS/Python 没有
✓ 新：Lisp 零配置就有，JS 装一次也有 —— 差别是摩擦，不是能力
```

**而摩擦对错误率高的执行者同样致命**：它不会记得先去装 linter。

**C、D 两类三语言都漏** —— 这是共同的天花板，与语言无关。

## 诚实记录：C 类在 CL 侧没种成功

`cl-C-keytypo.lisp` 我本想替换 `(getf al :nme)` → `(getf al :nmae)`，
但**这个字符串在原实现里不存在**，替换是空操作，文件与原版一模一样。

所以 CL 侧 C 类的「抓不到」是**假阴性**，表格里标成"未测"。
教训：**替换必须先验证命中（文件内容确实变了），再验证效果（判据确实红了）。**
JS 侧做了这个检查（`与原文不同: True`），CL 侧没做，就漏了一个。

## 怎么复现

```bash
# JS 侧（需要先装 eslint）
npm install --no-save eslint@8
node_modules/.bin/eslint --no-ignore --no-eslintrc -c .eslintrc.json --format json A-freevar.js
node --check A-freevar.js          # → 无输出，exit 0

# CL 侧
sbcl --non-interactive --load cl-A-freevar.drv.lisp   # → caught STYLE-WARNING: undefined variable: LG
```

## 这些文件是什么

```
A-freevar.js  B-callonly.js  C-proptypo.js  D-semantic.js      JS 四份病人
cl-*.lisp                                                       CL 四份病人
cl-*.drv.lisp                                                   编译驱动（一行 compile-file）
.eslintrc.json                                                  只开 no-undef 的最小配置
```

`.fasl` 已被 `.gitignore` 挡住，不随仓库走。

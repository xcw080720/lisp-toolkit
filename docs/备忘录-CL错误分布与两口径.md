# 备忘录：CL 十二格的错误分布与两个口径（2026-11-01）

> 给"容易记不住"的一天。**只看这一页就能接上。**
> 数据：`cl-error-profile.tsv`　复跑：`node analyze-cl-errors.cjs --prefix v5`
> 判据：`check-v3.cjs --upto 36`（默认）／`--exclude-out-of-spec`（spec 合规口径）

---

## 一、一句话

> **CL 不是"写不出来"，是六格里六格写废了，另有四格只差在两条超纲判据上。**
> 按 36 条全算是 2/12；按 spec 合规（踢掉 #31/#32）是 **5/12**。JS 两个口径都是 **12/12**。

---

## 二、CL 十二格逐格

| 格 | 判定 | 36 条全算 | 合规口径 | 错误类别 / 失败判据 |
|---|---|---|---|---|
| cl-macro r1 | partial | 34/36 | **32/34** | **#16 duplicate 误报 CONFLICT、#36 swap 误报 CONFLICT**（两条都合规，是真错） |
| cl-macro r2 | **crash** | 0/36 | 0/34 | C 未定义函数（调用了一个不是函数的符号） |
| cl-macro r3 | partial | 34/36 | **34/34 ✅** | 只挂 #31 未知命令、#32 空串（**超纲**） |
| cl-macro r4 | **crash** | 0/36 | 0/34 | C 未定义函数（`SB-EXT:*POSIX-ARGV*` 被当函数调用） |
| cl-macro r5 | green | 36/36 | **34/34 ✅** | — |
| cl-macro r6 | **crash** | 0/36 | 0/34 | B 读取期语法错误（READ error during LOAD） |
| cl-inline r1 | partial | 34/36 | **34/34 ✅** | 只挂 #31/#32（超纲） |
| cl-inline r2 | green | 36/36 | **34/34 ✅** | — |
| cl-inline r3 | partial | 34/36 | **34/34 ✅** | 只挂 #31/#32（超纲） |
| cl-inline r4 | **crash** | 0/36 | 0/34 | A 读到文件尾（**括号不配平**） |
| cl-inline r5 | **crash** | 0/36 | 0/34 | E 其它运行时错误（`ERROR:` 直接退出） |
| cl-inline r6 | **crash** | 0/36 | 0/34 | B 读取期语法错误 |

## 三、分布（12 格）

```
5 × 通过（合规口径）      其中 2 格在 36 条口径下也是绿
1 × 可加载但真错          #16 + #36（duplicate/swap 多做了一次冲突检查）
6 × crash
     ├─ 2 × C 未定义函数（把变量当函数调；含把 sb-ext:*posix-argv* 当函数）
     ├─ 2 × B 读取期语法错误（READ error during LOAD）
     ├─ 1 × A 读到文件尾（括号不配平）
     └─ 1 × E 其它（ERROR: 直接退出）
```

**关键分层**：6 个 crash 里 **3 个是结构/读取期错误**（括号、读取），**2 个是符号误用**（把变量当函数）。**没有一个是"逻辑写错但能跑"**——这说明失败发生在"能不能成为可加载的产物"这一层，而不是"写得对不对"这一层。

## 四、失败判据分布（只统计可加载的格）

```
3 × #31  未知命令 → BADARG          ← 超纲
3 × #32  空命令串 → BADARG          ← 超纲
1 × #16  duplicate 同名时间 → CONFLICT  ← 合规（实现多查了一次冲突）
1 × #36  混合序列里的 swap → CONFLICT   ← 合规（spec L71 明文：swap 不查冲突）
```

## 五、超纲判据清单（按 spec 逐条核过）

| 判据 | 内容 | spec 依据 | 处置 |
|---|---|---|---|
| **#31** | 未知命令 → `err BADARG` | `v3.spec.md` 错误码表只有 DUP/NOTFOUND/BADARG(参数个数或取值越界)/CONFLICT/LIMIT，**没写未知动词** | **超纲**，不计分（`--exclude-out-of-spec`） |
| **#32** | 空命令串 → `err BADARG` | 同上，**没写空串** | **超纲**，不计分（与历史撤回 #32 一致） |
| #36 | swap 对调后不该报 CONFLICT | **spec L71 已明文**「只交换 day/from/to，不检查冲突」 | **合规**，失败算真错 |
| #16 | duplicate 复制到新名、时间不变 | spec §4 op7 有定义 | **合规**，失败算真错 |

> 注意：#32/#36 在 10 月底曾因"spec 未写明"被撤回（claim-32）。**现在 #36 已经被 spec 补写覆盖，只有 #31/#32 仍超纲。**

## 六、两个口径为什么都要报

- **36 条全算**：历史所有数字都是这个口径，换成别的就没法跟 v3 比。
- **合规口径（34 条）**：问的是"实现有没有按 spec 做"。把 spec 没规定的东西算成缺陷，等于用判据去规定规格——这正是这项目反复抓的那类错（E-04 同族）。

两个数并排写，读者自己能看出"差的那 3 格是差在规格缺口上，不是差在能力上"。

## 七、复跑命令

```powershell
cd lisp-toolkit\experiments\timetable-ab
$env:SBCL_WSL = 'kali-linux'

# 全量错误分布（12 格 + 分布 + 失败判据 + 落 tsv）
node analyze-cl-errors.cjs --prefix v5

# 单格两个口径
node check-v3.cjs --impl runs\v5-cl-macro-r3\impl.lisp --upto 36
node check-v3.cjs --impl runs\v5-cl-macro-r3\impl.lisp --upto 36 --exclude-out-of-spec

# 必须先声明分母，否则 check-v3 直接拒绝执行（文件里装了两个契约：1–36 十五 op，37–56 三十 op）
```

## 八、下一步（写下来免得忘）

1. **#31/#32 二选一**：要么把"未知命令 → BADARG、空串 → BADARG"写进 `v3.spec.md`（那它们就转正、重新计分），要么承认它们超纲并永久剔除。**不能一直挂在中间**。
2. **CL 的 6 个 crash 值得单独看**：3 个读取期/括号问题像是"长输出收尾失守"，2 个是符号误用——两类修法不同（前者是写作纪律，后者是语义层）。
3. CL 的 `first_pass` **不要报成比率**：5 通过 / 1 真错 / 6 crash，n 太小且分母口径刚变。

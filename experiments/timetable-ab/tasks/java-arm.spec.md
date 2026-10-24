# Java 臂：同规格、无库、手写 JSON

## 目的

在跨语言成本表里加**第四个"没有 JSON 库"的语言**（CL / Rust / Julia 已就位）。
Java 的特殊性：它以**注解处理器 / codegen** 闻名——那是"单源多产物"的另一种实现方式，
但**本臂不测那个**。本臂只补语言本身的一张行数票，变量只加"语言"一个。

## 硬条件（与其他臂严格对齐）

- **规格**：`tasks/scale.spec.md`，5 个 op：`add / del / edit / move / swap` + 输出契约
- **判据**：`check-scale.cjs`，19 条不变量，目标 9/9（`--only 1..9`）
- **无第三方库**：不许 Maven / Gradle / Gson / Jackson / 任何 jar
  → **JSON 读写必须手写**（与 CL / Rust / Julia 同处境）
- 只允许 JDK 21 标准库

## 文件名与类名（检查器约定）

```
文件：impl.java
类名：public class impl          ← 必须与文件名一致
入口：public static void main(String[] args)
参数：args[0] = 输入 JSON 文件路径
输出：把结果 JSON 打到 stdout（不要在 stdout 打任何调试信息）
```

检查器会自动 `javac` 到临时目录再 `java -cp` 运行，**你不用自己建构建脚本**。

## 运行方式

```powershell
# 判据（编译+运行都由它负责）
node ..\..\check-scale.cjs --impl impl.java --only 1,2,3,4,5,6,7,8,9

# 自己手测
javac -encoding UTF-8 -d . impl.java
java -cp . impl ..\..\cases\public-A.json
```

## 时间戳（v2 协议）

log.txt 前三条：

```
T0 <HH:mm:ss>  收到任务、开始读规格
T1 <HH:mm:ss>  impl.java 首次落盘（注明行数）
T2 <HH:mm:ss>  首次 9/9
```

其余每条命令一行：`<HH:mm:ss> | <命令> | exit=<code> | <首行错误或空>`。UTF-8 无 BOM。

## 时间盒

35 分钟（编译等待也算）。

## 结束报告（必须逐条答）

1. T0 / T1 / T2；
2. impl.java 总行数；其中**手写 JSON 读、写各多少行**；
3. 编译错误次数（`javac` 报错算一次）与用例未过次数，分开记；
4. **Java 特有的开销**，一条一行（例如：类型声明、`Map<String,Object>` 的强制转型、
   `long`/`int` 与 `Double` 的拆箱、`List<Object>` 的泛型擦除、checked exception、
   字符串不可变导致的拼接开销……）；
5. 有没有用 `record` / `enum` / `switch` 模式匹配这类新语法？用了哪些、省了什么。

## 判读注意

- 本臂**不测**注解处理器、不测 codegen——那是另一臂的事，别混；
- 与其他臂比**行数**时，先扣掉"手写 JSON"那一部分（各臂都单列了）。

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

/**
 * 入口：decls.json（唯一声明源） -> 生成 @Op 注解源 -> 带 -processor 编译一次 -> 产物落盘。
 *
 * 第 1 趟编译：src/fanout/{Op,GenProc}.java -> build/proc，并写 META-INF/services
 *              的 Processor 注册（service 发现，不用 -processor 硬指）。
 * 第 2 趟编译：build/gen/gen/OpsDecl.java 里那 5 个带 @Op 的空类，-d 指到工作目录，
 *              处理器在编译期用 Filer 把 5 样产物写到工作目录根。
 */
public final class Emit {

    static final Path CWD = Paths.get(System.getProperty("user.dir")).toAbsolutePath();
    static final Path BUILD = CWD.resolve("build");
    static final Path PROC = BUILD.resolve("proc");
    static final Path GEN = BUILD.resolve("gen");

    public static void main(String[] args) {
        try {
            run();
        } catch (Throwable t) {
            System.err.println("emit: FAILED — " + t);
            System.exit(1);
        }
    }

    static void run() throws Exception {
        Path decls = CWD.resolve("decls.json");
        if (!Files.isRegularFile(decls)) throw new IllegalStateException("找不到 " + decls);

        long t0 = System.nanoTime();
        Map<String, Dec> ops = Dec.parseAll(Files.readString(decls, StandardCharsets.UTF_8));
        if (ops.isEmpty()) throw new IllegalStateException("decls.json 里一个 op 都没有");

        compileProc();                 // 第 1 趟
        Path genSrc = writeOpSource(ops); // decls.json -> @Op 源码
        compileWithProc(genSrc);       // 第 2 趟，产物在这一趟落盘

        System.out.printf("emit: %d ops -> opsText/schema/client/tests/validate (+contrib.d.ts), %.2fs%n",
                ops.size(), (System.nanoTime() - t0) / 1e9);
    }

    // ---------- 第 1 趟：注解 + 处理器 + service 注册 ----------
    static void compileProc() throws IOException {
        deleteTree(PROC);
        Files.createDirectories(PROC);
        List<Path> srcs;
        try (Stream<Path> s = Files.list(CWD.resolve("src/fanout"))) {
            srcs = s.filter(p -> p.toString().endsWith(".java")).sorted().toList();
        }
        if (srcs.isEmpty()) throw new IllegalStateException("src/fanout 下没有源文件");

        JavaCompiler jc = compiler();
        DiagnosticCollector<JavaFileObject> diag = new DiagnosticCollector<>();
        try (StandardJavaFileManager fm = jc.getStandardFileManager(diag, null, StandardCharsets.UTF_8)) {
            List<String> opts = List.of("-d", PROC.toString(), "-encoding", "UTF-8",
                    "-proc:none", "-nowarn", "-Xlint:none");
            boolean okc = jc.getTask(null, fm, diag, opts, null, fm.getJavaFileObjectsFromPaths(srcs)).call();
            report("第 1 趟（注解+处理器）", okc, diag);
        }

        Path svc = PROC.resolve("META-INF/services/javax.annotation.processing.Processor");
        Files.createDirectories(svc.getParent());
        Files.writeString(svc, "fanout.GenProc\n", StandardCharsets.UTF_8);
    }

    // ---------- 第 2 趟：跑处理器 ----------
    static void compileWithProc(Path src) throws IOException {
        JavaCompiler jc = compiler();
        DiagnosticCollector<JavaFileObject> diag = new DiagnosticCollector<>();
        try (StandardJavaFileManager fm = jc.getStandardFileManager(diag, null, StandardCharsets.UTF_8)) {
            List<String> opts = List.of(
                    "-d", CWD.toString(),          // Filer 的 CLASS_OUTPUT = 工作目录根，产物直接落地
                    "-encoding", "UTF-8",
                    "-classpath", PROC.toString(),
                    "-processorpath", PROC.toString(), // service 文件在 PROC 里，让 javac 自己发现
                    "-nowarn", "-Xlint:none");
            boolean okc = jc.getTask(null, fm, diag, opts, null, fm.getJavaFileObjects(src)).call();
            report("第 2 趟（APT 生成）", okc, diag);
        }
    }

    static JavaCompiler compiler() {
        JavaCompiler jc = ToolProvider.getSystemJavaCompiler();
        if (jc == null) throw new IllegalStateException("没有系统编译器：请在 JDK 21 上运行，别用 JRE");
        return jc;
    }

    static void report(String stage, boolean okc, DiagnosticCollector<JavaFileObject> diag) {
        for (Diagnostic<? extends JavaFileObject> d : diag.getDiagnostics()) {
            if (d.getKind() == Diagnostic.Kind.NOTE && d.getMessage(null).contains("selftest")) {
                System.out.println(stage + ": " + d.getMessage(null));
            }
        }
        if (okc) return;
        StringBuilder sb = new StringBuilder(stage + " 编译失败：");
        for (Diagnostic<? extends JavaFileObject> d : diag.getDiagnostics()) {
            if (d.getKind() != Diagnostic.Kind.ERROR) continue;
            sb.append("\n  ").append(d.getSource() == null ? "-" : d.getSource().getName())
              .append(':').append(d.getLineNumber()).append(' ').append(d.getMessage(null));
        }
        throw new IllegalStateException(sb.toString());
    }

    // ---------- decls.json -> 注解源 ----------
    static Path writeOpSource(Map<String, Dec> ops) throws IOException {
        deleteTree(GEN);
        Path f = GEN.resolve("gen/OpsDecl.java");
        Files.createDirectories(f.getParent());
        StringBuilder sb = new StringBuilder("package gen;\n\nimport fanout.Op;\n\n");
        sb.append("// Emit 从 decls.json 生成的中间形态；注解只是 @Op，产物由 GenProc 长出来\n");
        int i = 0;
        for (Dec d : ops.values()) {
            sb.append("@Op(name=").append(lit(d.name()))
              .append(", params=").append(braces(d.params()))
              .append(", required=").append(braces(d.required()))
              .append(", text=").append(lit(d.text()))
              .append(", clamp=").append(braces(d.clamp()))
              .append(")\nfinal class Op").append(i++).append(" {}\n\n");
        }
        Files.writeString(f, sb.toString(), StandardCharsets.UTF_8);
        return f;
    }

    static String lit(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> sb.append(c);
            }
        }
        return sb.append('"').toString();
    }

    static String braces(List<String> xs) {
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < xs.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append(lit(xs.get(i)));
        }
        return sb.append('}').toString();
    }

    static void deleteTree(Path p) throws IOException {
        if (!Files.exists(p)) return;
        try (Stream<Path> s = Files.walk(p)) {
            for (Path x : s.sorted(Comparator.reverseOrder()).toList()) Files.delete(x);
        }
    }
}

/** 读端的一条声明（Emit 自己用，和处理器里的 Rule 不共享——处理器只看注解） */
record Dec(String name, List<String> params, List<String> required, String text, List<String> clamp) {

    static Map<String, Dec> parseAll(String raw) {
        Object root = Json.parse(raw);
        if (!(root instanceof Map<?, ?> m)) throw new IllegalArgumentException("decls.json 顶层必须是对象");
        Map<String, Dec> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> e : m.entrySet()) {
            String name = String.valueOf(e.getKey());
            if (!(e.getValue() instanceof Map<?, ?> body)) throw new IllegalArgumentException(name + " 必须是对象");
            out.put(name, new Dec(name, strs(body.get("params")), strs(body.get("required")),
                    body.get("text") == null ? "" : String.valueOf(body.get("text")), strs(body.get("clamp"))));
        }
        return out;
    }

    static List<String> strs(Object v) {
        if (!(v instanceof List<?> l)) return List.of();
        List<String> out = new ArrayList<>();
        for (Object o : l) out.add(String.valueOf(o));
        return out;
    }
}

/** 够用的 JSON 读器（不引第三方库，也不许引） */
final class Json {

    private final String s;
    private int i;

    private Json(String s) {
        this.s = s;
    }

    static Object parse(String s) {
        Json p = new Json(s);
        Object v = p.value();
        p.ws();
        if (p.i < s.length()) throw p.err("尾部有多余字符");
        return v;
    }

    private RuntimeException err(String m) {
        return new IllegalArgumentException("json: " + m + " @" + i);
    }

    private void ws() {
        while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
    }

    private char peek() {
        return i < s.length() ? s.charAt(i) : '\0';
    }

    private Object value() {
        ws();
        if (i >= s.length()) throw err("意外结束");
        return switch (s.charAt(i)) {
            case '{' -> object();
            case '[' -> array();
            case '"' -> string();
            case 't' -> {
                lit("true");
                yield Boolean.TRUE;
            }
            case 'f' -> {
                lit("false");
                yield Boolean.FALSE;
            }
            case 'n' -> {
                lit("null");
                yield null;
            }
            default -> number();
        };
    }

    private Map<String, Object> object() {
        Map<String, Object> m = new LinkedHashMap<>();
        i++;
        ws();
        if (peek() == '}') {
            i++;
            return m;
        }
        while (true) {
            ws();
            String k = string();
            ws();
            ch(':');
            m.put(k, value());
            ws();
            char c = s.charAt(i++);
            if (c == '}') return m;
            if (c != ',') throw err("对象里期望 , 或 }");
        }
    }

    private List<Object> array() {
        List<Object> l = new ArrayList<>();
        i++;
        ws();
        if (peek() == ']') {
            i++;
            return l;
        }
        while (true) {
            l.add(value());
            ws();
            char c = s.charAt(i++);
            if (c == ']') return l;
            if (c != ',') throw err("数组里期望 , 或 ]");
        }
    }

    private String string() {
        if (peek() != '"') throw err("期望字符串");
        i++;
        StringBuilder sb = new StringBuilder();
        while (true) {
            char c = s.charAt(i++);
            if (c == '"') return sb.toString();
            if (c != '\\') {
                sb.append(c);
                continue;
            }
            char e = s.charAt(i++);
            switch (e) {
                case 'n' -> sb.append('\n');
                case 'r' -> sb.append('\r');
                case 't' -> sb.append('\t');
                case 'b' -> sb.append('\b');
                case 'f' -> sb.append('\f');
                case 'u' -> {
                    sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                    i += 4;
                }
                default -> sb.append(e);
            }
        }
    }

    private Double number() {
        int st = i;
        while (i < s.length() && "-+.eE0123456789".indexOf(s.charAt(i)) >= 0) i++;
        return Double.valueOf(s.substring(st, i));
    }

    private void lit(String w) {
        if (!s.startsWith(w, i)) throw err("期望 " + w);
        i += w.length();
    }

    private void ch(char c) {
        if (peek() != c) throw err("期望 " + c);
        i++;
    }
}

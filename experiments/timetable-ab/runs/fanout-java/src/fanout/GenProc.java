package fanout;

import java.io.IOException;
import java.io.Writer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import javax.annotation.processing.AbstractProcessor;
import javax.annotation.processing.Filer;
import javax.annotation.processing.RoundEnvironment;
import javax.annotation.processing.SupportedAnnotationTypes;
import javax.lang.model.SourceVersion;
import javax.lang.model.element.Element;
import javax.lang.model.element.TypeElement;
import javax.tools.Diagnostic;
import javax.tools.StandardLocation;

/**
 * 产物生成器：读 @Op，一次编译长出 opsText.txt / schema.json / client.js /
 * tests.json / validate.txt（+ 第 6 样 contrib.d.ts 作增量测量）。
 *
 * 产物走 Filer 的资源出口（CLASS_OUTPUT，即 javac 的 -d），所以 Emit 把 -d
 * 指到工作目录根，产物直接落在判据要看的地方。没有用 Files.write 直写。
 */
@SupportedAnnotationTypes("fanout.Op")
public final class GenProc extends AbstractProcessor {

    private boolean emitted;

    @Override
    public SourceVersion getSupportedSourceVersion() {
        return SourceVersion.latestSupported();
    }

    @Override
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment round) {
        if (emitted) return true;

        List<Rule> rules = new ArrayList<>();
        boolean bad = false;
        for (Element e : round.getElementsAnnotatedWith(Op.class)) {
            Rule r = Rule.of(e);
            if (r == null) continue;
            String err = r.check();
            if (err != null) {
                processingEnv.getMessager().printMessage(Diagnostic.Kind.ERROR, err, e);
                bad = true;
                continue;
            }
            if (rules.stream().anyMatch(x -> x.name.equals(r.name))) {
                processingEnv.getMessager().printMessage(Diagnostic.Kind.ERROR, "op 重名: " + r.name, e);
                bad = true;
                continue;
            }
            rules.add(r);
        }
        if (bad || rules.isEmpty()) return true; // 声明有错就一个字不生成，把错误留在编译期

        try {
            Filer filer = processingEnv.getFiler();
            write(filer, "opsText.txt", Artifacts.opsText(rules));
            write(filer, "schema.json", Artifacts.schemaJson(rules));
            write(filer, "client.js", Artifacts.clientJs(rules));
            write(filer, "tests.json", Artifacts.testsJson(rules));
            write(filer, "validate.txt", Artifacts.validateTxt(rules));
            write(filer, "contrib.d.ts", Artifacts.contribDts(rules)); // 第 6 样
            selftest(rules);
            emitted = true;
        } catch (Exception ex) {
            processingEnv.getMessager().printMessage(Diagnostic.Kind.ERROR, "GenProc: " + ex);
        }
        return true;
    }

    /** Filer 出口：同一 round 内同一资源只能建一次，所以整段只在 emitted=false 时跑一次 */
    private void write(Filer filer, String name, String body) throws IOException {
        try (Writer w = filer.createResource(StandardLocation.CLASS_OUTPUT, "", name).openWriter()) {
            w.write(body);
        }
    }

    /** 生成前先在编译期验一遍：文案能渲染、缺字段文案含 op 名与字段名 */
    private void selftest(List<Rule> rules) {
        int pass = 0;
        List<String> fails = new ArrayList<>();
        for (Rule r : rules) {
            String got = Artifacts.renderFromTree(r, Artifacts.tree(r));
            if (got.contains("{") || got.isBlank()) fails.add(r.name + " 文案残留占位符: " + got);
            else pass++;
            for (String req : r.required) {
                String msg = r.missingMsg(req);
                if (msg.contains(r.name) && msg.contains(req)) pass++;
                else fails.add(r.name + " 缺字段文案不合格: " + msg);
            }
        }
        processingEnv.getMessager().printMessage(Diagnostic.Kind.NOTE,
                "GenProc selftest " + pass + "/" + (pass + fails.size()) + " " + (fails.isEmpty() ? "OK" : fails));
        if (!fails.isEmpty())
            processingEnv.getMessager().printMessage(Diagnostic.Kind.ERROR, "GenProc selftest 失败: " + fails);
    }
}

/** 一条声明在读端的形态 */
final class Rule {
    final String name;
    final List<String> params;
    final List<String> required;
    final String text;
    final List<String> clamp;

    private Rule(String name, List<String> params, List<String> required, String text, List<String> clamp) {
        this.name = name;
        this.params = params;
        this.required = required;
        this.text = text;
        this.clamp = clamp;
    }

    static Rule of(Element e) {
        Op a = e.getAnnotation(Op.class);
        if (a == null) return null;
        return new Rule(a.name(), List.of(a.params()), List.of(a.required()), a.text(), List.of(a.clamp()));
    }

    /** 编译期校验：声明的内部一致性。返回 null 表示合法 */
    String check() {
        if (name == null || name.isBlank()) return "op 名为空";
        for (String ph : placeholders(text))
            if (!params.contains(root(ph))) return "op " + name + ": 文案里的 {" + ph + "} 不是已声明参数";
        for (String r : required)
            if (!params.contains(root(r))) return "op " + name + ": required 的 " + r + " 不是已声明参数";
        for (String c : clamp) {
            String field = c.contains(":") ? c.substring(0, c.indexOf(':')) : c;
            if (!params.contains(root(field))) return "op " + name + ": clamp 的 " + c + " 不是已声明参数";
        }
        return null;
    }

    static String root(String path) {
        int i = path.indexOf('.');
        return i < 0 ? path : path.substring(0, i);
    }

    static List<String> placeholders(String t) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < t.length(); i++) {
            if (t.charAt(i) != '{') continue;
            int j = t.indexOf('}', i);
            if (j < 0) break;
            out.add(t.substring(i + 1, j));
            i = j;
        }
        return out;
    }

    String missingMsg(String path) {
        return name + ": missing required " + path;
    }
}

/** 5 样（+1）产物的正文，全部从 Rule 推导，没有任何按 op 名写死的东西 */
final class Artifacts {

    private static final Set<String> JS_RESERVED = Set.of(
            "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do",
            "else", "enum", "export", "extends", "false", "finally", "for", "function", "if", "import", "in",
            "instanceof", "new", "null", "return", "super", "switch", "this", "throw", "true", "try", "typeof",
            "var", "void", "while", "with", "yield", "let", "static", "implements", "interface", "package",
            "private", "protected", "public", "await", "async", "arguments", "eval");

    private Artifacts() {}

    static String jsName(String p) {
        return JS_RESERVED.contains(p) ? p + "_" : p; // swap 的 with 是保留字
    }

    static String cap(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    static String str(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.append('"').toString();
    }

    static String arr(List<String> xs) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < xs.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append(str(xs.get(i)));
        }
        return sb.append(']').toString();
    }

    // ---------- 2 号：确认文案 ----------
    static String opsText(List<Rule> rules) {
        StringBuilder sb = new StringBuilder("# opsText.txt — fanout.GenProc 编译期生成，别手改\n");
        for (Rule r : rules) sb.append(r.name).append('\t').append(r.text).append('\n');
        return sb.toString();
    }

    // ---------- 4 号：schema ----------
    static String schemaJson(List<Rule> rules) {
        StringBuilder sb = new StringBuilder("{\n");
        for (int i = 0; i < rules.size(); i++) {
            Rule r = rules.get(i);
            sb.append("  ").append(str(r.name)).append(": {\n")
              .append("    \"name\": ").append(str(r.name)).append(",\n")
              .append("    \"params\": ").append(arr(r.params)).append(",\n")
              .append("    \"required\": ").append(arr(r.required)).append(",\n")
              .append("    \"clamp\": ").append(arr(r.clamp)).append(",\n")
              .append("    \"text\": ").append(str(r.text)).append("\n")
              .append("  }").append(i + 1 < rules.size() ? "," : "").append('\n');
        }
        return sb.append("}\n").toString();
    }

    // ---------- 5 号：客户端存根 ----------
    static String clientJs(List<Rule> rules) {
        StringBuilder sb = new StringBuilder();
        sb.append("// client.js — fanout.GenProc 编译期生成，别手改；函数参数名来自声明里的 params\n")
          .append("'use strict';\n\n")
          .append("function guard(op, args, required) {\n")
          .append("  for (const path of required) {\n")
          .append("    let v = args;\n")
          .append("    for (const k of path.split('.')) v = (v == null) ? undefined : v[k];\n")
          .append("    if (v === undefined || v === null) throw new Error(op + ': missing required ' + path);\n")
          .append("  }\n")
          .append("}\n\n")
          .append("function call(op, params) { return { op, params }; }\n\n");
        for (Rule r : rules) {
            List<String> locals = new ArrayList<>();
            for (String p : r.params) locals.add(jsName(p));
            sb.append("/** ").append(r.name).append(" — ").append(r.text.replace("*/", "* /")).append(" */\n");
            sb.append("function ").append(r.name).append('(').append(String.join(", ", locals)).append(") {\n");
            sb.append("  guard('").append(r.name).append("', ").append(pairs(r, locals)).append(", ")
              .append(arr(r.required)).append(");\n");
            sb.append("  return call('").append(r.name).append("', ").append(pairs(r, locals)).append(");\n");
            sb.append("}\n\n");
        }
        sb.append("const api = { ").append(rules.stream().map(r -> r.name).collect(Collectors.joining(", "))).append(" };\n")
          .append("if (typeof module !== 'undefined') module.exports = api;\n");
        return sb.toString();
    }

    private static String pairs(Rule r, List<String> locals) {
        StringBuilder sb = new StringBuilder("{ ");
        for (int i = 0; i < r.params.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append(r.params.get(i)).append(": ").append(locals.get(i));
        }
        return sb.append(" }").toString();
    }

    // ---------- 6 号：测试 ----------
    static String testsJson(List<Rule> rules) {
        List<String> cases = new ArrayList<>();
        for (Rule r : rules) {
            cases.add("    " + json(obj("op", r.name, "case", "ok", "args", tree(r),
                    "expect", obj("text", renderFromTree(r, tree(r)), "errors", List.of()))));
            for (String req : r.required) {
                Map<String, Object> miss = tree(r);
                drop(miss, req);
                cases.add("    " + json(obj("op", r.name, "case", "missing:" + req, "args", miss,
                        "expect", obj("errors", List.of(r.missingMsg(req))))));
            }
        }
        return "{\n  \"generatedBy\": \"fanout.GenProc\",\n  \"cases\": [\n"
                + String.join(",\n", cases) + "\n  ]\n}\n";
    }

    static Map<String, Object> obj(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    static Map<String, Object> tree(Rule r) {
        Map<String, Object> root = new LinkedHashMap<>();
        for (String p : r.params) root.put(p, "样·" + p);
        for (String req : r.required) putPath(root, req, "样·" + req);
        for (String ph : Rule.placeholders(r.text)) putPath(root, ph, "样·" + ph);
        return root;
    }

    @SuppressWarnings("unchecked")
    static void putPath(Map<String, Object> root, String path, String val) {
        String[] seg = path.split("\\.");
        Map<String, Object> cur = root;
        for (int i = 0; i < seg.length - 1; i++) {
            Object next = cur.get(seg[i]);
            if (!(next instanceof Map)) {
                next = new LinkedHashMap<String, Object>();
                cur.put(seg[i], next);
            }
            cur = (Map<String, Object>) next;
        }
        cur.put(seg[seg.length - 1], val);
    }

    @SuppressWarnings("unchecked")
    static void drop(Map<String, Object> root, String path) {
        String[] seg = path.split("\\.");
        Map<String, Object> cur = root;
        for (int i = 0; i < seg.length - 1; i++) {
            Object next = cur.get(seg[i]);
            if (!(next instanceof Map)) return;
            cur = (Map<String, Object>) next;
        }
        cur.remove(seg[seg.length - 1]);
    }

    static Object lookup(Map<String, Object> root, String path) {
        Object cur = root;
        for (String k : path.split("\\.")) {
            if (!(cur instanceof Map<?, ?> m)) return null;
            cur = m.get(k);
        }
        return cur;
    }

    static String renderFromTree(Rule r, Map<String, Object> args) {
        String s = r.text;
        for (String ph : Rule.placeholders(r.text)) {
            Object v = lookup(args, ph);
            s = s.replace("{" + ph + "}", v == null ? "?" + ph + "?" : String.valueOf(v));
        }
        return s;
    }

    static String json(Object v) {
        if (v instanceof Map<?, ?> m) {
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (!first) sb.append(", ");
                first = false;
                sb.append(str(String.valueOf(e.getKey()))).append(": ").append(json(e.getValue()));
            }
            return sb.append('}').toString();
        }
        if (v instanceof List<?> l) {
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < l.size(); i++) {
                if (i > 0) sb.append(", ");
                sb.append(json(l.get(i)));
            }
            return sb.append(']').toString();
        }
        return str(String.valueOf(v));
    }

    // ---------- 3 号：参数校验 ----------
    static String validateTxt(List<Rule> rules) {
        StringBuilder sb = new StringBuilder();
        sb.append("# validate.txt — fanout.GenProc 编译期生成，别手改\n")
          .append("# 规则行: <op> | requires <path>[, ...] | clamp <field>:<range>[, ...]\n")
          .append("# 缺字段文案: \"<op>: missing required <path>\"\n");
        for (Rule r : rules)
            sb.append(r.name).append(" | requires ")
              .append(r.required.isEmpty() ? "-" : String.join(", ", r.required))
              .append(" | clamp ")
              .append(r.clamp.isEmpty() ? "-" : String.join(", ", r.clamp))
              .append('\n');
        return sb.toString();
    }

    // ---------- 第 6 样：TypeScript 声明（增量测量用） ----------
    static String contribDts(List<Rule> rules) {
        StringBuilder sb = new StringBuilder(
                "// contrib.d.ts — 第 6 样产物（增量测量），fanout.GenProc 编译期生成\n");
        for (Rule r : rules) {
            sb.append("export interface ").append(cap(r.name)).append("Args {");
            for (String p : r.params) sb.append(' ').append(p).append(": unknown;");
            sb.append(" }\n");
            sb.append("export declare function ").append(r.name).append("(args: ")
              .append(cap(r.name)).append("Args): unknown;\n");
        }
        return sb.toString();
    }
}

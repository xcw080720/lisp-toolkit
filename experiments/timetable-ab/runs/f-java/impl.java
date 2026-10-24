import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public class impl {
    // ===== JSON READ BEGIN =====
    static char[] S;
    static int P;

    static Object readJson(String s) { S = s.toCharArray(); P = 0; ws(); return val(); }

    static void ws() { while (P < S.length && Character.isWhitespace(S[P])) P++; }

    static Object val() {
        ws();
        char c = S[P];
        if (c == '{') return obj();
        if (c == '[') return arr();
        if (c == '"') return str();
        if (c == 't') { P += 4; return Boolean.TRUE; }
        if (c == 'f') { P += 5; return Boolean.FALSE; }
        if (c == 'n') { P += 4; return null; }
        return num();
    }

    static Map<String, Object> obj() {
        Map<String, Object> m = new LinkedHashMap<>();
        P++; ws();
        if (S[P] == '}') { P++; return m; }
        while (true) {
            ws();
            String k = str();
            ws();
            P++;                                   // skip ':'
            m.put(k, val());
            ws();
            if (S[P] == ',') { P++; continue; }
            P++; return m;                         // skip '}'
        }
    }

    static List<Object> arr() {
        List<Object> a = new ArrayList<>();
        P++; ws();
        if (S[P] == ']') { P++; return a; }
        while (true) {
            a.add(val());
            ws();
            if (S[P] == ',') { P++; continue; }
            P++; return a;                         // skip ']'
        }
    }

    static String str() {
        StringBuilder b = new StringBuilder();
        P++;                                       // skip '"'
        while (true) {
            char c = S[P++];
            if (c == '"') return b.toString();
            if (c != '\\') { b.append(c); continue; }
            char e = S[P++];
            switch (e) {
                case 'n' -> b.append('\n');
                case 't' -> b.append('\t');
                case 'r' -> b.append('\r');
                case 'b' -> b.append('\b');
                case 'f' -> b.append('\f');
                case 'u' -> { b.append((char) Integer.parseInt(new String(S, P, 4), 16)); P += 4; }
                default -> b.append(e);
            }
        }
    }

    static Object num() {
        int st = P;
        while (P < S.length && "+-0123456789.eE".indexOf(S[P]) >= 0) P++;
        String t = new String(S, st, P - st);
        if (t.indexOf('.') < 0 && t.indexOf('e') < 0 && t.indexOf('E') < 0) return (Object) Long.valueOf(t);
        return (Object) Double.valueOf(t);
    }
    // ===== JSON READ END =====

    // ===== JSON WRITE BEGIN =====
    static String writeJson(Object v) { StringBuilder b = new StringBuilder(); emit(v, b); return b.toString(); }

    static void emit(Object v, StringBuilder b) {
        if (v == null) { b.append("null"); return; }
        if (v instanceof String s) { quote(s, b); return; }
        if (v instanceof Boolean bo) { b.append(bo ? "true" : "false"); return; }
        if (v instanceof Long l) { b.append(l.longValue()); return; }
        if (v instanceof Integer i) { b.append(i.intValue()); return; }
        if (v instanceof Double d) {
            if (!d.isInfinite() && d == Math.rint(d)) b.append(d.longValue()); else b.append(d.doubleValue());
            return;
        }
        if (v instanceof Map<?, ?> m) {
            b.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (!first) b.append(',');
                first = false;
                quote(String.valueOf(e.getKey()), b);
                b.append(':');
                emit(e.getValue(), b);
            }
            b.append('}');
            return;
        }
        if (v instanceof List<?> l) {
            b.append('[');
            boolean first = true;
            for (Object o : l) { if (!first) b.append(','); first = false; emit(o, b); }
            b.append(']');
            return;
        }
        quote(String.valueOf(v), b);
    }

    static void quote(String s, StringBuilder b) {
        b.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> {
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c);
                }
            }
        }
        b.append('"');
    }
    // ===== JSON WRITE END =====

    // ===== ops =====
    static final Set<String> KNOWN = Set.of("add", "del", "edit", "move", "swap");
    static final List<String> LOG = new ArrayList<>();
    static int N = 0;

    static void log(String msg) { LOG.add((LOG.size() + 1) + ") " + msg); }

    static String str(Map<String, Object> m, String k) {
        Object v = m.get(k);
        return v instanceof String x ? x : null;
    }

    static long num(Map<String, Object> m, String k, long dflt) {
        Object v = m.get(k);
        return v instanceof Number n ? n.longValue() : dflt;
    }

    static boolean has(Map<String, Object> m, String k) { return m.get(k) != null; }

    static long clamp(long v, long lo, long hi) { return v < lo ? lo : (v > hi ? hi : v); }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> hits(List<Map<String, Object>> cs, String match) {
        List<Map<String, Object>> r = new ArrayList<>();
        if (match == null) return r;
        for (Map<String, Object> c : cs) {
            String nm = str(c, "name");
            if (nm != null && nm.contains(match)) r.add(c);
        }
        return r;
    }

    @SuppressWarnings("unchecked")
    static void doAdd(List<Map<String, Object>> cs, Map<String, Object> op) {
        if (!(op.get("course") instanceof Map<?, ?> raw)) { log("add 缺 course，跳过"); return; }
        Map<String, Object> c = new LinkedHashMap<>((Map<String, Object>) raw);
        if (!(c.get("weeks") instanceof Map<?, ?>)) {
            Map<String, Object> w = new LinkedHashMap<>();
            w.put("type", "range");
            w.put("from", Long.valueOf(1));
            w.put("to", Long.valueOf(16));
            c.put("weeks", w);
        }
        if (c.get("day") instanceof Number n) c.put("day", Long.valueOf(clamp(n.longValue(), 1, 7)));
        cs.add(c);
        N++;
        log("add " + str(c, "name"));
    }

    static void doDel(List<Map<String, Object>> cs, Map<String, Object> op) {
        List<Map<String, Object>> h = hits(cs, str(op, "match"));
        if (h.isEmpty()) { log("没找到：" + str(op, "match")); return; }
        cs.removeIf(c -> { for (Map<String, Object> x : h) if (x == c) return true; return false; });
        N += h.size();
        log("del 删掉 " + h.size() + " 门");
    }

    @SuppressWarnings("unchecked")
    static void doEdit(List<Map<String, Object>> cs, Map<String, Object> op) {
        if (!(op.get("set") instanceof Map<?, ?> sm)) { log("edit 缺 set，跳过"); return; }
        List<Map<String, Object>> h = hits(cs, str(op, "match"));
        for (Map<String, Object> c : h) {
            for (Map.Entry<?, ?> e : sm.entrySet()) c.put(String.valueOf(e.getKey()), e.getValue());
            if (c.get("day") instanceof Number n) c.put("day", Long.valueOf(clamp(n.longValue(), 1, 7)));
        }
        N += h.size();
        log("edit 改 " + h.size() + " 门");
    }

    static void doMove(List<Map<String, Object>> cs, Map<String, Object> op) {
        if (!has(op, "day") || !has(op, "periodFrom") || !has(op, "periodTo")) { log("move 缺字段，不执行"); return; }
        List<Map<String, Object>> h = hits(cs, str(op, "match"));
        for (Map<String, Object> c : h) {
            c.put("day", Long.valueOf(clamp(num(op, "day", 1), 1, 7)));
            c.put("periodFrom", Long.valueOf(num(op, "periodFrom", 1)));
            c.put("periodTo", Long.valueOf(num(op, "periodTo", 1)));
        }
        N += h.size();
        log("move 移 " + h.size() + " 门");
    }

    static void doSwap(List<Map<String, Object>> cs, Map<String, Object> op) {
        List<Map<String, Object>> a = hits(cs, str(op, "match"));
        List<Map<String, Object>> b = hits(cs, str(op, "with"));
        if (a.size() != 1 || b.size() != 1) { log("swap 命中数不对，不执行"); return; }
        Map<String, Object> x = a.get(0), y = b.get(0);
        Object d = x.get("day"), f = x.get("periodFrom"), t = x.get("periodTo");
        x.put("day", y.get("day")); x.put("periodFrom", y.get("periodFrom")); x.put("periodTo", y.get("periodTo"));
        y.put("day", d); y.put("periodFrom", f); y.put("periodTo", t);
        N += 2;
        log("swap 互换 " + str(x, "name") + " / " + str(y, "name"));
    }

    @SuppressWarnings("unchecked")
    public static void main(String[] args) throws Exception {
        String txt = Files.readString(Path.of(args[0]), StandardCharsets.UTF_8);
        Map<String, Object> root = (Map<String, Object>) readJson(txt);
        List<Map<String, Object>> cs = new ArrayList<>();
        if (root.get("courses") instanceof List<?> l) for (Object o : l) cs.add(new LinkedHashMap<>((Map<String, Object>) o));
        List<Object> ops = new ArrayList<>();
        if (root.get("ops") instanceof List<?> l) ops.addAll(l);

        String opsText = "";
        boolean rejected = false;
        for (Object o : ops) {
            String kind = (o instanceof Map<?, ?> m) ? (m.get("op") instanceof String x ? x : null) : null;
            if (kind == null || !KNOWN.contains(kind)) {
                log("拒绝：未知 op " + kind);
                rejected = true;
                break;
            }
        }
        if (!rejected && !ops.isEmpty()) {
            for (Object o : ops) {
                Map<String, Object> op = (Map<String, Object>) o;
                String kind = (String) op.get("op");
                switch (kind) {
                    case "add" -> doAdd(cs, op);
                    case "del" -> doDel(cs, op);
                    case "edit" -> doEdit(cs, op);
                    case "move" -> doMove(cs, op);
                    case "swap" -> doSwap(cs, op);
                    default -> log("未处理 " + kind);
                }
            }
            opsText = writeJson(ops);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("opsText", opsText);
        out.put("courses", cs);
        out.put("log", LOG);
        out.put("n", Long.valueOf(N));

        PrintStream ps = new PrintStream(new FileOutputStream(FileDescriptor.out), true, "UTF-8");
        ps.print(writeJson(out));
        ps.flush();
    }
}

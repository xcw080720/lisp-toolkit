// impl.rs — 课表 ops 执行器（std-only；手写 JSON 读 / 写；5 个 op：add/del/edit/move/swap）
use std::env;
use std::fs;
use std::process;

// ---------------- JSON 值（对象保持输入键序） ----------------
#[derive(Clone, PartialEq)]
enum V {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<V>),
    Obj(Vec<(String, V)>),
}

// ---------------- 读取：递归下降 parser ----------------
struct P<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> P<'a> {
    fn new(b: &'a [u8]) -> Self {
        P { b, i: 0 }
    }
    fn ws(&mut self) {
        while self.i < self.b.len()
            && matches!(self.b[self.i], b' ' | b'\t' | b'\n' | b'\r')
        {
            self.i += 1;
        }
    }
    fn peek(&self) -> u8 {
        if self.i < self.b.len() { self.b[self.i] } else { 0 }
    }
    fn value(&mut self) -> Result<V, String> {
        self.ws();
        match self.peek() {
            b'{' => self.obj(),
            b'[' => self.arr(),
            b'"' => Ok(V::Str(self.string()?)),
            b't' => {
                self.lit("true")?;
                Ok(V::Bool(true))
            }
            b'f' => {
                self.lit("false")?;
                Ok(V::Bool(false))
            }
            b'n' => {
                self.lit("null")?;
                Ok(V::Null)
            }
            b'-' | b'0'..=b'9' => self.num(),
            c => Err(format!("bad char {:?}", c as char)),
        }
    }
    fn lit(&mut self, s: &str) -> Result<(), String> {
        if self.b[self.i..].starts_with(s.as_bytes()) {
            self.i += s.len();
            Ok(())
        } else {
            Err(format!("expect {}", s))
        }
    }
    fn obj(&mut self) -> Result<V, String> {
        self.i += 1;
        let mut o: Vec<(String, V)> = Vec::new();
        self.ws();
        if self.peek() == b'}' {
            self.i += 1;
            return Ok(V::Obj(o));
        }
        loop {
            self.ws();
            let k = self.string()?;
            self.ws();
            if self.peek() != b':' {
                return Err("expect :".into());
            }
            self.i += 1;
            let v = self.value()?;
            o.push((k, v));
            self.ws();
            match self.peek() {
                b',' => self.i += 1,
                b'}' => {
                    self.i += 1;
                    return Ok(V::Obj(o));
                }
                _ => return Err("expect , or }".into()),
            }
        }
    }
    fn arr(&mut self) -> Result<V, String> {
        self.i += 1;
        let mut a: Vec<V> = Vec::new();
        self.ws();
        if self.peek() == b']' {
            self.i += 1;
            return Ok(V::Arr(a));
        }
        loop {
            a.push(self.value()?);
            self.ws();
            match self.peek() {
                b',' => self.i += 1,
                b']' => {
                    self.i += 1;
                    return Ok(V::Arr(a));
                }
                _ => return Err("expect , or ]".into()),
            }
        }
    }
    fn hex4(&mut self) -> Result<u32, String> {
        let mut v: u32 = 0;
        for _ in 0..4 {
            let c = self.peek();
            self.i += 1;
            let d = match c {
                b'0'..=b'9' => c - b'0',
                b'a'..=b'f' => c - b'a' + 10,
                b'A'..=b'F' => c - b'A' + 10,
                _ => return Err("bad hex".into()),
            };
            v = v * 16 + d as u32;
        }
        Ok(v)
    }
    fn string(&mut self) -> Result<String, String> {
        if self.peek() != b'"' {
            return Err("expect \"".into());
        }
        self.i += 1;
        let mut out: Vec<u8> = Vec::new();
        loop {
            if self.i >= self.b.len() {
                return Err("eof in string".into());
            }
            let c = self.b[self.i];
            if c == b'"' {
                self.i += 1;
                break;
            }
            if c == b'\\' {
                self.i += 1;
                let e = self.peek();
                self.i += 1;
                match e {
                    b'"' => out.push(b'"'),
                    b'\\' => out.push(b'\\'),
                    b'/' => out.push(b'/'),
                    b'b' => out.push(8),
                    b'f' => out.push(12),
                    b'n' => out.push(b'\n'),
                    b'r' => out.push(b'\r'),
                    b't' => out.push(b'\t'),
                    b'u' => {
                        let mut cp = self.hex4()?;
                        if (0xD800..0xDC00).contains(&cp) && self.peek() == b'\\' {
                            let save = self.i;
                            self.i += 1;
                            if self.peek() == b'u' {
                                self.i += 1;
                                let lo = self.hex4()?;
                                cp = 0x10000 + ((cp - 0xD800) << 10) + (lo.wrapping_sub(0xDC00) & 0x3FF);
                            } else {
                                self.i = save;
                            }
                        }
                        let ch = char::from_u32(cp).unwrap_or('\u{FFFD}');
                        let mut buf = [0u8; 4];
                        out.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
                    }
                    _ => return Err("bad escape".into()),
                }
            } else {
                out.push(c);
                self.i += 1;
            }
        }
        String::from_utf8(out).map_err(|_| "bad utf8".to_string())
    }
    fn num(&mut self) -> Result<V, String> {
        let s = self.i;
        if self.peek() == b'-' {
            self.i += 1;
        }
        while self.i < self.b.len()
            && matches!(self.b[self.i], b'0'..=b'9' | b'.' | b'e' | b'E' | b'+' | b'-')
        {
            self.i += 1;
        }
        let t = std::str::from_utf8(&self.b[s..self.i]).map_err(|_| "num utf8".to_string())?;
        t.parse::<f64>()
            .map(V::Num)
            .map_err(|_| format!("bad num {}", t))
    }
}

// ---------------- 写出 ----------------
fn esc(s: &str, out: &mut String) {
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn ser(v: &V, out: &mut String) {
    match v {
        V::Null => out.push_str("null"),
        V::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        V::Num(n) => {
            if n.fract() == 0.0 && n.abs() < 1e15 {
                out.push_str(&format!("{}", *n as i64));
            } else {
                out.push_str(&format!("{}", n));
            }
        }
        V::Str(s) => esc(s, out),
        V::Arr(a) => {
            out.push('[');
            for (i, x) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                ser(x, out);
            }
            out.push(']');
        }
        V::Obj(o) => {
            out.push('{');
            for (i, (k, x)) in o.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                esc(k, out);
                out.push(':');
                ser(x, out);
            }
            out.push('}');
        }
    }
}

fn to_text(v: &V) -> String {
    let mut s = String::new();
    ser(v, &mut s);
    s
}

// ---------------- 取值 / 改值小工具 ----------------
fn get<'a>(o: &'a [(String, V)], k: &str) -> Option<&'a V> {
    o.iter().find(|(kk, _)| kk == k).map(|(_, v)| v)
}
fn get_mut<'a>(o: &'a mut Vec<(String, V)>, k: &str) -> Option<&'a mut V> {
    o.iter_mut().find(|(kk, _)| kk == k).map(|(_, v)| v)
}
fn set(o: &mut Vec<(String, V)>, k: &str, v: V) {
    if let Some(slot) = get_mut(o, k) {
        *slot = v;
    } else {
        o.push((k.to_string(), v));
    }
}
fn s_of(v: Option<&V>) -> String {
    match v {
        Some(V::Str(s)) => s.clone(),
        _ => String::new(),
    }
}
fn n_of(v: Option<&V>) -> Option<f64> {
    match v {
        Some(V::Num(n)) => Some(*n),
        _ => None,
    }
}
fn clamp_day(x: f64) -> f64 {
    if x < 1.0 {
        1.0
    } else if x > 7.0 {
        7.0
    } else {
        x
    }
}
fn at_least1(x: f64) -> f64 {
    if x < 1.0 { 1.0 } else { x }
}

fn cname(c: &V) -> String {
    match c {
        V::Obj(f) => s_of(get(f, "name")),
        _ => String::new(),
    }
}

fn weeks_default() -> V {
    V::Obj(vec![
        ("type".to_string(), V::Str("range".to_string())),
        ("from".to_string(), V::Num(1.0)),
        ("to".to_string(), V::Num(16.0)),
    ])
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("usage: impl.exe <input.json>");
        process::exit(2);
    }
    let raw = match fs::read(&args[1]) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("read error: {}", e);
            process::exit(2);
        }
    };
    let text = String::from_utf8_lossy(&raw).to_string();

    let mut p = P::new(text.as_bytes());
    let root = match p.value() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("parse error: {}", e);
            process::exit(2);
        }
    };

    let mut courses: Vec<V> = match &root {
        V::Obj(o) => match get(o, "courses") {
            Some(V::Arr(a)) => a.clone(),
            _ => Vec::new(),
        },
        _ => Vec::new(),
    };
    let ops: Vec<V> = match &root {
        V::Obj(o) => match get(o, "ops") {
            Some(V::Arr(a)) => a.clone(),
            _ => Vec::new(),
        },
        _ => Vec::new(),
    };

    // 空 ops
    if ops.is_empty() {
        let out = V::Obj(vec![
            ("opsText".to_string(), V::Str(String::new())),
            ("courses".to_string(), V::Arr(courses)),
            ("log".to_string(), V::Arr(Vec::new())),
            ("n".to_string(), V::Num(0.0)),
        ]);
        println!("{}", to_text(&out));
        return;
    }

    // 先校验：未知 op 整批拒绝
    let known = ["add", "del", "edit", "move", "swap"];
    for op in ops.iter() {
        let name = match op {
            V::Obj(o) => s_of(get(o, "op")),
            _ => String::new(),
        };
        if !known.contains(&name.as_str()) {
            let shown = if name.is_empty() { "?".to_string() } else { name };
            let out = V::Obj(vec![
                ("opsText".to_string(), V::Str(String::new())),
                ("courses".to_string(), V::Arr(courses)),
                (
                    "log".to_string(),
                    V::Arr(vec![V::Str(format!("1) 拒绝：未知 op {}", shown))]),
                ),
                ("n".to_string(), V::Num(0.0)),
            ]);
            println!("{}", to_text(&out));
            return;
        }
    }

    let mut logs: Vec<String> = Vec::new();
    let mut n: i64 = 0;

    for op in ops.iter() {
        let o: &Vec<(String, V)> = match op {
            V::Obj(x) => x,
            _ => continue,
        };
        let name = s_of(get(o, "op"));
        match name.as_str() {
            "add" => {
                let mut c: Vec<(String, V)> = match get(o, "course") {
                    Some(V::Obj(x)) => x.clone(),
                    _ => Vec::new(),
                };
                if get(&c, "weeks").is_none() {
                    set(&mut c, "weeks", weeks_default());
                }
                if get(&c, "tag").is_none() {
                    set(&mut c, "tag", V::Null);
                }
                if get(&c, "teacher").is_none() {
                    set(&mut c, "teacher", V::Str(String::new()));
                }
                if get(&c, "location").is_none() {
                    set(&mut c, "location", V::Str(String::new()));
                }
                if get(&c, "periodFrom").is_none() {
                    set(&mut c, "periodFrom", V::Num(1.0));
                }
                if get(&c, "periodTo").is_none() {
                    set(&mut c, "periodTo", V::Num(2.0));
                }
                let d = clamp_day(n_of(get(&c, "day")).unwrap_or(1.0));
                set(&mut c, "day", V::Num(d));
                let nm = s_of(get(&c, "name"));
                courses.push(V::Obj(c));
                n += 1;
                logs.push(format!("新增「{}」，day={}", nm, d as i64));
            }
            "del" => {
                let m = s_of(get(o, "match"));
                let before = courses.len();
                courses.retain(|c| !cname(c).contains(&m));
                let hit = before - courses.len();
                if hit == 0 {
                    logs.push(format!("没找到「{}」", m));
                } else {
                    n += hit as i64;
                    logs.push(format!("删除 {} 门（含「{}」）", hit, m));
                }
            }
            "edit" => {
                let m = s_of(get(o, "match"));
                let kv: Vec<(String, V)> = match get(o, "set") {
                    Some(V::Obj(x)) => x.clone(),
                    _ => Vec::new(),
                };
                let mut cnt = 0;
                for c in courses.iter_mut() {
                    if let V::Obj(f) = c {
                        if s_of(get(&f[..], "name")).contains(&m) {
                            for (k, v) in kv.iter() {
                                let nv = if k == "day" {
                                    V::Num(clamp_day(n_of(Some(v)).unwrap_or(1.0)))
                                } else {
                                    v.clone()
                                };
                                set(f, k, nv);
                            }
                            cnt += 1;
                        }
                    }
                }
                if cnt == 0 {
                    logs.push(format!("没找到「{}」", m));
                } else {
                    n += cnt;
                    logs.push(format!("改 {} 门（含「{}」）", cnt, m));
                }
            }
            "move" => {
                let has = get(o, "match").is_some()
                    && get(o, "day").is_some()
                    && get(o, "periodFrom").is_some()
                    && get(o, "periodTo").is_some();
                if !has {
                    logs.push("move 缺 match/day/periodFrom/periodTo，不执行".to_string());
                } else {
                    let m = s_of(get(o, "match"));
                    let d = clamp_day(n_of(get(o, "day")).unwrap_or(1.0));
                    let pf = at_least1(n_of(get(o, "periodFrom")).unwrap_or(1.0));
                    let pt = at_least1(n_of(get(o, "periodTo")).unwrap_or(pf));
                    let mut cnt = 0;
                    for c in courses.iter_mut() {
                        if let V::Obj(f) = c {
                            if s_of(get(&f[..], "name")).contains(&m) {
                                set(f, "day", V::Num(d));
                                set(f, "periodFrom", V::Num(pf));
                                set(f, "periodTo", V::Num(pt));
                                cnt += 1;
                            }
                        }
                    }
                    if cnt == 0 {
                        logs.push(format!("没找到「{}」", m));
                    } else {
                        n += cnt;
                        logs.push(format!("移 {} 门到 day={} 第{}-{}节", cnt, d as i64, pf as i64, pt as i64));
                    }
                }
            }
            "swap" => {
                let a = s_of(get(o, "match"));
                let b = s_of(get(o, "with"));
                let ia: Vec<usize> = (0..courses.len())
                    .filter(|&i| cname(&courses[i]).contains(&a))
                    .collect();
                let ib: Vec<usize> = (0..courses.len())
                    .filter(|&i| cname(&courses[i]).contains(&b))
                    .collect();
                if ia.len() == 1 && ib.len() == 1 && ia[0] != ib[0] {
                    let (i1, i2) = (ia[0], ib[0]);
                    let t1 = triple(&courses[i1]);
                    let t2 = triple(&courses[i2]);
                    put_triple(&mut courses[i1], t2);
                    put_triple(&mut courses[i2], t1);
                    n += 2;
                    logs.push(format!("互换「{}」与「{}」的时间", a, b));
                } else {
                    logs.push(format!(
                        "swap 需两侧各命中恰好 1 门（实际 {} / {}），不执行",
                        ia.len(),
                        ib.len()
                    ));
                }
            }
            _ => {}
        }
    }

    let log_v: Vec<V> = logs
        .iter()
        .enumerate()
        .map(|(i, s)| V::Str(format!("{}) {}", i + 1, s)))
        .collect();
    let out = V::Obj(vec![
        ("opsText".to_string(), V::Str(to_text(&V::Arr(ops.clone())))),
        ("courses".to_string(), V::Arr(courses)),
        ("log".to_string(), V::Arr(log_v)),
        ("n".to_string(), V::Num(n as f64)),
    ]);
    println!("{}", to_text(&out));
}

fn triple(c: &V) -> (f64, f64, f64) {
    match c {
        V::Obj(f) => (
            n_of(get(f, "day")).unwrap_or(1.0),
            n_of(get(f, "periodFrom")).unwrap_or(1.0),
            n_of(get(f, "periodTo")).unwrap_or(1.0),
        ),
        _ => (1.0, 1.0, 2.0),
    }
}

fn put_triple(c: &mut V, t: (f64, f64, f64)) {
    if let V::Obj(f) = c {
        set(f, "day", V::Num(t.0));
        set(f, "periodFrom", V::Num(t.1));
        set(f, "periodTo", V::Num(t.2));
    }
}

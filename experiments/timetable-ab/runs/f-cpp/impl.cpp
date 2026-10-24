// impl.cpp — 课表 ops 执行器（add / del / edit / move / swap）
// 单文件 · 零第三方依赖 · 手写 JSON 解析与序列化
//
// C++ 标准库没有 JSON，这一层必须自己搭：
//   解析：对象 / 数组 / 字符串（含 \u 转义与代理对）/ 数字 / 布尔 / null
//   序列化：UTF-8 原样透出，空对象保持 {}，整数不带小数点，键序按插入序
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <utility>
#include <vector>

// ============================ JSON 值 ============================
struct Val {
  enum Kind { NUL, BOOL, NUM, STR, ARR, OBJ };
  Kind k = NUL;
  bool b = false;
  double d = 0;
  long long i = 0;
  bool isInt = true;
  std::string s;
  std::vector<Val> a;
  std::vector<std::pair<std::string, Val> > o;  // 键序 = 插入序

  static Val nul() { return Val(); }
  static Val boolean(bool x) { Val v; v.k = BOOL; v.b = x; return v; }
  static Val integer(long long x) { Val v; v.k = NUM; v.isInt = true; v.i = x; v.d = (double)x; return v; }
  static Val real(double x) { Val v; v.k = NUM; v.isInt = false; v.d = x; v.i = (long long)x; return v; }
  static Val string(const std::string& x) { Val v; v.k = STR; v.s = x; return v; }
  static Val array() { Val v; v.k = ARR; return v; }
  static Val object() { Val v; v.k = OBJ; return v; }

  const Val* find(const std::string& key) const {
    if (k != OBJ) return 0;
    for (size_t j = 0; j < o.size(); j++)
      if (o[j].first == key) return &o[j].second;
    return 0;
  }
  Val* find(const std::string& key) {
    if (k != OBJ) return 0;
    for (size_t j = 0; j < o.size(); j++)
      if (o[j].first == key) return &o[j].second;
    return 0;
  }
  bool has(const std::string& key) const { return find(key) != 0; }
  void put(const std::string& key, const Val& v) {
    for (size_t j = 0; j < o.size(); j++)
      if (o[j].first == key) { o[j].second = v; return; }
    o.push_back(std::make_pair(key, v));
  }
};

// ============================ 解析器 ============================
struct Parser {
  const std::string& S;
  size_t p;
  bool bad;
  explicit Parser(const std::string& src) : S(src), p(0), bad(false) {}

  void skip() {
    while (p < S.size()) {
      char c = S[p];
      if (c == ' ' || c == '\t' || c == '\n' || c == '\r') p++;
      else break;
    }
  }

  static void utf8(std::string& r, unsigned cp) {
    if (cp < 0x80) r += (char)cp;
    else if (cp < 0x800) { r += (char)(0xC0 | (cp >> 6)); r += (char)(0x80 | (cp & 0x3F)); }
    else if (cp < 0x10000) {
      r += (char)(0xE0 | (cp >> 12)); r += (char)(0x80 | ((cp >> 6) & 0x3F)); r += (char)(0x80 | (cp & 0x3F));
    } else {
      r += (char)(0xF0 | (cp >> 18)); r += (char)(0x80 | ((cp >> 12) & 0x3F));
      r += (char)(0x80 | ((cp >> 6) & 0x3F)); r += (char)(0x80 | (cp & 0x3F));
    }
  }

  std::string str() {
    std::string r;
    if (p >= S.size() || S[p] != '"') { bad = true; return r; }
    p++;
    while (p < S.size()) {
      unsigned char c = (unsigned char)S[p++];
      if (c == '"') return r;
      if (c != '\\') { r += (char)c; continue; }
      if (p >= S.size()) { bad = true; return r; }
      char e = S[p++];
      if (e == '"') r += '"';
      else if (e == '\\') r += '\\';
      else if (e == '/') r += '/';
      else if (e == 'b') r += '\b';
      else if (e == 'f') r += '\f';
      else if (e == 'n') r += '\n';
      else if (e == 'r') r += '\r';
      else if (e == 't') r += '\t';
      else if (e == 'u') {
        if (p + 4 > S.size()) { bad = true; return r; }
        unsigned cp = (unsigned)strtoul(S.substr(p, 4).c_str(), 0, 16);
        p += 4;
        if (cp >= 0xD800 && cp <= 0xDBFF && p + 6 <= S.size() && S[p] == '\\' && S[p + 1] == 'u') {
          unsigned lo = (unsigned)strtoul(S.substr(p + 2, 4).c_str(), 0, 16);
          if (lo >= 0xDC00 && lo <= 0xDFFF) {
            cp = 0x10000u + ((cp - 0xD800u) << 10) + (lo - 0xDC00u);
            p += 6;
          }
        }
        utf8(r, cp);
      } else { bad = true; return r; }
    }
    bad = true;
    return r;
  }

  Val number() {
    size_t b = p;
    bool flt = false;
    while (p < S.size()) {
      char c = S[p];
      if ((c >= '0' && c <= '9') || c == '+' || c == '-') { p++; continue; }
      if (c == '.' || c == 'e' || c == 'E') { flt = true; p++; continue; }
      break;
    }
    if (b == p) { bad = true; return Val::integer(0); }
    std::string t = S.substr(b, p - b);
    if (!flt) {
      long long v = strtoll(t.c_str(), 0, 10);
      return Val::integer(v);
    }
    double x = strtod(t.c_str(), 0);
    if (x == std::floor(x) && std::fabs(x) < 1e15) return Val::integer((long long)x);
    return Val::real(x);
  }

  Val object() {
    Val v = Val::object();
    p++;  // '{'
    skip();
    if (p < S.size() && S[p] == '}') { p++; return v; }  // 空对象保持对象
    while (true) {
      skip();
      if (p >= S.size()) { bad = true; return v; }
      std::string key = str();
      skip();
      if (p < S.size() && S[p] == ':') p++; else { bad = true; return v; }
      Val item = value();
      v.o.push_back(std::make_pair(key, item));
      skip();
      if (p < S.size() && S[p] == ',') { p++; continue; }
      if (p < S.size() && S[p] == '}') { p++; return v; }
      bad = true;
      return v;
    }
  }

  Val array() {
    Val v = Val::array();
    p++;  // '['
    skip();
    if (p < S.size() && S[p] == ']') { p++; return v; }
    while (true) {
      Val item = value();
      v.a.push_back(item);
      skip();
      if (p < S.size() && S[p] == ',') { p++; continue; }
      if (p < S.size() && S[p] == ']') { p++; return v; }
      bad = true;
      return v;
    }
  }

  Val value() {
    skip();
    if (p >= S.size()) { bad = true; return Val::nul(); }
    char c = S[p];
    if (c == '{') return object();
    if (c == '[') return array();
    if (c == '"') return Val::string(str());
    if (c == 't') { if (S.compare(p, 4, "true") == 0 && p + 4 <= S.size()) { p += 4; return Val::boolean(true); } bad = true; return Val::nul(); }
    if (c == 'f') { if (S.compare(p, 5, "false") == 0 && p + 5 <= S.size()) { p += 5; return Val::boolean(false); } bad = true; return Val::nul(); }
    if (c == 'n') { if (S.compare(p, 4, "null") == 0 && p + 4 <= S.size()) { p += 4; return Val::nul(); } bad = true; return Val::nul(); }
    return number();
  }
};

// ============================ 序列化 ============================
static void esc(const std::string& s, std::string& out) {
  out += '"';
  for (size_t j = 0; j < s.size(); j++) {
    unsigned char c = (unsigned char)s[j];
    if (c == '"') out += "\\\"";
    else if (c == '\\') out += "\\\\";
    else if (c == '\n') out += "\\n";
    else if (c == '\r') out += "\\r";
    else if (c == '\t') out += "\\t";
    else if (c == '\b') out += "\\b";
    else if (c == '\f') out += "\\f";
    else if (c < 0x20) { char buf[8]; snprintf(buf, sizeof buf, "\\u%04x", (unsigned)c); out += buf; }
    else out += (char)c;  // UTF-8 其余字节原样透出
  }
  out += '"';
}

static void dump(const Val& v, std::string& out) {
  if (v.k == Val::NUL) { out += "null"; return; }
  if (v.k == Val::BOOL) { out += v.b ? "true" : "false"; return; }
  if (v.k == Val::NUM) {
    if (v.isInt) { out += std::to_string(v.i); return; }
    double x = v.d;
    if (x == std::floor(x) && std::fabs(x) < 1e15) { out += std::to_string((long long)x); return; }
    char buf[40];
    snprintf(buf, sizeof buf, "%.17g", x);
    out += buf;
    return;
  }
  if (v.k == Val::STR) { esc(v.s, out); return; }
  if (v.k == Val::ARR) {
    out += '[';
    for (size_t j = 0; j < v.a.size(); j++) { if (j) out += ','; dump(v.a[j], out); }
    out += ']';
    return;
  }
  out += '{';
  for (size_t j = 0; j < v.o.size(); j++) {
    if (j) out += ',';
    esc(v.o[j].first, out);
    out += ':';
    dump(v.o[j].second, out);
  }
  out += '}';
}

// ============================ 小工具 ============================
static const long long BIG = 1LL << 40;

static long long clampv(long long v, long long lo) { return v < lo ? lo : v; }

static std::string txt(const Val& v) { return v.k == Val::STR ? v.s : std::string(); }

static long long intOf(const Val& v, long long dflt) {
  if (v.k != Val::NUM) return dflt;
  if (v.isInt) return v.i;
  return (long long)std::llround(v.d);  // 2.5 / -5.0 一律先落成整数
}

static long long field(const Val& o, const std::string& key, long long dflt) {
  const Val* f = o.find(key);
  return f ? intOf(*f, dflt) : dflt;
}

static std::string nameOf(const Val& o) {
  const Val* f = o.find("name");
  return f ? txt(*f) : std::string();
}

static bool hitContains(const Val& c, const std::string& needle) {
  return nameOf(c).find(needle) != std::string::npos;
}

struct Ctx {
  std::vector<Val> courses;
  std::vector<std::string> log;
  int n;
  Ctx() : n(0) {}
  void say(const std::string& m) { log.push_back(m); }
};

// ============================ 五个 op ============================
static void opAdd(Ctx& c, const Val& op) {
  const Val* src = op.find("course");
  Val course = (src && src->k == Val::OBJ) ? *src : Val::object();

  const Val* w = course.find("weeks");
  if (!w || w->k != Val::OBJ) {  // 缺 weeks（或不是对象）→ range 1..16
    Val nw = Val::object();
    nw.put("type", Val::string("range"));
    nw.put("from", Val::integer(1));
    nw.put("to", Val::integer(16));
    course.put("weeks", nw);
  }
  long long day = field(course, "day", 1);
  if (day < 1) day = 1;
  if (day > 7) day = 7;
  course.put("day", Val::integer(day));

  long long pf = clampv(field(course, "periodFrom", 1), 1);
  long long pt = clampv(field(course, "periodTo", pf), 1);
  if (pt < pf) pt = pf;
  course.put("periodFrom", Val::integer(pf));
  course.put("periodTo", Val::integer(pt));

  c.courses.push_back(course);
  c.n += 1;
  c.say("新增 1 门：" + nameOf(course));
}

static void opDel(Ctx& c, const Val& op) {
  const Val* m = op.find("match");
  if (!m) { c.say("缺字段，未执行：del"); return; }
  std::string needle = txt(*m);
  std::vector<size_t> hit;
  for (size_t j = 0; j < c.courses.size(); j++)
    if (hitContains(c.courses[j], needle)) hit.push_back(j);
  if (hit.empty()) { c.say("没找到：" + needle); return; }
  for (size_t j = hit.size(); j-- > 0;) c.courses.erase(c.courses.begin() + (long)hit[j]);
  c.n += (int)hit.size();
  c.say("删除 " + std::to_string(hit.size()) + " 门：" + needle);
}

static void opEdit(Ctx& c, const Val& op) {
  const Val* m = op.find("match");
  const Val* set = op.find("set");
  if (!m || !set || set->k != Val::OBJ) { c.say("缺字段，未执行：edit"); return; }
  std::string needle = txt(*m);
  std::vector<size_t> hit;
  for (size_t j = 0; j < c.courses.size(); j++)
    if (hitContains(c.courses[j], needle)) hit.push_back(j);
  if (hit.empty()) { c.say("没找到：" + needle); return; }

  std::string keys;
  for (size_t h = 0; h < hit.size(); h++) {
    Val& course = c.courses[hit[h]];
    for (size_t q = 0; q < set->o.size(); q++) {
      const std::string& key = set->o[q].first;
      const Val& val = set->o[q].second;
      if (key == "day") {
        long long dd = intOf(val, 1);
        if (dd < 1) dd = 1;
        if (dd > 7) dd = 7;
        course.put("day", Val::integer(dd));
      } else if (key == "periodFrom" || key == "periodTo") {
        course.put(key, Val::integer(clampv(intOf(val, 1), 1)));
      } else if (key == "name" || key == "teacher" || key == "location") {
        if (val.k == Val::STR) course.put(key, val);
      } else if (key == "weeks") {
        if (val.k == Val::OBJ) course.put(key, val);
      } else {
        course.put(key, val);
      }
      if (h == 0) { if (!keys.empty()) keys += "/"; keys += key; }
    }
    long long pf = clampv(field(course, "periodFrom", 1), 1);
    long long pt = clampv(field(course, "periodTo", pf), 1);
    if (pt < pf) pt = pf;  // 不倒挂
    course.put("periodFrom", Val::integer(pf));
    course.put("periodTo", Val::integer(pt));
  }
  c.n += (int)hit.size();
  c.say("修改 " + std::to_string(hit.size()) + " 门：" + needle + "（键：" + keys + "）");
}

static void opMove(Ctx& c, const Val& op) {
  const Val* mt = op.find("match");
  const Val* dy = op.find("day");
  const Val* pfv = op.find("periodFrom");
  const Val* ptv = op.find("periodTo");
  if (!mt || !dy || !pfv || !ptv || dy->k != Val::NUM || pfv->k != Val::NUM || ptv->k != Val::NUM) {
    c.say("缺字段，未执行：move（需 match/day/periodFrom/periodTo）");
    return;
  }
  std::string needle = txt(*mt);
  long long day = intOf(*dy, 1);
  if (day < 1) day = 1;
  if (day > 7) day = 7;
  long long pf = clampv(intOf(*pfv, 1), 1);
  long long pt = clampv(intOf(*ptv, pf), 1);
  if (pt < pf) pt = pf;

  std::vector<size_t> hit;
  for (size_t j = 0; j < c.courses.size(); j++)
    if (hitContains(c.courses[j], needle)) hit.push_back(j);
  if (hit.empty()) { c.say("没找到：" + needle); return; }
  for (size_t h = 0; h < hit.size(); h++) {
    Val& course = c.courses[hit[h]];
    course.put("day", Val::integer(day));
    course.put("periodFrom", Val::integer(pf));
    course.put("periodTo", Val::integer(pt));
  }
  c.n += (int)hit.size();
  c.say("移动 " + std::to_string(hit.size()) + " 门：" + needle + " → 周" + std::to_string(day) +
        " 第" + std::to_string(pf) + "–" + std::to_string(pt) + " 节");
}

static void opSwap(Ctx& c, const Val& op) {
  const Val* mt = op.find("match");
  const Val* wt = op.find("with");
  if (!mt || !wt) { c.say("缺字段，未执行：swap"); return; }
  std::string la = txt(*mt), lb = txt(*wt);
  std::vector<size_t> A, B;
  for (size_t j = 0; j < c.courses.size(); j++) {
    if (hitContains(c.courses[j], la)) A.push_back(j);
    if (hitContains(c.courses[j], lb)) B.push_back(j);
  }
  if (A.size() != 1 || B.size() != 1) {
    c.say("拒绝：swap 两侧须各命中恰好 1 门（" + la + "=" + std::to_string(A.size()) + "，" +
          lb + "=" + std::to_string(B.size()) + "）");
    return;
  }
  if (A[0] == B[0]) { c.say("拒绝：swap 两侧指向同一门课"); return; }
  Val& x = c.courses[A[0]];
  Val& y = c.courses[B[0]];
  long long xd = field(x, "day", 1), xf = field(x, "periodFrom", 1), xt = field(x, "periodTo", 1);
  long long yd = field(y, "day", 1), yf = field(y, "periodFrom", 1), yt = field(y, "periodTo", 1);
  x.put("day", Val::integer(yd));
  x.put("periodFrom", Val::integer(yf));
  x.put("periodTo", Val::integer(yt));
  y.put("day", Val::integer(xd));
  y.put("periodFrom", Val::integer(xf));
  y.put("periodTo", Val::integer(xt));
  c.n += 2;
  c.say("交换：" + nameOf(x) + " ↔ " + nameOf(y));
}

// ============================ 入口 ============================
static std::string readAll(const char* path) {
  std::string r;
  FILE* f = fopen(path, "rb");
  if (!f) return r;
  char buf[65536];
  size_t got;
  while ((got = fread(buf, 1, sizeof buf, f)) > 0) r.append(buf, got);
  fclose(f);
  return r;
}

int main(int argc, char** argv) {
  if (argc < 2) return 1;
  std::string src = readAll(argv[1]);
  Parser P(src);
  Val root = P.value();

  Ctx c;
  const Val* cs = root.find("courses");
  if (cs && cs->k == Val::ARR) c.courses = cs->a;
  std::vector<Val> ops;
  const Val* opv = root.find("ops");
  if (opv && opv->k == Val::ARR) ops = opv->a;

  std::vector<Val> original = c.courses;
  bool rejected = false;
  for (size_t j = 0; j < ops.size(); j++) {
    const Val& op = ops[j];
    const Val* nm = op.find("op");
    std::string name = nm ? txt(*nm) : std::string();
    if (name == "add") opAdd(c, op);
    else if (name == "del") opDel(c, op);
    else if (name == "edit") opEdit(c, op);
    else if (name == "move") opMove(c, op);
    else if (name == "swap") opSwap(c, op);
    else {  // 未知 op → 整批拒绝，课表原样
      rejected = true;
      c.log.clear();
      c.say("拒绝：未知 op " + name);
      c.courses = original;
      c.n = 0;
      break;
    }
  }

  std::string opsText;
  if (!rejected && !ops.empty()) {
    Val wrap = Val::array();
    wrap.a = ops;
    dump(wrap, opsText);
  }

  std::string out;
  out += "{\"opsText\":";
  esc(opsText, out);
  out += ",\"courses\":";
  Val outCourses = Val::array();
  outCourses.a = c.courses;
  dump(outCourses, out);
  out += ",\"log\":[";
  for (size_t j = 0; j < c.log.size(); j++) {
    if (j) out += ',';
    esc(std::to_string(j + 1) + ") " + c.log[j], out);
  }
  out += "],\"n\":";
  out += std::to_string(c.n);
  out += "}\n";

  fwrite(out.data(), 1, out.size(), stdout);
  return 0;
}

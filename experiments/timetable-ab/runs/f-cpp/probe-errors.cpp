// probe-errors.cpp —— 探针：一次性写进 10 处互相独立的错，看 g++ 一轮报几条、是否停
#include <string>
#include <vector>

int f(int a, int b) { return a + b; }

struct S {
  int x
  std::string y;          // 错 1：上一行缺分号
};

int g() {
  return undefined_var;    // 错 2：未声明标识符
}

int h() {
  int n = "abc";           // 错 3：const char* 初始化 int
  return n;
}

int k() {
  return f(1);             // 错 4：实参个数不足
}

void v() {}

int m() {
  int z = v();             // 错 5：void 值赋给 int
  return z + f(1, 2, 3);   // 错 6：实参过多
}

int n2() {
  return nosuch_function(42);   // 错 7：未声明的函数
}

std::vector<int> vec() {
  std::vector<int> x;
  x.push_back("str");      // 错 8：类型不匹配
  return x;
}

struct T {
  int a;
  int a;                   // 错 9：成员重定义
};

int o(int p) {
  S s;
  s.nope = 1;              // 错 10：成员不存在
  return p;
}

int main() { return 0; }

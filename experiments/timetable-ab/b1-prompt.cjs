// b1-prompt.cjs —— 由唯一一份存档提示词，按**四条规则**重建四臂提示词
// 用法: node b1-prompt.cjs --arm v4-js-inline --out runs/prompts/v4-js-inline.txt
//       node b1-prompt.cjs --selftest        （自证：重建的 cl-macro 必须与存档逐字节相同）
//
// 为什么需要它：v3 十二格里只有 runs/v3-cl-macro-r1/prompt.txt 一份存档（探索层存档率 1%，
// 见 CONDITIONS.md）。另外三臂的原始提示词不可核，所以只能重建；重建规则必须能被检查。
//
// 重建只改这四处（其余逐字节不动）：
//   ① 【语言】行        ② 【实现风格】行
//   ③ argv 机制行      ④ 【输出格式】里的代码块语言与文件名
// 保留不动：纯 ASCII 约束（依据：12/12 产物确实全 ASCII，见 reports/B1-加n预注册-20261101.md §3.2）
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const HERE = __dirname;
const TEMPLATE = path.join(HERE, 'runs', 'v3-cl-macro-r1', 'prompt.txt');

const LANGS = {
  cl: 'Common Lisp（SBCL 2.6.4）',
  js: 'JavaScript（Node.js v24）'
};
const SCHEMES = {
  macro: 'macro：用宏把每个 op 的定义收敛到一处，校验/文案/日志/分发由宏生成',
  inline: 'inline：每个 op 手写独立分支，不共用任何生成机制',
  table: 'table：一张注册表描述所有 op，执行器读表分发'
};
const ARGV_LINE = {
  cl: '- argv 用 sb-ext:*posix-argv*；不要依赖 member "--script" 定位（该元素可能被处理掉）。',
  js: '- argv 用 process.argv（process.argv[2] 起为命令）。'
};
const ASCII_LINE = {
  cl: '- 文件必须纯 ASCII：不许中文注释、不许任何非 ASCII 字符（SBCL 读入非 ASCII 会报错）。',
  js: '- 文件必须纯 ASCII：不许中文注释、不许任何非 ASCII 字符。'
};
// 代码块语言标签与文件名：CL 是 "lisp" / impl.lisp，不是 "cl" / impl.cl
const FENCE = { cl: { tag: 'lisp', file: 'impl.lisp' }, js: { tag: 'js', file: 'impl.js' } };

function build(lang, scheme) {
  let t = fs.readFileSync(TEMPLATE, 'utf8');
  const before = t;

  // ① 语言行
  const langRe = /^【语言】.*$/m;
  if (!langRe.test(t)) throw new Error('模板里找不到【语言】行');
  t = t.replace(langRe, '【语言】' + LANGS[lang]);

  // ② 风格行
  const styleRe = /^【实现风格】.*$/m;
  if (!styleRe.test(t)) throw new Error('模板里找不到【实现风格】行');
  t = t.replace(styleRe, '【实现风格】' + SCHEMES[scheme]);

  // ③ argv 机制行 + ASCII 行的语言相关括号
  const clArgv = ARGV_LINE.cl, clAscii = ASCII_LINE.cl;
  if (!t.includes(clArgv)) throw new Error('模板里找不到 CL 的 argv 行（模板可能已变）');
  if (lang === 'js') {
    t = t.replace(clArgv, ARGV_LINE.js);
    if (!t.includes(clAscii)) throw new Error('模板里找不到 ASCII 行');
    t = t.replace(clAscii, ASCII_LINE.js);
  }

  // ④ 输出格式：代码块语言 + 文件名
  const outRe = /只输出一个 lisp 代码块（三个反引号 \+ lisp），内容即 impl\.lisp 的完整文件。/;
  if (!outRe.test(t)) throw new Error('模板里找不到输出格式行');
  const F = FENCE[lang];
  t = t.replace(outRe, '只输出一个 ' + F.tag + ' 代码块（三个反引号 + ' + F.tag + '），内容即 ' + F.file + ' 的完整文件。');

  if (lang === 'cl' && scheme === 'macro') {
    if (t !== before) throw new Error('自证失败：重建的 cl-macro 与存档不一致');
  }
  return t;
}

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

if (argv.includes('--selftest')) {
  const t = build('cl', 'macro');
  const orig = fs.readFileSync(TEMPLATE, 'utf8');
  const same = t === orig;
  console.log('cl-macro 重建 = 存档 ? ' + same);
  console.log('存档 sha256      = ' + crypto.createHash('sha256').update(orig).digest('hex'));
  console.log('重建 sha256      = ' + crypto.createHash('sha256').update(t).digest('hex'));
  process.exitCode = same ? 0 : 1;
} else {
  const arm = arg('--arm'); // 形如 v4-cl-macro
  const out = arg('--out');
  if (!arm || !out) { console.log('usage: node b1-prompt.cjs --arm v4-cl-macro --out <file> | --selftest'); process.exit(2); }
  const m = arm.match(/^v4-(cl|js)-(macro|inline|table)$/);
  if (!m) { console.log('臂名必须是 v4-{cl|js}-{macro|inline|table}'); process.exit(2); }
  const text = build(m[1], m[2]);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text, 'utf8');
  console.log('写入 ' + out + '  (' + text.length + ' 字符, sha256=' +
    crypto.createHash('sha256').update(text).digest('hex').slice(0, 12) + ', 语言=' + m[1] + ' 风格=' + m[2] + ')');
}

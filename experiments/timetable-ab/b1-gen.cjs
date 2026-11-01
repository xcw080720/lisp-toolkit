// b1-gen.cjs —— 加 n 生成器（v3 十二格：n 从 3 提到 9）
// 用法:
//   node b1-gen.cjs --arm v3-js-inline --from 4 --to 9 [--model deepseek-flash] [--dry]
//
// 设计要点（与 reports/B1-加n预注册-20261101.md 对齐）：
//   · 提示词**逐字节**取 runs/v3-<arm>-r1/prompt.txt，不重写、不追加
//   · 每次调用是 stateless 的单条 user 消息：无历史、无工具、无文件读取
//   · 只写 runs/v3-<arm>-r<N>/ 下三个文件（prompt.txt / impl.* / log.txt），不碰 r1–r3
//   · 记录 model、参数、usage、finish_reason、时间戳，供事后核查端点是否漂
'use strict';
const fs = require('fs'), path = require('path'), https = require('https'), crypto = require('crypto');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ARM = arg('--arm');
const FROM = +arg('--from', '4');
const TO = +arg('--to', '9');
const MODEL = arg('--model', 'deepseek-flash');
const DRY = argv.includes('--dry');
const MAXTOK = +arg('--max-tokens', '32768');
if (!ARM) { console.log('usage: node b1-gen.cjs --arm v3-js-inline --from 4 --to 9 [--model M] [--dry]'); process.exit(2); }

const HERE = __dirname, RUNS = path.join(HERE, 'runs');
const ext = ARM.includes('cl') ? '.lisp' : '.js';
const TM = arg('--prompt-file', path.join(RUNS, ARM + '-r1', 'prompt.txt'));
if (!fs.existsSync(TM)) { console.error('找不到提示词文件: ' + TM); process.exit(2); }
const PROMPT = fs.readFileSync(TM, 'utf8');

// ---- 读 key（不打印、不落盘、不写进 log）----
function readKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  const p = path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh', '.credentials.yaml');
  const raw = fs.readFileSync(p, 'utf8');
  const m = raw.match(/DEEPSEEK_API_KEY:\s*(\S+)/);
  if (!m) throw new Error('凭据里没有 DEEPSEEK_API_KEY');
  return m[1].trim();
}

// ---- 提取代码块 ----
function extractCode(text) {
  const fence = /```[ \t]*([a-zA-Z0-9+#-]*)[ \t]*\r?\n([\s\S]*?)```/g;
  let best = null, m;
  while ((m = fence.exec(text)) !== null) {
    const body = m[2];
    if (!best || body.length > best.length) best = body;
  }
  if (best) return { code: best.replace(/\r\n/g, '\n'), fenced: true };
  return { code: null, fenced: false };
}

let KEY = null; // 在 IIFE 里赋值；callOnce 在模块作用域读它

function callOnce(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: PROMPT }],
      max_tokens: MAXTOK,
      stream: false
    });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST', timeout: 600000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Authorization: 'Bearer ' + KEY }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ': ' + buf.slice(0, 400)));
        try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('响应非 JSON: ' + buf.slice(0, 200))); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

(async () => {
  const pr = fs.existsSync(path.join(HERE, 'b1-prereg.sha256'))
    ? fs.readFileSync(path.join(HERE, 'b1-prereg.sha256'), 'utf8').trim() : '(未锁定)';
  console.log('臂 = ' + ARM + '  模型 = ' + MODEL + '  n = ' + FROM + '..' + TO);
  console.log('提示词 = ' + path.relative(HERE, TM) + '  (' + PROMPT.length + ' 字符, sha256=' +
    crypto.createHash('sha256').update(PROMPT).digest('hex').slice(0, 12) + ')');
  console.log('预注册 = ' + pr);
  if (DRY) { console.log('[dry] 不调用 API。'); return; }

  const KEY_ = readKey(); KEY = KEY_;
  let totIn = 0, totOut = 0, ok = 0, failed = 0;
  for (let n = FROM; n <= TO; n++) {
    const dir = path.join(RUNS, ARM + '-r' + n);
    if (fs.existsSync(path.join(dir, 'impl' + ext))) { console.log('[skip] r' + n + ' 已有实现，不覆盖'); continue; }
    fs.mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    let r, err = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { r = await callOnce(); err = null; break; }
      catch (e) { err = e; console.log('  r' + n + ' 第 ' + attempt + ' 次失败: ' + e.message); }
    }
    if (err) { failed++; fs.writeFileSync(path.join(dir, 'log.txt'), 'FAILED after 3 attempts: ' + err.message + '\n', 'utf8'); continue; }
    const _m = r.choices[0].message || {}; const msg = _m.content || ''; const reasoning = _m.reasoning_content || '';
    const fin = r.choices[0].finish_reason;
    const u = r.usage || {};
    totIn += u.prompt_tokens || 0; totOut += u.completion_tokens || 0;
    const ex = extractCode(msg);
    fs.writeFileSync(path.join(dir, 'prompt.txt'), PROMPT, 'utf8');
    if (ex.fenced) fs.writeFileSync(path.join(dir, 'impl' + ext), ex.code, 'utf8');
    else fs.writeFileSync(path.join(dir, 'raw-response.txt'), msg, 'utf8');
    fs.writeFileSync(path.join(dir, 'log.txt'), [
      'arm=' + ARM + ' r' + n + ' model=' + MODEL + ' max_tokens=' + MAXTOK,
      'started=' + new Date(t0).toISOString() + ' elapsed_ms=' + (Date.now() - t0),
      'finish_reason=' + fin + ' fenced=' + ex.fenced + ' chars=' + (ex.fenced ? ex.code.length : 0),
      'usage_prompt=' + (u.prompt_tokens || 0) + ' usage_completion=' + (u.completion_tokens || 0) +
        ' cached=' + (u.prompt_cache_hit_tokens || 0),
      'response_id=' + (r.id || ''),
      'full_response_chars=' + msg.length,
      'reasoning_chars=' + reasoning.length
    ].join('\n') + '\n', 'utf8');
    if (ex.fenced) ok++; else failed++;
    console.log('  r' + n + ': ' + (ex.fenced ? 'ok ' + ex.code.length + ' 字符' : 'NO FENCE') +
      '  finish=' + fin + '  out_tok=' + (u.completion_tokens || 0) + '  ' + (Date.now() - t0) + 'ms');
  }
  console.log('');
  console.log('完成 ' + ok + '，失败/无代码块 ' + failed + '；合计输入 ' + totIn + ' tokens、输出 ' + totOut + ' tokens');
})();


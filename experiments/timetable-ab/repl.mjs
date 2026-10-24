// repl.mjs — 给 SBCL 一个"活体"通道：持续送 form，读回打印值。
// 这是 G2（REPL）条件的唯一技术前提；跑不通就不做 G2，不假装跑过。
// 用法：
//   node repl.mjs --selftest            # 自测：求值、定义、报错后恢复、退出
//   node repl.mjs --script forms.txt    # 逐行送 form，打印每条的返回值
import { spawn } from 'node:child_process';

const PROMPTS = [
  /^(?:\*|[A-Za-z0-9._-]+>|\d+\]) $/   // 逐行匹配：* / CL-USER> / 0]
];

export class ReplSession {
  constructor(opts = {}) {
    this.sbcl = opts.sbcl || process.env.SBCL || 'sbcl';
    this.timeout = opts.timeout || 15000;
    this.buf = '';
    this.waiters = [];
    this.proc = spawn(this.sbcl, ['--noinform', '--no-userinit', '--no-sysinit'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stderr.setEncoding('utf8');
    this.proc.stdout.on('data', (d) => this._feed(d));
    this.proc.stderr.on('data', (d) => this._feed(d));
    this.proc.on('exit', (code) => this._fail(new Error('sbcl exited ' + code)));
  }

  _feed(d) {
    this.buf += d;
    this._drain();
  }

  _drain() {
    if (!this.waiters.length) return;
    const idx = this.buf.lastIndexOf('\n');
    const last = this.buf.slice(idx + 1);
    if (PROMPTS.some((re) => re.test(last))) {
      const out = idx >= 0 ? this.buf.slice(0, idx + 1) : '';
      this.buf = '';                            // 吃掉提示符，下次靠新提示符触发
      const w = this.waiters.shift();
      clearTimeout(w.timer);
      w.resolve(out);
      return this._drain();
    }
  }

  _fail(err) {
    while (this.waiters.length) this.waiters.shift().reject(err);
  }

  wait(ms = this.timeout) {
    return new Promise((resolve, reject) => {
      const w = { resolve, reject, timer: setTimeout(() => reject(new Error('timeout')), ms) };
      this.waiters.push(w);
      this._drain();
    });
  }

  async send(form, ms) {
    this.proc.stdin.write(form + '\n');
    const out = await this.wait(ms);
    return out.replace(/\r/g, '');
  }

  async abort() {
    // 从 debugger 回 toplevel
    this.proc.stdin.write(':abort\n');
    return this.wait();
  }

  async quit() {
    try {
      this.proc.stdin.write('(sb-ext:exit :code 0 :abort nil)\n');
    } catch { /* 已退出 */ }
    await new Promise((r) => setTimeout(r, 300));
    if (!this.proc.killed) this.proc.kill();
  }
}

async function selftest() {
  const s = new ReplSession();
  let pass = 0, fail = 0;
  const check = (label, want, got) => {
    const ok = String(got).trim().endsWith(String(want));
    console.log((ok ? '[ok  ] ' : '[FAIL] ') + label + '  -> ' + JSON.stringify(String(got).trim().slice(-40)));
    ok ? pass++ : fail++;
  };

  await s.wait();                                    // 启动提示符
  check('(+ 1 2)', '3', await s.send('(+ 1 2)'));
  check('(defun f (x) (* x 2))', 'F', await s.send('(defun f (x) (* x 2))'));
  check('(f 21)', '42', await s.send('(f 21)'));

  // 故意报错，验证"不重启也能继续"
  const err = await s.send('(error "boom")');
  check('报错被 REPL 捕获（不退出）', true, /SIMPLE-ERROR/.test(err) && /boom/.test(err));
  await s.abort();
  check('abort 之后还能算', '5', await s.send('(+ 2 3)'));

  // 宏展开：这是 G2 相对 --script 的核心能力
  const exp = (await s.send("(macroexpand-1 '(when t 1 2))")).replace(/\s+/g, ' ').trim();
  check('macroexpand-1 可用', true, exp.includes('(IF T (PROGN 1 2))'));

  // 看符号文档
  const doc = await s.send("(describe 'car)");
  check('describe 可用', 'CAR', doc.split('\n')[0] || doc);

  await s.quit();
  console.log('-- ' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
}

async function runScript(file) {
  const { readFileSync } = await import('node:fs');
  const s = new ReplSession();
  await s.wait();
  const forms = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith(';;'));
  for (const f of forms) {
    const out = await s.send(f);
    console.log('> ' + f + '\n' + out.trim() + '\n');
  }
  await s.quit();
}

const arg = process.argv[2];
if (arg === '--selftest') selftest().catch((e) => { console.error('selftest failed: ' + e.message); process.exit(1); });
else if (arg === '--script' && process.argv[3]) runScript(process.argv[3]).catch((e) => { console.error(String(e)); process.exit(1); });
else console.log('usage: node repl.mjs --selftest | --script FILE');

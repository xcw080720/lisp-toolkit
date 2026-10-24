// live.mjs — 常驻 SBCL 会话守护：轮询 inbox.txt 里的 form，把打印值写进 outbox.txt
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const dir = process.argv[2] || '.';
const inbox = dir + '/inbox.txt';
const outbox = dir + '/outbox.txt';
fs.writeFileSync(inbox, '');
fs.writeFileSync(outbox, '');

const sbcl = process.env.SBCL;
const proc = spawn(sbcl, ['--noinform', '--no-userinit', '--no-sysinit'], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
const waiters = [];
const PROMPT = /^(?:\*|[A-Za-z0-9._-]+>|\d+\]) $/;

function feed(d) { buf += d; drain(); }
function drain() {
  if (!waiters.length) return;
  const idx = buf.lastIndexOf('\n');
  const last = buf.slice(idx + 1);
  if (PROMPT.test(last)) {
    const out = idx >= 0 ? buf.slice(0, idx + 1) : '';
    buf = '';
    const w = waiters.shift();
    w(out);
    return drain();
  }
}
proc.stdout.setEncoding('utf8');
proc.stderr.setEncoding('utf8');
proc.stdout.on('data', feed);
proc.stderr.on('data', feed);

function wait(ms) {
  return new Promise((res) => {
    const w = res;
    waiters.push(w);
    setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); res('<<timeout>>\n'); } }, ms);
  });
}
async function send(form, ms = 12000) { proc.stdin.write(form + '\n'); return await wait(ms); }

let seen = 0;
async function loop() {
  await wait(6000);                 // 启动提示符
  fs.appendFileSync(outbox, '<<READY>>\n');
  while (true) {
    const lines = fs.existsSync(inbox) ? fs.readFileSync(inbox, 'utf8').split('\n').filter(Boolean) : [];
    while (seen < lines.length) {
      const line = lines[seen++];
      const tab = line.indexOf('\t');
      const seq = line.slice(0, tab);
      const form = line.slice(tab + 1).replace(/\\n/g, '\n');
      let out;
      try { out = await send(form); } catch (e) { out = '<<daemon-err ' + e.message + '>>\n'; }
      fs.appendFileSync(outbox, '<<' + seq + '>>\n' + out.replace(/\r/g, '') + '<<end ' + seq + '>>\n');
    }
    await new Promise((r) => setTimeout(r, 120));
  }
}
loop();

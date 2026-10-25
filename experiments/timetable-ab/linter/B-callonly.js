'use strict';
// 课表 ops 执行器 —— 表驱动
// 一条 op 声明 = 参数夹紧(kind) + 必填校验(need) + 执行分支(run) + 日志文案(say) + 可用名单(REG 的键)
// 加一个 op 只写一条对象字面量，其余四处由这张表长出来。
const fs = require('fs');

/* ---------- 1. 字段夹紧：一处定义，全 op 共用 ---------- */
const COERCE = {
  day: (v) => Math.min(7, Math.max(1, Math.trunc(Number(v)) || 1)),
  period: (v) => Math.max(1, Math.trunc(Number(v)) || 1),
  int: (v) => Math.trunc(Number(v)) || 0,
  str: (v) => (v == null ? '' : String(v)),
  course: (v) => normalizeCourse(v || {}),
  weeks: (v) => (v && v.type ? v : defaultWeeks()),
  tag: (v) => (v == null || v === '' ? null : String(v)),
};

const defaultWeeks = () => ({ type: 'range', from: 1, to: 16 });

function normalizeCourse(c) {
  const from = COERCE.period(c.periodFrom);
  return {
    name: COERCE.str(c.name),
    teacher: COERCE.str(c.teacher),
    location: COERCE.str(c.location),
    day: COERCE.day(c.day),
    periodFrom: from,
    periodTo: Math.max(from, COERCE.period(c.periodTo)),
    weeks: COERCE.weeks(c.weeks),
    tag: COERCE.tag(c.tag),
  };
}

/* ---------- 2. 通用小工具 ---------- */
const hit = (list, m) => list.filter((c) => c.name.includes(COERCE.str(m)));
const timeOf = (c) => ({ day: c.day, periodFrom: c.periodFrom, periodTo: c.periodTo });
const setTime = (c, t) => {
  c.day = t.day;
  c.periodFrom = t.periodFrom;
  c.periodTo = t.periodTo;
};
function spliceIn(list, keep) {
  const n = list.length - keep.length;
  list.length = 0;
  list.push(...keep);
  return n;
}

/* ---------- 3. 注册表：唯一的声明处 ---------- */
// need: 缺任一字段 → 该 op 不执行（日志一条，n 不变）
// fields: 声明式提取 + 夹紧，run/say 拿到的是夹紧后的值
const REG = {
  add: {
    need: ['course'],
    fields: { course: 'course' },
    run(state, op, p) {
      state.push(p.course);
      return 1;
    },
    say(n, op, p) {
      return `新增《${p.course.name}》到周${p.course.day}`;
    },
  },

  del: {
    need: ['match'],
    run(state, op) {
      return spliceInn(state, state.filter((c) => !c.name.includes(COERCE.str(op.match))));
    },
    say(n, op) {
      return n ? `删除 ${n} 门（名字含「${op.match}」）` : '没找到匹配的课，未删除';
    },
  },

  edit: {
    need: ['match', 'set'],
    run(state, op) {
      const targets = hit(state, op.match);
      const patch = normalizePatch(op.set);
      for (const c of targets) {
        Object.assign(c, patch);
        if (c.periodTo < c.periodFrom) c.periodTo = c.periodFrom;
      }
      return targets.length;
    },
    say(n, op) {
      return n ? `修改 ${n} 门（键：${Object.keys(op.set || {}).join('/')}）` : '没找到匹配的课，未修改';
    },
  },

  move: {
    need: ['match', 'day', 'periodFrom', 'periodTo'],
    fields: { day: 'day', periodFrom: 'period', periodTo: 'period' },
    run(state, op, p) {
      const targets = hit(state, op.match);
      for (const c of targets) {
        c.day = p.day;
        c.periodFrom = p.periodFrom;
        c.periodTo = Math.max(p.periodFrom, p.periodTo);
      }
      return targets.length;
    },
    say(n, op, p) {
      return n ? `移动 ${n} 门到周${p.day} 第${p.periodFrom}-${p.periodTo}节` : '没找到匹配的课，未移动';
    },
  },

  swap: {
    need: ['match', 'with'],
    run(state, op) {
      const a = hit(state, op.match);
      const b = hit(state, op.with);
      if (a.length !== 1 || b.length !== 1) return 0;
      const ta = timeOf(a[0]);
      setTime(a[0], timeOf(b[0]));
      setTime(b[0], ta);
      return 2;
    },
    say(n, op) {
      return n ? `互换《${op.match}》与《${op.with}》的时间` : '两侧未各命中 1 门，未互换';
    },
  },

  rename: {
    need: ['match', 'to'],
    run(state, op) {
      const targets = hit(state, op.match);
      for (const c of targets) c.name = COERCE.str(op.to);
      return targets.length;
    },
    say(n, op) {
      return n ? `${n} 门改名为《${op.to}》` : '没找到匹配的课，未改名';
    },
  },

  duplicate: {
    need: ['match', 'day'],
    fields: { day: 'day' },
    run(state, op, p) {
      const copies = hit(state, op.match).map((c) => ({ ...c, day: p.day }));
      state.push(...copies);
      return copies.length;
    },
    say(n, op, p) {
      return n ? `复制 ${n} 门到周${p.day}` : '没找到匹配的课，未复制';
    },
  },

  trim: {
    need: ['match', 'from', 'to'],
    fields: { from: 'period', to: 'period' },
    run(state, op, p) {
      let n = 0;
      for (const c of hit(state, op.match)) {
        const nf = Math.max(c.periodFrom, Math.min(p.from, p.to));
        const nt = Math.min(c.periodTo, Math.max(p.from, p.to));
        if (nf > nt) continue;
        c.periodFrom = nf;
        c.periodTo = nt;
        n++;
      }
      return n;
    },
    say(n, op, p) {
      return n ? `${n} 门收窄到第${p.from}-${p.to}节` : '没找到可收窄的课';
    },
  },

  clear: {
    need: ['day'],
    fields: { day: 'day' },
    run(state, op, p) {
      return spliceInn(state, state.filter((c) => c.day !== p.day));
    },
    say(n, op, p) {
      return n ? `清空周${p.day} 的 ${n} 门课` : `周${p.day} 没有课`;
    },
  },

  shift: {
    need: ['match', 'delta'],
    fields: { delta: 'int' },
    run(state, op, p) {
      const targets = hit(state, op.match);
      for (const c of targets) {
        const span = c.periodTo - c.periodFrom;
        c.periodFrom = Math.max(1, c.periodFrom + p.delta);
        c.periodTo = c.periodFrom + span;
      }
      return targets.length;
    },
    say(n, op, p) {
      return n ? `${n} 门节次平移 ${p.delta >= 0 ? '+' : ''}${p.delta}` : '没找到匹配的课，未平移';
    },
  },

  tag: {
    need: ['match', 'tag'],
    fields: { tag: 'tag' },
    run(state, op, p) {
      const targets = hit(state, op.match);
      for (const c of targets) c.tag = p.tag;
      return targets.length;
    },
    say(n, op, p) {
      return n ? `${n} 门打上标签「${p.tag}」` : '没找到匹配的课，未打标签';
    },
  },

  untag: {
    need: ['tag'],
    fields: { tag: 'tag' },
    run(state, op, p) {
      const targets = state.filter((c) => c.tag === p.tag);
      for (const c of targets) c.tag = null;
      return targets.length;
    },
    say(n, op, p) {
      return n ? `移除标签「${p.tag}」：${n} 门` : `没有标签「${p.tag}」的课`;
    },
  },

  sort: {
    run(state) {
      state.sort((x, y) => x.day - y.day || x.periodFrom - y.periodFrom);
      return 0;
    },
    say() {
      return '已按周次、节次升序排序';
    },
  },

  swapDay: {
    need: ['a', 'b'],
    fields: { a: 'day', b: 'day' },
    run(state, op, p) {
      let n = 0;
      for (const c of state) {
        if (c.day === p.a) { c.day = p.b; n++; }
        else if (c.day === p.b) { c.day = p.a; n++; }
      }
      return n;
    },
    say(n, op, p) {
      return n ? `周${p.a} 与周${p.b} 对调，涉及 ${n} 门` : `周${p.a}/${p.b} 没有课，未对调`;
    },
  },

  stats: {
    run(state, op, p) {
      const slots = new Set();
      for (const c of state) for (let k = c.periodFrom; k <= c.periodTo; k++) slots.add(c.day + '-' + k);
      p._text = `共 ${state.length} 门课，${slots.size} 个时段被占`;
      return 0;
    },
    say(n, op, p) {
      return p._text;
    },
  },
};

function normalizePatch(set) {
  const out = {};
  for (const [k, v] of Object.entries(set || {})) {
    if (k in COERCE) out[k] = COERCE[k](v);
    else if (k === 'periodFrom' || k === 'periodTo') out[k] = COERCE.period(v);
    else if (k === 'name' || k === 'teacher' || k === 'location') out[k] = COERCE.str(v);
  }
  return out;
}

/* ---------- 4. 执行器：校验 / 分支 / 日志 / 计数全部读表 ---------- */
function runOp(state, op, index) {
  const d = REG[op.op];
  const p = {};
  for (const [k, kind] of Object.entries(d.fields || {})) p[k] = COERCE[kind](op[k]);
  const miss = (d.need || []).filter((k) => op[k] === undefined || op[k] === null);
  if (miss.length) return { n: 0, text: `缺少字段 ${miss.join('/')}，未执行` };
  const n = d.run(state, op, p) || 0;
  return { n, text: d.say(n, op, p) };
}

/* ---------- 5. 入口：契约 ---------- */
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const origCourses = Array.isArray(input.courses) ? input.courses : [];
const ops = Array.isArray(input.ops) ? input.ops : [];

const bad = ops.find((o) => !o || typeof o.op !== 'string' || !Object.prototype.hasOwnProperty.call(REG, o.op));

let out;
if (bad) {
  // 未知 op → 整批拒绝，课表原样
  out = { opsText: '', courses: origCourses, log: [`1) 拒绝：未知 op ${bad && bad.op}`], n: 0 };
} else if (ops.length === 0) {
  out = { opsText: '', courses: origCourses, log: [], n: 0 };
} else {
  const state = JSON.parse(JSON.stringify(origCourses));
  const log = [];
  let n = 0;
  for (const op of ops) {
    const r = runOp(state, op, log.length + 1);
    n += r.n;
    log.push(`${log.length + 1}) ${r.text}`);
  }
  // 可用 op 名单也是这张表
  out = { opsText: JSON.stringify(ops), courses: state, log, n, available: Object.keys(REG) };
}

process.stdout.write(JSON.stringify(out));

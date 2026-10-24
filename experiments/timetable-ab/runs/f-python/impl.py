import sys
import json
import copy

# 5 个 op：add / del / edit / move / swap
OPS = ("add", "del", "edit", "move", "swap")

DEFAULT_WEEKS = {"type": "range", "from": 1, "to": 16}


def clamp(v, lo, hi):
    """数值夹紧：先取整，再夹到 [lo, hi]"""
    if isinstance(v, bool):
        v = 1 if v else 0
    if isinstance(v, str):
        try:
            v = float(v.strip())
        except ValueError:
            return lo
    if not isinstance(v, (int, float)):
        return lo
    if v != v or v in (float("inf"), float("-inf")):
        return lo
    n = int(v)
    return lo if n < lo else hi if n > hi else n


def _text(v):
    return v if isinstance(v, str) else ("" if v is None else str(v))


def norm_weeks(w):
    """weeks 归一：缺省/空对象回落默认 range 1..16"""
    if isinstance(w, dict):
        t = w.get("type")
        if t == "range":
            a = clamp(w.get("from"), 1, 60)
            b = clamp(w.get("to"), 1, 60)
            if a > b:
                b = a
            return {"type": "range", "from": a, "to": b}
        if t == "list":
            raw = w.get("list")
            items = [clamp(x, 1, 60) for x in raw] if isinstance(raw, list) else []
            return {"type": "list", "list": items}
        if t in ("all", "odd", "even"):
            return {"type": t}
    return copy.deepcopy(DEFAULT_WEEKS)


def norm_course(c):
    """一门课归一：字段补全、day 夹 1..7、节次夹紧并防倒挂"""
    if not isinstance(c, dict):
        c = {}
    pf = clamp(c.get("periodFrom"), 1, 60)
    pt = clamp(c.get("periodTo"), 1, 60)
    if pf > pt:
        pt = pf
    tag = c.get("tag")
    return {
        "name": _text(c.get("name")),
        "teacher": _text(c.get("teacher")),
        "location": _text(c.get("location")),
        "day": clamp(c.get("day"), 1, 7),
        "periodFrom": pf,
        "periodTo": pt,
        "weeks": norm_weeks(c.get("weeks")),
        "tag": None if tag is None else _text(tag),
    }


def matches(courses, needle):
    """名字包含 needle 的课"""
    if not isinstance(needle, str):
        return []
    return [c for c in courses if needle in c["name"]]


def set_span(c, op):
    """设置 day / periodFrom / periodTo 三件套，各自夹紧且防倒挂"""
    a = clamp(op.get("periodFrom"), 1, 60)
    b = clamp(op.get("periodTo"), 1, 60)
    c["day"] = clamp(op.get("day"), 1, 7)
    c["periodFrom"] = min(a, b)
    c["periodTo"] = max(a, b)


def apply_edit(c, patch):
    """只改 patch 里出现的键；数值键夹紧，文本键覆盖"""
    if not isinstance(patch, dict):
        return
    for k in ("name", "teacher", "location"):
        if k in patch:
            c[k] = _text(patch[k])
    if "day" in patch:
        c["day"] = clamp(patch["day"], 1, 7)
    if "periodFrom" in patch:
        c["periodFrom"] = clamp(patch["periodFrom"], 1, 60)
    if "periodTo" in patch:
        c["periodTo"] = clamp(patch["periodTo"], 1, 60)
    if "weeks" in patch:
        c["weeks"] = norm_weeks(patch["weeks"])
    if "tag" in patch:
        c["tag"] = None if patch["tag"] is None else _text(patch["tag"])
    if c["periodFrom"] > c["periodTo"]:
        c["periodTo"] = c["periodFrom"]


def ops_text(ops):
    """opsText：带序号的操作文本；空 ops / 整批拒绝时为 "" """
    rows = []
    for i, o in enumerate(ops, 1):
        if not isinstance(o, dict):
            rows.append("%d) %s" % (i, o))
            continue
        rest = dict((k, v) for k, v in o.items() if k != "op")
        rows.append("%d) %s %s" % (i, o.get("op"),
                                   json.dumps(rest, ensure_ascii=False, separators=(",", ":"))))
    return "\n".join(rows)


def execute(state):
    raw_courses = state.get("courses")
    if not isinstance(raw_courses, list):
        raw_courses = []
    raw_ops = state.get("ops")
    if not isinstance(raw_ops, list):
        raw_ops = []

    # 空 ops：无日志、n=0、原样返回
    if not raw_ops:
        return {"opsText": "", "courses": [norm_course(c) for c in raw_courses], "log": [], "n": 0}

    # 预检：不认识的 op → 整批拒绝
    for o in raw_ops:
        name = o.get("op") if isinstance(o, dict) else None
        if name not in OPS:
            who = name if isinstance(name, str) else json.dumps(name, ensure_ascii=False)
            return {"opsText": "", "courses": copy.deepcopy(raw_courses),
                    "log": ["1) 拒绝：未知 op %s" % who], "n": 0}

    courses = [norm_course(c) for c in raw_courses]
    log = []
    n = 0

    for i, op in enumerate(raw_ops, 1):
        kind = op["op"]
        p = "%d) " % i

        if kind == "add":
            courses.append(norm_course(op.get("course")))
            n += 1
            log.append(p + "新增 1 门：%s" % courses[-1]["name"])

        elif kind == "del":
            hit = matches(courses, op.get("match"))
            if not hit:
                log.append(p + "没找到：%s" % op.get("match"))
            else:
                gone = set(id(c) for c in hit)
                courses = [c for c in courses if id(c) not in gone]
                n += len(hit)
                log.append(p + "删除 %d 条" % len(hit))

        elif kind == "edit":
            hit = matches(courses, op.get("match"))
            if not hit:
                log.append(p + "没找到：%s" % op.get("match"))
            else:
                patch = op.get("set")
                for c in hit:
                    apply_edit(c, patch)
                n += len(hit)
                keys = "/".join(sorted(patch.keys())) if isinstance(patch, dict) else "-"
                log.append(p + "修改 %d 条，键：%s" % (len(hit), keys))

        elif kind == "move":
            if "day" not in op or "periodFrom" not in op or "periodTo" not in op:
                log.append(p + "未执行：move 缺 day/periodFrom/periodTo")
                continue
            hit = matches(courses, op.get("match"))
            if not hit:
                log.append(p + "没找到：%s" % op.get("match"))
            else:
                for c in hit:
                    set_span(c, op)
                n += len(hit)
                log.append(p + "移动 %d 门到 周%d" % (len(hit), clamp(op.get("day"), 1, 7)))

        else:  # swap
            left = matches(courses, op.get("match"))
            right = matches(courses, op.get("with"))
            if len(left) != 1 or len(right) != 1 or left[0] is right[0]:
                log.append(p + "未执行：swap 需两侧各命中恰好 1 门（左 %d / 右 %d）"
                           % (len(left), len(right)))
                continue
            a, b = left[0], right[0]
            a["day"], b["day"] = b["day"], a["day"]
            a["periodFrom"], b["periodFrom"] = b["periodFrom"], a["periodFrom"]
            a["periodTo"], b["periodTo"] = b["periodTo"], a["periodTo"]
            n += 2
            log.append(p + "交换 %s 与 %s" % (a["name"], b["name"]))

    return {"opsText": ops_text(raw_ops), "courses": courses, "log": log, "n": n}


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        with open(path, "r", encoding="utf-8-sig") as fh:
            state = json.load(fh)
    except Exception:
        state = {}
    out = execute(state if isinstance(state, dict) else {})
    sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    sys.stdout.buffer.write(b"\n")
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()

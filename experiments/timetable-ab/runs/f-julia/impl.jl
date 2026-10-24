# impl.jl — 课表 ops 执行器（Julia 臂，std-only：只用 Base，无第三方包）
# 手写 JSON 读 + 写（对象/数组/字符串/数字/true/false/null，键序保持输入顺序）
# op：add / del / edit / move / swap；运行：julia --startup-file=no impl.jl input.json

# ================= JSON 值类型 =================
struct JObj
    ks::Vector{String}
    vs::Vector{Any}
end

function jidx(o::JObj, k::AbstractString)::Int
    @inbounds for i in eachindex(o.ks)
        o.ks[i] == k && return i
    end
    return 0
end

jhas(o::JObj, k::AbstractString)::Bool = jidx(o, k) != 0

function jget(o::JObj, k::AbstractString, dflt)
    i = jidx(o, k)
    return i == 0 ? dflt : o.vs[i]
end

function jset!(o::JObj, k::AbstractString, v)
    i = jidx(o, k)
    if i == 0
        push!(o.ks, String(k))
        push!(o.vs, v)
    else
        o.vs[i] = v
    end
    return o
end

jcopy(o::JObj) = JObj(copy(o.ks), copy(o.vs))

# ================= JSON 读（手写递归下降） =================
mutable struct Cur
    b::Vector{UInt8}
    i::Int
end

peekb(c::Cur)::UInt8 = c.i > length(c.b) ? 0x00 : @inbounds c.b[c.i]

function skipws(c::Cur)
    while c.i <= length(c.b)
        ch = @inbounds c.b[c.i]
        (ch == 0x20 || ch == 0x09 || ch == 0x0a || ch == 0x0d) || return
        c.i += 1
    end
    return
end

function p_hex4(c::Cur)::Int
    v = 0
    for _ in 1:4
        c.i > length(c.b) && error("json: \\u truncated")
        ch = @inbounds c.b[c.i]
        c.i += 1
        d = ch >= 0x30 && ch <= 0x39 ? Int(ch) - 0x30 :
            ch >= 0x61 && ch <= 0x66 ? Int(ch) - 0x61 + 10 :
            ch >= 0x41 && ch <= 0x46 ? Int(ch) - 0x41 + 10 : error("json: bad hex")
        v = v * 16 + d
    end
    return v
end

function p_string(c::Cur)::String
    buf = IOBuffer()
    c.i += 1                                    # 跳过开引号
    while true
        c.i > length(c.b) && error("json: string unterminated")
        ch = @inbounds c.b[c.i]
        if ch == 0x22
            c.i += 1
            break
        elseif ch == 0x5c
            c.i += 1
            c.i > length(c.b) && error("json: escape truncated")
            e = @inbounds c.b[c.i]
            c.i += 1
            if e == 0x22 || e == 0x5c || e == 0x2f
                write(buf, e)
            elseif e == 0x62
                write(buf, 0x08)
            elseif e == 0x66
                write(buf, 0x0c)
            elseif e == 0x6e
                write(buf, 0x0a)
            elseif e == 0x72
                write(buf, 0x0d)
            elseif e == 0x74
                write(buf, 0x09)
            elseif e == 0x75
                cp = p_hex4(c)
                if 0xd800 <= cp <= 0xdbff && c.i + 1 <= length(c.b) &&
                   c.b[c.i] == 0x5c && c.b[c.i+1] == 0x75
                    save = c.i
                    c.i += 2
                    lo = p_hex4(c)
                    if 0xdc00 <= lo <= 0xdfff
                        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00)
                    else
                        c.i = save
                    end
                end
                write(buf, Char(cp))
            else
                error("json: bad escape \\$(Char(e))")
            end
        else
            write(buf, ch)
            c.i += 1
        end
    end
    return String(take!(buf))
end

function p_number(c::Cur)
    start = c.i
    while c.i <= length(c.b)
        ch = @inbounds c.b[c.i]
        if (0x30 <= ch <= 0x39) || ch == 0x2b || ch == 0x2d || ch == 0x2e || ch == 0x65 || ch == 0x45
            c.i += 1
        else
            break
        end
    end
    t = String(c.b[start:c.i-1])
    if occursin('.', t) || occursin('e', t) || occursin('E', t)
        return parse(Float64, t)
    end
    v = tryparse(Int, t)
    return v === nothing ? parse(Float64, t) : v
end

function p_value(c::Cur)
    skipws(c)
    ch = peekb(c)
    if ch == 0x7b                                   # {
        c.i += 1
        ks = String[]
        vs = Any[]
        skipws(c)
        if peekb(c) == 0x7d
            c.i += 1
            return JObj(ks, vs)
        end
        while true
            skipws(c)
            k = p_string(c)
            skipws(c)
            peekb(c) == 0x3a || error("json: expected ':'")
            c.i += 1
            push!(ks, k)
            push!(vs, p_value(c))
            skipws(c)
            ch = peekb(c)
            if ch == 0x2c
                c.i += 1
            elseif ch == 0x7d
                c.i += 1
                break
            else
                error("json: expected ',' or '}'")
            end
        end
        return JObj(ks, vs)
    elseif ch == 0x5b                               # [
        c.i += 1
        arr = Any[]
        skipws(c)
        if peekb(c) == 0x5d
            c.i += 1
            return arr
        end
        while true
            push!(arr, p_value(c))
            skipws(c)
            ch = peekb(c)
            if ch == 0x2c
                c.i += 1
            elseif ch == 0x5d
                c.i += 1
                break
            else
                error("json: expected ',' or ']'")
            end
        end
        return arr
    elseif ch == 0x22
        return p_string(c)
    elseif ch == 0x74                               # true
        c.i += 4
        return true
    elseif ch == 0x66                               # false
        c.i += 5
        return false
    elseif ch == 0x6e                               # null
        c.i += 4
        return nothing
    else
        return p_number(c)
    end
end

function parse_json(s::AbstractString)
    c = Cur(Vector{UInt8}(codeunits(s)), 1)
    v = p_value(c)
    skipws(c)
    return v
end

# ================= JSON 写（手写） =================
function jw_str(io::IO, s::AbstractString)
    print(io, '"')
    for u in codeunits(s)
        if u == 0x22
            print(io, "\\\"")
        elseif u == 0x5c
            print(io, "\\\\")
        elseif u == 0x0a
            print(io, "\\n")
        elseif u == 0x0d
            print(io, "\\r")
        elseif u == 0x09
            print(io, "\\t")
        elseif u < 0x20
            print(io, "\\u", lpad(string(u, base=16), 4, '0'))
        else
            write(io, u)
        end
    end
    print(io, '"')
    return
end

function jw(io::IO, x)
    if x === nothing
        print(io, "null")
    elseif x isa Bool
        print(io, x ? "true" : "false")
    elseif x isa Integer
        print(io, Int64(x))
    elseif x isa AbstractFloat
        print(io, isfinite(x) && x == floor(x) ? string(Int64(x)) : string(x))
    elseif x isa AbstractString
        jw_str(io, x)
    elseif x isa JObj
        print(io, '{')
        for i in eachindex(x.ks)
            i > 1 && print(io, ',')
            jw_str(io, x.ks[i])
            print(io, ':')
            jw(io, x.vs[i])
        end
        print(io, '}')
    elseif x isa AbstractVector
        print(io, '[')
        for (i, v) in enumerate(x)
            i > 1 && print(io, ',')
            jw(io, v)
        end
        print(io, ']')
    else
        error("jw: 不支持的类型 $(typeof(x))")
    end
    return
end

# ================= 领域逻辑 =================
const OP_SET = ("add", "del", "edit", "move", "swap")

cname(c::JObj)::String = (v = jget(c, "name", ""); v isa AbstractString ? v : string(v))

function clampday(d)
    d isa Integer && return clamp(Int64(d), 1, 7)
    d isa AbstractFloat && return clamp(Int64(round(d)), 1, 7)
    return d
end

defweeks() = JObj(["type", "from", "to"], Any["range", 1, 16])

hits(name::AbstractString, m::AbstractString)::Bool = !isempty(m) && occursin(m, name)

function op_add!(courses::Vector{Any}, o::JObj)
    raw = jget(o, "course", nothing)
    raw isa JObj || return 0, "add：缺 course"
    c = jcopy(raw)
    jset!(c, "day", clampday(jget(c, "day", 1)))
    if !jhas(c, "weeks") || jget(c, "weeks", nothing) === nothing
        jset!(c, "weeks", defweeks())
    end
    jhas(c, "tag") || jset!(c, "tag", nothing)
    push!(courses, c)
    return 1, "add " * cname(c)
end

function op_del!(courses::Vector{Any}, o::JObj)
    m = string(jget(o, "match", ""))
    keep = Any[]
    hit = 0
    for c in courses
        if hits(cname(c), m)
            hit += 1
        else
            push!(keep, c)
        end
    end
    hit == 0 && return 0, "del " * m * "：没找到"
    empty!(courses)
    append!(courses, keep)
    return hit, "del " * m * " ×" * string(hit)
end

function op_edit!(courses::Vector{Any}, o::JObj)
    m = string(jget(o, "match", ""))
    s = jget(o, "set", nothing)
    s isa JObj || return 0, "edit " * m * "：缺 set"
    hit = 0
    for c in courses
        hits(cname(c), m) || continue
        for i in eachindex(s.ks)
            k = s.ks[i]
            v = s.vs[i]
            k == "day" && (v = clampday(v))
            jset!(c, k, v)
        end
        hit += 1
    end
    hit == 0 && return 0, "edit " * m * "：没找到"
    return hit, "edit " * m * " ×" * string(hit)
end

function op_move!(courses::Vector{Any}, o::JObj)
    m = string(jget(o, "match", ""))
    if !(jhas(o, "day") && jhas(o, "periodFrom") && jhas(o, "periodTo"))
        return 0, "move " * m * "：缺字段，不执行"
    end
    d = clampday(jget(o, "day", 1))
    pf = jget(o, "periodFrom", 1)
    pt = jget(o, "periodTo", 1)
    hit = 0
    for c in courses
        hits(cname(c), m) || continue
        jset!(c, "day", d)
        jset!(c, "periodFrom", pf)
        jset!(c, "periodTo", pt)
        hit += 1
    end
    hit == 0 && return 0, "move " * m * "：没找到"
    return hit, "move " * m * " → 周" * string(d) * " " * string(pf) * "-" * string(pt)
end

function op_swap!(courses::Vector{Any}, o::JObj)
    m = string(jget(o, "match", ""))
    w = string(jget(o, "with", ""))
    ia = Int[]
    ib = Int[]
    for (i, c) in enumerate(courses)
        hits(cname(c), m) && push!(ia, i)
        hits(cname(c), w) && push!(ib, i)
    end
    if length(ia) != 1 || length(ib) != 1 || ia[1] == ib[1]
        return 0, "swap " * m * "⇄" * w * "：未各命中 1 门，不执行"
    end
    a = courses[ia[1]]
    b = courses[ib[1]]
    for k in ("day", "periodFrom", "periodTo")
        va = jget(a, k, 1)
        vb = jget(b, k, 1)
        jset!(a, k, vb)
        jset!(b, k, va)
    end
    return 2, "swap " * cname(a) * " ⇄ " * cname(b)
end

function dispatch!(nm::String, courses::Vector{Any}, o::JObj)
    nm == "add" && return op_add!(courses, o)
    nm == "del" && return op_del!(courses, o)
    nm == "edit" && return op_edit!(courses, o)
    nm == "move" && return op_move!(courses, o)
    nm == "swap" && return op_swap!(courses, o)
    return 0, "未知 op " * nm
end

# ================= 主流程 =================
function main()::Int
    isempty(ARGS) && (println(stderr, "usage: julia impl.jl input.json"); return 2)
    doc = parse_json(read(ARGS[1], String))

    courses = Any[]
    if doc isa JObj
        cs = jget(doc, "courses", nothing)
        if cs isa AbstractVector
            for c in cs
                push!(courses, c isa JObj ? c : JObj(String[], Any[]))
            end
        end
    end
    opsraw = doc isa JObj ? jget(doc, "ops", nothing) : nothing
    ops = opsraw isa AbstractVector ? opsraw : Any[]

    badf = false
    badnm = ""
    for o in ops
        nm = o isa JObj ? string(jget(o, "op", "")) : ""
        if !(nm in OP_SET)
            badf = true
            badnm = nm
            break
        end
    end

    logs = String[]
    desc = String[]
    n = 0
    if badf
        push!(logs, "1) 拒绝：未知 op " * badnm)
    else
        for o in ops
            nm = string(jget(o, "op", ""))
            cnt, msg = dispatch!(nm, courses, o)
            n += cnt
            push!(desc, msg)
            push!(logs, string(length(logs) + 1) * ") " * msg)
        end
    end

    out = JObj(["opsText", "courses", "log", "n"],
               Any[join(desc, " | "), courses, logs, n])
    buf = IOBuffer()
    jw(buf, out)
    print(stdout, String(take!(buf)))
    println()
    return 0
end

exit(main())

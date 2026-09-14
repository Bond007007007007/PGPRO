#!/usr/bin/env python3
"""Merge IndiaBIX JSONL -> dedup (keep original) -> emit bank-practice-*.js files.
Cycle stage A: internal dedup + cross-bank dedup vs existing stems.
"""
import json, re, sys, collections

POOL = "/tmp/opencode/pool"
DIR = "/root/Desktop/Aaryan Sem V/gate-cbt"

def norm(q):
    s = q.get("q") or ""
    s = re.sub(r"\$[^$]*\$", " ", s)
    s = re.sub(r"\\text\s*\{[^}]*\}", " ", s)
    s = re.sub(r"[^a-z0-9]+", "", s.lower())
    return s.strip()

def load(fname):
    rows = [json.loads(l) for l in open(f"{POOL}/{fname}")]
    return rows

# source priority order: earlier = "original wins" on stem clash across sources
SOURCES = [
    ("indiabix_biochemistry.jsonl",    "indabix-biochem"),
    ("indiabix_biotechnology.jsonl",   "indabix-biotech"),
    ("indiabix_microbiology.jsonl",    "indabix-micro"),
    ("indiabix_biochemeng.jsonl",      "indabix-biochemeng"),
    ("indiabix_aptitude.jsonl",        "indabix-aptitude"),
    ("indiabix_verbal.jsonl",          "indabix-verbal"),
]

existing = json.load(open(f"{POOL}/existing_stems.json"))

def opt_sig(q):
    vals = ("".join(c for c in str(o).lower() if c.isalnum()) for o in (q.get("options") or []))
    # options[] is a plain list in JSONL; normalize + sort
    return "|".join(sorted(vals))

def ans_val(q):
    ai = ord(str(q.get("answer", "A")).upper()) - 65
    opts = q.get("options") or []
    v = opts[ai] if 0 <= ai < len(opts) else ""
    return "".join(c for c in str(v).lower() if c.isalnum())

def sig(q):
    s = norm(q)
    return (s, opt_sig(q), ans_val(q))

existing_lookup = {}
for pool, arr in existing.items():
    existing_lookup[pool] = {(e["stem"], "|".join(e["opts"]), e["ans"]) for e in arr}

# ---- merge with internal dedup ----
merged = {}   # stem -> q
per_src = collections.Counter()
dupe_internal = collections.Counter()

for fname, tag in SOURCES:
    for q in load(fname):
        s = norm(q)
        if len(s) < 12:
            continue
        q["_stem"] = s
        q["_src"] = tag
        if s in merged:
            dupe_internal[tag] += 1
            continue
        merged[s] = q
        per_src[tag] += 1

print("internal dedup: kept", len(merged), "| removed:", dict(dupe_internal))
for tag, n in per_src.items():
    print("  ", tag, n)

# ---- route to pools ----
SCI = {"indabix-biochem", "indabix-biotech", "indabix-micro", "indabix-biochemeng"}
GA_SCI = {"indabix-aptitude", "indabix-verbal"}

def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").replace("\r", " ").strip()

def qline(q, marks, sec):
    opts = q["options"]
    o = ", ".join(f'{chr(97+i)}: "{esc(v)}"' for i, v in enumerate(opts))
    expl = q["explain"]
    if "No answer description" in expl:
        expl = ""
    corr = q["answer"]
    return f'{{ section: "{sec}", type: "mcq", marks: {marks}, q: "{esc(q["q"])}", options: {{ {o} }}, correct: ["{corr.lower()}"], explain: "{esc(expl)}", topic: "{esc(q["topic"])}", src: "Practice IndiaBIX" }}'

def emit(fname, rows_for_pools):
    """rows_for_pools: [{pool, sec, marks_fn, rows}] writes one JS file registering into multiple pools"""
    parts = []
    parts.append("window.GATE_BANK = window.GATE_BANK || {};")
    parts.append("(function () {")
    for pool, sec, mk, rows in rows_for_pools:
        if rows is None:
            continue
        lines = [qline(q, mk(q, i), sec) for i, q in enumerate(rows)]
        body = ",\n".join(lines)
        parts.append(f'  window.GATE_BANK["{pool}"] = (window.GATE_BANK["{pool}"] || []).concat([\n    {body}\n  ]);')
    parts.append("})();")
    open(f"{DIR}/{fname}", "w").write("\n".join(parts) + "\n")

def pool_rows(stem_set, pool, sec, existing_pool):
    """filter stems: drop those whose FULL signature already exists in the target pool's existing content."""
    rows, dropped = [], 0
    for s in list(stem_set):
        q = merged[s]
        if sig(q) in existing_lookup.get(pool, set()):
            dropped += 1
            continue
        q["_sec"] = sec
        q["_pool"] = pool
        rows.append(q)
    return rows, dropped

def marks_alt(i, m1, m2, every=3):
    return m2 if i % every == every - 1 else m1

report = {}
sciset = set()
for tag in SCI:
    sciset |= {s for s, q in merged.items() if q["_src"] == tag}

gatb_rows, d1 = pool_rows(sciset, "gatb", "B", "gatb")
cuet_rows, d2 = pool_rows(sciset, "cuet", "D", "cuet")
jam_rows, d3 = pool_rows(sciset, "jam", "A", "jam")

# XL: biochem -> BIOCHEM, micro -> MICRO (others not routed to xl to avoid mislabeling)
xl_route = {"indabix-biochem": "BIOCHEM", "indabix-micro": "MICRO"}
xl_rows = []
xl_dropped = 0
for tag, sec in xl_route.items():
    stems = {s for s, q in merged.items() if q["_src"] == tag}
    r, d = pool_rows(stems, "xl", sec, "xl")
    xl_rows += r
    xl_dropped += d
xl_rows.sort(key=lambda t: t["_stem"])

# GA: aptitude+verbal -> gatb A + xl GA
gaset = set()
for tag in GA_SCI:
    gaset |= {s for s, q in merged.items() if q["_src"] == tag}
ga_gatb, d4 = pool_rows(gaset, "gatb", "A", "gatb")
ga_xl, d5 = pool_rows(gaset, "xl", "GA", "xl")

report["gatbB"] = (len(gatb_rows), d1)
report["cuetD"] = (len(cuet_rows), d2)
report["jamA"] = (len(jam_rows), d3)
report["xl_opt"] = (len(xl_rows), xl_dropped)
report["gatbA"] = (len(ga_gatb), d4)
report["xlGA"] = (len(ga_xl), d5)
print("cross-bank dedup:", report)

def mk_marks(pool, sec):
    if pool == "cuet":
        return lambda q, i: 4
    if pool == "gatb":
        return lambda q, i: 1
    if pool == "jam":
        return lambda q, i: marks_alt(i, 1, 2)
    if pool == "xl":
        return lambda q, i: marks_alt(i, 1, 2)

def reg(pool, sec, rows):
    return (pool, sec, mk_marks(pool, sec), rows)

def reg_sec(pool, rows):
    if not rows:
        return None
    sec = rows[0]["_sec"]
    return (pool, sec, mk_marks(pool, sec), rows)

emit("bank-practice-indiabix-biochem.js", [
    reg("gatb", "B", [q for q in gatb_rows if q["_src"] == "indabix-biochem"]),
    reg("cuet", "D", [q for q in cuet_rows if q["_src"] == "indabix-biochem"]),
    reg("jam", "A", [q for q in jam_rows if q["_src"] == "indabix-biochem"]),
    reg_sec("xl", [q for q in xl_rows if q["_src"] == "indabix-biochem"]),
])

emit("bank-practice-indiabix-biotech.js", [
    reg("gatb", "B", [q for q in gatb_rows if q["_src"] == "indabix-biotech"]),
    reg("cuet", "D", [q for q in cuet_rows if q["_src"] == "indabix-biotech"]),
    reg("jam", "A", [q for q in jam_rows if q["_src"] == "indabix-biotech"]),
])

emit("bank-practice-indiabix-micro.js", [
    reg("gatb", "B", [q for q in gatb_rows if q["_src"] == "indabix-micro"]),
    reg("cuet", "D", [q for q in cuet_rows if q["_src"] == "indabix-micro"]),
    reg("jam", "A", [q for q in jam_rows if q["_src"] == "indabix-micro"]),
    reg_sec("xl", [q for q in xl_rows if q["_src"] == "indabix-micro"]),
])

emit("bank-practice-indiabix-biochemeng.js", [
    reg("gatb", "B", [q for q in gatb_rows if q["_src"] == "indabix-biochemeng"]),
    reg("cuet", "D", [q for q in cuet_rows if q["_src"] == "indabix-biochemeng"]),
    reg("jam", "A", [q for q in jam_rows if q["_src"] == "indabix-biochemeng"]),
])

emit("bank-practice-indiabix-ga.js", [
    reg("gatb", "A", ga_gatb),
    reg("xl", "GA", ga_xl),
])

print("bank files written")
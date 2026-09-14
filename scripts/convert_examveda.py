#!/usr/bin/env python3
"""Convert Examveda JSONL -> dedup (keep original) -> emit bank-practice-examveda-*.js files.
Per-topic files; signature dedup vs existing banks (stem+options+answer)."""
import json, re, collections

POOL = "/tmp/opencode/pool"
DIR = "/root/Desktop/Aaryan Sem V/gate-cbt"

def norm(q):
    s = q.get("q") or ""
    s = re.sub(r"\$[^$]*\$", " ", s)
    s = re.sub(r"\\text\s*\{[^}]*\}", " ", s)
    s = re.sub(r"[^a-z0-9]+", "", s.lower())
    return s.strip()

def light_norm(s):
    s = re.sub(r"\$[^$]*\$", " ", str(s or ""))
    s = re.sub(r"\\(?:text|mathrm|mathbf|textbf)\s*\{[^}]*\}", " ", s)
    return re.sub(r"\s+", " ", s.lower()).strip()

def opt_sig(q):
    return json.dumps(sorted(light_norm(o) for o in (q.get("options") or [])), ensure_ascii=False)

def ans_val(q):
    ai = ord(str(q.get("answer", "A")).upper()) - 65
    opts = q.get("options") or []
    v = opts[ai] if 0 <= ai < len(opts) else ""
    return light_norm(v)

def n_norm(s):
    """Matches extract_stems.js N(): alnum collapse."""
    return light_norm(s).replace(" ", "").replace("-", "").replace("_", "")

def sig_norm(q):
    """Corpus-internal key matching dedup_sweep.js (lightNorm opts/ans)."""
    return (re.sub(r"[^a-z0-9]+", "", light_norm(q.get("q"))), opt_sig(q), ans_val(q))

def x_key(q):
    """Cross-source key matching extract_stems.js (N-normalized stem/opts/ans)."""
    opts = sorted(n_norm(o) for o in (q.get("options") or []))
    ai = ord(str(q.get("answer", "A")).upper()) - 65
    ans = n_norm(q.get("options")[ai]) if 0 <= ai < len(q.get("options") or []) else ""
    return (n_norm(q.get("q")), "|".join(opts), ans)

existing = json.load(open(f"{POOL}/existing_stems.json"))
existing_lookup = {}
for pool, arr in existing.items():
    existing_lookup[pool] = {(e["stem"], "|".join(e["opts"]), e["ans"]) for e in arr}

# topic -> (tag, {pool: sec})
ROUTES = {
    "Microbiology": ("examveda-micro", {"xl": "MICRO", "jam": "A", "gatb": "B", "cuet": "D"}),
    "Biotechnology": ("examveda-biotech", {"jam": "A", "gatb": "B", "cuet": "D"}),
    "Cell Biology": ("examveda-cellbio", {"xl": "BIOCHEM", "jam": "A", "gatb": "B", "cuet": "D"}),
    "Genetics And Evolution": ("examveda-genetics", {"xl": "BIOCHEM", "jam": "A", "gatb": "B", "cuet": "D"}),
    "Plant Anatomy And Physiology": ("examveda-plantphys", {"xl": "BOTANY", "jam": "A", "gatb": "B", "cuet": "D"}),
    "Plant Kingdom": ("examveda-plantkingdom", {"xl": "BOTANY", "jam": "A", "gatb": "B", "cuet": "D"}),
    "Animal Kingdom": ("examveda-animalkingdom", {"xl": "ZOO", "jam": "A", "gatb": "B", "cuet": "D"}),
    "Human Anatomy And Physiology": ("examveda-humanphys", {"xl": "ZOO", "jam": "A", "gatb": "B", "cuet": "D"}),
    "Human Diseases": ("examveda-humandiseases", {"xl": "ZOO", "jam": "A", "gatb": "B", "cuet": "D"}),
    "Economic Biology": ("examveda-econbio", {"xl": "BOTANY", "jam": "A", "gatb": "B", "cuet": "D"}),
}

rows = [json.loads(l) for l in open(f"{POOL}/examveda_all.jsonl")]
by_topic = collections.defaultdict(list)
for r in rows:
    by_topic[r["topic"]].append(r)

internal_removed = collections.Counter()
seen_all = set()
for topic in list(by_topic.keys()):
    kept = []
    for r in by_topic[topic]:
        k = sig_norm(r)
        if k in seen_all:
            internal_removed[topic] += 1
            continue
        seen_all.add(k)
        kept.append(r)
    by_topic[topic] = kept
print("corpus-wide internal dedup removed:", dict(internal_removed))

def esc(s):
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").replace("\r", " ").strip()

def qline(q, marks, sec):
    o = ", ".join(f'{chr(97+i)}: "{esc(v)}"' for i, v in enumerate(q["options"]))
    corr = q["answer"]
    q_src = f"Practice Examveda {esc(q['source'].replace('Examveda ',''))}"
    return f'{{ section: "{sec}", type: "mcq", marks: {marks}, q: "{esc(q["q"])}", options: {{ {o} }}, correct: ["{corr.lower()}"], explain: "{esc(q["explain"])}", topic: "{esc(q["topic"])}", src: "{q_src}" }}'

def marks_fn(pool):
    if pool == "cuet":
        return lambda q, i: 4
    if pool == "gatb":
        return lambda q, i: 1
    return lambda q, i: 2 if i % 3 == 2 else 1

report = {}
kept_total = 0

for topic, (tag, route) in ROUTES.items():
    rows_src = by_topic.get(topic, [])
    def pooled(pool, sec, rows_src):
        out, dropped = [], 0
        for q in rows_src:
            if x_key(q) in existing_lookup.get(pool, set()):
                dropped += 1
                continue
            out.append(q)
        return out, dropped

    parts = ["window.GATE_BANK = window.GATE_BANK || {};", "(function () {"]
    topic_report = {}
    for pool, sec in sorted(route.items()):
        out, dropped = pooled(pool, sec, rows_src)
        mk = marks_fn(pool)
        lines = [qline(q, mk(q, i), sec) for i, q in enumerate(out)]
        body = ",\n".join(lines)
        parts.append(f'  window.GATE_BANK["{pool}"] = (window.GATE_BANK["{pool}"] || []).concat([\n    {body}\n  ]);')
        topic_report[pool] = (len(out), dropped)
    parts.append("})();")
    fname = f"bank-practice-examveda-{tag.replace('examveda-','')}.js"
    open(f"{DIR}/{fname}", "w").write("\n".join(parts) + "\n")
    report[topic] = topic_report
    kept_total += sum(v[0] for v in topic_report.values())

print("per-topic (kept,dropped-per-pool):")
for topic, tr in report.items():
    print(f"  {topic}: {tr}")
print("TOTAL kept registrations:", kept_total)
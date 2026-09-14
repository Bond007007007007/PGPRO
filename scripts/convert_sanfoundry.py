#!/usr/bin/env python3
"""Convert Sanfoundry JSONL -> dedup (keep original) -> emit bank-practice-sf-*.js.
Reads /tmp/opencode/pool/sf_<topic>.jsonl; signature-dedup vs existing_stems.json
per convert_bio4u/convert_examveda pattern."""
import json, re, collections, glob, os

POOL = "/tmp/opencode/pool"
DIR = "/root/Desktop/Aaryan Sem V/gate-cbt"

def norm(q):
    s = q.get("stem") or ""
    s = re.sub(r"\$[^$]*\$", " ", s)
    s = re.sub(r"\\text\s*\{[^}]*\}", " ", s)
    s = re.sub(r"[^a-z0-9]+", "", s.lower())
    return s.strip()

def light_norm(s):
    s = re.sub(r"\$[^$]*\$", " ", str(s or ""))
    s = re.sub(r"\\(?:text|mathrm|mathbf|textbf)\s*\{[^}]*\}", " ", s)
    return re.sub(r"\s+", " ", s.lower()).strip()

def opt_sig(q):
    opts = [light_norm(o.get("text", "")) for o in (q.get("options") or [])]
    return json.dumps(sorted(opts), ensure_ascii=False)

def ans_val(q):
    ans_key = str(q.get("answer", "")).lower()
    opts = q.get("options") or []
    for o in opts:
        if o.get("key", "").lower() == ans_key:
            return light_norm(o.get("text", ""))
    return ""

def n_norm(s):
    return light_norm(s).replace(" ", "").replace("-", "").replace("_", "")

def sig_norm(q):
    return (re.sub(r"[^a-z0-9]+", "", light_norm(q.get("stem"))), opt_sig(q), ans_val(q))

def x_key(q):
    opts = sorted(n_norm(o.get("text", "")) for o in (q.get("options") or []))
    ans_key = str(q.get("answer", "")).lower()
    ans = ""
    for o in q.get("options") or []:
        if o.get("key", "").lower() == ans_key:
            ans = n_norm(o.get("text", ""))
            break
    return (n_norm(q.get("stem")), "|".join(opts), ans)

existing = json.load(open(f"{POOL}/existing_stems.json"))
existing_lookup = {}
for pool, arr in existing.items():
    existing_lookup[pool] = {(e["stem"], "|".join(e["opts"]), e["ans"]) for e in arr}

ROUTES = {
    "basic-biotechnology-questions-answers":     ("sf-biotech",     {"jam": "A", "gatb": "B", "cuet": "D"}),
    "biochemistry-questions-answers":             ("sf-biochem",     {"xl": "BIOCHEM", "jam": "A", "gatb": "B", "cuet": "D"}),
    "microbiology-questions-answers":             ("sf-micro",       {"xl": "MICRO", "jam": "A", "gatb": "B", "cuet": "D"}),
    "genetic-engineering-questions-answers":      ("sf-geneeng",     {"jam": "A", "gatb": "B", "cuet": "D"}),
    "immunology-questions-answers":               ("sf-immuno",      {"xl": "MICRO", "jam": "A", "gatb": "B", "cuet": "D"}),
    "cell-biology-questions-answers":             ("sf-cellbio",     {"xl": "BIOCHEM", "jam": "A", "gatb": "B", "cuet": "D"}),
    "molecular-biology-questions-answers":        ("sf-molbio",      {"xl": "BIOCHEM", "jam": "A", "gatb": "B", "cuet": "D"}),
    "enzyme-technology-questions-answers":        ("sf-enztech",     {"jam": "A", "gatb": "B", "cuet": "D"}),
    "fermentation-technology-questions-answers":  ("sf-fermtech",    {"jam": "A", "gatb": "B", "cuet": "D"}),
    "food-microbiology-questions-answers":        ("sf-foodmicro",   {"xl": "MICRO", "jam": "A", "gatb": "B", "cuet": "D"}),
    "bioinformatics-questions-answers":           ("sf-bioinfo",     {"jam": "A", "gatb": "B", "cuet": "D"}),
    "cytogenetics-questions-answers":             ("sf-cyto",        {"xl": "BIOCHEM", "jam": "A", "gatb": "B", "cuet": "D"}),
    "environmental-biotechnology-questions-answers": ("sf-envbiotech", {"jam": "A", "gatb": "B", "cuet": "D"}),
    "drug-pharmaceutical-biotechnology-questions-answers": ("sf-drugbiotech", {"jam": "A", "gatb": "B", "cuet": "D"}),
    "agricultural-biotechnology-questions-answers":  ("sf-agbiotech",  {"xl": "BOTANY", "jam": "A", "gatb": "B", "cuet": "D"}),
    "plant-biotechnology-questions-answers":      ("sf-plantbiotech", {"xl": "BOTANY", "jam": "A", "gatb": "B", "cuet": "D"}),
    "marine-biotechnology-questions-answers":     ("sf-marinebiotech", {"jam": "A", "gatb": "B", "cuet": "D"}),
    "molecular-endocrinology-questions-answers":  ("sf-endocrinol",  {"xl": "ZOO", "jam": "A", "gatb": "B", "cuet": "D"}),
    "biochemical-engineering-questions-answers":  ("sf-biochemeng",  {"jam": "A", "gatb": "B", "cuet": "D"}),
}

by_topic = collections.defaultdict(list)
for f in glob.glob(f"{POOL}/sf_*.jsonl"):
    slug = os.path.basename(f)[len("sf_"):-len(".jsonl")]
    if slug not in ROUTES:
        continue
    by_topic[slug].extend(json.loads(l) for l in open(f))
print("per-topic rows:", {k: len(v) for k, v in by_topic.items()})

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
    opts_list = []
    for i, o in enumerate(q.get("options") or []):
        opts_list.append(f'{chr(97+i)}: "{esc(o.get("text",""))}"')
    o = ", ".join(opts_list)
    corr = str(q.get("answer", "a")).lower()
    q_src = "Practice Sanfoundry"
    expl = q.get("explanation") or ""
    ch = q.get("chapter") or ""
    return f'{{ section: "{sec}", type: "mcq", marks: {marks}, q: "{esc(q.get("stem",""))}", options: {{ {o} }}, correct: ["{corr}"], explain: "{esc(expl)}", topic: "{esc(ch)}", src: "{q_src}" }}'

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
    if not rows_src:
        print(f"  {topic}: SKIP (0 rows)")
        continue
    fname = f"bank-practice-{tag}.js"
    open(f"{DIR}/{fname}", "w").write("\n".join(parts) + "\n")
    report[topic] = topic_report
    kept_total += sum(v[0] for v in topic_report.values())

print("\nper-topic (kept, dropped-per-pool):")
for topic, tr in report.items():
    print(f"  {topic}: {tr}")
print(f"\nTOTAL kept registrations: {kept_total}")

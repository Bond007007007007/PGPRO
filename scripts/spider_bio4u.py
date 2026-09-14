#!/usr/bin/env python3
"""BiologyExams4U BFS spider.
- Starts at /p/mcqs.html hub, follows ALL post links (incl. numbered sub-sets "1-20" etc.)
- Per-page parser handles 5 answer formats:
    1) "Answers:" numbered key   -> "N. letter) text"
    2) "Answers:" positional key -> "letter) text" in question order
    3) "Answers:" value-only key -> plain values matched to options
    4) inline "Ans: X" / "Answer: X" after each question
    5) uppercase options (A)(B)(C)(D) normalized to lower a-d
- Topic inherited from hub link text hints; sub-links inherit parent topic.
Output: /tmp/opencode/pool/bio4u_<topic>.jsonl  (topics with >=2 Qs)"""
import re, json, time, subprocess, html as ihtml, collections

OUT = "/tmp/opencode/pool"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

TOPIC_HINTS = [
    ("amino acid", "Amino Acids"),
    ("ph and buffer", "pH and Buffer"),
    ("buffer, weak acids", "pH and Buffer"),
    ("scientific method", "Scientific Method"),
    ("general agriculture", "Agriculture"),
    ("agricultural", "Agriculture"),
    ("ecology", "Ecology"),
    ("phyto hormones", "Phytohormones"),
    ("cytology", "Cytology"),
    ("immunology", "Immunology"),
    ("genetics", "Genetics"),
    ("evolution", "Evolution"),
    ("botany", "Botany"),
    ("zoology", "Zoology"),
    ("microbiology", "Microbiology"),
    ("biotechnology", "Biotechnology"),
    ("cell cycle", "Cell Cycle"),
    ("icmr", "Immunology"),
    ("dbt-bet", "Biotechnology"),
    ("jnu", "Biotechnology"),
    ("csir", "Life Sciences"),
]

def fetch(url):
    r = subprocess.run(["curl", "-s", "-L", "-A", UA, url], capture_output=True, text=True, timeout=40)
    return r.stdout

def post_body(html):
    i = html.find('<div class="post-body entry-content" id="post-body">')
    if i < 0:
        i = html.find('class="post-body entry-content"')
        if i < 0:
            return None
    b = html[i:]
    j = b.find("post-footer")
    if j > 0:
        b = b[:j]
    b = re.sub(r"<script.*?</script>", "", b, flags=re.S)
    b = re.sub(r"<style.*?</style>", "", b, flags=re.S)
    return b

def text_parts(body):
    txt = ihtml.unescape(re.sub(r"<[^>]+>", "|", body))
    txt = re.sub(r"\|+", "|", txt)
    return [re.sub(r"\s+", " ", p).strip() for p in txt.split("|") if p.strip()]

def z(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())

def parse_post(html, url):
    body = post_body(html)
    if not body:
        return []
    parts = text_parts(body)

    am = next((i for i, p in enumerate(parts) if p.lower().startswith("answers")), None)
    qpart = parts[:am] if am is not None else parts

    qs = collections.OrderedDict()
    inline = {}  # qn -> ('L', letter) | ('V', value_text)
    cur = None
    pending = None
    for p in qpart:
        mq = re.match(r"^(\d+)[\.\s:]+\s*(.*)$", p)
        mo = re.match(r"^\(?([a-eA-E])\)?[\s.:-]+(.*)$", p) or re.match(r"^\(?([a-eA-E])\)(?=\S)(.*)$", p)
        if mq and int(mq.group(1)) <= 300:
            n = int(mq.group(1))
            cur = {"n": n, "stem": mq.group(2), "opts": {}}
            qs[n] = cur
            pending = None
            continue
        ma = re.match(r"^\s*Ans(?:wer)?\s*:?\s*(.*)$", p, re.I)
        if ma and cur is not None:
            rest = ma.group(1).strip()
            lm = re.match(r"^\(?([a-eA-E])\)?[\s.:-]*(.*)$", rest)
            if lm:
                inline[cur["n"]] = ("L", lm.group(1).lower())
            elif rest:
                inline[cur["n"]] = ("V", rest)
            continue
        mb = re.match(r"^\(?([a-eA-E])\)?\s*$", p)
        if mb and cur is not None:
            pending = mb.group(1).lower()
            continue
        if pending and cur is not None:
            cur["opts"][pending] = p.strip()
            pending = None
            continue
        if mo and cur is not None:
            cur["opts"][mo.group(1).lower()] = mo.group(2).strip()
            continue
        if cur is not None:
            letters = list(cur["opts"].keys())
            if letters:
                cur["opts"][letters[-1]] = (cur["opts"][letters[-1]] + " " + p).strip()
            else:
                cur["stem"] = (cur["stem"] + " " + p).strip()

    if not qs:
        return []

    keys = {}
    if am is not None:
        keylines = parts[am + 1:]
        numbered = []
        for p in keylines:
            m = re.match(r"^(\d+)[\.\s:]+\(?([a-eA-E])\)", p)
            if m:
                numbered.append((int(m.group(1)), m.group(2).lower()))
        if numbered and all(1 <= n <= 300 for n, _ in numbered):
            for n, lt in numbered:
                keys[n] = lt
        else:
            qorder = [q["n"] for q in qs.values()]
            pos = 0
            for p in keylines:
                m = re.match(r"^\(?([a-eA-E])\)[\s.:-]*(.*)$", p)
                if m and pos < len(qorder):
                    keys[qorder[pos]] = m.group(1).lower()
                    pos += 1
            if len(keys) != len(qorder):
                pos = 0
                keys = {}
                for p in keylines:
                    if pos >= len(qorder):
                        break
                    n = qorder[pos]
                    q = qs[n]
                    kz = z(p)
                    if not kz:
                        pos += 1
                        continue
                    hits = [lt for lt, v in q["opts"].items() if z(v) == kz]
                    if len(hits) == 1:
                        keys[n] = hits[0]
                        pos += 1
                    else:
                        hits2 = [lt for lt, v in q["opts"].items()
                                 if (kz in z(v) or z(v) in kz) and min(len(kz), len(z(v))) >= 4]
                        if len(hits2) == 1:
                            keys[n] = hits2[0]
                            pos += 1
                        else:
                            pos += 1
    else:
        # format 4/5: inline "Ans: X" — first from standalone parts (inline dict), then stem scan
        for n, q in qs.items():
            if n in inline:
                kind, val = inline[n]
                if kind == "L":
                    keys[n] = val
                else:
                    kz = z(val)
                    if not kz:
                        continue
                    hits = [lt for lt, v in q["opts"].items() if z(v) == kz]
                    if len(hits) == 1:
                        keys[n] = hits[0]
                    else:
                        hits2 = [lt for lt, v in q["opts"].items()
                                 if (kz in z(v) or z(v) in kz) and min(len(kz), len(z(v))) >= 4]
                        if len(hits2) == 1:
                            keys[n] = hits2[0]
                        else:
                            # "2nd position" vs option "2nd Carbon": match on first token
                            first = re.split(r"[^a-z0-9]+", kz)[0]
                            if first and len(first) >= 3:
                                hits3 = [lt for lt, v in q["opts"].items()
                                         if re.split(r"[^a-z0-9]+", z(v))[0] == first]
                                if len(hits3) == 1:
                                    keys[n] = hits3[0]
            else:
                m = re.search(r"\b(?:Ans|Answer)\s*[:.\-]?\s*\(?([a-eA-E])\)?", q["stem"])
                if m:
                    keys[n] = m.group(1).lower()

    out = []
    for n, q in qs.items():
        if n not in keys or len(q["opts"]) < 2:
            continue
        ans = keys[n]
        if ans not in q["opts"]:
            continue
        if len(q["stem"]) < 8:
            continue
        opts = [q["opts"][c] for c in sorted(q["opts"])]
        out.append({"q": q["stem"], "options": opts, "answer": ans, "explain": "", "url": url})
    return out

def topic_of(text):
    t = text.lower()
    for kw, tag in TOPIC_HINTS:
        if kw in t:
            return tag
    return None

def crawl():
    hub = fetch("https://www.biologyexams4u.com/p/mcqs.html")
    links = re.findall(r'href="(https?://www\.biologyexams4u\.com/20\d\d/\d{2}/[^"]+)"[^>]*>([^<]{1,90})<', hub)
    queue = []
    for u, t in links:
        u = u.split("?")[0]
        if u.endswith(".html"):
            queue.append((u, topic_of(t)))
    visited = set()
    per_topic = collections.defaultdict(list)
    total_pages = 0
    while queue:
        u, topic = queue.pop(0)
        if u in visited:
            continue
        visited.add(u)
        html = fetch(u)
        body = post_body(html)
        qtext = topic
        if body and not qtext:
            tm = re.search(r"<title>([^<]*)</title>", html)
            if tm:
                qtext = topic_of(tm.group(1))
        qs = parse_post(html, u)
        if qs:
            tag = qtext or "Misc"
            for q in qs:
                q["topic"] = tag
                q["source"] = f"BiologyExams4U {tag}"
            per_topic[tag].extend(qs)
            print(f"  [{tag:<14}] {u.split('/')[-1][:42]:<44} -> {len(qs)} Qs", flush=True)
        if body:
            for subl, st in re.findall(r'href="(https?://www\.biologyexams4u\.com/20\d\d/\d{2}/[^"]+)"[^>]*>([^<]{1,90})<', body):
                subl = subl.split("?")[0]
                if subl.endswith(".html") and subl not in visited:
                    queue.append((subl, topic_of(st) or qtext))
        total_pages += 1
        time.sleep(0.4)

    print(f"visited: {total_pages} pages")
    for tag, qs in per_topic.items():
        if len(qs) < 2:
            print(f"  skip {tag} ({len(qs)})")
            continue
        fn = f"{OUT}/bio4u_{tag.lower().replace(' ', '_')}.jsonl"
        with open(fn, "w") as f:
            for q in qs:
                f.write(json.dumps(q) + "\n")
        print(f"saved {fn} ({len(qs)})", flush=True)
    print("DONE", flush=True)

if __name__ == "__main__":
    crawl()
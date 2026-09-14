#!/usr/bin/env python3
"""spider_sanfoundry.py — crawl Sanfoundry 1000-question hubs via Wayback Machine.

Live sanfoundry.com is Cloudflare-blocked (403) for curl/curl_cffi; the Wayback
Machine serves both hubs and chapter pages with full Q&A markup:
  N. stem
  a) opt  b) opt  c) opt  d) opt
  View Answer
  Answer: X
  Explanation: ...

Usage:
  python3 spider_sanfoundry.py <hub-slug1> [<hub-slug2> ...]
  python3 spider_sanfoundry.py --all      # all hubs in the default list

Output: /tmp/opencode/pool/sf_<hubslug>.jsonl (resumable — rerun to continue)
"""
import json, os, re, sys, time, urllib.request

OUT_DIR = "/tmp/opencode/pool"
WB = "https://web.archive.org/web/2025/"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}

# exam-relevant hubs (sanfoundry 1000-question hubs)
HUBS = [
    "1000-basic-biotechnology-questions-answers",
    "1000-biochemistry-questions-answers",
    "1000-microbiology-questions-answers",
    "1000-genetic-engineering-questions-answers",
    "1000-immunology-questions-answers",
    "1000-cell-biology-questions-answers",
    "1000-molecular-biology-questions-answers",
    "1000-enzyme-technology-questions-answers",
    "1000-fermentation-technology-questions-answers",
    "1000-food-microbiology-questions-answers",
    "1000-bioinformatics-questions-answers",
    "1000-cytogenetics-questions-answers",
    "1000-environmental-biotechnology-questions-answers",
    "1000-drug-pharmaceutical-biotechnology-questions-answers",
    "1000-agricultural-biotechnology-questions-answers",
    "1000-plant-biotechnology-questions-answers",
    "1000-marine-biotechnology-questions-answers",
    "1000-molecular-endocrinology-questions-answers",
    "1000-biochemical-engineering-questions-answers",
]

def fetch(url, tries=3):
    req = urllib.request.Request(url, headers=UA)
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if i == tries - 1:
                print(f"  !! fetch fail {url}: {e}", flush=True)
                return None
            time.sleep(3 * (i + 1))
    return None

def hub_chapters(hub_slug):
    """Return list of chapter URL slugs from a 1000- hub page."""
    html = fetch(WB + f"https://www.sanfoundry.com/{hub_slug}/")
    if not html:
        return []
    subject = hub_slug.replace("1000-", "")  # e.g. basic-biotechnology
    prefix = subject + "-questions-answers-"
    pat = re.compile(r'href="https://web\.archive\.org/web/[0-9]+/https?://www\.sanfoundry\.com/([a-z0-9-]+-questions-answers-[a-z0-9-]+)/')
    chs = sorted(set(pat.findall(html)))
    chs = [c for c in chs if c.startswith(prefix)]
    return chs

def parse_chapter(html):
    """Parse a sanfoundry chapter page -> list of Q dicts."""
    m = re.search(r'class="entry-content"(.*?)(?:<h2|<h3|<!--|</article|<div class="sf-top)', html, re.S)
    body = m.group(1) if m else html
    # normalize: extract visible text with paragraph breaks
    body = re.sub(r'<script.*?</script>|<style.*?</style>', '', body, flags=re.S)
    body = re.sub(r'<br\s*/?>', '\n', body)
    body = re.sub(r'</p>|</div>|</li>|</h\d>', '\n', body)
    body = re.sub(r'<[^>]+>', '', body)
    body = html_unescape(body)
    # "View Answer" span merges with the answer div -> force a line break
    body = re.sub(r'View Answer', 'View Answer\n', body, flags=re.I)
    lines = [l.strip() for l in body.split('\n')]
    return parse_lines(lines)

def html_unescape(s):
    import html as _h
    return _h.unescape(s)

def parse_lines(lines):
    """State machine over text lines -> questions.

    Formats seen:
      - "1. stem"  then "a) x".."d) x" then "View Answer" then "Answer: X"
      - "2. stem ..." (multi-line stem until first option)
      - options sometimes inline same line as stem? (not observed) — handle "a) x b) y" split
      - Answer line: "Answer: a" or "Answer: d" (letter)
    """
    qs = []
    cur = None
    i = 0
    n = len(lines)
    def flush():
        nonlocal cur
        if cur and cur.get("options") and cur.get("answer"):
            qs.append(cur)
        cur = None
    while i < n:
        ln = lines[i]
        if not ln:
            i += 1; continue
        # new question start: "N. stem" where N digits
        m = re.match(r'^(\d{1,3})[\.\)]\s+(.*)$', ln)
        if m and re.match(r'^\d+[\.\)]\s+\S', ln) and not re.match(r'^[0-9]+\s+[a-d][\.\)]', ln):
            flush()
            cur = {"stem": m.group(2), "options": [], "answer": None, "explanation": None}
            i += 1
            # collect stem continuation until an option or View Answer
            j = i
            while j < n and not re.match(r'^\(?[a-dA-D]\)\s*\S|^View Answer', lines[j]) and not re.match(r'^\d{1,3}[\.\)]\s+\S', lines[j]):
                if lines[j] and not lines[j].startswith(('advertisement', 'Advertisement')):
                    cur["stem"] += " " + lines[j]
                j += 1
            i = j
            continue
        # options
        m = re.match(r'^\(?([a-dA-D])\)\s*(.*)$', ln)
        if m and cur and (cur["options"] or re.match(r'^\(?[a-dA-D]\)', ln)):
            # check it's actually an option (short text) and not "View Answer"
            if ln.strip().lower() != "view answer":
                cur["options"].append({"key": m.group(1).lower(), "text": m.group(2)})
                i += 1
                continue
        # inline multiple options on one line: "a) x  b) y  c) z  d) w"
        if cur and len(cur["options"]) < 4:
            mm = re.match(r'^\(?a\)\s*.*\(?b\)\s*.*(?:\(?c\)\s*.*)?(?:\(?d\)\s*.*)?$', ln)
            if mm:
                parts = re.split(r'\s+(?=\(?[b-d]\)\s)', ln)
                for p in parts:
                    om = re.match(r'^\(?([a-dA-D])\)\s*(.*)$', p)
                    if om:
                        cur["options"].append({"key": om.group(1).lower(), "text": om.group(2)})
                i += 1
                continue
        # answer
        m = re.match(r'^Answer\s*[:\.]?\s*\(?([a-dA-D])\)?\s*$', ln)
        if m and cur:
            cur["answer"] = m.group(1).lower()
            i += 1
            # explanation until next question
            j = i
            expl = []
            while j < n and not re.match(r'^\d{1,3}[\.\)]\s+\S', lines[j]) and not re.match(r'^\(?[a-dA-D]\)\s*\S', lines[j]) and not re.match(r'^Answer\s*[:\.]?', lines[j]):
                if lines[j] and not lines[j].lower().startswith(('view answer', 'advertisement')):
                    expl.append(lines[j])
                j += 1
            cur["explanation"] = " ".join(expl).strip()[:400] or None
            i = j
            continue
        if ln.lower() == "view answer":
            i += 1; continue
        i += 1
    flush()
    return qs

def crawl_hub(hub_slug):
    outp = os.path.join(OUT_DIR, f"sf_{hub_slug.replace('1000-', '')}.jsonl")
    done = set()
    existing = []
    if os.path.exists(outp):
        with open(outp, encoding="utf-8") as f:
            for ln in f:
                try:
                    row = json.loads(ln)
                    existing.append(row)
                    done.add(row["chapter"])
                except Exception:
                    pass
    print(f"\n=== {hub_slug} (already {len(existing)} Qs / {len(done)} chapters) ===", flush=True)
    chs = hub_chapters(hub_slug)
    print(f"  hub lists {len(chs)} chapters", flush=True)
    if not chs:
        print("  !! no chapters found — hub parse failed", flush=True)
        return
    fresh = 0
    for c in chs:
        if c in done:
            continue
        url = WB + f"https://www.sanfoundry.com/{c}/"
        html = fetch(url)
        if not html:
            continue
        qs = parse_chapter(html)
        for q in qs:
            q["chapter"] = c
            q["topic"] = hub_slug.replace("1000-", "")
            existing.append(q)
            fresh += 1
        done.add(c)
        if fresh >= 5 and len(existing) % 25 == 0:
            print(f"  ... {len(existing)} Qs so far", flush=True)
        time.sleep(0.6)  # wayback politeness
    # write
    with open(outp, "w", encoding="utf-8") as f:
        for q in existing:
            f.write(json.dumps(q) + "\n")
    print(f"  DONE: {len(existing)} Qs ({fresh} new) -> {outp}", flush=True)

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        args = HUBS
    loops = sys.argv[1:]
    for h in loops:
        crawl_hub(h)
        print("sleeping 2s", flush=True)
        time.sleep(2)